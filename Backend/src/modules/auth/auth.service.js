/**
 * PATH       : src/modules/auth/auth.service.js
 * DATETIME   : 2026-08-15T18:30:00+07:00
 * VERSION    : 20.2.5-PR-2: BPL USER_APPROVAL semantic (schema + revision submit không dùng USER_REGISTER).
 * DESCRIPTION: Revision submit: đổi USER_REGISTER → USER_APPROVAL + action: REVISION_SUBMIT
 * (+ PR-1) process_kind REGISTER khi createCaseFromRegister; findOpenCaseByUser chỉ RP (process_kind REGISTER).
 * - Promote member after Register Approved. 
 * - PR-OP-4-Enhancement: Cờ từ chối lần cuối (UI list/form) — không đổi users.status
 * - Admin trả về sửa: giữ CHO_DUYET; case → NEEDS_REVISION + review_note.
 * - B1: isRevision không JWT; xác thực phone/password.
 * - PR-OP-3:getMyOnboardingCase + revision submit
 * - Bước 2: TU_CHOI → CHO_DUYET + case mới (correlation mới).
 * - [20.2.2-sysadmi-PR-OP-1b] PR-OP-1b: tạo member dự bị, bổ sung các trường tạm thời vào snapshot hồ sơ (temp_birth_year, temp_note, member_id, role) phục vụ Notification Orchestrator.
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
 * CHANGE LOGS:
 * - PR-OP-1b: Approve/Reject user (DA_DUYET | TU_CHOI).
   * - C = correlation factory tập trung (prisma.correlation.create).
   * - Member DU_BI (gender KHAC) + users.member_id khi DA_DUYET và chưa có.
   * - Case open → APPROVED / REJECTED (onboardingService + tx).
   * - BPL USER_APPROVAL + audit trong TX; notif post-TX.
   * - Authz: no self-approve, SYSTEM-only CreateClan, actor CLAN_ADMIN phải DA_DUYET.
   * - Q1: không đụng flow Register / 1a; return object đầy đủ status + member_id.
 * - PR-OP-1b Bước 2: TU_CHOI → CHO_DUYET + case mới (correlation mới).
   * - Case cũ giữ REJECTED; case mới: create SUBMITTED rồi update NEEDS_REVISION + review_note.
   * - BPL USER_APPROVAL + payload.action = REOPEN_REJECTED; audit; notif orchestrator (C mới).
   * - Không tạo member, không đổi tenant status. Q1: không đụng processUserApproval.
 *  PR-OP-1b Bước 3: getMyOnboardingCase + revision submit
 * - 1) GET my-onboarding-case (hoặc tương đương):
 *    User đang CHO_DUYET lấy case hiện tại + review_note + temp_* (prefill).
 * - 2) updateRegistrationDraft / revision submit:
 *    Applicant gửi lại hồ sơ đã sửa; giữ CHO_DUYET; case có thể SUBMITTED hoặc giữ NEEDS_REVISION (chốt khi design).
 * - 20.2.5-PR-OP-3B1
   * - B1: isRevision không JWT; xác thực phone/password.
   * - Chỉ CHO_DUYET; khóa phone/email; cập nhật temp_*.
   * - Case NEEDS_REVISION → SUBMITTED. Không tạo user/tenant/member.
 * 20.2.5-PR-OP-4-R1:
   * - Admin trả về sửa: giữ CHO_DUYET; case → NEEDS_REVISION + review_note.
   * - Không tạo member, không đổi tenant, không đổi users.status.
 * 20.2.5-PR-OP-4-Enhancement:
   * - Trong enrichedData, với mỗi user, trước return { ... }: cờ từ chối lần cuối (UI list/form) — không đổi users.status
 * 20.2.5 - C3:
   * - 2026-08-13: processUserApproval DA_DUYET → openMemberPromoteInstance (OP DRAFT, C mới).
   * - SSOT: Register-to-OP-Handoff-Contract-2026-08-13 v1.0. Q1: không đổi luồng Approve/Reject cốt lõi.
*/
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

//const { basePrisma } = require('../lib/prisma');
const { basePrisma, prisma, PRISMA_SELECTS } = require('../../lib/prisma.js');
const authLogService = require('./authLog.service');
const { cleanInput, formatNumericSlug } = require('../../shared/utils/slug.utils');
const securityConfig = require('../../config/securityConfig');

