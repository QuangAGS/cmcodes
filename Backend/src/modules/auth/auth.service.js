/**
 * PATH       : src/modules/auth/auth.service.js
 * DATETIME   : 2026-07-16T12:15:00+07:00
 * VERSION    : 20.2.2-DYNAMIC-ATTEMPT-LEDGER
 * DESCRIPTION:
 * - SỬA LỖI ĐÓNG BĂNG ATTEMPT: Tự động tính toán luỹ tiến attempt_no dựa trên số lần xử lý thực tế của một user_id.
 * - Đồng bộ nạp biến attempt_no động vào cả Business Ledger (businessLogger) và Communication Ledger (notificationBuilder).
 *
 * - Vá lỗ hổng cấp phát Token tự động cho tài khoản chưa qua phê duyệt.
 * - Kiểm tra đồng bộ Trạng thái vòng đời của User (`users.status`) và Dòng họ (`tenants.status`).
 * - Vá lỗ hổng Communication Ledger bằng cách tích hợp NotificationBuilder chuẩn hóa.
 *  Đảm bảo tuân thủ cấu trúc Schema, thực hiện cơ chế Silent Emit (Phase 6B).
 * - Rà soát và loại bỏ/comment toàn bộ việc sinh khóa chính (PK) thủ công `id: uuidv4()` ở tầng Backend.
 * 
 * - Tích hợp trọn vẹn quy trình 7 bước (Flow 7 Steps) cho tiến trình phê duyệt/từ chối hồ sơ (processUserApproval).
 * - Kết hợp bộ ba Log: authLogService (Hạ tầng/Anti-bot), businessLogger (Tổng quan/Snapshot), và auditService (Chi tiết/Details).
 * - Sử dụng đồng bộ mã liên vết correlation_id và đóng băng dữ liệu lịch sử target_name.
 * - Bảo tồn 100% các logic cũ liên quan đến Login, Register, và chuỗi khôi phục mật khẩu 3 bước (Q1).
 * - Tuân thủ nghiêm ngặt chuẩn định dạng tài liệu hệ thống (Q2).
 */
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

//const { basePrisma } = require('../lib/prisma');
const { basePrisma, PRISMA_SELECTS } = require('../../lib/prisma.js');
const authLogService = require('./authLog.service');
const { cleanInput, formatNumericSlug } = require('../../shared/utils/slug.utils');
const securityConfig = require('../../config/securityConfig');

// 🚀 ĐÃ SỬA CHUẨN XÁC: Nạp Class dịch vụ và khởi tạo đối tượng instance thực tế bằng từ khóa `new`
const businessLogger = require('../../services/ledger.service'); 
// const businessLogger = new BusinessLoggerService();

const auditService = require('../../services/audit.service'); 
const emailService = require('../../services/email.service');

const {
  propagateFromRegistration, 
} = require('../notifications/services/communicationPropagation.service'); // Tên tệp vật lý thực tế trên đĩa của bác


const notificationOrchestrator = require(
  '../notifications/orchestrator/notificationOrchestrator'
); 
//const { sendOTP } = require('../notifications/services/notification-builder'); // Tên tệp vật lý thực tế trên đĩa của bác

const notificationBuilder = require('../notifications/services/notification-builder');
/**
 * <2026-05-13T00:00:00+07:00>
 * Helper hash cho password reset session security.
 * - Config lấy từ centralized securityConfig.
 */
const hashResetSecret = (value) => {
  return crypto
    .createHash('sha256')
    .update(String(value))
    .digest('hex');
};

