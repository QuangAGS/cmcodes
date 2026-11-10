const { creatorStamp } = require('../members/profileAccess.service.js');
/**
 * PATH       : src/modules/auth/auth.service.js
 * DATETIME   : 2026-11-09T11:35:00+07:00
 * VERSION    : 20.4.0:MULTIHOME-PHASE3-[RP-OP-JSON]-[SMOKE-3.x]
 * DESCRIPTION:
 * - 20.4.0: Phase 2 (Multi-Home) + Phase 3 (RP-OP JSON) + Smoke Test 3.x:
 *    - Import helper validateRegistrationProfile.
 *    - Vị trí 1: registerUser – Hỗ trợ nhận và validate registration_profile (JSON metadata).   
 *    - Vị trí 2: submitRegistrationRevision – Validate và cập nhật registration_profile dạng JSON.   
 *    - Vị trí 3: processUserApproval – Xử lý Case 1 (EM), Case 2 (No EM) từ JSON và đồng bộ user_member_links.   
 *    - Vị trí 4: reopenRejectedUser – Phục hồi trạng thái user_member_links.   
 *    - Vị trí 5: markFinalRejection – Đánh dấu từ chối liên kết user_member_links.   
 *    - Vị trí 6: queryReviewableUsers – Nạp trọn vẹn 21 trường gia phả từ JSON metadata trả ra UI.
 * - [Phase 2][SM-U-02] syncUserStatusWithLinks: Đồng bộ users.status theo liên kết user_member_links.
 * - [Phase 2][SEC-02] switchContext: Chuyển đổi ngữ cảnh dòng họ đa thành viên (Multi-Home), cấp Context Token.
 * - [Phase 2][SEC-03] loginUser: Cấp phát Context Token chứa activeTenantId, activeMemberId, activeLinkStatus.
 * - Tuân thủ nghiêm ngặt Q1 (bảo tồn 100% flow cũ) và Q2 (chuẩn tài liệu hệ thống).
 */
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const { basePrisma, prisma, PRISMA_SELECTS } = require('../../lib/prisma.js');
const authLogService = require('./authLog.service');
const { cleanInput, formatNumericSlug } = require('../../shared/utils/slug.utils');
const securityConfig = require('../../config/securityConfig');

const onboardingService = require('../../services/onboarding.service');
const { openMemberPromoteInstance } = require('../onboarding/srpf');
const businessLogger = require('../../services/ledger.service'); 
const auditService = require('../../services/audit.service'); 
const emailService = require('../../services/email.service');

const {
  propagateFromRegistration, 
} = require('../notifications/services/communicationPropagation.service');

const notificationOrchestrator = require(
  '../notifications/orchestrator/notificationOrchestrator'
); 

const notificationBuilder = require('../notifications/services/notification-builder');

const { validateRegistrationProfile } = require('./registrationValidator');