const onboardingService = require('../../services/onboarding.service');
//20.2.5 -C3
const { openMemberPromoteInstance } = require('../onboarding/srpf');
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
    /* ********************
    if (user.status === 'CHO_DUYET') {
      const error = new Error('Hồ sơ của bác đang chờ Ban Quản trị phê duyệt. Vui lòng quay lại sau.');
      error.status = 423;
      error.code = 'ACCOUNT_CHO_DUYET';
      throw error;
    }
    ************ */
    /**
     * <2026-06-18T17:00:00+07:00>: PR-OP-3A: 423 kèm reviewNote + canEdit + tempSnapshot (fail-open nếu không có case) 
     */
    // PR-OP-3A: 423 kèm reviewNote + canEdit + tempSnapshot (fail-open nếu không có case)
        // 2b. Lifecycle — CHO_DUYET
    // PR-OP-3A / PR-OP-4:
    // - Luôn 423, không cấp JWT.
    // - canEdit = true chỉ khi case NEEDS_REVISION và có review_note (QTV trả về sửa).
    // - Đăng ký lần đầu (SUBMITTED, chưa bút phê) → canEdit = false (chỉ chờ duyệt).
    if (user.status === 'CHO_DUYET') {
      let reviewNote = null;
      let caseStatus = null;
      let caseId = null;

      try {
        const openCase = await basePrisma.onboarding_cases.findFirst({
          where: {
            user_id: user.id,
            deleted_at: null,
            process_kind: 'REGISTER', // PR-1
            status: {
              in: [
                'SUBMITTED',
                'UNDER_REVIEW',
                'NEEDS_REVISION',
                'DRAFT',
                'PROFILE_COMPLETED',
                'FAMILY_TREE_DRAFT',
              ],
            },
          },
        });

        if (openCase) {
          reviewNote = openCase.review_note
            ? String(openCase.review_note).trim() || null
            : null;
          caseStatus = openCase.status;
          caseId = openCase.id;
        }
      } catch (caseErr) {
        console.error('[LOGIN][CHO_DUYET][CASE]', caseErr.message || caseErr);
      }

      // Chỉ cho sửa hồ sơ khi QTV đã trả về sửa (có bút phê trên case NEEDS_REVISION)
      const canEdit =
        caseStatus === 'NEEDS_REVISION' &&
        !!reviewNote;

      const error = new Error(
        canEdit
          ? 'Ban Quản trị có góp ý. Bác vui lòng xem và bổ sung hồ sơ.'
          : 'Hồ sơ của bác đang chờ Ban Quản trị phê duyệt. Vui lòng quay lại sau.'
      );
      error.status = 423;
      error.code = 'ACCOUNT_CHO_DUYET';
      error.reviewNote = reviewNote;
      error.canEdit = canEdit;
      error.caseStatus = caseStatus;
      error.caseId = caseId;
      error.tempSnapshot = {
        temp_full_name: user.temp_full_name || null,
        temp_father_name: user.temp_father_name || null,
        temp_grandfather_name: user.temp_grandfather_name || null,
        temp_birth_year: user.temp_birth_year || null,
        temp_relationship: user.temp_relationship || null,
        temp_address: user.temp_address || null,
        temp_branch_name: user.temp_branch_name || null,
        temp_note: user.temp_note || null,
        temp_social_profiles: user.temp_social_profiles || {},
        // PR-OP-4: identity + tenant để prefill revision
        phone: user.phone || null,
        email: user.email || null,
        tenant_id: user.tenant_id || null,
        tenantId: user.tenant_id || null,
        clanName: user.tenants?.name || null,
        tenantSlug: user.tenants?.slug || null,
        description: user.tenants?.description || null,
        // Phân luồng Join vs Create (PR-OP-4 CLAN_SETUP)
        role: user.role || null,
        isNewClan: user.role === 'CLAN_ADMIN',
      };
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

    // SSOT tenant display cho FE header (mọi page sau login)
    const sc =
      user.tenants?.social_configs &&
      typeof user.tenants.social_configs === 'object'
        ? user.tenants.social_configs
        : {};
    const tenantDto = user.tenants
      ? {
          id: user.tenants.id || user.tenant_id || null,
          name: user.tenants.name || null,
          logo_url: user.tenants.logo_url || null,
          slogan: user.tenants.slogan || null,
          logo_icon: sc.logo_icon || null,
          status: user.tenants.status || tenantStatus,
        }
      : user.tenant_id
        ? {
            id: user.tenant_id,
            name: null,
            logo_url: null,
            slogan: null,
            logo_icon: null,
            status: tenantStatus,
          }
        : null;

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone || null,
        role: user.role,
        tenant_id: user.tenant_id,
        tenantId: user.tenant_id,
        status: user.status,
        tenantStatus, // FE routing (giữ flat)
        // Chuẩn hóa header multi-tenant
        tenant: tenantDto,
        // Tương thích ngược (OpHub resolveTenant / RP cũ)
        clanName: tenantDto?.name || null,
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
    //PR-OP-3B: Nếu isRevision = true, gọi submitRegistrationRevision
    if (payload.isRevision === true) {
      return authService.submitRegistrationRevision(payload, extraData);
    }
    
    const { isNewClan, clanName, description, tenantId, ...userData } = payload;
    //PR-OP-1a.1 M1: Lấy correlationId từ extraData để dùng cho tracking
    const { ip_address, user_agent, correlationId: incomingCorrelationId } = extraData;
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

// ========== POST-TX (M1): case + BPL + audit + notif — ngoài TX, cùng C ==========
      const C =
        incomingCorrelationId ||
        crypto.randomUUID();

      await authLogService.logAttempt({
        identifier: logIdentifier,
        ip_address,
        user_agent,
        status: 'THANH_CONG',
        failure_reason: 'REGISTER_SUCCESS',
      });

      const userId = transactionResult.userId;
      const tid = transactionResult.tenantId;
      const caseType = isNewClan ? 'CLAN_SETUP' : 'MEMBER_JOIN';
      const registrationType = isNewClan ? 'NEW_CLAN' : 'JOIN_CLAN';
      const displayName =
        userData.temp_full_name ||
        userData.name ||
        logIdentifier ||
        'new-user';

      let caseRow = null;

      // 1) Onboarding case SUBMITTED
      try {
        caseRow = await onboardingService.createCaseFromRegister({
          correlationId: C,
          caseType,
          userId,
          tenantId: tid,
          changedBy: userId,
          metadata: {
            source: 'REGISTER',
            registrationType,
          },
        });
      } catch (err) {
        console.error('[REGISTER_LEDGER][CASE]', err.message || err);
      }

      // 2) BPL USER_REGISTER (attempt 1)
      try {
        await businessLogger.createLog({
          correlation_id: C,
          attempt_no: 1,
          process_type: 'USER_REGISTER',
          actor_type: 'USER',
          actor_id: userId,
          tenant_id: tid,
          process_status: 'SUCCESS',
          context: {
            target_id: userId,
            target_name: displayName,
          },
          payload: {
            email: userData.email
              ? cleanInput(userData.email, 'email')
              : null,
            phone: logIdentifier || null,
            registered_via: 'WEB',
            temp_full_name: userData.temp_full_name || null,
          },
        });
      } catch (err) {
        console.error('[REGISTER_LEDGER][BPL_USER_REGISTER]', err.message || err);
      }

      // 3) BPL ONBOARDING_CASE_CREATE (attempt 2)
      try {
        await businessLogger.createLog({
          correlation_id: C,
          attempt_no: 2,
          process_type: 'ONBOARDING_CASE_CREATE',
          actor_type: 'USER',
          actor_id: userId,
          tenant_id: tid,
          process_status: 'SUCCESS',
          context: {
            target_id: caseRow?.id || userId,
            target_name: caseType,
          },
          payload: {
            case_type: caseType,
            initial_step: 'REGISTER',
            user_id: userId,
            member_id: null,
            branch_id: null,
          },
        });
      } catch (err) {
        console.error('[REGISTER_LEDGER][BPL_CASE]', err.message || err);
      }

      // 4) Audit users (+ tenants nếu CreateClan)
      try {
        await auditService.logAction(
          'THEM_MOI',
          'users',
          userId,
          null,
          {
            status: 'CHO_DUYET',
            role: isNewClan ? 'CLAN_ADMIN' : 'VIEWER',
            tenant_id: tid,
          },
          userId,
          isNewClan ? 'REGISTER_CREATE_CLAN' : 'REGISTER_JOIN_CLAN',
          tid,
          C
        );

        if (isNewClan && tid) {
          await auditService.logAction(
            'THEM_MOI',
            'tenants',
            tid,
            null,
            { status: 'CHO_DUYET', name: clanName || null },
            userId,
            'REGISTER_CREATE_CLAN',
            tid,
            C
          );
        }
      } catch (err) {
        console.error('[REGISTER_LEDGER][AUDIT]', err.message || err);
      }

      // 5) Notif — tạm giữ orchestrator (đã vá correlation) HOẶC đổi notification.create sau
      try {
        await notificationOrchestrator.emit(
          'USER_REGISTERED',
          {
            userId,
            correlationId: C,
            metadata: {
              tenantId: tid,
              registrationType,
              status: transactionResult.status,
              caseId: caseRow?.id || null,
            },
            executeImmediately: false,
          },
          null
        );
      } catch (emitError) {
        console.error('[EGAL-25][SilentEmit][USER_REGISTERED]', emitError);
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

  //UAT PR-OP-4:Đổi findUnique → findFirst + deleted_at: null cho khớp login/register.
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
        existing = await basePrisma.tenants.findFirst({
          where: { slug: cleanedValue, deleted_at: null },
        });
        break;

      case 'email':
        existing = await basePrisma.users.findFirst({
          where: { email: cleanedValue, deleted_at: null },
        });
        break;

      case 'phone':
        existing = await basePrisma.users.findFirst({
          where: { phone: cleanedValue, deleted_at: null },
        });
        break;

      default:
        throw new Error('INVALID_TYPE');
    }

    return {
      available: !existing,
      message: existing
        ? type === 'phone'
          ? 'Số điện thoại này đã được sử dụng.'
          : type === 'email'
            ? 'Email này đã được sử dụng.'
            : 'Giá trị này đã được sử dụng.'
        : undefined,
    };
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
            branch_id: true,
            status: true,
            role: true,
            branch: {
              select: {
                id: true,
                name: true,
              },
            },
          }
          });
        }
       
        // PR-OP-4-Enhancement: cờ từ chối lần cuối (UI list/form) — không đổi users.status
        let isFinalRejection = false;
        if (user.status === 'TU_CHOI') {
          try {
            const rejectedCase = await basePrisma.onboarding_cases.findFirst({
              where: {
                user_id: user.id,
                status: 'REJECTED',
                deleted_at: null,
                process_kind: 'REGISTER', // PR-1
              },
            });
            const meta =
              rejectedCase?.metadata &&
              typeof rejectedCase.metadata === 'object'
                ? rejectedCase.metadata
                : {};
            isFinalRejection = meta.is_final_rejection === true;
          } catch (e) {
            console.error('[queryReviewableUsers][isFinal]', e.message || e);
          }
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          status: user.status, 
          role: user.role,
          isFinalRejection, // ← thêm cờ từ chối lần cuối (UI list/form) — không đổi users.status
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
    * VERSION    : 20.2.2-DYNAMIC-ATTEMPT-LEDGER
    * DESCRIPTION:
    * - SỬA LỖI ĐÓNG BĂNG ATTEMPT: Tự động tính toán luỹ tiến attempt_no dựa trên số lần xử lý thực tế của một user_id.
    * - Đồng bộ nạp biến attempt_no động vào cả Business Ledger (businessLogger) và Communication Ledger (notificationBuilder).
  */

  /**
   * - PR-OP-1b: Approve/Reject user (DA_DUYET | TU_CHOI).
   * - C = correlation factory tập trung (prisma.correlation.create).
   * - Member DU_BI (gender KHAC) + users.member_id khi DA_DUYET và chưa có.
   * - Case open → APPROVED / REJECTED (onboardingService + tx).
   * - BPL USER_APPROVAL + audit trong TX; notif post-TX.
   * - Authz: no self-approve, SYSTEM-only CreateClan, actor CLAN_ADMIN phải DA_DUYET.
   * - Q1: không đụng flow Register / 1a; return object đầy đủ status + member_id.
   */
  processUserApproval: async (payload) => {
    const {
      userId,
      newStatus,
      adminNote,
      actorId,
      role,
      actorTenantId,
      actorStatus,
      correlation_id,
      correlationId: correlationIdCamel,
      isFinalRejection, // PR-OP-4R2
    } = payload;

    //const finalRejection = isFinalRejection === true;
    const finalRejection =
      isFinalRejection === true ||
      isFinalRejection === 'true' ||
      isFinalRejection === 1;

    // --- Validate input ---
    
    if (!adminNote || adminNote.trim() === '') {
      const error = new Error('Tiến trình bị hủy. Ghi chú phê duyệt không được phép để trống.');
      error.status = 400;
      throw error;
    }

    // Bridge: TU_CHOI → CHO_DUYET = reopen (không vào TX approve)
    const sourceUser = await basePrisma.users.findUnique({
      where: { id: userId },
      select: { id: true, status: true },
    });
    if (!sourceUser) {
      throw new Error('Không tìm thấy tài khoản yêu cầu phê duyệt.');
    }
    if (sourceUser.status === 'TU_CHOI' && newStatus === 'CHO_DUYET') {
      return authService.reopenRejectedUser({
        userId,
        adminNote,
        actorId,
        role,
        actorTenantId,
        actorStatus,
        correlation_id: correlation_id || correlationIdCamel || undefined,
      });
    }

    // DEBUG tạm (xóa sau)
    console.log('[processUserApproval bridge]', {
      sourceStatus: sourceUser.status,
      newStatus,
      isFinalRejection,
      finalRejection,
    });

    // Bridge: TU_CHOI → TU_CHOI + final = chỉ gắn cờ final (không đổi status user)
    if (
      sourceUser.status === 'TU_CHOI' &&
      newStatus === 'TU_CHOI' &&
      finalRejection // đã = isFinalRejection === true
    ) {
      return authService.markFinalRejection({
        userId,
        adminNote,
        actorId,
        role,
        actorTenantId,
        actorStatus,
        correlation_id: correlation_id || correlationIdCamel || undefined,
      });
    }

    // --- Attempt No (ngoài TX, đọc-only) ---
    const pastAttemptsCount = await basePrisma.business_process_logs.count({
      where: {
        process_type: 'USER_APPROVAL',
        metadata: { path: ['context', 'target_id'], equals: userId },
      },
    });
    const currentAttemptNo = pastAttemptsCount + 1;

    // --- Correlation factory tập trung (prisma.js) ---
    // Không dùng crypto.randomUUID() trực tiếp; không gọi tách rời.
    const C =
      correlation_id ||
      correlationIdCamel ||
      prisma.correlation.create();

    let securityLogIdentifier = 'unknown';
    let resultUser = null;

    // ====================== TRANSACTION ======================
    resultUser = await basePrisma.$transaction(
      async (tx) => {
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
            member_id: true,
            temp_birth_year: true,
            temp_note: true,
            role: true,
            tenants: { select: { id: true, status: true } },
          },
        });

        if (!targetUser) {
          throw new Error('Không tìm thấy tài khoản yêu cầu phê duyệt.');
        }

        // ---------- PR-OP-1b Bước 1: siết nguồn status ----------
        // Chỉ CHO_DUYET → DA_DUYET | TU_CHOI trong processUserApproval.
        // DA_DUYET = terminal (không flip qua service này; reverse tay ≤24h SYSTEM_ADMIN).
        // TU_CHOI → CHO_DUYET + case mới = API/flow riêng (bước 2).
        // Trả về sửa (giữ CHO_DUYET + NEEDS_REVISION) = API/flag riêng.
        // Terminal + nguồn: chỉ CHO_DUYET → DA_DUYET | TU_CHOI trong service này

       // 1) Nguồn trước
        if (targetUser.status === 'DA_DUYET') {
          throw new Error('DENIED');
        }
        
        if (targetUser.status !== 'CHO_DUYET') {
          throw new Error('DENIED');
        }

        // 2) newStatus chỉ khi nguồn = CHO_DUYET
        if (!['DA_DUYET', 'TU_CHOI'].includes(newStatus)) {
          const error = new Error('newStatus chỉ nhận DA_DUYET hoặc TU_CHOI.');
          error.status = 400;
          throw error;
        }

        // ---------- Authz (PR-OP-1b) ----------
        // 1. Cấm tự duyệt
        if (actorId === userId) {
          throw new Error('DENIED');
        }
        // 2. Actor CLAN_ADMIN phải đã DA_DUYET
        if (role === 'CLAN_ADMIN' && actorStatus !== 'DA_DUYET') {
          throw new Error('DENIED');
        }
        // 3. CreateClan (target CLAN_ADMIN + CHO_DUYET) → chỉ SYSTEM_ADMIN
        if (
          targetUser.role === 'CLAN_ADMIN' &&
          targetUser.status === 'CHO_DUYET' &&
          role !== 'SYSTEM_ADMIN'
        ) {
          throw new Error('DENIED');
        }
        // 4. Tenant isolation (giữ nguyên)
        if (role !== 'SYSTEM_ADMIN' && targetUser.tenant_id !== actorTenantId) {
          throw new Error('DENIED');
        }



        securityLogIdentifier = targetUser.phone || targetUser.email || 'unknown';

        const snapshotName =
          targetUser.temp_full_name || targetUser.name || 'Thành viên ẩn danh';
        const oldUserStatus = targetUser.status;
        const finalReason =
          adminNote || `Xử lý thay đổi trạng thái thành ${newStatus}`;

        // --- Member DU_BI (chỉ khi DA_DUYET và chưa có member_id) ---
        let newMemberId = targetUser.member_id || null;

        if (newStatus === 'DA_DUYET' && !targetUser.member_id) {
          const member = await tx.members.create({
            data: {
              full_name:
                targetUser.temp_full_name ||
                targetUser.name ||
                'Thành viên mới',
              tenant_id: targetUser.tenant_id,
              gender: 'KHAC',
              status: 'DU_BI',
              phone_number: targetUser.phone || null,
              email: targetUser.email || null,
              birth_year: targetUser.temp_birth_year || null,
              note: targetUser.temp_note || null,
              changed_by: actorId,
            },
          });
          newMemberId = member.id;
        }

        // --- Update users (status + member_id nếu có) ---
        /*
        await tx.users.update({
          where: { id: userId },
          data: {
            status: newStatus,
            changed_by: actorId,
            ...(newStatus === 'DA_DUYET' && newMemberId
              ? { member_id: newMemberId }
              : {}),
          },
        });
        */
        await tx.users.update({
          where: { id: userId },
          data: {
            status: newStatus,
            changed_by: actorId,
            ...(newStatus === 'DA_DUYET' && newMemberId
              ? { member_id: newMemberId }
              : {}),
            // CLAN_SETUP: RP xong vẫn VIEWER — CLAN_ADMIN chỉ sau OP approve
            ...(newStatus === 'DA_DUYET' && targetUser.role === 'CLAN_ADMIN'
              ? { role: 'VIEWER' }
              : {}),
          },
        });

        // --- Tenant CHO_DUYET → TAM_NGUNG (CreateClan) ---
        let updatedTenantData = null;
        if (
          targetUser.tenants &&
          targetUser.tenants.status === 'CHO_DUYET' &&
          newStatus === 'DA_DUYET'
        ) {
          updatedTenantData = await tx.tenants.update({
            where: { id: targetUser.tenant_id },
            data: { status: 'TAM_NGUNG', changed_by: actorId },
          });
        }

        // --- CLAN_SETUP: Reject → tenant TU_CHOI ---
        // Chỉ founder CLAN_ADMIN; tenant còn trong vòng onboarding (CHO_DUYET).
        // Final / không final: cùng status tenant TU_CHOI.
        if (
          newStatus === 'TU_CHOI' &&
          targetUser.role === 'CLAN_ADMIN' &&
          targetUser.tenant_id &&
          targetUser.tenants &&
          targetUser.tenants.status === 'CHO_DUYET'
        ) {
          updatedTenantData = await tx.tenants.update({
            where: { id: targetUser.tenant_id },
            data: {
              status: 'TU_CHOI',
              changed_by: actorId,
            },
          });
        }

        // --- Case open → APPROVED | REJECTED ---
        // PR-2.1: giữ case_id để BPL USER_APPROVAL tham chiếu case RP vừa đóng
        let affectedCaseId = null;
        let caseStatusAfter = null;

        try {
          const openCase = await tx.onboarding_cases.findFirst({
            where: {
              user_id: userId,
              deleted_at: null,
              process_kind: 'REGISTER', // PR-1 (nếu chưa có thì thêm)
              status: {
                in: [
                  'SUBMITTED',
                  'UNDER_REVIEW',
                  'NEEDS_REVISION',
                  'DRAFT',
                  'PROFILE_COMPLETED',
                  'FAMILY_TREE_DRAFT',
                ],
              },
            },
            orderBy: { created_at: 'desc' },
          });

          if (openCase) {
            affectedCaseId = openCase.id;

            if (newStatus === 'DA_DUYET') {
              caseStatusAfter = 'APPROVED';
              await onboardingService.updateCaseStatus({
                caseId: openCase.id,
                status: 'APPROVED',
                changedBy: actorId,
                reviewedBy: actorId,
                reviewNote: adminNote,
                client: tx,
              });
            } else {
              // TU_CHOI
              caseStatusAfter = 'REJECTED';
              await onboardingService.updateCaseStatus({
                caseId: openCase.id,
                status: 'REJECTED',
                changedBy: actorId,
                reviewedBy: actorId,
                rejectionReason: adminNote,
                client: tx,
              });

              // R2: cờ từ chối lần cuối trên metadata case
              const prevMeta =
                openCase.metadata && typeof openCase.metadata === 'object'
                  ? openCase.metadata
                  : {};

              await tx.onboarding_cases.update({
                where: { id: openCase.id },
                data: {
                  metadata: {
                    ...prevMeta,
                    is_final_rejection: finalRejection,
                    rejected_at: new Date().toISOString(),
                    rejected_by: actorId,
                  },
                },
              });
            }
          }
        } catch (caseErr) {
          console.error('[APPROVAL][CASE]', caseErr.message || caseErr);
          throw caseErr; // fail-closed trong TX
        }

        // --- C3: OP handoff — mở MEMBER_PROMOTE DRAFT (Register-to-OP Contract v1.0) ---
        // Chỉ khi DA_DUYET + đã có member DU_BI. Không đụng case RP APPROVED.
        // Cùng TX Approve → fail-closed nếu open OP lỗi.
        if (newStatus === 'DA_DUYET') {
          const promoteMemberId = newMemberId || targetUser.member_id || null;
          if (promoteMemberId && targetUser.tenant_id) {
            let sourceRegisterCaseId = null;
            let sourceRegisterCorrelationId = null;
            let opCaseType = 'MEMBER_JOIN';

            try {
              // openCase có thể đã đóng trong block trên; đọc lại case vừa APPROVED (nếu có)
              const rpCase = await tx.onboarding_cases.findFirst({
                where: {
                  user_id: userId,
                  deleted_at: null,
                  status: 'APPROVED',
                  process_kind: 'REGISTER', // PR-1: nguồn RP
                },
                orderBy: { approved_at: 'desc' },
                select: {
                  id: true,
                  correlation_id: true,
                  case_type: true,
                },
              });
              if (rpCase) {
                sourceRegisterCaseId = rpCase.id;
                sourceRegisterCorrelationId = rpCase.correlation_id || C || null;
                if (rpCase.case_type === 'CLAN_SETUP' || rpCase.case_type === 'MEMBER_JOIN') {
                  opCaseType = rpCase.case_type;
                }
              } else if (targetUser.role === 'CLAN_ADMIN') {
                // Fallback: founder CreateClan thường là CLAN_SETUP
                opCaseType = 'CLAN_SETUP';
              }
            } catch (lookupErr) {
              console.warn('[APPROVAL][OP-HANDOFF][LOOKUP]', lookupErr.message || lookupErr);
            }

            await openMemberPromoteInstance({
              userId,
              memberId: promoteMemberId,
              tenantId: targetUser.tenant_id,
              caseType: opCaseType,
              sourceRegisterCaseId,
              sourceRegisterCorrelationId: sourceRegisterCorrelationId || C || null,
              actorId,
              tx,
            });
          } else {
            console.warn('[APPROVAL][OP-HANDOFF] skip — missing memberId or tenant_id', {
              userId,
              promoteMemberId,
              tenantId: targetUser.tenant_id,
            });
          }
        }

        // --- BPL (correlation_id: C, tx) ---
        await businessLogger.createLog(
          {
            correlation_id: C,
            attempt_no: currentAttemptNo,
            process_type: 'USER_APPROVAL',
            actor_type: 'USER',
            actor_id: actorId,
            tenant_id: targetUser.tenant_id,
            process_status: 'SUCCESS',
            context: {
              target_id: userId,
              target_name: snapshotName,
              attempt_no: currentAttemptNo,
            },
            //20.2.5-PR-2
            payload: {
              action:
                newStatus === 'DA_DUYET'
                  ? 'APPROVE'
                  : finalRejection
                    ? 'FINAL_REJECT'
                    : 'REJECT',
              admin_note: adminNote,
              approver_note: adminNote,
              status_before: oldUserStatus,
              status_after: newStatus,
              attempt_no: currentAttemptNo,
              is_final: newStatus === 'TU_CHOI' ? finalRejection : false,
              approved_role: 'USER',
              // PR-2.1
              case_id: affectedCaseId,
              case_status_after: caseStatusAfter,
            },
          },
          tx
        );

        // --- Audit users ---
        await auditService.logAction(
          'CAP_NHAT',
          'users',
          userId,
          { status: oldUserStatus },
          {
            status: newStatus,
            ...(newMemberId ? { member_id: newMemberId } : {}),
            ...(newStatus === 'DA_DUYET' && targetUser.role === 'CLAN_ADMIN'
              ? { role: 'VIEWER' }
              : {}),
          },
          actorId,
          finalReason,
          targetUser.tenant_id,
          C,
          tx
        );

        // --- Audit tenant (nếu có) ---
        // PR-OP-4 CLAN_SETUP: DA_DUYET → TAM_NGUNG | TU_CHOI → TU_CHOI
        if (updatedTenantData) {
          const statusBefore =
            targetUser.tenants?.status ||
            null;

          await auditService.logAction(
            'CAP_NHAT',
            'tenants',
            targetUser.tenant_id,
            { status: statusBefore },
            { status: updatedTenantData.status },
            actorId,
            finalReason,
            targetUser.tenant_id,
            C,
            tx
          );
        }

        // ★ Return object đầy đủ từ trong TX (tránh out-of-scope)
        return {
          ...targetUser,
          status: newStatus,
          member_id: newMemberId || targetUser.member_id,
        };
      },
      { maxWait: 5000, timeout: 15000 }
    );

    // ====================== SAU TRANSACTION ======================
    authLogService
      .logAttempt({
        identifier: securityLogIdentifier,
        ip_address: 'system_internal',
        user_agent: 'server_orchestrator',
        status: 'THANH_CONG',
        failure_reason: `REVIEW_STATUS_CHANGED_TO_${newStatus}`,
      })
      .catch((err) => console.error('⚠️ [AuthLog Error]:', err.message));

    // Notification (post-TX, fail-open)
    try {
      const eventType =
        newStatus === 'DA_DUYET' ? 'USER_APPROVED' : 'USER_REJECTED';
      let title = '';
      let content = '';
      let schemaPayload = {};

      if (eventType === 'USER_APPROVED') {
        title = `Yêu cầu gia nhập tộc hệ đã được chấp thuận (Lượt xét duyệt #${currentAttemptNo})`;
        content = `Chúc mừng bạn đã được phê duyệt trở thành thành viên chính thức sau ${currentAttemptNo} lượt thẩm định. Lời nhắn: ${adminNote}`;
        schemaPayload = {
          approved_role: resultUser.role || 'USER',
          approver_note: adminNote,
          attempt_no: currentAttemptNo,
          tenant_id: resultUser.tenant_id,
        };
      } else {
        title = `Yêu cầu gia nhập tộc hệ bị từ chối (Lượt xét duyệt #${currentAttemptNo})`;
        content = `Hồ sơ đăng ký của bạn không được thông qua tại lượt xét duyệt số ${currentAttemptNo}. Lý do từ ban quản trị: ${adminNote}`;
        schemaPayload = {
          reason: adminNote,
          approver_note: adminNote,
          attempt_no: currentAttemptNo,
          tenant_id: resultUser.tenant_id,
        };
      }

      const notificationPayload = notificationBuilder.build({
        user_id: resultUser.id,
        tenant_id: resultUser.tenant_id,
        correlation_id: C,
        event_type: eventType,
        title,
        content,
        level: 'INFO',
        reliability: 'LOW',
        status: 'PENDING',
        context: {
          target_id: resultUser.id,
          target_name:
            resultUser.temp_full_name || resultUser.name || 'Tộc viên tương lai',
          attempt_no: currentAttemptNo,
        },
        payload: schemaPayload,
      });

      await basePrisma.notifications.create({
        data: {
          ...notificationPayload,
          tenant_id: resultUser.tenant_id,
          changed_by: actorId,
        },
      });
    } catch (commError) {
      console.error('⚠️ [Communication Ledger Exception]:', commError.message);
    }

    return resultUser;
  },

  //PR-OP-1b - Bước 2: Reject → CHO_DUYET + note (tách riêng, không dùng chung processUserApproval)
  reopenRejectedUser: async (payload) => {
    const {
      userId,
      adminNote,
      actorId,
      role,
      actorTenantId,
      actorStatus,
      correlation_id,
      correlationId: correlationIdCamel,
    } = payload;

    if (!userId) {
      const error = new Error('Thiếu userId.');
      error.status = 400;
      throw error;
    }
    if (!adminNote || adminNote.trim() === '') {
      const error = new Error('Ghi chú mở lại hồ sơ không được để trống.');
      error.status = 400;
      throw error;
    }

    const C =
      correlation_id ||
      correlationIdCamel ||
      prisma.correlation.create();

    const pastAttemptsCount = await basePrisma.business_process_logs.count({
      where: {
        process_type: 'USER_APPROVAL',
        metadata: { path: ['context', 'target_id'], equals: userId },
      },
    });
    const currentAttemptNo = pastAttemptsCount + 1;

    const result = await basePrisma.$transaction(
      async (tx) => {
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
            member_id: true,
            role: true,
          },
        });

        if (!targetUser) {
          throw new Error('Không tìm thấy tài khoản.');
        }

        // Nguồn chỉ TU_CHOI
        if (targetUser.status !== 'TU_CHOI') {
          throw new Error('DENIED');
        }

        // Authz
        if (actorId === userId) {
          throw new Error('DENIED');
        }
        if (role === 'CLAN_ADMIN' && actorStatus !== 'DA_DUYET') {
          throw new Error('DENIED');
        }
        if (targetUser.role === 'CLAN_ADMIN' && role !== 'SYSTEM_ADMIN') {
          throw new Error('DENIED');
        }
        if (role !== 'SYSTEM_ADMIN' && targetUser.tenant_id !== actorTenantId) {
          throw new Error('DENIED');
        }

        const snapshotName =
          targetUser.temp_full_name || targetUser.name || 'Thành viên ẩn danh';
        const oldUserStatus = targetUser.status;
        const finalReason = adminNote.trim();

        // Case REJECTED gần nhất + metadata (TRƯỚC khi check final)
        let caseType =
          targetUser.role === 'CLAN_ADMIN' ? 'CLAN_SETUP' : 'MEMBER_JOIN';

        const lastRejectedCase = await tx.onboarding_cases.findFirst({
          where: {
            user_id: userId,
            status: 'REJECTED',
            deleted_at: null,
            process_kind: 'REGISTER', // PR-1
          },
          orderBy: { created_at: 'desc' },
          select: {
            id: true,
            case_type: true,
            metadata: true,
          },
        });

        if (lastRejectedCase?.case_type) {
          caseType = lastRejectedCase.case_type;
        }

        const lastRejectedMeta =
          lastRejectedCase?.metadata &&
          typeof lastRejectedCase.metadata === 'object'
            ? lastRejectedCase.metadata
            : {};

        if (lastRejectedMeta.is_final_rejection === true) {
          const error = new Error(
            'Hồ sơ đã bị từ chối lần cuối. Không thể mở lại.'
          );
          error.status = 403;
          error.code = 'FINAL_REJECTION';
          throw error;
        }

        // users → CHO_DUYET
        await tx.users.update({
          where: { id: userId },
          data: {
            status: 'CHO_DUYET',
            changed_by: actorId,
          },
        });

        // CLAN_SETUP: tenant TU_CHOI → CHO_DUYET
        if (targetUser.role === 'CLAN_ADMIN' && targetUser.tenant_id) {
          const tenantRow = await tx.tenants.findUnique({
            where: { id: targetUser.tenant_id },
            select: { id: true, status: true },
          });

          if (tenantRow && tenantRow.status === 'TU_CHOI') {
            await tx.tenants.update({
              where: { id: tenantRow.id },
              data: {
                status: 'CHO_DUYET',
                changed_by: actorId,
              },
            });

            try {
              await auditService.logAction(
                'CAP_NHAT',
                'tenants',
                tenantRow.id,
                { status: 'TU_CHOI' },
                { status: 'CHO_DUYET' },
                actorId,
                finalReason,
                targetUser.tenant_id,
                C,
                tx
              );
            } catch (auditErr) {
              console.error(
                '[reopen][tenant audit]',
                auditErr.message || auditErr
              );
            }
          }
        }

        // Case mới
        const newCase = await onboardingService.createCaseFromRegister({
          correlationId: C,
          caseType,
          userId,
          tenantId: targetUser.tenant_id,
          changedBy: actorId,
          metadata: {
            source: 'REOPEN_REJECTED',
            previous_case_id: lastRejectedCase?.id || null,
            reopen_note: finalReason,
          },
        });

        await onboardingService.updateCaseStatus({
          caseId: newCase.id,
          status: 'NEEDS_REVISION',
          changedBy: actorId,
          reviewedBy: actorId,
          reviewNote: finalReason,
          client: tx,
        });

        await businessLogger.createLog(
          {
            correlation_id: C,
            attempt_no: currentAttemptNo,
            process_type: 'USER_APPROVAL',
            actor_type: 'USER',
            actor_id: actorId,
            tenant_id: targetUser.tenant_id,
            process_status: 'SUCCESS',
            context: {
              target_id: userId,
              target_name: snapshotName,
              attempt_no: currentAttemptNo,
            },
            payload: {
              action: 'REOPEN_REJECTED',
              admin_note: finalReason,
              status_before: oldUserStatus,
              status_after: 'CHO_DUYET',
              new_case_id: newCase.id,
              attempt_no: currentAttemptNo,
            },
          },
          tx
        );

        await auditService.logAction(
          'CAP_NHAT',
          'users',
          userId,
          { status: oldUserStatus },
          { status: 'CHO_DUYET' },
          actorId,
          finalReason,
          targetUser.tenant_id,
          C,
          tx
        );

        return {
          ...targetUser,
          status: 'CHO_DUYET',
          newCaseId: newCase.id,
          correlationId: C,
        };
      },
      { maxWait: 5000, timeout: 15000 }
    );

    // Notif orchestrator (fail-open)
    try {
      await notificationOrchestrator.emit(
        'ONBOARDING_REVISION_REQUESTED',
        {
          userId: result.id,
          correlationId: C,
          metadata: {
            tenantId: result.tenant_id,
            status: 'CHO_DUYET',
            caseId: result.newCaseId,
            action: 'REOPEN_REJECTED',
            adminNote: adminNote.trim(),
          },
          executeImmediately: false,
        },
        null
      );
    } catch (emitError) {
      console.error(
        '[EGAL][SilentEmit][USER_REOPENED]',
        emitError.message || emitError
      );
    }

    return result;
  },

  /**
   * PR-OP-4: User đã TU_CHOI → gắn từ chối lần cuối (không đổi users.status).
   * Không cho reopen sau đó.
   */
  markFinalRejection: async (payload) => {
    const {
      userId,
      adminNote,
      actorId,
      role,
      actorTenantId,
      actorStatus,
      correlation_id,
      correlationId: correlationIdCamel,
    } = payload;

    if (!userId) {
      const error = new Error('Thiếu userId.');
      error.status = 400;
      throw error;
    }
    if (!adminNote || adminNote.trim() === '') {
      const error = new Error('Ghi chú từ chối lần cuối không được để trống.');
      error.status = 400;
      throw error;
    }

    const C =
      correlation_id ||
      correlationIdCamel ||
      prisma.correlation.create();

    const pastAttemptsCount = await basePrisma.business_process_logs.count({
      where: {
        process_type: 'USER_APPROVAL',
        metadata: { path: ['context', 'target_id'], equals: userId },
      },
    });
    const currentAttemptNo = pastAttemptsCount + 1;

    const result = await basePrisma.$transaction(
      async (tx) => {
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
            role: true,
          },
        });

        if (!targetUser) {
          throw new Error('Không tìm thấy tài khoản.');
        }

        // Chỉ user đang TU_CHOI
        if (targetUser.status !== 'TU_CHOI') {
          throw new Error('DENIED');
        }

        // Authz (cùng reopen)
        if (actorId === userId) {
          throw new Error('DENIED');
        }
        if (role === 'CLAN_ADMIN' && actorStatus !== 'DA_DUYET') {
          throw new Error('DENIED');
        }
        if (targetUser.role === 'CLAN_ADMIN' && role !== 'SYSTEM_ADMIN') {
          throw new Error('DENIED');
        }
        if (role !== 'SYSTEM_ADMIN' && targetUser.tenant_id !== actorTenantId) {
          throw new Error('DENIED');
        }

        const finalReason = adminNote.trim();
        const snapshotName =
          targetUser.temp_full_name || targetUser.name || 'Thành viên ẩn danh';

        // Case REJECTED gần nhất
        const rejectedCase = await tx.onboarding_cases.findFirst({
          where: {
            user_id: userId,
            status: 'REJECTED',
            deleted_at: null,
            process_kind: 'REGISTER', // PR-1
          },
          orderBy: { created_at: 'desc' },
        });

        if (!rejectedCase) {
          const error = new Error(
            'Không tìm thấy hồ sơ từ chối để gắn cờ từ chối lần cuối.'
          );
          error.status = 400;
          throw error;
        }

        const prevMeta =
          rejectedCase.metadata && typeof rejectedCase.metadata === 'object'
            ? rejectedCase.metadata
            : {};

        if (prevMeta.is_final_rejection === true) {
          const error = new Error(
            'Hồ sơ đã được từ chối lần cuối. Không thể thao tác lại.'
          );
          error.status = 400;
          error.code = 'FINAL_REJECTION';
          throw error;
        }

        await tx.onboarding_cases.update({
          where: { id: rejectedCase.id },
          data: {
            metadata: {
              ...prevMeta,
              is_final_rejection: true,
              final_rejected_at: new Date().toISOString(),
              final_rejected_by: actorId,
              final_note: finalReason,
            },
            review_note: finalReason,
            changed_by: actorId,
          },
        });

        // users.status GIỮ TU_CHOI — không update status

        // CLAN_SETUP: tenant onboarding → TU_CHOI (nếu còn CHO_DUYET)
        if (targetUser.role === 'CLAN_ADMIN' && targetUser.tenant_id) {
          const tenantRow = await tx.tenants.findUnique({
            where: { id: targetUser.tenant_id },
            select: { id: true, status: true },
          });
          if (tenantRow && tenantRow.status === 'CHO_DUYET') {
            await tx.tenants.update({
              where: { id: tenantRow.id },
              data: { status: 'TU_CHOI', changed_by: actorId },
            });
          }
        }

        await businessLogger.createLog(
          {
            correlation_id: C,
            attempt_no: currentAttemptNo,
            process_type: 'USER_APPROVAL',
            actor_type: 'USER',
            actor_id: actorId,
            tenant_id: targetUser.tenant_id,
            process_status: 'SUCCESS',
            context: {
              target_id: userId,
              target_name: snapshotName,
              attempt_no: currentAttemptNo,
            },
            payload: {
              action: 'FINAL_REJECT',
              is_final: true,
              admin_note: finalReason,
              status_before: 'TU_CHOI',
              status_after: 'TU_CHOI',
              case_id: rejectedCase.id,
              attempt_no: currentAttemptNo,
            },
          },
          tx
        );

        await auditService.logAction(
          'CAP_NHAT',
          'onboarding_cases',
          rejectedCase.id,
          { is_final_rejection: false },
          { is_final_rejection: true, final_note: finalReason },
          actorId,
          finalReason,
          targetUser.tenant_id,
          C,
          tx
        );

        return {
          id: targetUser.id,
          status: 'TU_CHOI',
          isFinalRejection: true,
          caseId: rejectedCase.id,
          correlationId: C,
        };
      },
      { maxWait: 5000, timeout: 15000 }
    );

    return result;
  },

  /**
   * DATETIME   : 2026-08-04 PR-OP-4-R1
   * DESCRIPTION:
   * - Admin trả về sửa: giữ CHO_DUYET; case → NEEDS_REVISION + review_note.
   * - Không tạo member, không đổi tenant, không đổi users.status.
   */
  returnForRevision: async (payload) => {
    const {
      userId,
      adminNote,
      actorId,
      role,
      actorTenantId,
      actorStatus,
      correlation_id,
      correlationId: correlationIdCamel,
    } = payload;

    if (!userId) {
      const error = new Error('Thiếu userId.');
      error.status = 400;
      throw error;
    }
    if (!adminNote || adminNote.trim() === '') {
      const error = new Error('Ghi chú yêu cầu bổ sung không được để trống.');
      error.status = 400;
      throw error;
    }

    const C =
      correlation_id ||
      correlationIdCamel ||
      prisma.correlation.create();

    const pastAttemptsCount = await basePrisma.business_process_logs.count({
      where: {
        process_type: 'USER_APPROVAL',
        metadata: { path: ['context', 'target_id'], equals: userId },
      },
    });
    const currentAttemptNo = pastAttemptsCount + 1;

    const result = await basePrisma.$transaction(
      async (tx) => {
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
            role: true,
          },
        });

        if (!targetUser) {
          throw new Error('Không tìm thấy tài khoản.');
        }

        // Chỉ CHO_DUYET mới trả về sửa
        if (targetUser.status !== 'CHO_DUYET') {
          throw new Error('DENIED');
        }

        // Authz (cùng approve)
        if (actorId === userId) {
          throw new Error('DENIED');
        }
        if (role === 'CLAN_ADMIN' && actorStatus !== 'DA_DUYET') {
          throw new Error('DENIED');
        }
        if (targetUser.role === 'CLAN_ADMIN' && role !== 'SYSTEM_ADMIN') {
          throw new Error('DENIED');
        }
        if (role !== 'SYSTEM_ADMIN' && targetUser.tenant_id !== actorTenantId) {
          throw new Error('DENIED');
        }

        const finalReason = adminNote.trim();
        const snapshotName =
          targetUser.temp_full_name || targetUser.name || 'Thành viên ẩn danh';

        // Case open → NEEDS_REVISION
        const openCase = await tx.onboarding_cases.findFirst({
          where: {
            user_id: userId,
            deleted_at: null,
            process_kind: 'REGISTER', // PR-1
            status: {
              in: [
                'SUBMITTED',
                'UNDER_REVIEW',
                'NEEDS_REVISION',
                'DRAFT',
                'PROFILE_COMPLETED',
                'FAMILY_TREE_DRAFT',
              ],
            },
          },
          orderBy: { created_at: 'desc' },
        });

        if (!openCase) {
          const error = new Error(
            'Không tìm thấy hồ sơ onboarding đang mở để yêu cầu bổ sung.'
          );
          error.status = 400;
          throw error;
        }

        await onboardingService.updateCaseStatus({
          caseId: openCase.id,
          status: 'NEEDS_REVISION',
          changedBy: actorId,
          reviewedBy: actorId,
          reviewNote: finalReason,
          client: tx,
        });

        // users.status GIỮ CHO_DUYET — không update status
        // (optional: chỉ changed_by)
        await tx.users.update({
          where: { id: userId },
          data: { changed_by: actorId },
        });

        await businessLogger.createLog(
          {
            correlation_id: C,
            attempt_no: currentAttemptNo,
            process_type: 'USER_APPROVAL',
            actor_type: 'USER',
            actor_id: actorId,
            tenant_id: targetUser.tenant_id,
            process_status: 'SUCCESS',
            context: {
              target_id: userId,
              target_name: snapshotName,
              attempt_no: currentAttemptNo,
            },
            payload: {
              action: 'RETURN_FOR_REVISION',
              admin_note: finalReason,
              status_before: 'CHO_DUYET',
              status_after: 'CHO_DUYET',
              case_id: openCase.id,
              case_status_after: 'NEEDS_REVISION',
              attempt_no: currentAttemptNo,
            },
          },
          tx
        );

        await auditService.logAction(
          'CAP_NHAT',
          'users',
          userId,
          { status: 'CHO_DUYET', note: 'RETURN_FOR_REVISION' },
          { status: 'CHO_DUYET', review_note: finalReason },
          actorId,
          finalReason,
          targetUser.tenant_id,
          C,
          tx
        );

        return {
          id: targetUser.id,
          status: 'CHO_DUYET',
          caseId: openCase.id,
          caseStatus: 'NEEDS_REVISION',
          correlationId: C,
        };
      },
      { maxWait: 5000, timeout: 15000 }
    );

    // Notif fail-open
    try {
      await notificationOrchestrator.emit(
        'ONBOARDING_REVISION_REQUESTED',
        {
          userId: result.id,
          correlationId: C,
          metadata: {
            tenantId: result.tenant_id,
            caseId: result.caseId,
            action: 'RETURN_FOR_REVISION',
            adminNote: adminNote.trim(),
          },
          executeImmediately: false,
        },
        null
      );
    } catch (emitError) {
      console.error(
        '[EGAL][SilentEmit][ONBOARDING_REVISION_REQUESTED]',
        emitError.message || emitError
      );
    }

    return result;
  },

  /**
   * DATETIME   : 2026-08-02
   * VERSION    : 20.2.5-PR-OP-3B
   * - B1: isRevision không JWT; xác thực phone/password.
   * - Chỉ CHO_DUYET; khóa phone/email; cập nhật temp_*.
   * - Case NEEDS_REVISION → SUBMITTED. Không tạo user/tenant/member.
   */
  submitRegistrationRevision: async (payload, extraData = {}) => {
    const {
      phone,
      email,
      password,
      temp_full_name,
      temp_father_name,
      temp_grandfather_name,
      temp_birth_year,
      temp_relationship,
      temp_address,
      temp_branch_name,
      temp_note,
      temp_social_profiles,
      // PR-OP-4 2.2 CLAN_SETUP revision
      description,
      clanName,
    } = payload;

    const { ip_address, user_agent, correlationId: incomingCorrelationId } = extraData;

    if (!password) {
      const error = new Error('Thiếu mật khẩu để xác thực chỉnh sửa hồ sơ.');
      error.status = 400;
      error.code = 'REVISION_PASSWORD_REQUIRED';
      throw error;
    }

    const logIdentifier = phone
      ? require('../../shared/utils/slug.utils').cleanInput(phone, 'phone')
      : null;
    const cleanEmail = email
      ? require('../../shared/utils/slug.utils').cleanInput(email, 'email')
      : null;

    if (!logIdentifier && !cleanEmail) {
      const error = new Error('Thiếu số điện thoại hoặc email.');
      error.status = 400;
      throw error;
    }

    const user = await basePrisma.users.findFirst({
      where: {
        deleted_at: null,
        OR: [
          ...(logIdentifier ? [{ phone: logIdentifier }] : []),
          ...(cleanEmail ? [{ email: cleanEmail }] : []),
        ],
      },
    });

    if (!user) {
      const error = new Error('Thông tin tài khoản hoặc mật khẩu không chính xác.');
      error.status = 401;
      error.code = 'INVALID_CREDENTIALS';
      throw error;
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      const error = new Error('Thông tin tài khoản hoặc mật khẩu không chính xác.');
      error.status = 401;
      error.code = 'INVALID_CREDENTIALS';
      throw error;
    }

    if (user.status !== 'CHO_DUYET') {
      const error = new Error('DENIED');
      error.status = 403;
      error.code = 'ACCOUNT_NOT_EDITABLE';
      throw error;
    }

    // Khóa phone/email: nếu client gửi khác DB → 400
    if (logIdentifier && user.phone && logIdentifier !== user.phone) {
      const error = new Error('Không được thay đổi số điện thoại khi bổ sung hồ sơ.');
      error.status = 400;
      error.code = 'PHONE_LOCKED';
      throw error;
    }
    if (cleanEmail && user.email && cleanEmail !== user.email) {
      const error = new Error('Không được thay đổi email khi bổ sung hồ sơ.');
      error.status = 400;
      error.code = 'EMAIL_LOCKED';
      throw error;
    }

    const C =
      incomingCorrelationId ||
      prisma.correlation.create();

    const displayName =
      temp_full_name || user.temp_full_name || user.name || logIdentifier || 'user';

    const updated = await basePrisma.$transaction(async (tx) => {
      const data = {
        changed_by: user.id,
        ...(temp_full_name !== undefined ? { temp_full_name } : {}),
        ...(temp_father_name !== undefined ? { temp_father_name } : {}),
        ...(temp_grandfather_name !== undefined ? { temp_grandfather_name } : {}),
        ...(temp_birth_year !== undefined
          ? {
              temp_birth_year: temp_birth_year
                ? parseInt(temp_birth_year, 10)
                : null,
            }
          : {}),
        ...(temp_relationship !== undefined ? { temp_relationship } : {}),
        ...(temp_address !== undefined ? { temp_address } : {}),
        ...(temp_branch_name !== undefined ? { temp_branch_name } : {}),
        ...(temp_note !== undefined ? { temp_note } : {}),
        ...(temp_social_profiles !== undefined
          ? { temp_social_profiles: temp_social_profiles || {} }
          : {}),
      };

      const u = await tx.users.update({
        where: { id: user.id },
        data,
        select: {
          id: true,
          status: true,
          tenant_id: true,
          role: true,
          phone: true,
          email: true,
          temp_full_name: true,
        },
      });

      // PR-OP-4 2.2: CLAN_SETUP — cập nhật mô tả (và tên nếu gửi) khi tenant còn onboarding
      if (
        user.role === 'CLAN_ADMIN' &&
        user.tenant_id &&
        (description !== undefined || clanName !== undefined)
      ) {
        const tenantRow = await tx.tenants.findFirst({
          where: {
            id: user.tenant_id,
            deleted_at: null,
          },
          select: { id: true, status: true, name: true, description: true },
        });

        // Chỉ khi tenant chưa kích hoạt dịch vụ
        const onboardingTenant =
          tenantRow &&
          ['CHO_DUYET', 'TU_CHOI', 'TAM_NGUNG'].includes(tenantRow.status);

          if (onboardingTenant) {
          const tenantData = {
            changed_by: user.id,
            ...(description !== undefined
              ? { description: String(description || '').trim() || null }
              : {}),
            // Tên dòng họ: chỉ update nếu client gửi chuỗi không rỗng
            ...(clanName !== undefined &&
            String(clanName || '').trim() !== ''
              ? { name: String(clanName).trim() }
              : {}),
          };

          if (Object.keys(tenantData).length > 1) {
            // >1 vì luôn có changed_by
            await tx.tenants.update({
              where: { id: tenantRow.id },
              data: tenantData,
            });

            try {
              await auditService.logAction(
                'CAP_NHAT',
                'tenants',
                tenantRow.id,
                {
                  name: tenantRow.name,
                  description: tenantRow.description,
                },
                {
                  ...(tenantData.name !== undefined
                    ? { name: tenantData.name }
                    : {}),
                  ...(tenantData.description !== undefined
                    ? { description: tenantData.description }
                    : {}),
                },
                user.id,
                'REVISION_SUBMIT_TENANT',
                user.tenant_id,
                C,
                tx
              );
            } catch (auditTenantErr) {
              console.error(
                '[REVISION][AUDIT][TENANT]',
                auditTenantErr.message || auditTenantErr
              );
            }
          }
          }
      }



      let caseId = null;
      const openCase = await tx.onboarding_cases.findFirst({
        where: {
          user_id: user.id,
          deleted_at: null,
          process_kind: 'REGISTER', // PR-1
          status: {
            in: [
              'SUBMITTED',
              'UNDER_REVIEW',
              'NEEDS_REVISION',
              'DRAFT',
              'PROFILE_COMPLETED',
              'FAMILY_TREE_DRAFT',
            ],
          },
        },
        orderBy: { created_at: 'desc' },
      });

      if (openCase) {
        caseId = openCase.id;
        if (openCase.status === 'NEEDS_REVISION') {
          await onboardingService.updateCaseStatus({
            caseId: openCase.id,
            status: 'SUBMITTED',
            changedBy: user.id,
            client: tx,
          });
        }
      }
      //20.2.5-PR-2
      try {
        await businessLogger.createLog(
          {
            correlation_id: C,
            attempt_no: 1,
            process_type: 'USER_APPROVAL',
            actor_type: 'USER',
            actor_id: user.id,
            tenant_id: user.tenant_id,
            process_status: 'SUCCESS',
            context: {
              target_id: user.id,
              target_name: displayName,
              attempt_no: 1,
            },
            payload: {
              action: 'REVISION_SUBMIT',
              case_id: caseId,
              status_before: 'CHO_DUYET',
              status_after: 'CHO_DUYET',
              case_status_after: 'SUBMITTED',
              attempt_no: 1,
              approved_role: 'USER',
              admin_note: 'REVISION_SUBMIT',
              approver_note: 'REVISION_SUBMIT',
            },
          },
          tx
        );
      } catch (bplErr) {
        console.error('[REVISION][BPL]', bplErr.message || bplErr);
      }

      try {
        await auditService.logAction(
          'CAP_NHAT',
          'users',
          user.id,
          { status: 'CHO_DUYET' },
          { status: 'CHO_DUYET', revision: true },
          user.id,
          'REVISION_SUBMIT',
          user.tenant_id,
          C,
          tx
        );
      } catch (auditErr) {
        console.error('[REVISION][AUDIT]', auditErr.message || auditErr);
      }

      return { ...u, caseId, correlationId: C };
    });

    authLogService
      .logAttempt({
        identifier: logIdentifier || cleanEmail || user.id,
        ip_address: ip_address || 'unknown',
        user_agent: user_agent || 'unknown',
        status: 'THANH_CONG',
        failure_reason: 'REVISION_SUBMIT_SUCCESS',
        action_type: 'REGISTER',
      })
      .catch(() => {});

    return {
      userId: updated.id,
      tenantId: updated.tenant_id,
      status: updated.status,
      caseId: updated.caseId,
      correlationId: updated.correlationId,
    };
  },
};

module.exports = authService;