const authService = {
  checkLockStatus: async (user) => {
    if (!user) return { isLocked: false };

    console.log(
      `[DEBUG checkLockStatus] User=${user.id} | Status=${user.status} | locked_until=${user.locked_until} | pre_lock_status=${user.pre_lock_status}`
    );

    if (user.status === 'BI_CAM') {
      console.log('[DEBUG] → BI_CAM → PERMANENT');
      return {
        isLocked: true,
        isPermanent: true,
        lockType: 'PERMANENT',
        reasonCode: 'ACCOUNT_BANNED',
      };
    }

    if (user.status === 'BI_KHOA') {
      let lockedUntilDate = null;

      if (user.locked_until) {
        try {
          lockedUntilDate = new Date(user.locked_until);
        } catch (e) {
          lockedUntilDate = null;
        }
      }

      const now = new Date();

      const hasValidLockTime =
        lockedUntilDate &&
        !isNaN(lockedUntilDate.getTime()) &&
        lockedUntilDate > now;

      const hasPreLockStatus =
        !!user.pre_lock_status &&
        user.pre_lock_status !== '' &&
        user.pre_lock_status !== null &&
        user.pre_lock_status !== 'null';

      console.log(
        `[DEBUG] hasValidLockTime=${hasValidLockTime}, hasPreLockStatus=${hasPreLockStatus}`
      );

      if (!hasValidLockTime || !hasPreLockStatus) {
        console.log(
          '[DEBUG] → BI_KHOA bị hỏng (null fields) → PERMANENT (không auto-unlock)'
        );

        return {
          isLocked: true,
          isPermanent: true,
          lockType: 'PERMANENT',
          reasonCode: 'INVALID_LOCK_STATE',
        };
      }

      const minutesLeft = Math.ceil((lockedUntilDate - now) / 60000);
      console.log(`[DEBUG] → TEMPORARY lock còn ${minutesLeft} phút`);

      return {
        isLocked: true,
        isPermanent: false,
        minutesLeft: Math.max(1, minutesLeft),
        lockType: 'TEMPORARY',
        reasonCode: 'TOO_MANY_ATTEMPTS',
      };
    }

    console.log('[DEBUG] → Status khác, không lock');
    return { isLocked: false };
  },

  /**
   * @dateTime 2026-06-18T16:52:00+07:00
   * @description Tiến trình xác thực thông tin đăng nhập, thẩm định trạng thái vòng đời và cấp phát JWT Token.
   * @param {string} identifier - Email hoặc Số điện thoại người dùng gửi lên
   * @param {string} password - Mật khẩu thô chưa mã hóa
   * @param {Object} extraData - Dữ liệu bổ sung (thiết bị, IP, anti-bot...) phục vụ phân tích log
   */
  /**
   * @dateTime 2026-07-22T11:10:00+07:00
   * @description Tiến trình xác thực đăng nhập + Assert Order (SEC Wave 2).
   * Thứ tự bắt buộc:
   *   1. Credential (password)
   *   2. User status / Lock (checkLockStatus)
   *   3. Tenant status / activation
   *   4. Cấp token
   * @param {string} identifier - Email hoặc SĐT
   * @param {string} password
   * @param {Object} extraData
   */
  loginUser: async (identifier, password, extraData) => {
    // ─── Bước 0: Tìm user ─────────────────────────────────────
    const user = await basePrisma.users.findFirst({
      where: {
        OR: [{ email: identifier }, { phone: identifier }],
        deleted_at: null,
      },
      include: { tenants: true },
    });

    if (!user) {
      const error = new Error('Thông tin tài khoản đăng nhập hoặc mật khẩu không chính xác.');
      error.status = 401;
      error.code = 'INVALID_CREDENTIALS';
      throw error;
    }

    // ─── Bước 1: Credential (Assert Order — PHẢI làm trước status/lock) ───
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      const error = new Error('Thông tin tài khoản đăng nhập hoặc mật khẩu không chính xác.');
      error.status = 401;
      error.code = 'INVALID_CREDENTIALS';
      throw error;
    }

    // ─── Bước 2: User status / Lock ───────────────────────────
    // 2a. Permanent / temporary lock (BI_CAM, BI_KHOA)
    const lockInfo = await authService.checkLockStatus(user);
    if (lockInfo.isLocked) {
      const error = new Error(
        lockInfo.isPermanent
          ? 'Tài khoản đã bị cấm hoặc khóa vĩnh viễn. Vui lòng liên hệ hỗ trợ.'
          : `Tài khoản tạm khóa. Vui lòng thử lại sau ${lockInfo.minutesLeft || 1} phút.`
      );
      error.status = 423;
      error.code = lockInfo.isPermanent ? 'ACCOUNT_BANNED' : 'ACCOUNT_LOCKED';
      error.isPermanent = lockInfo.isPermanent;
      error.minutesLeft = lockInfo.minutesLeft || 0;
      error.lockType = lockInfo.lockType;
      error.reasonCode = lockInfo.reasonCode;
      throw error;
    }

    // 2b. Lifecycle status (CHO_DUYET, TAM_NGUNG, TU_CHOI…)
    if (user.status === 'CHO_DUYET') {
      const error = new Error('Hồ sơ của bác đang chờ Ban Quản trị phê duyệt. Vui lòng quay lại sau.');
      error.status = 423;
      error.code = 'ACCOUNT_CHO_DUYET';
      throw error;
    }

    if (user.status === 'TAM_NGUNG' || user.status === 'TU_CHOI') {
      const error = new Error('Tài khoản này hiện tại đã bị tạm ngưng hoặc từ chối truy cập.');
      error.status = 403;
      error.code = 'ACCOUNT_DISABLED';
      throw error;
    }

    // ─── Bước 3: Tenant status / activation ───────────────────
    // SYSTEM_ADMIN bypass tenant check
    // TAM_NGUNG: CHO PHÉP login (CLAN_ADMIN cần vào để hoàn thiện tenant/profile)
    // Chỉ chặn tenant bị khóa nặng (BI_KHOA) hoặc tương đương
    if (user.role !== 'SYSTEM_ADMIN' && user.tenants) {
      const tenantStatus = user.tenants.status;

      if (tenantStatus === 'CHO_DUYET') {
        // Edge case hiếm (data lệch) — vẫn giữ defensive
        const error = new Error(
          'Dòng họ của bác hiện đang chờ Hệ thống Trung tâm phê duyệt kích hoạt dịch vụ.'
        );
        error.status = 423;
        error.code = 'TENANT_PENDING_ACTIVATION';
        throw error;
      }

      // TAM_NGUNG → cho phép login (không chặn)
      // BI_KHOA tenant → chặn
      if (tenantStatus === 'BI_KHOA') {
        const error = new Error(
          'Dòng họ hiện đang bị khóa. Vui lòng liên hệ Ban quản trị.'
        );
        error.status = 403;
        error.code = 'TENANT_DISABLED';
        throw error;
      }
    }

    // ─── Bước 4: Cấp token (chỉ khi đã pass toàn bộ) ─────────
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('Cấu hình thiếu JWT_SECRET tại tệp môi trường .env.');
    }

    const tenantStatus = user.tenants ? user.tenants.status : null;

    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenant_id,
        status: user.status,
        tenantStatus, // [20.3.0-W2] phục vụ requireActiveTenant + FE routing
      },
      secret,
      { expiresIn: '24h' }
    );

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        tenant_id: user.tenant_id,
        status: user.status,
        tenantStatus, // FE dùng để quyết định redirect
      },
    };
  },

  generateToken: (user) => {
    const secret = securityConfig.JWT_SECRET;

    if (!secret) {
      throw new Error('JWT_SECRET is not defined');
    }

    return jwt.sign(
      {
        userId: user.id,
        tenantId: user.tenant_id,
        role: user.role,
        status: user.status,
      },
      secret,
      { expiresIn: '7d' }
    );
  },

  registerUser: async (payload, extraData = {}) => {
    const { isNewClan, clanName, description, tenantId, ...userData } = payload;
    const { ip_address, user_agent } = extraData;

    const logIdentifier = cleanInput(userData.phone, 'phone');
    let transactionResult = null;

    /**
     * <2026-06-04T16:10:00+07:00>
     * Purpose:
     * - Pre-compute password hash before opening Prisma transaction.
     *
     * Notes:
     * - bcrypt is CPU-bound and should not hold interactive transaction open.
     * - Prevents "Transaction already closed" in CreateClan flow.
     * - Q1-safe:
     *   No business behavior change.
     */
    const hashedPassword = await bcrypt.hash(
      userData.password,
      10
    );

    try {
      transactionResult = await basePrisma.$transaction(
        async (tx) => {
          let tid = tenantId;
          let tenantSlug = 'SYSTEM_GENERATE';

          if (isNewClan) {
            const currentYear = new Date().getFullYear();

            const counter = await tx.slug_counters.upsert({
              where: { year: currentYear },
              update: { last_value: { increment: 1 } },
              create: { year: currentYear, last_value: 1 },
            });

            tenantSlug = formatNumericSlug(currentYear, counter.last_value);

            const newTenant = await tx.tenants.create({
              data: {
                name: clanName,
                slug: tenantSlug,
                description,
                status: 'CHO_DUYET',
              },
            });

            tid = newTenant.id;
          } else if (tid) {
            const tenant = await tx.tenants.findUnique({
              where: { id: tid },
            });

            tenantSlug = tenant?.slug || 'SYSTEM_GENERATE';
          }
          //Sinh slug = year_[random number]
          const shortId = crypto.randomBytes(4).toString('hex');
          const technicalName = `${tenantSlug}_${shortId}`;

          //Create a new user.
          const newUser = await tx.users.create({
            data: {
              //id: crypto.randomUUID(), //PK do DB tự sinh.
              name: technicalName,
              email: userData.email
                ? cleanInput(userData.email, 'email')
                : null,
              phone: logIdentifier,
              password: hashedPassword,
              tenant_id: tid,
              role: isNewClan ? 'CLAN_ADMIN' : 'VIEWER',
              status: 'CHO_DUYET',
              temp_full_name:
                userData.temp_full_name || userData.name || 'Thành viên mới',
              temp_father_name: userData.temp_father_name,
              temp_grandfather_name: userData.temp_grandfather_name,
              temp_birth_year: userData.temp_birth_year
                ? parseInt(userData.temp_birth_year, 10)
                : null,
              temp_relationship: userData.temp_relationship || 'CON_DE',
              temp_address: userData.temp_address,
              temp_branch_name: userData.temp_branch_name,
              temp_note: userData.temp_note,
              temp_social_profiles: userData.temp_social_profiles || {},
            },
          });

          /**
           * <2026-06-05T11:20:00+07:00>
           * Purpose:
           * - Propagate Register capture data into canonical communication tables.
           *
           * Notes:
           * - Must stay inside the same transaction as user creation.
           * - This is data propagation, not notification delivery.
           * - If propagation fails, registration must rollback.
           */
          await propagateFromRegistration({
            tx,
            user: {
              id: newUser.id,
              email: newUser.email,
              phone: newUser.phone,
              status: newUser.status,
              role: newUser.role,
              tenant_id: newUser.tenant_id,
            },
            rawUserData: userData,
            isNewClan,
          });

          return {
            userId: newUser.id,
            tenantId: tid,
            slug: tenantSlug,
            status: newUser.status,
          };
        },
        {
          maxWait: 10000,
          timeout: 20000,
        },
      );

      await authLogService.logAttempt({
        identifier: logIdentifier,
        ip_address,
        user_agent,
        status: 'THANH_CONG',
        failure_reason: 'REGISTER_SUCCESS',
      });

      /**
       * <2026-06-07T00:00:00+07:00>
       * EGAL-25 Phase 6.3A
       *
       * Silent business emit:
       * USER_REGISTERED
       *
       * Doctrine:
       * - Persist only
       * - No delivery execution
       * - Must NOT break register flow
       */
      try {
        //EGAL-25.x R6.3A For test the Failure isolation only
        //throw new Error('TEST_SILENT_EMIT_FAILURE');

        await notificationOrchestrator.emit(
          'USER_REGISTERED',
          {
            userId: transactionResult.userId,

            metadata: {
              tenantId: transactionResult.tenantId,

              registrationType: isNewClan ? 'NEW_CLAN' : 'JOIN_CLAN',

              status: transactionResult.status,
            },

            executeImmediately: false,
          },
          null,
        );
      } catch (emitError) {
        console.error('[EGAL-25][SilentEmit][USER_REGISTERED]', emitError);

        // Q1:
        // registration must survive notification failure
      }

      return transactionResult;
    } catch (error) {
      await authLogService.logAttempt({
        identifier: logIdentifier || 'unknown',
        ip_address,
        user_agent,
        status: 'THAT_BAI',
        failure_reason: `REGISTER_FAILED: ${error.message}`,
      });

      throw error;
    }
  },

  checkIdentity: async (type, value) => {
    const cleanedValue = cleanInput(value, type);

    if (!cleanedValue) {
      return {
        available: false,
        message: 'Dữ liệu không hợp lệ',
      };
    }

    let existing = null;

    switch (type) {
      case 'slug':
        existing = await basePrisma.tenants.findUnique({
          where: { slug: cleanedValue },
        });
        break;

      case 'email':
        existing = await basePrisma.users.findUnique({
          where: { email: cleanedValue },
        });
        break;

      case 'phone':
        existing = await basePrisma.users.findUnique({
          where: { phone: cleanedValue },
        });
        break;

      default:
        throw new Error('INVALID_TYPE');
    }

    return { available: !existing };
  },
  
  /**
   * <2026-05-13T00:00:00+07:00>
   * Forgot Password Flow v3: REQUEST RESET CODE
   * - Dùng bảng password_reset_sessions.
   * - Không dùng users.reset_token/reset_expires.
   * - Kiểm tra identifier tồn tại.
   * - Enforce resend cooldown.
   * - Enforce max request/window.
   * - OTP được hash trước khi lưu DB.
   */
  forgotPassword: async (identifier, extraData = {}) => {
    const { ip_address, user_agent } = extraData;

    const rawIdentifier = cleanInput(
      identifier,
      identifier?.includes('@') ? 'email' : 'phone'
    );

    if (!rawIdentifier) {
      const err = new Error('Dữ liệu không hợp lệ.');
      err.status = 400;
      err.code = 'INVALID_IDENTIFIER';
      throw err;
    }

    const user = await basePrisma.users.findFirst({
      where: {
        OR: [{ email: rawIdentifier }, { phone: rawIdentifier }],
        deleted_at: null,
      },
    });

    if (!user) {
      await authLogService.logAttempt({
        identifier: rawIdentifier,
        ip_address,
        user_agent,
        status: 'THAT_BAI',
        failure_reason: 'FORGOT_PASSWORD_IDENTIFIER_NOT_FOUND',
      });

      const err = new Error('Email hoặc số điện thoại này chưa được đăng ký.');
      err.status = 404;
      err.code = 'IDENTIFIER_NOT_FOUND';
      throw err;
    }

    if (!user.email) {
      await authLogService.logAttempt({
        identifier: rawIdentifier,
        ip_address,
        user_agent,
        status: 'THAT_BAI',
        failure_reason: 'FORGOT_PASSWORD_NO_EMAIL_CHANNEL',
      });

      const err = new Error('Tài khoản này chưa có email để nhận mã xác nhận.');
      err.status = 400;
      err.code = 'NO_EMAIL_CHANNEL';
      throw err;
    }

    const now = new Date();

    const requestWindowStart = new Date(
      now.getTime() -
        securityConfig.RESET_OTP_REQUEST_WINDOW_MINUTES * 60 * 1000
    );

    const recentRequestCount =
      await basePrisma.password_reset_sessions.count({
        where: {
          identifier: rawIdentifier,
          created_at: {
            gte: requestWindowStart,
          },
          deleted_at: null,
        },
      });

    if (
      recentRequestCount >=
      securityConfig.RESET_OTP_MAX_REQUESTS_PER_WINDOW
    ) {
      await authLogService.logAttempt({
        identifier: rawIdentifier,
        ip_address,
        user_agent,
        status: 'THAT_BAI',
        failure_reason: 'FORGOT_PASSWORD_REQUEST_LIMITED',
      });

      const err = new Error(
        'Bạn đã yêu cầu mã xác nhận quá nhiều lần. Vui lòng thử lại sau.'
      );
      err.status = 429;
      err.code = 'RESET_OTP_REQUEST_LIMITED';
      throw err;
    }

    const latestSession =
      await basePrisma.password_reset_sessions.findFirst({
        where: {
          user_id: user.id,
          identifier: rawIdentifier,
          status: {
            in: ['PENDING', 'VERIFIED'],
          },
          deleted_at: null,
        },
        orderBy: {
          created_at: 'desc',
        },
      });

    if (latestSession?.created_at) {
      const elapsedSeconds =
        (now.getTime() -
          new Date(latestSession.created_at).getTime()) /
        1000;

      if (
        elapsedSeconds <
        securityConfig.RESET_OTP_RESEND_COOLDOWN_SECONDS
      ) {
        const waitSeconds = Math.ceil(
          securityConfig.RESET_OTP_RESEND_COOLDOWN_SECONDS -
            elapsedSeconds
        );

        const err = new Error(
          `Mã xác nhận đã được gửi. Vui lòng chờ khoảng ${waitSeconds} giây trước khi yêu cầu lại.`
        );
        err.status = 429;
        err.code = 'RESET_OTP_COOLDOWN';
        err.waitSeconds = waitSeconds;
        throw err;
      }
    }

    await basePrisma.password_reset_sessions.updateMany({
      where: {
        user_id: user.id,
        status: {
          in: ['PENDING', 'VERIFIED', 'LOCKED'],
        },
        deleted_at: null,
      },
      data: {
        status: 'CANCELLED',
        updated_at: now,
      },
    });

    const otp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = hashResetSecret(otp);

    const expiresAt = new Date(
      now.getTime() +
        securityConfig.RESET_OTP_EXPIRES_MINUTES * 60 * 1000
    );

    const session = await basePrisma.password_reset_sessions.create({
      data: {
        user_id: user.id,
        identifier: rawIdentifier,
        otp_hash: otpHash,
        reset_token_hash: null,
        status: 'PENDING',
        request_count: recentRequestCount + 1,
        resend_count: 0,
        verify_attempt_count: 0,
        expires_at: expiresAt,
        verified_at: null,
        locked_until: null,
        ip_address: ip_address || null,
        user_agent: user_agent || null,
        metadata: {
          delivery_channel: 'EMAIL',
          delivery_email: user.email,
          otp_expires_minutes: securityConfig.RESET_OTP_EXPIRES_MINUTES,
        },
        updated_at: now,
      },
    });

    await emailService.sendOTP(user.email, otp);

    await authLogService.logAttempt({
      identifier: rawIdentifier,
      ip_address,
      user_agent,
      status: 'THANH_CONG',
      failure_reason: 'FORGOT_PASSWORD_OTP_SENT',
    });

    return {
      dispatched: true,
      channel: 'EMAIL',
      sessionId: session.id,
      expiresInMinutes: securityConfig.RESET_OTP_EXPIRES_MINUTES,
    };
  },

  /**
   * <2026-05-13T00:00:00+07:00>
   * Forgot Password Flow v3: VERIFY RESET CODE
   */
  verifyResetCode: async (identifier, otp, extraData = {}) => {
    const { ip_address, user_agent } = extraData;

    const rawIdentifier = cleanInput(
      identifier,
      identifier?.includes('@') ? 'email' : 'phone'
    );

    if (!rawIdentifier || !otp) {
      const err = new Error('Mã xác nhận không hợp lệ hoặc đã hết hạn.');
      err.status = 400;
      err.code = 'INVALID_RESET_CODE';
      throw err;
    }

    const now = new Date();

    const session = await basePrisma.password_reset_sessions.findFirst({
      where: {
        identifier: rawIdentifier,
        status: 'PENDING',
        deleted_at: null,
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    if (!session) {
      await authLogService.logAttempt({
        identifier: rawIdentifier,
        ip_address,
        user_agent,
        status: 'THAT_BAI',
        failure_reason: 'VERIFY_RESET_CODE_SESSION_NOT_FOUND',
      });

      const err = new Error('Mã xác nhận không hợp lệ hoặc đã hết hạn.');
      err.status = 400;
      err.code = 'RESET_SESSION_NOT_FOUND';
      throw err;
    }

    if (session.locked_until && new Date(session.locked_until) > now) {
      const minutesLeft = Math.ceil(
        (new Date(session.locked_until).getTime() - now.getTime()) /
          60000
      );

      const err = new Error(
        `Bạn đã nhập sai mã quá nhiều lần. Vui lòng thử lại sau ${minutesLeft} phút.`
      );
      err.status = 429;
      err.code = 'RESET_OTP_LOCKED';
      err.minutesLeft = minutesLeft;
      throw err;
    }

    if (new Date(session.expires_at) < now) {
      await basePrisma.password_reset_sessions.update({
        where: { id: session.id },
        data: {
          status: 'EXPIRED',
          updated_at: now,
        },
      });

      const err = new Error(
        'Mã xác nhận đã hết hạn. Vui lòng yêu cầu mã mới.'
      );
      err.status = 400;
      err.code = 'RESET_OTP_EXPIRED';
      throw err;
    }

    const otpHash = hashResetSecret(otp);

    if (otpHash !== session.otp_hash) {
      const nextAttemptCount =
        (session.verify_attempt_count || 0) + 1;

      const shouldLock =
        nextAttemptCount >=
        securityConfig.RESET_OTP_MAX_VERIFY_ATTEMPTS;

      await basePrisma.password_reset_sessions.update({
        where: { id: session.id },
        data: {
          verify_attempt_count: nextAttemptCount,
          status: shouldLock ? 'LOCKED' : 'PENDING',
          locked_until: shouldLock
            ? new Date(
                now.getTime() +
                  securityConfig.RESET_OTP_LOCK_MINUTES *
                    60 *
                    1000
              )
            : session.locked_until,
          updated_at: now,
        },
      });

      await authLogService.logAttempt({
        identifier: rawIdentifier,
        ip_address,
        user_agent,
        status: 'THAT_BAI',
        failure_reason: shouldLock
          ? 'VERIFY_RESET_CODE_LOCKED'
          : 'VERIFY_RESET_CODE_WRONG_OTP',
      });

      const err = new Error(
        shouldLock
          ? `Bạn đã nhập sai mã quá nhiều lần. Vui lòng thử lại sau ${securityConfig.RESET_OTP_LOCK_MINUTES} phút.`
          : 'Mã xác nhận không đúng. Vui lòng kiểm tra lại.'
      );

      err.status = shouldLock ? 429 : 400;
      err.code = shouldLock
        ? 'RESET_OTP_LOCKED'
        : 'INVALID_RESET_CODE';

      err.remainingAttempts = Math.max(
        0,
        securityConfig.RESET_OTP_MAX_VERIFY_ATTEMPTS -
          nextAttemptCount
      );

      throw err;
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = hashResetSecret(resetToken);

    const resetTokenExpiresAt = new Date(
      now.getTime() +
        securityConfig.RESET_TOKEN_EXPIRES_MINUTES * 60 * 1000
    );

    await basePrisma.password_reset_sessions.update({
      where: { id: session.id },
      data: {
        status: 'VERIFIED',
        reset_token_hash: resetTokenHash,
        verified_at: now,
        expires_at: resetTokenExpiresAt,
        updated_at: now,
        metadata: {
          ...(session.metadata || {}),
          reset_token_expires_minutes:
            securityConfig.RESET_TOKEN_EXPIRES_MINUTES,
          verified_ip_address: ip_address || null,
          verified_user_agent: user_agent || null,
        },
      },
    });

    await authLogService.logAttempt({
      identifier: rawIdentifier,
      ip_address,
      user_agent,
      status: 'THANH_CONG',
      failure_reason: 'VERIFY_RESET_CODE_SUCCESS',
    });

    return {
      resetToken,
      expiresInMinutes: securityConfig.RESET_TOKEN_EXPIRES_MINUTES,
    };
  },

  /**
   * <2026-05-13T00:00:00+07:00>
   * Forgot Password Flow v3: CHANGE PASSWORD AFTER RESET
   */
  changePasswordAfterReset: async (identifier, resetToken, newPassword) => {
    const rawIdentifier = cleanInput(
      identifier,
      identifier?.includes('@') ? 'email' : 'phone'
    );

    if (!rawIdentifier || !resetToken || !newPassword) {
      const err = new Error('Yêu cầu đặt lại mật khẩu không hợp lệ.');
      err.status = 400;
      err.code = 'INVALID_CHANGE_PASSWORD_REQUEST';
      throw err;
    }

    if (newPassword.length < 6) {
      const err = new Error('Mật khẩu mới cần có ít nhất 6 ký tự.');
      err.status = 400;
      err.code = 'WEAK_PASSWORD';
      throw err;
    }

    const now = new Date();
    const resetTokenHash = hashResetSecret(resetToken);

    const session = await basePrisma.password_reset_sessions.findFirst({
      where: {
        identifier: rawIdentifier,
        reset_token_hash: resetTokenHash,
        status: 'VERIFIED',
        deleted_at: null,
      },
      orderBy: {
        verified_at: 'desc',
      },
    });

    if (!session) {
      const err = new Error(
        'Phiên đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.'
      );
      err.status = 400;
      err.code = 'INVALID_RESET_SESSION';
      throw err;
    }

    if (session.locked_until && new Date(session.locked_until) > now) {
      const minutesLeft = Math.ceil(
        (new Date(session.locked_until).getTime() - now.getTime()) /
          60000
      );

      const err = new Error(
        `Phiên đặt lại mật khẩu đang bị khóa. Vui lòng thử lại sau ${minutesLeft} phút.`
      );
      err.status = 429;
      err.code = 'RESET_SESSION_LOCKED';
      err.minutesLeft = minutesLeft;
      throw err;
    }

    if (new Date(session.expires_at) < now) {
      await basePrisma.password_reset_sessions.update({
        where: { id: session.id },
        data: {
          status: 'EXPIRED',
          updated_at: now,
        },
      });

      const err = new Error(
        'Phiên đặt lại mật khẩu đã hết hạn. Vui lòng yêu cầu mã mới.'
      );
      err.status = 400;
      err.code = 'RESET_TOKEN_EXPIRED';
      throw err;
    }

    const user = await basePrisma.users.findFirst({
      where: {
        id: session.user_id,
        deleted_at: null,
      },
    });

    if (!user) {
      const err = new Error('Tài khoản không còn tồn tại hoặc đã bị xóa.');
      err.status = 404;
      err.code = 'RESET_USER_NOT_FOUND';
      throw err;
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await basePrisma.$transaction(async (tx) => {
      await tx.users.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          attempt_count: 0,
          updated_at: now,
        },
      });

      await tx.password_reset_sessions.update({
        where: { id: session.id },
        data: {
          status: 'COMPLETED',
          reset_token_hash: null,
          updated_at: now,
          metadata: {
            ...(session.metadata || {}),
            completed_at: now.toISOString(),
          },
        },
      });

      await tx.password_reset_sessions.updateMany({
        where: {
          user_id: user.id,
          id: {
            not: session.id,
          },
          status: {
            in: ['PENDING', 'VERIFIED', 'LOCKED'],
          },
          deleted_at: null,
        },
        data: {
          status: 'CANCELLED',
          updated_at: now,
        },
      });
    });

    return {
      userId: user.id,
      changed: true,
    };
  },

  /**
   * <2026-05-12T00:00:00+07:00>
   * Legacy compatibility.
   * - Giữ tương thích cho route /auth/reset-password cũ.
   * - Không dùng cho flow mới 3 bước.
   */
  resetPassword: async (email, otp, newPassword) => {
    const user = await authService.verifyOTP(email, otp);

    if (!user) {
      const err = new Error('Mã OTP không hợp lệ hoặc đã hết hạn.');
      err.status = 400;
      err.code = 'INVALID_OTP';
      throw err;
    }

    await authService.updatePassword(email, newPassword);

    return {
      changed: true,
    };
  },

  saveResetToken: async (userId, otp) => {
    return await basePrisma.users.update({
      where: { id: userId },
      data: {
        reset_token: otp,
        reset_expires: new Date(
          Date.now() +
            securityConfig.RESET_OTP_EXPIRES_MINUTES * 60 * 1000
        ),
      },
    });
  },

  verifyOTP: async (email, otp) => {
    return await basePrisma.users.findFirst({
      where: {
        email,
        reset_token: otp,
        reset_expires: {
          gte: new Date(),
        },
      },
    });
  },

  updatePassword: async (email, newPassword) => {
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    return await basePrisma.users.update({
      where: { email },
      data: {
        password: hashedPassword,
        reset_token: null,
        reset_expires: null,
      },
    });
  },


  /* ****************************************************************************
   * Lấy danh sách user đang chờ duyệt (có thông tin tenant)
  
   *   Phương pháp cũ - Cách 1
  getPendingUsers: async (actorRole, actorTenantId) => {
    try {
      const users = await basePrisma.users.findMany({
        where: {
          status: 'CHO_DUYET',
          deleted_at: null,                    // ← Soft delete
          ...(actorRole !== 'SYSTEM_ADMIN' && actorTenantId 
            ? { tenant_id: actorTenantId } 
            : {}),
        },
        orderBy: {
          created_at: 'desc',
        },
      });

      if (users.length === 0) return users;

      // Lấy thông tin tenant
      const tenantIds = [...new Set(users.map(u => u.tenant_id).filter(Boolean))];

      let tenantMap = {};
      if (tenantIds.length > 0) {
        const tenants = await basePrisma.tenants.findMany({
          where: { 
            id: { in: tenantIds },
            deleted_at: null,                 // ← Soft delete cho tenant
          },
          select: { 
            id: true, 
            name: true, 
            description: true,
            slug: true 
          }
        });

        tenantMap = tenants.reduce((acc, tenant) => {
          acc[tenant.id] = tenant;
          return acc;
        }, {});
      }

      // Gắn tenant vào từng user
      return users.map(user => ({
        ...user,
        tenant: tenantMap[user.tenant_id] || null,
      }));
    } catch (error) {
      console.error('[getPendingUsers Error]:', error);
      throw error;
    }
  },
   * Phương pháp mới - Cách 2 dùng include
    getPendingUsers: async (actorRole, actorTenantId) => {
      try {
        // Thực hiện 1 câu query duy nhất xuống Database để lấy cả User và Tenant
        const users = await basePrisma.users.findMany({
          where: {
            status: 'CHO_DUYET',
            deleted_at: null, // Chỉ lấy người dùng chưa bị xóa mềm
            
            // Phân quyền động: Nếu không phải SYSTEM_ADMIN, ép điều kiện chỉ xem tenant của chính mình
            ...(actorRole !== 'SYSTEM_ADMIN' && actorTenantId 
              ? { tenant_id: actorTenantId } 
              : {}),
          },
          orderBy: {
            created_at: 'desc', // Sắp xếp người dùng mới đăng ký lên đầu
          },
          // Eager Loading: Tự động kết hợp dữ liệu bảng tenants dựa trên Foreign Key (tenant_id)
          include: {
            tenants: {
              where: {
                deleted_at: null, // Lọc trực tiếp: Chỉ lấy thông tin nếu Tenant chưa bị xóa mềm
              },
              select: {
                id: true,
                name: true,
                description: true,
                slug: true,
              },
            },
          },
        });

        // Nếu không có user nào, Prisma tự động trả về mảng rỗng [].
        // Toàn bộ logic gom ID, map thủ công và dòng check `if (users.length === 0)` rườm rà đã được loại bỏ.
        return users;

      } catch (error) {
        console.error('[getPendingUsers Error]:', error);
        throw error;
      }
    },
  ****************************************************************************** */
  
  // Lấy danh sách users kèm tenant theo phương pháp mới: dùng select
  getPendingUsers: async (actorRole, actorTenantId) => {
    try {
      const users = await basePrisma.users.findMany({
        where: {
          status: 'CHO_DUYET',
          deleted_at: null,
          ...(actorRole !== 'SYSTEM_ADMIN' && actorTenantId 
            ? { tenant_id: actorTenantId } 
            : {}),
        },
        orderBy: {
          created_at: 'desc',
        },
        take: 30,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          status: true,
          tenant_id: true,
          temp_full_name: true,
          temp_father_name: true,
          temp_grandfather_name: true,
          temp_address: true,
          temp_birth_year: true,
          temp_branch_name: true,
          temp_relationship: true,
          temp_note: true,
          temp_social_profiles: true,
          created_at: true,
          // Prisma bắt buộc dùng đúng tên relation trong schema
          tenants: {
            where: {
              deleted_at: null,
            },
            select: {
              id: true,
              name: true,
              description: true,
              slug: true,
              status: true,
            },
          },
        },
      });

      // 🚀 SỬA LỖI TẠI ĐÂY: Map lại tên trường từ 'tenants' thành 'tenant' để tương thích với Frontend
      return users.map(({ tenants, ...user }) => ({
        ...user,
        tenant: tenants || null, // Đổi sang số ít cho đúng contract của UserApprovalForm.jsx
      }));

    } catch (error) {
      console.error('[getPendingUsers Error]:', error);
      throw error;
    }
  },

  /**
   * @dateTime 2026-06-18T11:45:00+07:00
   * @description SERVICE QUERY ĐỘNG NÂNG CAO: Hợp nhất dữ liệu Users, Tenants và Members.
   * Giúp Approver theo dõi toàn diện vòng đời tài khoản (Chờ duyệt, Từ chối, Đã Duyệt, Bị Khóa).
   */
  queryReviewableUsers: async (filters, actorRole, actorTenantId) => {
    try {
      const { status, role, searchKeyword, fromDate, toDate, page = 1, limit = 20 } = filters;
      
      // 1. Điều kiện gốc: An toàn Multi-tenant và chống lấy bản ghi đã xóa mềm
      const whereClause = {
        deleted_at: null,
        ...(actorRole !== 'SYSTEM_ADMIN' ? { tenant_id: actorTenantId } : {})
      };

      // 2. Tích hợp bộ lọc Trạng thái động ('CHO_DUYET', 'TU_CHOI', 'DA_DUYET', 'BI_KHOA', 'BI_CAM', 'TAM_NGUNG')
      if (status) {
        whereClause.status = status;
      } else {
        // Mặc định hiển thị các trạng thái cần quan tâm quản trị
        whereClause.status = { in: ['CHO_DUYET', 'TU_CHOI', 'DA_DUYET', 'BI_KHOA', 'BI_CAM', 'TAM_NGUNG'] };
      }

      // 3. Tích hợp bộ lọc Vai trò (Role)
      if (role) {
        whereClause.role = role;
      }

      // 4. Lọc theo khoảng thời gian biến động (created_at hoặc updated_at)
      if (fromDate || toDate) {
        whereClause.updated_at = {};
        if (fromDate) whereClause.updated_at.gte = new Date(fromDate);
        if (toDate) whereClause.updated_at.lte = new Date(toDate);
      }

      // 5. Tìm kiếm nâng cao đa biểu thức (Tên tài khoản, Tên Snapshot, Email, SĐT)
      if (searchKeyword && searchKeyword.trim() !== '') {
        const keyword = searchKeyword.trim();
        whereClause.OR = [
          { name: { contains: keyword, mode: 'insensitive' } },
          { temp_full_name: { contains: keyword, mode: 'insensitive' } },
          { email: { contains: keyword, mode: 'insensitive' } },
          { phone: { contains: keyword, mode: 'insensitive' } }
        ];
      }

      const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
      const take = parseInt(limit, 10);

      // 6. Thực thi truy vấn kết hợp (JOIN mềm qua Prisma) giữa 3 thực thể: users, tenants, members
      const [totalRecords, users] = await Promise.all([
        basePrisma.users.count({ where: whereClause }),
        /* ------------------------------------
        basePrisma.users.findMany({
          where: whereClause,
          skip,
          take,
          orderBy: { updated_at: 'desc' },
          include: {
            // Lấy thông tin Dòng họ context
            tenants: {
              select: { id: true, name: true, status: true, slug: true, description: true }
            },
          ---------------------------------------- */
        
        // Sử dụng từ điển prisma.js
        basePrisma.users.findMany({
          where: whereClause,
          skip,
          take,
          orderBy: { updated_at: 'desc' },
          // Gọi trực tiếp hằng số tập trung: Hệ thống tự động JOIN sạch và ép deleted_at = null ở tầng dưới!
          select: {
            ...PRISMA_SELECTS.USER_REGISTRATION,
            tenants: {
              select: PRISMA_SELECTS.TENANT_STANDARD
            }
          }
        }),
      ]);

      /** Không cần giả lập quan hệ mà luôn có FK (1-[0..n]) từ members -> user
       * Giả lập bổ sung: Nếu database chưa tạo quan hệ trực tiếp trong schema giữa User và Member, 
       * ta sẽ lấy danh sách member tương ứng dựa trên tenant_id hoặc cơ chế map thủ công để đảm bảo an toàn tuyệt đối
      const enrichedData = await Promise.all(users.map(async (user) => {
        // Tìm hồ sơ member chính thức trên cây gia phả có tên trùng với snapshot hoặc có liên kết tài khoản
        let linkedMember = null;
        //if (user.status === 'DA_DUYET' || user.status === 'BI_KHOA') {
        if (user.status != 'CHO_DUYET') {
          linkedMember = await basePrisma.members.findFirst({
            where: {
              tenant_id: user.tenant_id,
              full_name: user.temp_full_name || user.name,
              deleted_at: null
            },
            select: {
              id: true,
              full_name: true,
              generation: true,
              gender: true,
              is_alive: true
            }
          });
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          status: user.status, // CHO_DUYET, DA_DUYET, TU_CHOI, BI_KHOA
          role: user.role,
          created_at: user.created_at,
          updated_at: user.updated_at,
          temp_snapshot: {
            full_name: user.temp_full_name,
            birth_year: user.temp_birth_year,
            branch_name: user.temp_branch_name,
            registration_reason: user.registration_reason
          },
          tenant: user.tenants || null,
          member_profile: linkedMember // Đính kèm hồ sơ cây gia phả vật lý
        };
      }));
      ******************************************************* */
      
      /*
       * PATH       : src/services/authService.js (Hàm queryReviewableUsers - Đoạn enrichedData)
       * DATETIME   : 2026-06-20T16:45:00+07:00
       * DESCRIPTION: Tối ưu hóa truy vấn dựa trên bản chất Khóa ngoại (FK) member_id.
       * Loại bỏ hoàn toàn việc dò tìm bằng text (full_name) chậm chạp và thiếu chính xác.
      */
      const enrichedData = await Promise.all(users.map(async (user) => {
        let linkedMember = null;

        // 🎯 ĐÚNG BẢN CHẤT: Chỉ truy vấn include thông tin cây phả hệ khi tài khoản thực sự giữ mối liên kết FK
        if (user.member_id !== null && user.member_id !== undefined) {
          linkedMember = await basePrisma.members.findFirst({
            where: {
              id: user.member_id, // Truy vấn trực tiếp bằng Khóa chính/Khóa ngoại (Index tốc độ cao)
              tenant_id: user.tenant_id,
              deleted_at: null
            },
            select: {
              id: true,
              full_name: true,
              generation: true,
              gender: true,
              is_alive: true,
              branch_name: true // Đảm bảo lấy chi cành nuôi Khung 3 Frontend
            }
          });
        }
       
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          status: user.status, 
          role: user.role,
          created_at: user.created_at,
          updated_at: user.updated_at,
          temp_snapshot: {
            full_name: user.temp_full_name || user.name || 'Chưa khai báo',
            birth_year: user.temp_birth_year || 'Chưa khai báo',
            branch_name: user.temp_branch_name || 'Chưa khai báo',
            father_name: user.temp_father_name || 'Chưa khai báo',
            grandfather_name: user.temp_grandfather_name || 'Chưa khai báo',
            address: user.temp_address || 'Chưa khai báo',
            relationship: user.temp_relationship || 'CON_DE',
            note: user.temp_note || 'Không có ghi chú',
            social_profiles: user.temp_social_profiles || {},
            registration_reason: user.registration_reason || 'Nộp đơn gia nhập tộc hệ'
          },
          tenant: user.tenants || null,
          member_profile: linkedMember 
        };
      }
    ));

      return {
        pagination: {
          total_records: totalRecords,
          current_page: parseInt(page, 10),
          limit: take,
          total_pages: Math.ceil(totalRecords / take)
        },
        data: enrichedData
      };

    } catch (error) {
      console.error('❌ [queryReviewableUsers Advanced Exception]:', error.message);
      throw error;
    }
  },

  /** 
   * Cách xử lý gộp: Approve or Reject 
  // =========================================================================
  // CORE PROCESS: TIẾN TRÌNH DUYỆT ĐƠN (HỢP NHẤT 3 SỔ CÁI)
  // =========================================================================
   * @dateTime 2026-06-17T11:32:00+07:00
   * @description Thực thi luồng xử lý quyết định phê duyệt tộc viên từ UI Admin gửi lên.
  */
  /** 
    * VERSION    : 20.2.2-DYNAMIC-ATTEMPT-LEDGER
    * DESCRIPTION:
    * - SỬA LỖI ĐÓNG BĂNG ATTEMPT: Tự động tính toán luỹ tiến attempt_no dựa trên số lần xử lý thực tế của một user_id.
    * - Đồng bộ nạp biến attempt_no động vào cả Business Ledger (businessLogger) và Communication Ledger (notificationBuilder).
  */