/**
 * <2026-05-13T00:00:00+07:00>
 * Helper hash cho password reset session security.
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
   * @dateTime 2026-07-22T11:10:00+07:00
   * @description Tiến trình xác thực đăng nhập + Assert Order (SEC Wave 2).
   */
  loginUser: async (identifier, password, extraData) => {
    // ─── Bước 0: Tìm user (Nạp danh sách user_member_links) ───────────
    const user = await basePrisma.users.findFirst({
      where: {
        OR: [{ email: identifier }, { phone: identifier }],
        deleted_at: null,
      },
      include: { 
        tenants: true,
        user_member_links: {
          where: { deleted_at: null },
          include: {
            tenant: {
              select: { id: true, name: true, slug: true, status: true, logo_url: true, slogan: true }
            },
            member: {
              select: { id: true, full_name: true, generation: true, status: true, role: true }
            }
          },
          orderBy: [
            { is_default: 'desc' },
            { created_at: 'asc' }
          ]
        }
      },
    });

    if (!user) {
      const error = new Error('Thông tin tài khoản đăng nhập hoặc mật khẩu không chính xác.');
      error.status = 401;
      error.code = 'INVALID_CREDENTIALS';
      throw error;
    }

    // ─── Bước 1: Credential (Assert Order) ────────────────────────────
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      const error = new Error('Thông tin tài khoản đăng nhập hoặc mật khẩu không chính xác.');
      error.status = 401;
      error.code = 'INVALID_CREDENTIALS';
      throw error;
    }

    // ─── Bước 2: User status / Lock ──────────────────────────────────
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

    // 2b. Lifecycle — CHO_DUYET
    // Nếu user có liên kết DRAFT (Onboarding Sandbox), cho phép cấp token Sandbox
    const draftLink = user.user_member_links?.find(l => l.status === 'DRAFT');
    const isSandboxAllowed = Boolean(draftLink);

    if (user.status === 'CHO_DUYET' && !isSandboxAllowed) {
      let reviewNote = null;
      let caseStatus = null;
      let caseId = null;

      try {
        const openCase = await basePrisma.onboarding_cases.findFirst({
          where: {
            user_id: user.id,
            deleted_at: null,
            process_kind: 'REGISTER',
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

      const canEdit = caseStatus === 'NEEDS_REVISION' && !!reviewNote;

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
        phone: user.phone || null,
        email: user.email || null,
        tenant_id: user.tenant_id || null,
        tenantId: user.tenant_id || null,
        clanName: user.tenants?.name || null,
        tenantSlug: user.tenants?.slug || null,
        description: user.tenants?.description || null,
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
    if (user.role !== 'SYSTEM_ADMIN' && user.tenants) {
      const tenantStatus = user.tenants.status;

      if (tenantStatus === 'CHO_DUYET') {
        const error = new Error(
          'Dòng họ của bác hiện đang chờ Hệ thống Trung tâm phê duyệt kích hoạt dịch vụ.'
        );
        error.status = 423;
        error.code = 'TENANT_PENDING_ACTIVATION';
        throw error;
      }

      if (tenantStatus === 'BI_KHOA') {
        const error = new Error(
          'Dòng họ hiện đang bị khóa. Vui lòng liên hệ Ban quản trị.'
        );
        error.status = 403;
        error.code = 'TENANT_DISABLED';
        throw error;
      }
    }

    // ─── Bước 4: Cấp token (Nạp đầy đủ Context Token cho Phase 2) ─────
    const secret = process.env.JWT_SECRET || securityConfig.JWT_SECRET;
    if (!secret) {
      throw new Error('Cấu hình thiếu JWT_SECRET tại tệp môi trường .env.');
    }

    // ─── [PHASE 3][SEC-ROOT] RẼ NHÁNH CHO SYSTEM_ADMIN (ROOT PLATFORM) ─────────
    if (user.role === 'SYSTEM_ADMIN') {
      const rootTenantId = user.tenant_id || '00000000-0000-0000-0000-000000000000';

      const token = jwt.sign(
        {
          userId: user.id,
          email: user.email,
          role: 'SYSTEM_ADMIN',
          tenantId: rootTenantId,
          activeTenantId: rootTenantId,
          activeMemberId: null,
          activeLinkStatus: 'DA_DUYET',
          linkType: 'SYSTEM',
          status: user.status,
          tenantStatus: 'HOAT_DONG',
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
          phone: user.phone || null,
          role: 'SYSTEM_ADMIN',
          tenant_id: rootTenantId,
          tenantId: rootTenantId,
          activeTenantId: rootTenantId,
          activeMemberId: null,
          activeLinkStatus: 'DA_DUYET',
          status: user.status,
          tenantStatus: 'HOAT_DONG',
          tenant: null,
          clanName: 'Hệ Thống Trung Tâm',
          availableClans: [],
        },
      };
    }

    const activeLink = user.user_member_links?.find(l => l.is_default && l.status === 'DA_DUYET')
      || user.user_member_links?.find(l => l.status === 'DA_DUYET')
      || draftLink
      || user.user_member_links?.[0]
      || null;

    const activeTenantId = activeLink ? activeLink.tenant_id : user.tenant_id;
    const activeMemberId = activeLink ? activeLink.member_id : user.member_id;
    const activeLinkStatus = activeLink ? activeLink.status : (user.status === 'DA_DUYET' ? 'DA_DUYET' : 'CHO_DUYET');
    const tenantStatus = activeLink?.tenant ? activeLink.tenant.status : (user.tenants ? user.tenants.status : null);

    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: activeLink?.role_in_tenant || user.role,
        tenantId: activeTenantId, // tương thích backward
        activeTenantId,
        activeMemberId,
        activeLinkStatus,
        linkType: activeLink?.link_type || null,
        status: user.status,
        tenantStatus,
      },
      secret,
      { expiresIn: '24h' }
    );

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

    const availableClans = (user.user_member_links || []).map(link => ({
      tenantId: link.tenant_id,
      clanName: link.tenant?.name || 'Dòng họ',
      clanSlug: link.tenant?.slug || '',
      linkType: link.link_type,
      status: link.status,
      isDefault: link.is_default,
      roleInTenant: link.role_in_tenant,
      memberId: link.member_id,
      memberName: link.member?.full_name || null,
    }));

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone || null,
        role: activeLink?.role_in_tenant || user.role,
        tenant_id: activeTenantId,
        tenantId: activeTenantId,
        activeTenantId,
        activeMemberId,
        activeLinkStatus,
        status: user.status,
        tenantStatus,
        tenant: activeLink?.tenant || tenantDto,
        clanName: activeLink?.tenant?.name || tenantDto?.name || null,
        availableClans,
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

  // 20.4.0:MULTIHOME-PHASE3-[RP-OP-JSON]-[SMOKE-3.x]
  registerUser: async (payload, extraData = {}) => {
    if (payload.isRevision === true) {
      return authService.submitRegistrationRevision(payload, extraData);
    }
    
    const { isNewClan, clanName, description, tenantId, registration_profile, ...userData } = payload;
    const { ip_address, user_agent, correlationId: incomingCorrelationId } = extraData;
    const logIdentifier = cleanInput(userData.phone, 'phone');
    let transactionResult = null;

    // Chuẩn hóa và validate registration_profile nếu có truyền vào
    let validatedProfile = {};
    if (registration_profile && typeof registration_profile === 'object') {
      validatedProfile = validateRegistrationProfile(registration_profile);
    } else {
      // Tự động map từ các trường phẳng cũ sang JSON profile (bảo tồn Q1)
      validatedProfile = validateRegistrationProfile({
        full_name: userData.temp_full_name || userData.name || 'Thành viên mới',
        gender: userData.gender || 'NAM',
        birth_year: userData.temp_birth_year ? parseInt(userData.temp_birth_year, 10) : undefined,
        father_name: userData.temp_father_name,
        grandfather_name: userData.temp_grandfather_name,
        branch_name: userData.temp_branch_name,
        address: userData.temp_address,
        note: userData.temp_note,
        claimed_member_id: userData.claimed_member_id,
        phone: logIdentifier,
        email: userData.email,
        social_profiles: userData.temp_social_profiles || {},
      });
    }

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

          const shortId = crypto.randomBytes(4).toString('hex');
          const technicalName = `${tenantSlug}_${shortId}`;

          const newUser = await tx.users.create({
            data: {
              name: technicalName,
              email: userData.email
                ? cleanInput(userData.email, 'email')
                : null,
              phone: logIdentifier,
              password: hashedPassword,
              tenant_id: tid,
              role: isNewClan ? 'CLAN_ADMIN' : 'VIEWER',
              status: 'CHO_DUYET',
              // Lưu vào các cột cũ để tương thích ngược
              temp_full_name: validatedProfile.full_name,
              temp_father_name: validatedProfile.father_name || userData.temp_father_name,
              temp_grandfather_name: validatedProfile.grandfather_name || userData.temp_grandfather_name,
              temp_birth_year: validatedProfile.birth_year || (userData.temp_birth_year ? parseInt(userData.temp_birth_year, 10) : null),
              temp_relationship: userData.temp_relationship || 'CON_DE',
              temp_address: validatedProfile.address || userData.temp_address,
              temp_branch_name: validatedProfile.branch_name || userData.temp_branch_name,
              temp_note: validatedProfile.note || userData.temp_note,
              // Lưu toàn bộ JSON metadata sạch vào temp_social_profiles
              temp_social_profiles: {
                ...(userData.temp_social_profiles || {}),
                registration_profile: validatedProfile,
              },
            },
          });

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
      
      // ========== POST-TX (M1): case + BPL + audit + notif — CÙNG CORRELATION C ==========
      const C = incomingCorrelationId || crypto.randomUUID();

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

      // 1) Tạo Onboarding Case (vẫn giữ nguyên helper)
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

      // =======================================================================
      // [FIX S0.1 & BFA DOCTRINE]: Bọc BPL & Audit trong withTransaction
      // Đảm bảo có tx hợp lệ và nạp đúng tenantId vào ALS context
      // =======================================================================
      try {
        const { withTransaction } = require('../../lib/prisma.js');

        await withTransaction(
          {
            correlationId: C,
            actorId: userId,
            actorType: 'USER',
            tenantId: tid,
            activeTenantId: tid,
          },
          async (tx, ctx) => {
            // 2) BPL USER_REGISTER (attempt 1) - TRUYỀN tx HỢP LỆ
            try {
              await businessLogger.createLog(
                {
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
                },
                tx
              );
            } catch (err) {
              console.error('[REGISTER_LEDGER][BPL_USER_REGISTER]', err.message || err);
            }

            // 3) BPL ONBOARDING_CASE_CREATE (attempt 2) - TRUYỀN tx HỢP LỆ
            try {
              await businessLogger.createLog(
                {
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
                },
                tx
              );
            } catch (err) {
              console.error('[REGISTER_LEDGER][BPL_CASE]', err.message || err);
            }

            // 4) Audit users (+ tenants nếu CreateClan) - DÙNG tx
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
                C,
                tx
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
                  C,
                  tx
                );
              }
            } catch (err) {
              console.error('[REGISTER_LEDGER][AUDIT]', err.message || err);
            }
          }
        );
      } catch (ledgerTxErr) {
        console.error('[REGISTER_LEDGER][TX_WRAPPER_ERROR]', ledgerTxErr.message || ledgerTxErr);
      }

      // =======================================================================
      // 5) [FIX S0.1 TENANT CONTEXT MISSING CHO NOTIFICATIONS]:
      // Bọc notificationOrchestrator trong runWithTenantContext
      // =======================================================================
      try {
        const { runWithTenantContext } = require('../../lib/prisma.js');

        await runWithTenantContext(
          {
            tenantId: tid,
            activeTenantId: tid,
            userId,
          },
          async () => {
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
          }
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

      return users.map(({ tenants, ...user }) => ({
        ...user,
        tenant: tenants || null,
      }));

    } catch (error) {
      console.error('[getPendingUsers Error]:', error);
      throw error;
    }
  },

  // 20.4.0:MULTIHOME-PHASE3-[RP-OP-JSON]-[SMOKE-3.x] - Vị trí 6: nạp 21 trường
  queryReviewableUsers: async (filters, actorRole, actorTenantId) => {
    try {
      const { status, role, searchKeyword, fromDate, toDate, page = 1, limit = 20 } = filters;
      
      const whereClause = {
        deleted_at: null,
        ...(actorRole !== 'SYSTEM_ADMIN' ? { tenant_id: actorTenantId } : {})
      };

      if (status) {
        whereClause.status = status;
      } else {
        whereClause.status = { in: ['CHO_DUYET', 'TU_CHOI', 'DA_DUYET', 'BI_KHOA', 'BI_CAM', 'TAM_NGUNG'] };
      }

      if (role) {
        whereClause.role = role;
      }

      if (fromDate || toDate) {
        whereClause.updated_at = {};
        if (fromDate) whereClause.updated_at.gte = new Date(fromDate);
        if (toDate) whereClause.updated_at.lte = new Date(toDate);
      }

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

      const [totalRecords, users] = await Promise.all([
        basePrisma.users.count({ where: whereClause }),
        basePrisma.users.findMany({
          where: whereClause,
          skip,
          take,
          orderBy: { updated_at: 'desc' },
          select: {
            ...PRISMA_SELECTS.USER_REGISTRATION,
            tenants: {
              select: PRISMA_SELECTS.TENANT_STANDARD
            }
          }
        }),
      ]);

      const enrichedData = await Promise.all(users.map(async (user) => {
        let linkedMember = null;

        if (user.member_id !== null && user.member_id !== undefined) {
          linkedMember = await basePrisma.members.findFirst({
            where: {
              id: user.member_id,
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
       
        let isFinalRejection = false;
        if (user.status === 'TU_CHOI') {
          try {
            const rejectedCase = await basePrisma.onboarding_cases.findFirst({
              where: {
                user_id: user.id,
                status: 'REJECTED',
                deleted_at: null,
                process_kind: 'REGISTER',
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

        const meta = (user.temp_social_profiles && typeof user.temp_social_profiles === 'object')
          ? user.temp_social_profiles
          : {};
        const profile = meta.registration_profile || {};

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          status: user.status, 
          role: user.role,
          isFinalRejection,
          created_at: user.created_at,
          updated_at: user.updated_at,
          temp_snapshot: {
            full_name: profile.full_name || user.temp_full_name || user.name || 'Chưa khai báo',
            alias: profile.alias || null,
            gender: profile.gender || 'NAM',
            birth_year: profile.birth_year || user.temp_birth_year || 'Chưa khai báo',
            birth_month: profile.birth_month || null,
            birth_day: profile.birth_day || null,
            birth_place: profile.birth_place || null,
            death_year: profile.death_year || null,
            is_alive: profile.is_alive !== undefined ? profile.is_alive : true,
            generation: profile.generation || null,
            member_role: profile.member_role || 'THANH_VIEN',
            branch_name: profile.branch_name || user.temp_branch_name || 'Chưa khai báo',
            father_name: profile.father_name || user.temp_father_name || 'Chưa khai báo',
            mother_name: profile.mother_name || null,
            grandfather_name: profile.grandfather_name || user.temp_grandfather_name || 'Chưa khai báo',
            grandmother_name: profile.grandmother_name || null,
            address: profile.address || user.temp_address || 'Chưa khai báo',
            relationship: user.temp_relationship || 'CON_DE',
            note: profile.note || user.temp_note || 'Không có ghi chú',
            claimed_member_id: profile.claimed_member_id || null,
            proof_documents: profile.proof_documents || [],
            social_profiles: profile.social_profiles || meta.social_profiles || {},
            registration_reason: user.registration_reason || 'Nộp đơn gia nhập tộc hệ'
          },
          tenant: user.tenants || null,
          member_profile: linkedMember 
        };
      }));

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

  // 20.4.0:MULTIHOME-PHASE3-[RP-OP-JSON]-[SMOKE-3.x] - Vị trí 3: Case 1 (EM), Case 2 (No EM), sync user_member_links
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
      isFinalRejection,
      targetMemberId,
    } = payload;

    const finalRejection =
      isFinalRejection === true ||
      isFinalRejection === 'true' ||
      isFinalRejection === 1;

    if (!adminNote || adminNote.trim() === '') {
      const error = new Error('Tiến trình bị hủy. Ghi chú phê duyệt không được phép để trống.');
      error.status = 400;
      throw error;
    }

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

    if (
      sourceUser.status === 'TU_CHOI' &&
      newStatus === 'TU_CHOI' &&
      finalRejection
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

    const pastAttemptsCount = await basePrisma.business_process_logs.count({
      where: {
        process_type: 'USER_APPROVAL',
        metadata: { path: ['context', 'target_id'], equals: userId },
      },
    });
    const currentAttemptNo = pastAttemptsCount + 1;

    const C =
      correlation_id ||
      correlationIdCamel ||
      prisma.correlation.create();

    let securityLogIdentifier = 'unknown';
    let resultUser = null;

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
            temp_social_profiles: true,
            tenants: { select: { id: true, status: true } },
          },
        });

        if (!targetUser) {
          throw new Error('Không tìm thấy tài khoản yêu cầu phê duyệt.');
        }

        if (targetUser.status === 'DA_DUYET') {
          throw new Error('DENIED');
        }
        
        if (targetUser.status !== 'CHO_DUYET') {
          throw new Error('DENIED');
        }

        if (!['DA_DUYET', 'TU_CHOI'].includes(newStatus)) {
          const error = new Error('newStatus chỉ nhận DA_DUYET hoặc TU_CHOI.');
          error.status = 400;
          throw error;
        }

        if (actorId === userId) {
          throw new Error('DENIED');
        }
        if (role === 'CLAN_ADMIN' && actorStatus !== 'DA_DUYET') {
          throw new Error('DENIED');
        }
        if (
          targetUser.role === 'CLAN_ADMIN' &&
          targetUser.status === 'CHO_DUYET' &&
          role !== 'SYSTEM_ADMIN'
        ) {
          throw new Error('DENIED');
        }
        if (role !== 'SYSTEM_ADMIN' && targetUser.tenant_id !== actorTenantId) {
          throw new Error('DENIED');
        }

        securityLogIdentifier = targetUser.phone || targetUser.email || 'unknown';

        const snapshotName =
          targetUser.temp_full_name || targetUser.name || 'Thành viên ẩn danh';
        const oldUserStatus = targetUser.status;
        const finalReason =
          adminNote || `Xử lý thay đổi trạng thái thành ${newStatus}`;

        // Trích xuất registration_profile từ JSON metadata
        const userMeta = (targetUser.temp_social_profiles && typeof targetUser.temp_social_profiles === 'object')
          ? targetUser.temp_social_profiles
          : {};
        const profile = userMeta.registration_profile || {};

        let newMemberId = targetMemberId || profile.claimed_member_id || targetUser.member_id || null;

        // CASE 2 & CLAN-SETUP: Nếu duyệt DA_DUYET mà chưa có member nào được gán -> Tạo Member mới từ JSON
        if (newStatus === 'DA_DUYET' && !newMemberId) {
          const member = await tx.members.create({
            data: {
              full_name: profile.full_name || targetUser.temp_full_name || targetUser.name || 'Thành viên mới',
              tenant_id: targetUser.tenant_id,
              gender: profile.gender || 'NAM',
              generation: profile.generation || null,
              birth_year: profile.birth_year || targetUser.temp_birth_year || null,
              birth_month: profile.birth_month || null,
              birth_day: profile.birth_day || null,
              //birth_place: profile.birth_place || null,
              death_year: profile.death_year || null,
              is_alive: profile.is_alive !== undefined ? profile.is_alive : true,
              role: profile.member_role || 'THANH_VIEN',
              phone_number: profile.phone || targetUser.phone || null,
              email: profile.email || targetUser.email || null,
              note: profile.note || targetUser.temp_note || null,
              status: 'DU_BI',
              changed_by: actorId,
              ...creatorStamp({ id: actorId, member_id: null }),
            },
          });
          newMemberId = member.id;
        }

        await tx.users.update({
          where: { id: userId },
          data: {
            status: newStatus,
            changed_by: actorId,
            ...(newStatus === 'DA_DUYET' && newMemberId
              ? { member_id: newMemberId }
              : {}),
            ...(newStatus === 'DA_DUYET' && targetUser.role === 'CLAN_ADMIN'
              ? { role: 'VIEWER' }
              : {}),
          },
        });

        // Đồng bộ user_member_links
        if (newStatus === 'DA_DUYET') {
          await tx.user_member_links.updateMany({
            where: {
              user_id: userId,
              tenant_id: targetUser.tenant_id,
              deleted_at: null,
            },
            data: {
              status: 'DA_DUYET',
              member_id: newMemberId,
              role_in_tenant: targetUser.role === 'CLAN_ADMIN' ? 'CLAN_ADMIN' : 'USER',
              updated_at: new Date(),
            },
          });
        } else if (newStatus === 'TU_CHOI') {
          await tx.user_member_links.updateMany({
            where: {
              user_id: userId,
              tenant_id: targetUser.tenant_id,
              deleted_at: null,
            },
            data: {
              status: 'TU_CHOI',
              updated_at: new Date(),
            },
          });
        }

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

        let affectedCaseId = null;
        let caseStatusAfter = null;

        try {
          const openCase = await tx.onboarding_cases.findFirst({
            where: {
              user_id: userId,
              deleted_at: null,
              process_kind: 'REGISTER',
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
              caseStatusAfter = 'REJECTED';
              await onboardingService.updateCaseStatus({
                caseId: openCase.id,
                status: 'REJECTED',
                changedBy: actorId,
                reviewedBy: actorId,
                rejectionReason: adminNote,
                client: tx,
              });

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
          throw caseErr;
        }
        /*** 
        if (newStatus === 'DA_DUYET') {
          const promoteMemberId = newMemberId || targetUser.member_id || null;
          if (promoteMemberId && targetUser.tenant_id) {
            let sourceRegisterCaseId = null;
            let sourceRegisterCorrelationId = null;
            let opCaseType = 'MEMBER_JOIN';

            try {
              const rpCase = await tx.onboarding_cases.findFirst({
                where: {
                  user_id: userId,
                  deleted_at: null,
                  status: 'APPROVED',
                  process_kind: 'REGISTER',
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
          }
        }
        ***/

        if (newStatus === 'DA_DUYET') {
          const promoteMemberId = newMemberId || targetUser.member_id || null;
          if (promoteMemberId && targetUser.tenant_id) {
            
            // Kiểm tra trạng thái hiện tại của member
            const memberToCheck = await tx.members.findUnique({
              where: { id: promoteMemberId },
              select: { id: true, status: true },
            });

            // CHỈ mở tiến trình thăng hạng (OP) nếu member đang là DỰ BỊ (DU_BI)
            if (memberToCheck && memberToCheck.status === 'DU_BI') {
              let sourceRegisterCaseId = null;
              let sourceRegisterCorrelationId = null;
              let opCaseType = 'MEMBER_JOIN';

              try {
                const rpCase = await tx.onboarding_cases.findFirst({
                  where: {
                    user_id: userId,
                    deleted_at: null,
                    status: 'APPROVED',
                    process_kind: 'REGISTER',
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
              console.log(`[APPROVAL][OP-BYPASS] Member ${promoteMemberId} status is ${memberToCheck?.status}, skipping SRPF promotion.`);
            }
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
              case_id: affectedCaseId,
              case_status_after: caseStatusAfter,
            },
          },
          tx
        );

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

        return {
          ...targetUser,
          status: newStatus,
          member_id: newMemberId || targetUser.member_id,
        };
      },
      { maxWait: 5000, timeout: 15000 }
    );

    authLogService
      .logAttempt({
        identifier: securityLogIdentifier,
        ip_address: 'system_internal',
        user_agent: 'server_orchestrator',
        status: 'THANH_CONG',
        failure_reason: `REVIEW_STATUS_CHANGED_TO_${newStatus}`,
      })
      .catch((err) => console.error('⚠️ [AuthLog Error]:', err.message));

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

  // 20.4.0:MULTIHOME-PHASE3-[RP-OP-JSON]-[SMOKE-3.x] - Vị trí 4: Reopen phục hồi user_member_links
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

        if (targetUser.status !== 'TU_CHOI') {
          throw new Error('DENIED');
        }

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

        let caseType =
          targetUser.role === 'CLAN_ADMIN' ? 'CLAN_SETUP' : 'MEMBER_JOIN';

        const lastRejectedCase = await tx.onboarding_cases.findFirst({
          where: {
            user_id: userId,
            status: 'REJECTED',
            deleted_at: null,
            process_kind: 'REGISTER',
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

        await tx.users.update({
          where: { id: userId },
          data: {
            status: 'CHO_DUYET',
            changed_by: actorId,
          },
        });

        // Phục hồi liên kết user_member_links về CHO_DUYET
        await tx.user_member_links.updateMany({
          where: {
            user_id: userId,
            tenant_id: targetUser.tenant_id,
            deleted_at: null,
          },
          data: {
            status: 'CHO_DUYET',
            updated_at: new Date(),
          },
        });

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

  // 20.4.0:MULTIHOME-PHASE3-[RP-OP-JSON]-[SMOKE-3.x] - Vị trí 5: markFinalRejection cập nhật liên kết
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

        if (targetUser.status !== 'TU_CHOI') {
          throw new Error('DENIED');
        }

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

        const rejectedCase = await tx.onboarding_cases.findFirst({
          where: {
            user_id: userId,
            status: 'REJECTED',
            deleted_at: null,
            process_kind: 'REGISTER',
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

        // Đánh dấu liên kết user_member_links sang TU_CHOI
        await tx.user_member_links.updateMany({
          where: {
            user_id: userId,
            tenant_id: targetUser.tenant_id,
            deleted_at: null,
          },
          data: {
            status: 'TU_CHOI',
            updated_at: new Date(),
          },
        });

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

        if (targetUser.status !== 'CHO_DUYET') {
          throw new Error('DENIED');
        }

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

        const openCase = await tx.onboarding_cases.findFirst({
          where: {
            user_id: userId,
            deleted_at: null,
            process_kind: 'REGISTER',
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

  // 20.4.0:MULTIHOME-PHASE3-[RP-OP-JSON]-[SMOKE-3.x] - Vị trí 2: submitRegistrationRevision
  submitRegistrationRevision: async (payload, extraData = {}) => {
    const {
      phone,
      email,
      password,
      registration_profile,
      temp_full_name,
      temp_father_name,
      temp_grandfather_name,
      temp_birth_year,
      temp_relationship,
      temp_address,
      temp_branch_name,
      temp_note,
      temp_social_profiles,
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

    const C = incomingCorrelationId || prisma.correlation.create();

    const displayName =
      temp_full_name || user.temp_full_name || user.name || logIdentifier || 'user';

    const updated = await basePrisma.$transaction(async (tx) => {
      // Validate profile mới nếu có truyền, hoặc merge từ các trường phẳng
      let cleanProfile = null;
      if (registration_profile && typeof registration_profile === 'object') {
        cleanProfile = validateRegistrationProfile(registration_profile);
      } else if (temp_full_name || temp_father_name || temp_birth_year) {
        cleanProfile = validateRegistrationProfile({
          full_name: temp_full_name || user.temp_full_name,
          gender: payload.gender || 'NAM',
          birth_year: temp_birth_year ? parseInt(temp_birth_year, 10) : user.temp_birth_year,
          father_name: temp_father_name !== undefined ? temp_father_name : user.temp_father_name,
          grandfather_name: temp_grandfather_name !== undefined ? temp_grandfather_name : user.temp_grandfather_name,
          address: temp_address !== undefined ? temp_address : user.temp_address,
          branch_name: temp_branch_name !== undefined ? temp_branch_name : user.temp_branch_name,
          note: temp_note !== undefined ? temp_note : user.temp_note,
        });
      }

      const existingMeta = typeof user.temp_social_profiles === 'object' && user.temp_social_profiles !== null 
        ? user.temp_social_profiles 
        : {};

      const data = {
        changed_by: user.id,
        ...(temp_full_name !== undefined ? { temp_full_name } : (cleanProfile?.full_name ? { temp_full_name: cleanProfile.full_name } : {})),
        ...(temp_father_name !== undefined ? { temp_father_name } : (cleanProfile?.father_name ? { temp_father_name: cleanProfile.father_name } : {})),
        ...(temp_grandfather_name !== undefined ? { temp_grandfather_name } : (cleanProfile?.grandfather_name ? { temp_grandfather_name: cleanProfile.grandfather_name } : {})),
        ...(temp_birth_year !== undefined
          ? {
              temp_birth_year: temp_birth_year
                ? parseInt(temp_birth_year, 10)
                : null,
            }
          : (cleanProfile?.birth_year ? { temp_birth_year: cleanProfile.birth_year } : {})),
        ...(temp_relationship !== undefined ? { temp_relationship } : {}),
        ...(temp_address !== undefined ? { temp_address } : (cleanProfile?.address ? { temp_address: cleanProfile.address } : {})),
        ...(temp_branch_name !== undefined ? { temp_branch_name } : (cleanProfile?.branch_name ? { temp_branch_name: cleanProfile.branch_name } : {})),
        ...(temp_note !== undefined ? { temp_note } : (cleanProfile?.note ? { temp_note: cleanProfile.note } : {})),
        temp_social_profiles: {
          ...existingMeta,
          ...(temp_social_profiles || {}),
          ...(cleanProfile ? { registration_profile: cleanProfile } : {}),
        },
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

        const onboardingTenant =
          tenantRow &&
          ['CHO_DUYET', 'TU_CHOI', 'TAM_NGUNG'].includes(tenantRow.status);

        if (onboardingTenant) {
          const tenantData = {
            changed_by: user.id,
            ...(description !== undefined
              ? { description: String(description || '').trim() || null }
              : {}),
            ...(clanName !== undefined &&
            String(clanName || '').trim() !== ''
              ? { name: String(clanName).trim() }
              : {}),
          };

          if (Object.keys(tenantData).length > 1) {
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
          process_kind: 'REGISTER',
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

  // =========================================================================
  // [PHASE 2][SM-U-02] ĐỒNG BỘ TRẠNG THÁI USER DỰA TRÊN USER_MEMBER_LINKS
  // =========================================================================
  /**
   * Nguyên tắc: users.status chỉ là DA_DUYET nếu có ít nhất 1 link DA_DUYET.
   * Ngược lại, nếu chưa có link DA_DUYET nào thì giữ nguyên CHO_DUYET.
   */
  syncUserStatusWithLinks: async (userId, tx = basePrisma) => {
    const activeLink = await tx.user_member_links.findFirst({
      where: {
        user_id: userId,
        status: 'DA_DUYET',
        deleted_at: null,
      },
    });

    const targetStatus = activeLink ? 'DA_DUYET' : 'CHO_DUYET';

    await tx.users.updateMany({
      where: {
        id: userId,
        status: { notIn: ['BI_KHOA', 'BI_CAM', targetStatus] },
        deleted_at: null,
      },
      data: {
        status: targetStatus,
        updated_at: new Date(),
      },
    });

    return targetStatus;
  },

  // =========================================================================
  // [PHASE 2][SEC-02] CHUYỂN ĐỔI NGỮ CẢNH DÒNG HỌ (SWITCH CONTEXT API)
  // =========================================================================
  /**
   * Cấp phát Context Token mới dựa trên dòng họ đích mà user lựa chọn
   */
  switchContext: async (userId, targetTenantId) => {
    if (!targetTenantId) {
      const error = new Error('Thiếu mã định danh dòng họ (targetTenantId).');
      error.status = 400;
      error.code = 'TENANT_REQUIRED';
      throw error;
    }

    const link = await basePrisma.user_member_links.findFirst({
      where: {
        user_id: userId,
        tenant_id: targetTenantId,
        deleted_at: null,
      },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            logo_url: true,
            slogan: true,
          },
        },
        member: {
          select: {
            id: true,
            full_name: true,
            gender: true,
            generation: true,
            status: true,
            role: true,
            branch_id: true,
          },
        },
      },
    });

    if (!link) {
      const error = new Error('Bạn không có quyền truy cập hoặc chưa liên kết với dòng họ này.');
      error.status = 403;
      error.code = 'NO_TENANT_ACCESS';
      throw error;
    }

    if (link.status === 'TU_CHOI' || link.status === 'HUY_LIEN_KET') {
      const error = new Error('Tư cách thành viên của bạn tại dòng họ này đã bị hủy bỏ hoặc từ chối.');
      error.status = 403;
      error.code = 'LINK_INACTIVE';
      throw error;
    }

    const user = await basePrisma.users.findUnique({
      where: { id: userId, deleted_at: null },
      select: { id: true, email: true, phone: true, name: true, role: true, status: true },
    });

    if (!user) {
      const error = new Error('Tài khoản không tồn tại.');
      error.status = 404;
      error.code = 'USER_NOT_FOUND';
      throw error;
    }

    const secret = process.env.JWT_SECRET || securityConfig.JWT_SECRET;
    if (!secret) {
      throw new Error('Cấu hình thiếu JWT_SECRET tại tệp môi trường .env.');
    }

    const contextToken = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: link.role_in_tenant || user.role,
        tenantId: link.tenant_id,
        activeTenantId: link.tenant_id,
        activeMemberId: link.member_id,
        activeLinkStatus: link.status,
        linkType: link.link_type,
        tenantStatus: link.tenant?.status || null,
      },
      secret,
      { expiresIn: '24h' }
    );

    return {
      token: contextToken,
      activeContext: {
        activeTenantId: link.tenant_id,
        activeMemberId: link.member_id,
        activeLinkStatus: link.status,
        linkType: link.link_type,
        roleInTenant: link.role_in_tenant,
        tenant: link.tenant,
        member: link.member,
      },
    };
  },
};

module.exports = authService;