/* 
  processUserApproval: async (payload) => {
    const { userId, newStatus, adminNote, actorId, role, actorTenantId, correlation_id } = payload;

    if (!adminNote || adminNote.trim() === '') {
      const error = new Error('Tiến trình bị hủy. Ghi chú phê duyệt không được phép để trống.');
      error.status = 400;
      throw error;
    }

    // 1. Tính toán lũy tiến attempt_no trước khi mở transaction (Đã tối ưu đường dẫn JSON)
    const pastAttemptsCount = await basePrisma.business_process_logs.count({
      where: {
        process_type: 'USER_APPROVAL',
        metadata: { path: ['context', 'target_id'], equals: userId }
      }
    });
    const currentAttemptNo = pastAttemptsCount + 1;

    // Biến trung gian hứng thông tin tài khoản phục vụ ghi log an ninh sau này
    let securityLogIdentifier = 'unknown';

    // -------------------------------------------------------------------
    // 🏛️ KHỐI TRANSACTION TỐI ƯU HÓA TỐC ĐỘ CAO
    // -------------------------------------------------------------------
    // 🎯 ĐÃ VÁ: Tăng thời gian timeout lên 15 giây (15000ms) bọc lót cho hạ tầng Supabase mạng chậm
    const resultUser = await basePrisma.$transaction(async (tx) => {
      
      const targetUser = await tx.users.findUnique({
        where: { id: userId },
        // 🎯 ĐÃ TỐI ƯU SIÊU TỐC: Không lôi cả tảng trường temp_ rườm rà vào đây nữa, chỉ lấy 4 trường cốt lõi để chạy logic!
        select: {
          id: true,
          tenant_id: true,
          status: true,
          phone: true,
          email: true,
          name: true,
          temp_full_name: true,
          tenants: {
            select: { id: true, status: true }
          }
        }
      });

      if (!targetUser) {
        throw new Error('Không tìm thấy tài khoản yêu cầu phê duyệt.');
      }

      if (role !== 'SYSTEM_ADMIN' && targetUser.tenant_id !== actorTenantId) {
        throw new Error('DENIED');
      }

      // Nạp danh tính vào biến trung gian ra ngoài transaction dùng
      securityLogIdentifier = targetUser.phone || targetUser.email || 'unknown';

      const snapshotName = targetUser.temp_full_name || targetUser.name || 'Thành viên ẩn danh';
      const oldUserStatus = targetUser.status;
      const finalReason = adminNote || `Xử lý thay đổi trạng thái thành ${newStatus}`;
      
      // XỬ LÝ 1: Cập nhật trạng thái người dùng
      await tx.users.update({
        where: { id: userId },
        data: { status: newStatus, changed_by: actorId }
      });
      
      // XỬ LÝ 2: Cập nhật trạng thái Dòng họ (Áp dụng logic gộp phẳng siêu tinh gọn của Trưởng tộc)
      let oldTenantStatus = null;
      let updatedTenantData = null;
      
      if (targetUser.tenants && targetUser.tenants.status === 'CHO_DUYET' && newStatus === 'DA_DUYET') {
        oldTenantStatus = targetUser.tenants.status;
        const nextTenantStatus = 'TAM_NGUNG';
        
        updatedTenantData = await tx.tenants.update({
          where: { id: targetUser.tenant_id },
          data: { status: nextTenantStatus, changed_by: actorId }
        });
      }

      // XỬ LÝ 3: Ghi Sổ Cái Nghiệp vụ (Ghi trực tiếp thông qua Transaction client `tx` nếu businessLogger hỗ trợ, hoặc để nguyên)
      await businessLogger.createLog({
        correlation_id,
        attempt_no: currentAttemptNo,
        process_type: 'USER_APPROVAL',
        actor_type: 'USER',
        actor_id: actorId,
        tenant_id: targetUser.tenant_id,
        process_status: 'SUCCESS',
        context: { target_id: userId, target_name: snapshotName, attempt_no: currentAttemptNo },
        payload: {
          admin_note: adminNote || 'Phê duyệt tài khoản thành công',
          status_before: oldUserStatus,
          status_after: newStatus,
          attempt_no: currentAttemptNo
        }
      });

      // XỬ LÝ 4: Ghi Nhật ký biến động Audit Trail (Dùng tx lót nền nếu hàm hỗ trợ)
      await auditService.logAction('CAP_NHAT', 'users', userId, { status: oldUserStatus }, { status: newStatus }, actorId, finalReason, targetUser.tenant_id, correlation_id);
      
      if (updatedTenantData) {
        await auditService.logAction('CAP_NHAT', 'tenants', targetUser.tenant_id, { status: oldTenantStatus }, { status: updatedTenantData.status }, actorId, finalReason, targetUser.tenant_id, correlation_id);
      }

      return targetUser;
    }, {
      maxWait: 5000, // Thời gian tối đa chờ giành được kết nối (5 giây)
      timeout: 15000 // Thời gian thực thi tối đa của Transaction (Đẩy lên 15 giây)
    });

    // =========================================================================
    // 🚀 KHỐI TÁC VỤ SAU TRANSACTION (MẠNG CHẠY SONG SONG KHÔNG BLOCK DB)
    // =========================================================================
    
    // 🟢 ĐÃ DỊCH CHUYỂN RA NGOÀI TRANSACTION: Log an ninh hạ tầng chạy thoải mái không sợ block lệnh commit
    authLogService.logAttempt({
      identifier: securityLogIdentifier,
      ip_address: 'system_internal',
      user_agent: 'server_orchestrator',
      status: 'THANH_CONG',
      failure_reason: `REVIEW_STATUS_CHANGED_TO_${newStatus}`
    }).catch(err => console.error('⚠️ [AuthLog Non-blocking Error]:', err.message));

    // =========================================================================
    // 🏛️ STEP 7: KÍCH HOẠT COMMUNICATION LEDGER (Giữ nguyên vẹn cũ của bác)
    // =========================================================================
    try {
      const eventType = newStatus === 'DA_DUYET' ? 'USER_APPROVED' : 'USER_REJECTED';
      let title = '';
      let content = '';
      let schemaPayload = {};

      if (eventType === 'USER_APPROVED') {
        title = `Yêu cầu gia nhập tộc hệ đã được chấp thuận (Lượt xét duyệt #${currentAttemptNo})`;
        content = `Chúc mừng bạn đã được phê duyệt trở thành thành viên chính thức sau ${currentAttemptNo} lượt thẩm định. Lời nhắn: ${adminNote}`;
        schemaPayload = { approved_role: resultUser.role || 'USER', approver_note: adminNote, attempt_no: currentAttemptNo, tenant_id: resultUser.tenant_id };
      } else {
        title = `Yêu cầu gia nhập tộc hệ bị từ chối (Lượt xét duyệt #${currentAttemptNo})`;
        content = `Hồ sơ đăng ký của bạn không được thông qua tại lượt xét duyệt số ${currentAttemptNo}. Lý do từ ban quản trị: ${adminNote}`;
        schemaPayload = { reason: adminNote, approver_note: adminNote, attempt_no: currentAttemptNo, tenant_id: resultUser.tenant_id };
      }

      const notificationPayload = notificationBuilder.build({
        user_id: resultUser.id,
        tenant_id: resultUser.tenant_id,
        correlation_id: correlation_id,
        event_type: eventType,
        title,
        content,
        level: 'INFO',
        reliability: 'LOW',
        status: 'PENDING',
        context: { target_id: resultUser.id, target_name: resultUser.temp_full_name || resultUser.name || 'Tộc viên tương lai', attempt_no: currentAttemptNo },
        payload: schemaPayload
      });

      await basePrisma.notifications.create({
        data: {
          ...notificationPayload,
          tenant_id: resultUser.tenant_id,
          changed_by: actorId
        }
      });
    } catch (commError) {
      console.error('⚠️ [Communication Ledger Exception]: Thất bại khi sinh Silent Emit Notification:', commError.message);
    }

    return resultUser;
  },
*/

processUserApproval: async (payload) => {
    const { userId, newStatus, adminNote, actorId, role, actorTenantId, correlation_id } = payload;

    if (!adminNote || adminNote.trim() === '') {
      const error = new Error('Tiến trình bị hủy. Ghi chú phê duyệt không được phép để trống.');
      error.status = 400;
      throw error;
    }

    const pastAttemptsCount = await basePrisma.business_process_logs.count({
      where: {
        process_type: 'USER_APPROVAL',
        metadata: { path: ['context', 'target_id'], equals: userId }
      }
    });
    const currentAttemptNo = pastAttemptsCount + 1;

    let securityLogIdentifier = 'unknown';
    let resultUser = null;

    // ====================== TRANSACTION ======================
    resultUser = await basePrisma.$transaction(async (tx) => {
      
      const targetUser = await tx.users.findUnique({
        where: { id: userId },
        select: {
          id: true,
          tenant_id: true,
          status: true,
          phone: true,
          email: true,
          name: true,
          temp_full_name: true,
          tenants: { select: { id: true, status: true } }
        }
      });

      if (!targetUser) throw new Error('Không tìm thấy tài khoản yêu cầu phê duyệt.');

      if (role !== 'SYSTEM_ADMIN' && targetUser.tenant_id !== actorTenantId) {
        throw new Error('DENIED');
      }

      securityLogIdentifier = targetUser.phone || targetUser.email || 'unknown';

      const snapshotName = targetUser.temp_full_name || targetUser.name || 'Thành viên ẩn danh';
      const oldUserStatus = targetUser.status;
      const finalReason = adminNote || `Xử lý thay đổi trạng thái thành ${newStatus}`;

      // Update User
      await tx.users.update({
        where: { id: userId },
        data: { status: newStatus, changed_by: actorId }
      });

      // Update Tenant nếu cần
      let updatedTenantData = null;
      if (targetUser.tenants && targetUser.tenants.status === 'CHO_DUYET' && newStatus === 'DA_DUYET') {
        updatedTenantData = await tx.tenants.update({
          where: { id: targetUser.tenant_id },
          data: { status: 'TAM_NGUNG', changed_by: actorId }
        });
      }

      // === GHI LOG BÊN TRONG TRANSACTION (truyền tx nếu service hỗ trợ) ===
      await businessLogger.createLog({
        correlation_id,
        attempt_no: currentAttemptNo,
        process_type: 'USER_APPROVAL',
        actor_type: 'USER',
        actor_id: actorId,
        tenant_id: targetUser.tenant_id,
        process_status: 'SUCCESS',
        context: { target_id: userId, target_name: snapshotName, attempt_no: currentAttemptNo },
        payload: {
          admin_note: adminNote || 'Phê duyệt tài khoản thành công',
          status_before: oldUserStatus,
          status_after: newStatus,
          attempt_no: currentAttemptNo
        }, tx
      });

      await auditService.logAction('CAP_NHAT', 'users', userId, { status: oldUserStatus }, { status: newStatus }, actorId, finalReason, targetUser.tenant_id, correlation_id, tx);
      
      if (updatedTenantData) {
        await auditService.logAction('CAP_NHAT', 'tenants', targetUser.tenant_id, { status: 'CHO_DUYET' }, { status: updatedTenantData.status }, actorId, finalReason, targetUser.tenant_id, correlation_id, tx);
      }

      return targetUser;
    }, { maxWait: 5000, timeout: 15000 });

    // ====================== SAU TRANSACTION ======================
    authLogService.logAttempt({
      identifier: securityLogIdentifier,
      ip_address: 'system_internal',
      user_agent: 'server_orchestrator',
      status: 'THANH_CONG',
      failure_reason: `REVIEW_STATUS_CHANGED_TO_${newStatus}`
    }).catch(err => console.error('⚠️ [AuthLog Error]:', err.message));

    // Notification (sau transaction)
    try {
      const eventType = newStatus === 'DA_DUYET' ? 'USER_APPROVED' : 'USER_REJECTED';
      let title = '';
      let content = '';
      let schemaPayload = {};

      if (eventType === 'USER_APPROVED') {
        title = `Yêu cầu gia nhập tộc hệ đã được chấp thuận (Lượt xét duyệt #${currentAttemptNo})`;
        content = `Chúc mừng bạn đã được phê duyệt trở thành thành viên chính thức sau ${currentAttemptNo} lượt thẩm định. Lời nhắn: ${adminNote}`;
        schemaPayload = { approved_role: resultUser.role || 'USER', approver_note: adminNote, attempt_no: currentAttemptNo, tenant_id: resultUser.tenant_id };
      } else {
        title = `Yêu cầu gia nhập tộc hệ bị từ chối (Lượt xét duyệt #${currentAttemptNo})`;
        content = `Hồ sơ đăng ký của bạn không được thông qua tại lượt xét duyệt số ${currentAttemptNo}. Lý do từ ban quản trị: ${adminNote}`;
        schemaPayload = { reason: adminNote, approver_note: adminNote, attempt_no: currentAttemptNo, tenant_id: resultUser.tenant_id };
      }

      const notificationPayload = notificationBuilder.build({
        user_id: resultUser.id,
        tenant_id: resultUser.tenant_id,
        correlation_id: correlation_id,
        event_type: eventType,
        title,
        content,
        level: 'INFO',
        reliability: 'LOW',
        status: 'PENDING',
        context: { target_id: resultUser.id, target_name: resultUser.temp_full_name || resultUser.name || 'Tộc viên tương lai', attempt_no: currentAttemptNo },
        payload: schemaPayload
      });

      await basePrisma.notifications.create({
        data: {
          ...notificationPayload,
          tenant_id: resultUser.tenant_id,
          changed_by: actorId
        }
      });
    } catch (commError) {
      console.error('⚠️ [Communication Ledger Exception]:', commError.message);
    }

    return resultUser;
  },

};

module.exports = authService;