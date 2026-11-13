/**
 * PATH       : src/modules/auth/auth.service.js
 * DATETIME   : 2026-11-13T17:15:00+07:00
 * VERSION    : 20.9.3-MULTIHOME-UAT-BUG2-ISCLAN-MARRIAGE
 * DESCRIPTION:
 * - [AMEND-RP-OP-2026-02 V1.5.0] Lát 0 + Lát 3 Multi-Home SSOT:
 *   + Lát 0 (C2 & C2-S): registerUser tạo users (CHO_DUYET) + onboarding_cases.metadata trong 1 TX atomic;
 *     processUserApproval tạo/nối member CHINH_THUC + user_member_links (DA_DUYET, is_default = true),
 *     tuyệt đối không tạo DU_BI và không ghi users.member_id; loginUser trả 423 kèm caseMetadata và 403 hard-lock.
 *   + Lát 3 (C1 & C1-S Multi-Home): getAvailableClans hợp nhất user_member_links với hồ sơ C1/C1-S chờ duyệt;
 *     switchContext hỗ trợ chuyển ngữ cảnh sang dòng họ B đang CHO_DUYET/TU_CHOI;
 *     queryReviewableUsers hiển thị hồ sơ C1/C1-S; processUserApproval & returnForRevision ủy quyền
 *     xử lý C1/C1-S sang membershipService (link DA_DUYET, is_default = false, giữ nguyên họ gốc A).
 *   + UAT Bug 2.1: queryReviewableUsers truy vấn is_clan, child_type và marriages trên members để
 *     xác định chính xác tư cách Nội tộc/Ngoại tộc và vai vế CON_RE / CON_DAU / CON_DE.
 * ============================================================================
 * CHANGELOGS:
 * - 2026-11-12T11:30:00+07:00 (v20.8.0-MULTIHOME-AMEND02-V15-LAT0-ATOMIC): Hoàn thiện Lát 0 Phương án A.
 * - 2026-11-13T10:30:00+07:00 (v20.9.1-MULTIHOME-AMEND02-V15-LAT3): Bổ sung hỗ trợ Multi-Home C1 / C1-S.
 * - 2026-11-13T16:30:00+07:00 (v20.9.2-MULTIHOME-UAT-BUG2-RELATIONSHIP): Select child_type trên members.
 * - 2026-11-13T17:15:00+07:00 (v20.9.3-MULTIHOME-UAT-BUG2-ISCLAN-MARRIAGE):
 *   + Bổ sung resolveMemberClanRelation (is_clan + child_type + marriages) trong queryReviewableUsers
 *     để không hiển thị nhầm CON_DE khi thành viên ngoại tộc (is_clan = false) mang default DB.
 * ============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const { creatorStamp } = require('../members/profileAccess.service.js');
const { basePrisma, prisma, PRISMA_SELECTS } = require('../../lib/prisma.js');
const authLogService = require('./authLog.service');
const { cleanInput, formatNumericSlug } = require('../../shared/utils/slug.utils');
const securityConfig = require('../../config/securityConfig');

const onboardingService = require('../../services/onboarding.service');
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

const VALID_MEMBER_GENDERS = new Set(['NAM', 'NU', 'KHAC']);
const VALID_MEMBER_ROLES = new Set([
  'TRUONG_TOC',
  'TRUONG_NGANH',
  'TRUONG_CHI',
  'THANH_VIEN',
  'TRUONG_HO',
  'KHAC',
]);

/**
 * Helper hash cho password reset session security.
 */
const hashResetSecret = (value) => {
  return crypto
    .createHash('sha256')
    .update(String(value))
    .digest('hex');
};

/**
 * Helper tính toán thời hạn sống (expiresIn) của Token mới khi switch context.
 * Kế thừa exp của token gốc, trần tối đa 12h, tối thiểu 60s, fallback 8h.
 */
function resolveSwitchExpiresIn(authHeader) {
  const raw = (authHeader || '').replace(/^Bearer\s+/i, '').trim();
  const decoded = raw ? jwt.decode(raw) : null;
  const now = Math.floor(Date.now() / 1000);
  const ceiling = now + 12 * 3600;

  if (decoded?.exp && decoded.exp > now) {
    return Math.max(60, Math.min(decoded.exp, ceiling) - now);
  }
  return 8 * 3600;
}

/**
 * Chuẩn hóa payload đăng ký (21 trường / claimed_member_id) từ request đầu vào.
 */
function normalizeIncomingRegistrationProfile(payload, logIdentifier) {
  const { registration_profile, ...userData } = payload || {};
  if (registration_profile && typeof registration_profile === 'object') {
    return validateRegistrationProfile({
      ...registration_profile,
      phone: registration_profile.phone || logIdentifier || undefined,
      email: registration_profile.email || userData.email || undefined,
    });
  }

  return validateRegistrationProfile({
    full_name: userData.temp_full_name || userData.full_name || userData.name || 'Thành viên mới',
    alias: userData.alias,
    gender: userData.gender || 'NAM',
    birth_year: userData.temp_birth_year
      ? parseInt(userData.temp_birth_year, 10)
      : userData.birth_year
        ? parseInt(userData.birth_year, 10)
        : undefined,
    birth_month: userData.birth_month ? parseInt(userData.birth_month, 10) : undefined,
    birth_day: userData.birth_day ? parseInt(userData.birth_day, 10) : undefined,
    birth_place: userData.birth_place,
    death_year: userData.death_year ? parseInt(userData.death_year, 10) : undefined,
    is_alive: userData.is_alive !== undefined ? userData.is_alive : true,
    generation: userData.generation ? parseInt(userData.generation, 10) : undefined,
    member_role: userData.member_role || 'THANH_VIEN',
    branch_name: userData.temp_branch_name || userData.branch_name,
    father_name: userData.temp_father_name || userData.father_name,
    mother_name: userData.mother_name,
    grandfather_name: userData.temp_grandfather_name || userData.grandfather_name,
    grandmother_name: userData.grandmother_name,
    address: userData.temp_address || userData.address,
    note: userData.temp_note || userData.note,
    claimed_member_id: userData.claimed_member_id || undefined,
    proof_documents: Array.isArray(userData.proof_documents) ? userData.proof_documents : undefined,
    phone: logIdentifier || undefined,
    email: userData.email || undefined,
    social_profiles: userData.temp_social_profiles || userData.social_profiles || {},
  });
}

/**
 * Tổng hợp ghi chú phả hệ từ 21 trường để không thất lạc thông tin tiền nhân / địa chỉ khi tạo member chính thức.
 */
/**
 * Suy diễn tư cách Nội tộc / Ngoại tộc (is_clan) và vai vế (child_type) từ members + marriages.
 * Khắc phục trường hợp schema.prisma đặt @default(CON_DE) cho thành viên ngoại tộc (is_clan = false).
 */
function resolveMemberClanRelation(member) {
  if (!member) {
    return { isClan: null, childType: null };
  }
  const isClan = member.is_clan !== false;
  const hasClanWife = (member.marriages_as_husband || []).some(
    (m) =>
      m.members_marriages_wife_idTomembers &&
      m.members_marriages_wife_idTomembers.is_clan !== false
  );
  const hasClanHusband = (member.marriages_as_wife || []).some(
    (m) =>
      m.members_marriages_husband_idTomembers &&
      m.members_marriages_husband_idTomembers.is_clan !== false
  );
  const isMarriedToClanMember = hasClanWife || hasClanHusband;

  if (!isClan) {
    if (
      member.child_type === 'CON_RE' ||
      member.child_type === 'CON_DAU' ||
      member.child_type === 'KHAC'
    ) {
      return { isClan: false, childType: member.child_type };
    }
    if (isMarriedToClanMember || member.child_type === 'CON_DE' || !member.child_type) {
      const inferred =
        member.gender === 'NAM'
          ? 'CON_RE'
          : member.gender === 'NU'
            ? 'CON_DAU'
            : 'KHAC';
      return { isClan: false, childType: inferred };
    }
    return { isClan: false, childType: member.child_type };
  }

  return {
    isClan: true,
    childType: member.child_type || 'CON_DE',
  };
}

function buildMemberNoteFromProfile(profile = {}) {
  const parts = [];
  if (profile.father_name) parts.push(`Cha: ${profile.father_name}`);
  if (profile.mother_name) parts.push(`Mẹ: ${profile.mother_name}`);
  if (profile.grandfather_name) parts.push(`Ông nội: ${profile.grandfather_name}`);
  if (profile.grandmother_name) parts.push(`Bà nội: ${profile.grandmother_name}`);
  if (profile.branch_name) parts.push(`Chi/Nhánh khai báo: ${profile.branch_name}`);
  if (profile.address) parts.push(`Địa chỉ khai báo: ${profile.address}`);
  if (profile.note) parts.push(String(profile.note).trim());

  const combined = parts.join(' | ');
  return combined ? combined.slice(0, 1024) : null;
}

const authService = {
  checkLockStatus: async (user) => {
    if (!user) return { isLocked: false };

    if (user.status === 'BI_CAM') {
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

      if (!hasValidLockTime || !hasPreLockStatus) {
        return {
          isLocked: true,
          isPermanent: true,
          lockType: 'PERMANENT',
          reasonCode: 'INVALID_LOCK_STATE',
        };
      }

      const minutesLeft = Math.ceil((lockedUntilDate - now) / 60000);
      return {
        isLocked: true,
        isPermanent: false,
        minutesLeft: Math.max(1, minutesLeft),
        lockType: 'TEMPORARY',
        reasonCode: 'TOO_MANY_ATTEMPTS',
      };
    }

    return { isLocked: false };
  },

  /**
   * Tiến trình xác thực đăng nhập + Assert Order + Multi-Home Context Token (V1.5.0).
   */
  loginUser: async (identifier, password, extraData) => {
    // ─── Bước 0: Tìm user kèm danh sách liên kết user_member_links ───
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
              select: {
                id: true,
                name: true,
                slug: true,
                status: true,
                logo_url: true,
                slogan: true,
                social_configs: true,
              },
            },
            member: {
              select: {
                id: true,
                full_name: true,
                generation: true,
                status: true,
                role: true,
              },
            },
          },
          orderBy: [{ is_default: 'desc' }, { created_at: 'asc' }],
        },
      },
    });

    if (!user) {
      const error = new Error('Thông tin tài khoản đăng nhập hoặc mật khẩu không chính xác.');
      error.status = 401;
      error.code = 'INVALID_CREDENTIALS';
      throw error;
    }

    // ─── Bước 1: Kiểm tra mật khẩu ───────────────────────────────────
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      const error = new Error('Thông tin tài khoản đăng nhập hoặc mật khẩu không chính xác.');
      error.status = 401;
      error.code = 'INVALID_CREDENTIALS';
      throw error;
    }

    // ─── Bước 2: Kiểm tra trạng thái an ninh / Khóa tài khoản ─────────
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

    // 2b. Lifecycle — CHO_DUYET (423 kèm trọn vẹn caseMetadata cho vòng lặp sửa đổi)
    const draftLink = user.user_member_links?.find((l) => l.status === 'DRAFT');
    const isSandboxAllowed = Boolean(draftLink);

    if (user.status === 'CHO_DUYET' && !isSandboxAllowed) {
      let reviewNote = null;
      let caseStatus = null;
      let caseId = null;
      let caseMetadata = null;

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
          orderBy: { created_at: 'desc' },
        });

        if (openCase) {
          reviewNote = openCase.review_note
            ? String(openCase.review_note).trim() || null
            : null;
          caseStatus = openCase.status;
          caseId = openCase.id;
          caseMetadata =
            openCase.metadata && typeof openCase.metadata === 'object'
              ? openCase.metadata
              : null;
        }
      } catch (caseErr) {
        console.error('[LOGIN][CHO_DUYET][CASE]', caseErr.message || caseErr);
      }

      const canEdit = caseStatus === 'NEEDS_REVISION' && !!reviewNote;
      const profileFromCase =
        caseMetadata?.registration_profile &&
        typeof caseMetadata.registration_profile === 'object'
          ? caseMetadata.registration_profile
          : {};

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
      error.caseMetadata = caseMetadata;
      error.tempSnapshot = {
        ...profileFromCase,
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

    // 2c. Hard-lock (403 ACCOUNT_PERMANENTLY_REJECTED) vs Soft reject / Disabled (403)
    if (user.status === 'TU_CHOI') {
      let isFinalRejection = false;
      try {
        const rejectedCase = await basePrisma.onboarding_cases.findFirst({
          where: {
            user_id: user.id,
            status: 'REJECTED',
            deleted_at: null,
            process_kind: 'REGISTER',
          },
          orderBy: { created_at: 'desc' },
          select: { metadata: true },
        });
        const meta =
          rejectedCase?.metadata && typeof rejectedCase.metadata === 'object'
            ? rejectedCase.metadata
            : {};
        isFinalRejection = meta.is_final_rejection === true;
      } catch (rejErr) {
        console.error('[LOGIN][TU_CHOI][CASE]', rejErr.message || rejErr);
      }

      if (isFinalRejection) {
        const error = new Error(
          'Hồ sơ đăng ký của bạn đã bị từ chối vĩnh viễn và không thể nộp lại.'
        );
        error.status = 403;
        error.code = 'ACCOUNT_PERMANENTLY_REJECTED';
        error.canEdit = false;
        throw error;
      }

      const error = new Error(
        'Tài khoản này hiện tại đã bị từ chối truy cập. Vui lòng liên hệ Ban quản trị.'
      );
      error.status = 403;
      error.code = 'ACCOUNT_DISABLED';
      throw error;
    }

    if (user.status === 'TAM_NGUNG') {
      const error = new Error(
        'Tài khoản này hiện tại đã bị tạm ngưng truy cập.'
      );
      error.status = 403;
      error.code = 'ACCOUNT_DISABLED';
      throw error;
    }

    // ─── Bước 3: Kiểm tra trạng thái dòng họ (Tenant status) ─────────
    const activeLink =
      user.user_member_links?.find((l) => l.is_default && l.status === 'DA_DUYET') ||
      user.user_member_links?.find((l) => l.status === 'DA_DUYET') ||
      draftLink ||
      user.user_member_links?.[0] ||
      null;

    const effectiveTenantObj = activeLink?.tenant || user.tenants || null;

    if (user.role !== 'SYSTEM_ADMIN' && effectiveTenantObj) {
      const tenantStatus = effectiveTenantObj.status;

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

    // ─── Bước 4: Cấp Context Token (100% SSOT từ user_member_links) ───
    const secret = process.env.JWT_SECRET || securityConfig.JWT_SECRET;
    if (!secret) {
      throw new Error('Cấu hình thiếu JWT_SECRET tại tệp môi trường .env.');
    }

    if (user.role === 'SYSTEM_ADMIN') {
      const rootTenantId = user.tenant_id || '00000000-0000-0000-0000-000000000000';

      const token = jwt.sign(
        {
          userId: user.id,
          email: user.email,
          role: 'SYSTEM_ADMIN',
          roleInTenant: 'SYSTEM_ADMIN',
          tenantId: rootTenantId,
          activeTenantId: rootTenantId,
          activeMemberId: null,
          activeLinkStatus: 'DA_DUYET',
          linkType: 'SYSTEM',
          status: user.status,
          tenantStatus: 'HOAT_DONG',
          isSandbox: false,
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
          roleInTenant: 'SYSTEM_ADMIN',
          tenant_id: rootTenantId,
          tenantId: rootTenantId,
          activeTenantId: rootTenantId,
          activeMemberId: null,
          activeLinkStatus: 'DA_DUYET',
          status: user.status,
          tenantStatus: 'HOAT_DONG',
          isSandbox: false,
          tenant: null,
          clanName: 'Hệ Thống Trung Tâm',
          availableClans: [],
        },
      };
    }

    // Tuyệt đối KHÔNG fallback sang user.member_id; SSOT duy nhất là activeLink
    const activeTenantId = activeLink ? activeLink.tenant_id : (user.tenant_id || null);
    const activeMemberId = activeLink ? activeLink.member_id : null;
    const activeLinkStatus = activeLink ? activeLink.status : null;
    const effectiveRole = activeLink?.role_in_tenant || user.role;
    const tenantStatus = effectiveTenantObj?.status || null;

    const sc =
      effectiveTenantObj?.social_configs &&
      typeof effectiveTenantObj.social_configs === 'object'
        ? effectiveTenantObj.social_configs
        : {};
    const isSandbox = Boolean(sc.isSandbox);

    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: effectiveRole,
        roleInTenant: effectiveRole,
        tenantId: activeTenantId,
        activeTenantId,
        activeMemberId,
        activeLinkStatus,
        linkType: activeLink?.link_type || null,
        status: user.status,
        tenantStatus,
        isSandbox,
      },
      secret,
      { expiresIn: '24h' }
    );

    const tenantDto = effectiveTenantObj
      ? {
          id: effectiveTenantObj.id || activeTenantId || null,
          name: effectiveTenantObj.name || null,
          slug: effectiveTenantObj.slug || null,
          logo_url: effectiveTenantObj.logo_url || null,
          slogan: effectiveTenantObj.slogan || null,
          logo_icon: sc.logo_icon || null,
          status: effectiveTenantObj.status || tenantStatus,
          isSandbox,
        }
      : activeTenantId
        ? {
            id: activeTenantId,
            name: null,
            slug: null,
            logo_url: null,
            slogan: null,
            logo_icon: null,
            status: tenantStatus,
            isSandbox,
          }
        : null;

    const availableClans = (user.user_member_links || []).map((link) => {
      const linkSc =
        link.tenant?.social_configs && typeof link.tenant.social_configs === 'object'
          ? link.tenant.social_configs
          : {};
      return {
        tenantId: link.tenant_id,
        clanName: link.tenant?.name || 'Dòng họ',
        clanSlug: link.tenant?.slug || '',
        linkType: link.link_type,
        status: link.status,
        isDefault: link.is_default,
        roleInTenant: link.role_in_tenant,
        memberId: link.member_id,
        memberName: link.member?.full_name || null,
        isSandbox: Boolean(linkSc.isSandbox),
      };
    });

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone || null,
        role: effectiveRole,
        roleInTenant: effectiveRole,
        tenant_id: activeTenantId,
        tenantId: activeTenantId,
        activeTenantId,
        activeMemberId,
        activeLinkStatus,
        status: user.status,
        tenantStatus,
        isSandbox,
        tenant: tenantDto,
        clanName: tenantDto?.name || null,
        availableClans,
      },
    };
  },

  /**
   * Lấy danh sách dòng họ liên kết của user (Multi-Home).
   */
  getAvailableClans: async (userId) => {
    const [links, pendingCases] = await Promise.all([
      basePrisma.user_member_links.findMany({
        where: {
          user_id: userId,
          deleted_at: null,
        },
        include: {
          tenant: {
            select: {
              id: true,
              name: true,
              slug: true,
              status: true,
              social_configs: true,
            },
          },
          member: {
            select: { id: true, full_name: true },
          },
        },
        orderBy: [{ is_default: 'desc' }, { created_at: 'asc' }],
      }),
      basePrisma.onboarding_cases.findMany({
        where: {
          user_id: userId,
          deleted_at: null,
          process_kind: 'REGISTER',
          tenant_id: { not: null },
          status: {
            in: [
              'DRAFT',
              'PROFILE_COMPLETED',
              'FAMILY_TREE_DRAFT',
              'SUBMITTED',
              'UNDER_REVIEW',
              'NEEDS_REVISION',
              'REJECTED',
            ],
          },
        },
        include: {
          tenants: {
            select: {
              id: true,
              name: true,
              slug: true,
              status: true,
              social_configs: true,
            },
          },
        },
        orderBy: { created_at: 'desc' },
      }),
    ]);

    const linkedTenantIds = new Set(links.map((l) => l.tenant_id));

    const result = links.map((link) => {
      const sc =
        link.tenant?.social_configs && typeof link.tenant.social_configs === 'object'
          ? link.tenant.social_configs
          : {};
      return {
        tenantId: link.tenant_id,
        clanName: link.tenant?.name || 'Dòng họ',
        clanSlug: link.tenant?.slug || '',
        linkType: link.link_type,
        status: link.status,
        isDefault: link.is_default,
        roleInTenant: link.role_in_tenant,
        memberId: link.member_id,
        memberName: link.member?.full_name || null,
        isSandbox: Boolean(sc.isSandbox),
      };
    });

    for (const c of pendingCases) {
      if (!c.tenant_id || linkedTenantIds.has(c.tenant_id)) continue;
      linkedTenantIds.add(c.tenant_id);
      const meta = c.metadata && typeof c.metadata === 'object' ? c.metadata : {};
      const sc =
        c.tenants?.social_configs && typeof c.tenants.social_configs === 'object'
          ? c.tenants.social_configs
          : {};
      const mappedStatus = c.status === 'REJECTED' ? 'TU_CHOI' : 'CHO_DUYET';
      result.push({
        tenantId: c.tenant_id,
        clanName: c.tenants?.name || meta.clanName || 'Dòng họ',
        clanSlug: c.tenants?.slug || meta.tenantSlug || '',
        linkType:
          meta.link_type ||
          (c.case_type === 'CLAN_SETUP' ? 'PRIMARY_PATERNAL' : 'SPOUSE_FAMILY'),
        status: mappedStatus,
        isDefault: false,
        roleInTenant: c.case_type === 'CLAN_SETUP' ? 'CLAN_ADMIN' : 'VIEWER',
        memberId: c.primary_member_id || null,
        memberName: meta.registration_profile?.full_name || null,
        isSandbox: Boolean(sc.isSandbox),
        caseId: c.id,
        caseType: c.case_type,
        caseStatus: c.status,
        isFinalRejection: meta.is_final_rejection === true,
      });
    }

    return result;
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

  /**
   * Đăng ký tài khoản mới (Luồng C2 & C2-S theo AMEND-RP-OP-2026-02 V1.5.0).
   * - Chỉ tạo định danh trên bảng users (status = 'CHO_DUYET').
   * - Không tạo members DU_BI, không ghi users.member_id, không rải phả hệ vào users.temp_*.
   * - Toàn bộ registration_profile (21 trường / claimed_member_id) lưu vào onboarding_cases.metadata.
   */
  registerUser: async (payload, extraData = {}) => {
    if (payload.isRevision === true) {
      return authService.submitRegistrationRevision(payload, extraData);
    }

    const { isNewClan, clanName, description, tenantId, ...userData } = payload;
    const { ip_address, user_agent, correlationId: incomingCorrelationId } = extraData;
    const logIdentifier = cleanInput(userData.phone, 'phone');
    let transactionResult = null;

    const validatedProfile = normalizeIncomingRegistrationProfile(payload, logIdentifier);
    const hashedPassword = await bcrypt.hash(userData.password, 10);

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

          // Chỉ ghi trường định danh an ninh vào users; tuyệt đối không tạo member / không rải temp_*
          const newUser = await tx.users.create({
            data: {
              name: technicalName,
              email: userData.email ? cleanInput(userData.email, 'email') : null,
              phone: logIdentifier,
              password: hashedPassword,
              tenant_id: tid,
              role: isNewClan ? 'CLAN_ADMIN' : 'VIEWER',
              status: 'CHO_DUYET',
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

          // [AMEND-02 V1.5.0] Đưa việc tạo onboarding_cases vào trong transaction để tránh sinh user mồ côi
          const C = incomingCorrelationId || crypto.randomUUID();
          const caseType = isNewClan ? 'CLAN_SETUP' : 'MEMBER_JOIN';
          const registrationType = isNewClan ? 'NEW_CLAN' : 'JOIN_CLAN';
          
          const caseMetadataPayload = {
            source: 'REGISTER',
            registrationType,
            registration_profile: validatedProfile,
          };

          const newCase = await tx.onboarding_cases.create({
            data: {
              correlation_id: C,
              case_type: caseType,
              process_kind: 'REGISTER',
              status: 'SUBMITTED',
              user_id: newUser.id,
              tenant_id: tid,
              submitted_at: new Date(),
              changed_by: newUser.id,
              metadata: caseMetadataPayload,
            },
          });

          return {
            userId: newUser.id,
            tenantId: tid,
            slug: tenantSlug,
            status: newUser.status,
            validatedProfile,
            correlationId: C,
            caseId: newCase.id,
            caseType,
          };
        },
        {
          maxWait: 10000,
          timeout: 20000,
        }
      );

      const C = transactionResult.correlationId;
      const userId = transactionResult.userId;
      const tid = transactionResult.tenantId;
      const caseType = transactionResult.caseType;
      const registrationType = isNewClan ? 'NEW_CLAN' : 'JOIN_CLAN';
      const displayName =
        transactionResult.validatedProfile?.full_name || logIdentifier || 'new-user';
      const caseId = transactionResult.caseId;

      await authLogService.logAttempt({
        identifier: logIdentifier,
        ip_address,
        user_agent,
        status: 'THANH_CONG',
        failure_reason: 'REGISTER_SUCCESS',
      });

      // 2) BPL & Audit trong withTransaction
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
          async (tx) => {
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
                    email: userData.email ? cleanInput(userData.email, 'email') : null,
                    phone: logIdentifier || null,
                    registered_via: 'WEB',
                    full_name: displayName,
                    claimed_member_id:
                      transactionResult.validatedProfile?.claimed_member_id || null,
                  },
                },
                tx
              );
            } catch (err) {
              console.error('[REGISTER_LEDGER][BPL_USER_REGISTER]', err.message || err);
            }

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
                    target_id: caseId || userId,
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

      // 3) Notification Silent Emit
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
                  caseId: caseId || null,
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

      return {
        userId: transactionResult.userId,
        tenantId: transactionResult.tenantId,
        slug: transactionResult.slug,
        status: transactionResult.status,
      };
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

    const recentRequestCount = await basePrisma.password_reset_sessions.count({
      where: {
        identifier: rawIdentifier,
        created_at: { gte: requestWindowStart },
        deleted_at: null,
      },
    });

    if (recentRequestCount >= securityConfig.RESET_OTP_MAX_REQUESTS_PER_WINDOW) {
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

    const latestSession = await basePrisma.password_reset_sessions.findFirst({
      where: {
        user_id: user.id,
        identifier: rawIdentifier,
        status: { in: ['PENDING', 'VERIFIED'] },
        deleted_at: null,
      },
      orderBy: { created_at: 'desc' },
    });

    if (latestSession?.created_at) {
      const elapsedSeconds =
        (now.getTime() - new Date(latestSession.created_at).getTime()) / 1000;

      if (elapsedSeconds < securityConfig.RESET_OTP_RESEND_COOLDOWN_SECONDS) {
        const waitSeconds = Math.ceil(
          securityConfig.RESET_OTP_RESEND_COOLDOWN_SECONDS - elapsedSeconds
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
        status: { in: ['PENDING', 'VERIFIED', 'LOCKED'] },
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
      now.getTime() + securityConfig.RESET_OTP_EXPIRES_MINUTES * 60 * 1000
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
      orderBy: { created_at: 'desc' },
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
        (new Date(session.locked_until).getTime() - now.getTime()) / 60000
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
        data: { status: 'EXPIRED', updated_at: now },
      });

      const err = new Error('Mã xác nhận đã hết hạn. Vui lòng yêu cầu mã mới.');
      err.status = 400;
      err.code = 'RESET_OTP_EXPIRED';
      throw err;
    }

    const otpHash = hashResetSecret(otp);
    if (otpHash !== session.otp_hash) {
      const nextAttemptCount = (session.verify_attempt_count || 0) + 1;
      const shouldLock =
        nextAttemptCount >= securityConfig.RESET_OTP_MAX_VERIFY_ATTEMPTS;

      await basePrisma.password_reset_sessions.update({
        where: { id: session.id },
        data: {
          verify_attempt_count: nextAttemptCount,
          status: shouldLock ? 'LOCKED' : 'PENDING',
          locked_until: shouldLock
            ? new Date(
                now.getTime() + securityConfig.RESET_OTP_LOCK_MINUTES * 60 * 1000
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
      err.code = shouldLock ? 'RESET_OTP_LOCKED' : 'INVALID_RESET_CODE';
      err.remainingAttempts = Math.max(
        0,
        securityConfig.RESET_OTP_MAX_VERIFY_ATTEMPTS - nextAttemptCount
      );
      throw err;
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = hashResetSecret(resetToken);
    const resetTokenExpiresAt = new Date(
      now.getTime() + securityConfig.RESET_TOKEN_EXPIRES_MINUTES * 60 * 1000
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
      orderBy: { verified_at: 'desc' },
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
        (new Date(session.locked_until).getTime() - now.getTime()) / 60000
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
        data: { status: 'EXPIRED', updated_at: now },
      });

      const err = new Error(
        'Phiên đặt lại mật khẩu đã hết hạn. Vui lòng yêu cầu mã mới.'
      );
      err.status = 400;
      err.code = 'RESET_TOKEN_EXPIRED';
      throw err;
    }

    const user = await basePrisma.users.findFirst({
      where: { id: session.user_id, deleted_at: null },
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
          id: { not: session.id },
          status: { in: ['PENDING', 'VERIFIED', 'LOCKED'] },
          deleted_at: null,
        },
        data: {
          status: 'CANCELLED',
          updated_at: now,
        },
      });
    });

    return { userId: user.id, changed: true };
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
    return { changed: true };
  },

  saveResetToken: async (userId, otp) => {
    return await basePrisma.users.update({
      where: { id: userId },
      data: {
        reset_token: otp,
        reset_expires: new Date(
          Date.now() + securityConfig.RESET_OTP_EXPIRES_MINUTES * 60 * 1000
        ),
      },
    });
  },

  verifyOTP: async (email, otp) => {
    return await basePrisma.users.findFirst({
      where: {
        email,
        reset_token: otp,
        reset_expires: { gte: new Date() },
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
        orderBy: { created_at: 'desc' },
        take: 30,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          status: true,
          role: true,
          tenant_id: true,
          created_at: true,
          tenants: {
            where: { deleted_at: null },
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

  /**
   * Danh sách hồ sơ cho cổng Admin (/admin/approval).
   * Đọc trọn vẹn 21 trường và claimed_member_id từ onboarding_cases.metadata.
   */
  queryReviewableUsers: async (filters, actorRole, actorTenantId) => {
    try {
      const {
        status,
        role,
        searchKeyword,
        fromDate,
        toDate,
        page = 1,
        limit = 20,
      } = filters;

      const whereClause = {
        deleted_at: null,
        ...(actorRole !== 'SYSTEM_ADMIN' ? { tenant_id: actorTenantId } : {}),
      };

      if (status) {
        whereClause.status = status;
      } else {
        whereClause.status = {
          in: ['CHO_DUYET', 'TU_CHOI', 'DA_DUYET', 'BI_KHOA', 'BI_CAM', 'TAM_NGUNG'],
        };
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
          { phone: { contains: keyword, mode: 'insensitive' } },
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
              select: PRISMA_SELECTS.TENANT_STANDARD,
            },
          },
        }),
      ]);

      const enrichedData = await Promise.all(
        users.map(async (user) => {
          let linkedMember = null;
          let openCase = null;

          try {
            openCase = await basePrisma.onboarding_cases.findFirst({
              where: {
                user_id: user.id,
                deleted_at: null,
                process_kind: 'REGISTER',
              },
              orderBy: { created_at: 'desc' },
              select: {
                id: true,
                case_type: true,
                status: true,
                review_note: true,
                rejection_reason: true,
                metadata: true,
              },
            });
          } catch (e) {
            console.error('[queryReviewableUsers][Case]', e.message || e);
          }

          const rawCaseMeta =
            openCase?.metadata && typeof openCase.metadata === 'object'
              ? openCase.metadata
              : {};
          const profile =
            rawCaseMeta.registration_profile &&
            typeof rawCaseMeta.registration_profile === 'object'
              ? rawCaseMeta.registration_profile
              : rawCaseMeta; // Fallback to raw meta if directly stored

          // 1. Kiểm tra liên kết thực tế trên user_member_links (SSOT)
          const activeLink = user.tenant_id
            ? await basePrisma.user_member_links.findFirst({
                where: {
                  user_id: user.id,
                  tenant_id: user.tenant_id,
                  deleted_at: null,
                },
                select: { member_id: true, status: true, role_in_tenant: true },
              })
            : null;

          // 2. Nạp thông tin Member (từ link đã duyệt hoặc từ claimed_member_id đang xin nhận)
          const memberIdToInspect =
            activeLink?.member_id || profile.claimed_member_id || null;

          if (memberIdToInspect && user.tenant_id) {
            const rawMember = await basePrisma.members.findFirst({
              where: {
                id: memberIdToInspect,
                tenant_id: user.tenant_id,
                deleted_at: null,
              },
              select: {
                id: true,
                full_name: true,
                generation: true,
                gender: true,
                is_clan: true,
                child_type: true,
                is_alive: true,
                branch_id: true,
                status: true,
                role: true,
                branch: {
                  select: { id: true, name: true },
                },
                marriages_as_husband: {
                  where: { deleted_at: null },
                  select: {
                    id: true,
                    members_marriages_wife_idTomembers: {
                      select: { id: true, is_clan: true },
                    },
                  },
                  take: 5,
                },
                marriages_as_wife: {
                  where: { deleted_at: null },
                  select: {
                    id: true,
                    members_marriages_husband_idTomembers: {
                      select: { id: true, is_clan: true },
                    },
                  },
                  take: 5,
                },
              },
            });
            if (rawMember) {
              const rel = resolveMemberClanRelation(rawMember);
              const {
                marriages_as_husband,
                marriages_as_wife,
                ...cleanMember
              } = rawMember;
              linkedMember = {
                ...cleanMember,
                is_clan: rel.isClan,
                child_type: rel.childType,
              };
            }
          }

          const isFinalRejection =
            user.status === 'TU_CHOI' && rawCaseMeta.is_final_rejection === true;

          // Phân loại nhãn nghiệp vụ theo V1.5.0 Mục 7
          const isClanSetup =
            openCase?.case_type === 'CLAN_SETUP' || user.role === 'CLAN_ADMIN';
          const claimCategory = isClanSetup
            ? 'CLAN_SETUP_C2S'
            : profile.claimed_member_id
              ? 'CLAIM_EM'
              : 'NEW_MEMBER_21_FIELDS';

          const summaryObj =
            profile.claim_verification?.claimed_member_summary || {};
          const effectiveIsClan =
            linkedMember?.is_clan !== undefined
              ? linkedMember.is_clan
              : summaryObj.is_clan !== undefined
                ? summaryObj.is_clan
                : null;
          const effectiveChildType =
            linkedMember?.child_type ||
            summaryObj.child_type ||
            null;
          const resolvedRelationship =
            effectiveChildType ||
            profile.temp_relationship ||
            rawCaseMeta.link_type ||
            user.temp_relationship ||
            'CON_DE';

          return {
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            status: user.status,
            role: user.role,
            isFinalRejection,
            claimCategory,
            caseId: openCase?.id || null,
            caseType: openCase?.case_type || (isClanSetup ? 'CLAN_SETUP' : 'MEMBER_JOIN'),
            caseStatus: openCase?.status || null,
            caseMetadata: rawCaseMeta,
            created_at: user.created_at,
            updated_at: user.updated_at,
            temp_snapshot: {
              full_name:
                profile.full_name || user.temp_full_name || user.name || 'Chưa khai báo',
              alias: profile.alias || null,
              gender: profile.gender || 'NAM',
              birth_year:
                profile.birth_year || user.temp_birth_year || 'Chưa khai báo',
              birth_month: profile.birth_month || null,
              birth_day: profile.birth_day || null,
              birth_place: profile.birth_place || null,
              death_year: profile.death_year || null,
              is_alive: profile.is_alive !== undefined ? profile.is_alive : true,
              generation: profile.generation || null,
              member_role: profile.member_role || 'THANH_VIEN',
              branch_name:
                profile.branch_name || user.temp_branch_name || 'Chưa khai báo',
              father_name:
                profile.father_name || user.temp_father_name || 'Chưa khai báo',
              mother_name: profile.mother_name || null,
              grandfather_name:
                profile.grandfather_name ||
                user.temp_grandfather_name ||
                'Chưa khai báo',
              grandmother_name: profile.grandmother_name || null,
              address: profile.address || user.temp_address || 'Chưa khai báo',
              is_clan: effectiveIsClan,
              is_clan: effectiveIsClan,
              relationship: resolvedRelationship,
              child_type: effectiveChildType,
              link_type: rawCaseMeta.link_type || null,
              note: profile.note || user.temp_note || 'Không có ghi chú',
              claimed_member_id: profile.claimed_member_id || null,
              proof_documents: profile.proof_documents || [],
              social_profiles: profile.social_profiles || {},
              registration_reason: 'Nộp đơn gia nhập tộc hệ',
            },
            tenant: user.tenants || null,
            member_profile: linkedMember,
          };
        })
      );

      // Bổ sung hồ sơ Multi-Home C1 / C1-S (user đã DA_DUYET ở họ gốc, nộp đơn sang họ B hoặc lập họ B)
      const c1CaseWhere = {
        deleted_at: null,
        process_kind: 'REGISTER',
        ...(actorRole !== 'SYSTEM_ADMIN'
          ? { tenant_id: actorTenantId, case_type: 'MEMBER_JOIN' }
          : {}),
        status:
          status === 'TU_CHOI'
            ? { in: ['REJECTED'] }
            : status === 'DA_DUYET'
              ? { in: ['APPROVED', 'MERGED'] }
              : { in: ['SUBMITTED', 'UNDER_REVIEW', 'NEEDS_REVISION'] },
        users: {
          status: 'DA_DUYET',
          deleted_at: null,
        },
      };

      const c1Cases = await basePrisma.onboarding_cases.findMany({
        where: c1CaseWhere,
        orderBy: { updated_at: 'desc' },
        take: 30,
        include: {
          users: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              status: true,
              role: true,
              created_at: true,
              updated_at: true,
            },
          },
          tenants: {
            select: PRISMA_SELECTS.TENANT_STANDARD,
          },
        },
      });

      const c1Items = await Promise.all(
        c1Cases.map(async (c) => {
          const u = c.users;
          const rawCaseMeta = c.metadata && typeof c.metadata === 'object' ? c.metadata : {};
          const profile =
            rawCaseMeta.registration_profile &&
            typeof rawCaseMeta.registration_profile === 'object'
              ? rawCaseMeta.registration_profile
              : rawCaseMeta;

          let linkedMember = null;
          if (profile.claimed_member_id && c.tenant_id) {
            const rawMember = await basePrisma.members.findFirst({
              where: {
                id: profile.claimed_member_id,
                tenant_id: c.tenant_id,
                deleted_at: null,
              },
              select: {
                id: true,
                full_name: true,
                generation: true,
                gender: true,
                is_clan: true,
                child_type: true,
                is_alive: true,
                branch_id: true,
                status: true,
                role: true,
                branch: { select: { id: true, name: true } },
                marriages_as_husband: {
                  where: { deleted_at: null },
                  select: {
                    id: true,
                    members_marriages_wife_idTomembers: {
                      select: { id: true, is_clan: true },
                    },
                  },
                  take: 5,
                },
                marriages_as_wife: {
                  where: { deleted_at: null },
                  select: {
                    id: true,
                    members_marriages_husband_idTomembers: {
                      select: { id: true, is_clan: true },
                    },
                  },
                  take: 5,
                },
              },
            });
            if (rawMember) {
              const rel = resolveMemberClanRelation(rawMember);
              const {
                marriages_as_husband,
                marriages_as_wife,
                ...cleanMember
              } = rawMember;
              linkedMember = {
                ...cleanMember,
                is_clan: rel.isClan,
                child_type: rel.childType,
              };
            }
          }

          const isClanSetup = c.case_type === 'CLAN_SETUP';
          const mappedStatus =
            c.status === 'REJECTED'
              ? 'TU_CHOI'
              : c.status === 'APPROVED' || c.status === 'MERGED'
                ? 'DA_DUYET'
                : 'CHO_DUYET';

          const summaryObj =
            profile.claim_verification?.claimed_member_summary || {};
          const effectiveIsClan =
            linkedMember?.is_clan !== undefined
              ? linkedMember.is_clan
              : summaryObj.is_clan !== undefined
                ? summaryObj.is_clan
                : null;
          const effectiveChildType =
            linkedMember?.child_type ||
            summaryObj.child_type ||
            null;
          const resolvedRelationship =
            effectiveChildType ||
            profile.temp_relationship ||
            rawCaseMeta.link_type ||
            'CON_DE';

          return {
            id: u.id,
            caseId: c.id,
            isMultiHomeCase: true,
            name: u.name,
            email: u.email,
            phone: u.phone,
            status: mappedStatus,
            role: isClanSetup ? 'CLAN_ADMIN' : 'USER',
            isFinalRejection:
              c.status === 'REJECTED' && rawCaseMeta.is_final_rejection === true,
            claimCategory: isClanSetup ? 'CLAN_SETUP_C1S' : 'MULTIHOME_C1',
            caseType: c.case_type,
            caseStatus: c.status,
            caseMetadata: rawCaseMeta,
            created_at: c.created_at,
            updated_at: c.updated_at,
            temp_snapshot: {
              full_name: profile.full_name || u.name || 'Chưa khai báo',
              alias: profile.alias || null,
              gender: profile.gender || 'NAM',
              birth_year: profile.birth_year || 'Chưa khai báo',
              birth_month: profile.birth_month || null,
              birth_day: profile.birth_day || null,
              birth_place: profile.birth_place || null,
              death_year: profile.death_year || null,
              is_alive: profile.is_alive !== undefined ? profile.is_alive : true,
              generation: profile.generation || null,
              member_role: profile.member_role || 'THANH_VIEN',
              branch_name: profile.branch_name || 'Chưa khai báo',
              father_name: profile.father_name || 'Chưa khai báo',
              mother_name: profile.mother_name || null,
              grandfather_name: profile.grandfather_name || 'Chưa khai báo',
              grandmother_name: profile.grandmother_name || null,
              address: profile.address || 'Chưa khai báo',
              relationship: resolvedRelationship,
              child_type: effectiveChildType,
              link_type: rawCaseMeta.link_type || null,
              note: profile.note || 'Không có ghi chú',
              claimed_member_id: profile.claimed_member_id || null,
              proof_documents: profile.proof_documents || [],
              social_profiles: profile.social_profiles || {},
              registration_reason: isClanSetup
                ? 'Thành viên hiện hữu lập dòng họ mới (C1-S)'
                : 'Thành viên hiện hữu xin gia nhập dòng họ thứ hai (C1)',
            },
            tenant: c.tenants || null,
            member_profile: linkedMember,
          };
        })
      );

      const combinedData = [...c1Items, ...enrichedData];

      return {
        pagination: {
          total_records: totalRecords + c1Items.length,
          current_page: parseInt(page, 10),
          limit: take,
          total_pages: Math.ceil((totalRecords + c1Items.length) / take),
        },
        data: combinedData,
      };
    } catch (error) {
      console.error('❌ [queryReviewableUsers Advanced Exception]:', error.message);
      throw error;
    }
  },

  /**
   * Duyệt hồ sơ đăng ký (Phương án A - AMEND-RP-OP-2026-02 V1.5.0):
   * - Đọc registration_profile từ onboarding_cases.metadata.
   * - Case 1 (Claim EM): Kiểm tra EM chính thức & chưa có chủ, gắn user_member_links -> EM.
   * - Case 2 (No EM - 21 trường) & C2-S (CLAN_SETUP): Tạo member status = 'CHINH_THUC' từ metadata,
   *   tạo user_member_links (DA_DUYET, is_default = true).
   * - Tuyệt đối KHÔNG tạo DU_BI, KHÔNG ghi users.member_id.
   * - Giữ role_in_tenant = 'CLAN_ADMIN' và kích hoạt tenant sang HOAT_DONG (kèm cờ isSandbox = true) cho C2-S.
   */
  processUserApproval: async (payload) => {
    const {
      userId,
      caseId: explicitCaseId,
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

    // Lát 3 (Multi-Home C1 / C1-S): User đã DA_DUYET ở họ gốc A -> ủy quyền sang membershipService.approveMultiHomeCase
    if (sourceUser.status === 'DA_DUYET') {
      const targetMultiHomeCase = await basePrisma.onboarding_cases.findFirst({
        where: {
          ...(explicitCaseId ? { id: explicitCaseId } : {}),
          user_id: userId,
          deleted_at: null,
          process_kind: 'REGISTER',
          ...(role !== 'SYSTEM_ADMIN' && actorTenantId && !explicitCaseId
            ? { tenant_id: actorTenantId }
            : {}),
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
        select: { id: true },
      });

      if (targetMultiHomeCase) {
        const membershipService = require('../membership/membership.service');
        return membershipService.approveMultiHomeCase({
          caseId: targetMultiHomeCase.id,
          newStatus,
          adminNote,
          actorId,
          actorRole: role,
          actorTenantId,
          actorStatus,
          isFinalRejection: finalRejection,
          targetMemberId: targetMemberId || null,
          correlationId: correlation_id || correlationIdCamel || null,
        });
      }
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
            role: true,
            tenants: {
              select: {
                id: true,
                name: true,
                status: true,
                social_configs: true,
              },
            },
          },
        });

        if (!targetUser) {
          throw new Error('Không tìm thấy tài khoản yêu cầu phê duyệt.');
        }

        // Nạp hồ sơ onboarding_cases (process_kind = REGISTER) để hỗ trợ cả C2/C2-S và Multi-Home C1/C1-S
        const openCase = await tx.onboarding_cases.findFirst({
          where: {
            ...(explicitCaseId ? { id: explicitCaseId } : {}),
            user_id: userId,
            deleted_at: null,
            process_kind: 'REGISTER',
            ...(role !== 'SYSTEM_ADMIN' && actorTenantId && !explicitCaseId
              ? { tenant_id: actorTenantId }
              : {}),
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

        const isMultiHomeCase = targetUser.status === 'DA_DUYET' && Boolean(openCase);

        if (targetUser.status !== 'CHO_DUYET' && !isMultiHomeCase) {
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

        const effectiveTargetTenantId = openCase?.tenant_id || targetUser.tenant_id;
        const effectiveTargetTenant = effectiveTargetTenantId
          ? await tx.tenants.findUnique({
              where: { id: effectiveTargetTenantId },
              select: { id: true, name: true, status: true, social_configs: true },
            })
          : targetUser.tenants;

        const isClanSetup =
          openCase?.case_type === 'CLAN_SETUP' ||
          (!isMultiHomeCase && targetUser.role === 'CLAN_ADMIN');

        if (isClanSetup && role !== 'SYSTEM_ADMIN') {
          throw new Error('DENIED');
        }
        if (role !== 'SYSTEM_ADMIN' && effectiveTargetTenantId !== actorTenantId) {
          throw new Error('DENIED');
        }

        securityLogIdentifier = targetUser.phone || targetUser.email || 'unknown';
        const oldUserStatus = targetUser.status;
        const finalReason = adminNote.trim();

        const caseMeta =
          openCase?.metadata && typeof openCase.metadata === 'object'
            ? openCase.metadata
            : {};
        const profile =
          caseMeta.registration_profile &&
          typeof caseMeta.registration_profile === 'object'
            ? caseMeta.registration_profile
            : caseMeta;

        const snapshotName =
          profile.full_name || targetUser.name || 'Thành viên';

        let resolvedMemberId = null;
        let createdNewMember = false;

        if (newStatus === 'DA_DUYET') {
          if (!effectiveTargetTenantId) {
            const err = new Error('Hồ sơ thiếu mã định danh dòng họ (tenant_id).');
            err.status = 400;
            throw err;
          }

          const claimedMemberId =
            targetMemberId || profile.claimed_member_id || null;

          if (claimedMemberId && !isClanSetup) {
            // ── CASE 1: CLAIM EM (Nối với thành viên CHINH_THUC đã có trên cây) ──
            const existingEm = await tx.members.findFirst({
              where: {
                id: claimedMemberId,
                tenant_id: effectiveTargetTenantId,
                deleted_at: null,
              },
              select: { id: true, full_name: true, status: true },
            });

            if (!existingEm || existingEm.status !== 'CHINH_THUC') {
              const err = new Error(
                'Thành viên được chọn trên cây không tồn tại hoặc chưa ở trạng thái chính thức.'
              );
              err.status = 400;
              err.code = 'INVALID_CLAIMED_MEMBER';
              throw err;
            }

            // Chặn tranh chấp: 1 EM chỉ có tối đa 1 liên kết DA_DUYET trong cùng dòng họ
            const existingActiveOwner = await tx.user_member_links.findFirst({
              where: {
                tenant_id: effectiveTargetTenantId,
                member_id: existingEm.id,
                status: 'DA_DUYET',
                deleted_at: null,
                user_id: { not: userId },
              },
              select: { id: true, user_id: true },
            });

            if (existingActiveOwner) {
              const conflictErr = new Error(
                'Thành viên này trên cây phả hệ đã được liên kết với một tài khoản khác.'
              );
              conflictErr.status = 409;
              conflictErr.code = 'EM_ALREADY_CLAIMED';
              throw conflictErr;
            }

            resolvedMemberId = existingEm.id;
          } else {
            // ── CASE 2 (No EM - 21 trường) & C2-S / C1-S (Founder dòng họ mới) ──
            const memberGender = VALID_MEMBER_GENDERS.has(profile.gender)
              ? profile.gender
              : 'NAM';
            const memberRole = isClanSetup
              ? 'TRUONG_HO'
              : VALID_MEMBER_ROLES.has(profile.member_role)
                ? profile.member_role
                : 'THANH_VIEN';

            const newMember = await tx.members.create({
              data: {
                tenant_id: effectiveTargetTenantId,
                full_name: profile.full_name || targetUser.name || 'Thành viên mới',
                alias: profile.alias || null,
                gender: memberGender,
                is_alive:
                  profile.is_alive !== undefined ? Boolean(profile.is_alive) : true,
                generation:
                  profile.generation != null
                    ? Number(profile.generation)
                    : isClanSetup
                      ? 1
                      : null,
                birth_year:
                  profile.birth_year != null ? Number(profile.birth_year) : null,
                birth_month:
                  profile.birth_month != null ? Number(profile.birth_month) : null,
                birth_day:
                  profile.birth_day != null ? Number(profile.birth_day) : null,
                birth_note: profile.birth_place || null,
                death_year:
                  profile.death_year != null ? Number(profile.death_year) : null,
                phone_number: profile.phone || targetUser.phone || null,
                email: profile.email || targetUser.email || null,
                role: memberRole,
                status: 'CHINH_THUC',
                social_profiles:
                  profile.social_profiles &&
                  typeof profile.social_profiles === 'object'
                    ? profile.social_profiles
                    : {},
                note: buildMemberNoteFromProfile(profile),
                changed_by: actorId,
                ...creatorStamp({ id: actorId, member_id: null }),
              },
            });

            resolvedMemberId = newMember.id;
            createdNewMember = true;

            await auditService.logAction(
              'THEM_MOI',
              'members',
              newMember.id,
              null,
              {
                full_name: newMember.full_name,
                status: 'CHINH_THUC',
                role: memberRole,
                tenant_id: effectiveTargetTenantId,
              },
              actorId,
              finalReason,
              effectiveTargetTenantId,
              C,
              tx
            );
          }

          // Tạo / Cập nhật bản ghi SSOT user_member_links
          const assignedRoleInTenant = isClanSetup ? 'CLAN_ADMIN' : 'USER';
          const resolvedLinkType =
            caseMeta.link_type ||
            (isClanSetup ? 'PRIMARY_PATERNAL' : isMultiHomeCase ? 'SPOUSE_FAMILY' : 'PRIMARY_PATERNAL');

          const existingDefaultLink = await tx.user_member_links.findFirst({
            where: {
              user_id: userId,
              is_default: true,
              status: 'DA_DUYET',
              deleted_at: null,
            },
            select: { id: true },
          });

          const existingTenantLink = await tx.user_member_links.findFirst({
            where: {
              user_id: userId,
              tenant_id: effectiveTargetTenantId,
              deleted_at: null,
            },
            select: { id: true, is_default: true },
          });

          if (existingTenantLink) {
            await tx.user_member_links.update({
              where: { id: existingTenantLink.id },
              data: {
                member_id: resolvedMemberId,
                status: 'DA_DUYET',
                role_in_tenant: assignedRoleInTenant,
                is_default: isMultiHomeCase
                  ? false
                  : existingTenantLink.is_default || !existingDefaultLink,
                approved_by: actorId,
                approved_at: new Date(),
                changed_by: actorId,
              },
            });
          } else {
            await tx.user_member_links.create({
              data: {
                user_id: userId,
                tenant_id: effectiveTargetTenantId,
                member_id: resolvedMemberId,
                link_type: resolvedLinkType,
                status: 'DA_DUYET',
                role_in_tenant: assignedRoleInTenant,
                is_default: isMultiHomeCase ? false : !existingDefaultLink,
                approved_by: actorId,
                approved_at: new Date(),
                changed_by: actorId,
              },
            });
          }
        }

        // Chỉ cập nhật users nếu là luồng C2 / C2-S (users.status === 'CHO_DUYET').
        // Với Multi-Home C1 / C1-S: giữ nguyên users.status = DA_DUYET và role ở họ gốc A!
        const nextUserRole = isMultiHomeCase
          ? targetUser.role
          : newStatus === 'DA_DUYET'
            ? isClanSetup
              ? 'CLAN_ADMIN'
              : targetUser.role === 'VIEWER'
                ? 'USER'
                : targetUser.role
            : targetUser.role;

        const nextUserStatus = isMultiHomeCase ? targetUser.status : newStatus;

        if (!isMultiHomeCase) {
          await tx.users.update({
            where: { id: userId },
            data: {
              status: nextUserStatus,
              role: nextUserRole,
              changed_by: actorId,
            },
          });
        }

        // Cập nhật trạng thái Tenant nếu là luồng C2-S hoặc C1-S (CLAN_SETUP)
        let updatedTenantData = null;
        if (
          effectiveTargetTenant &&
          effectiveTargetTenant.status === 'CHO_DUYET' &&
          newStatus === 'DA_DUYET'
        ) {
          const currentSc =
            effectiveTargetTenant.social_configs &&
            typeof effectiveTargetTenant.social_configs === 'object'
              ? effectiveTargetTenant.social_configs
              : {};

          updatedTenantData = await tx.tenants.update({
            where: { id: effectiveTargetTenantId },
            data: {
              status: 'HOAT_DONG',
              social_configs: {
                ...currentSc,
                isSandbox: true,
              },
              changed_by: actorId,
            },
          });
        }

        if (
          newStatus === 'TU_CHOI' &&
          isClanSetup &&
          effectiveTargetTenantId &&
          effectiveTargetTenant &&
          effectiveTargetTenant.status === 'CHO_DUYET'
        ) {
          updatedTenantData = await tx.tenants.update({
            where: { id: effectiveTargetTenantId },
            data: {
              status: 'TU_CHOI',
              changed_by: actorId,
            },
          });
        }

        // Cập nhật trạng thái onboarding_cases
        let affectedCaseId = null;
        let caseStatusAfter = null;

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

            if (resolvedMemberId) {
              await tx.onboarding_cases.update({
                where: { id: openCase.id },
                data: {
                  primary_member_id: resolvedMemberId,
                  changed_by: actorId,
                },
              });
            }
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

            await tx.onboarding_cases.update({
              where: { id: openCase.id },
              data: {
                metadata: {
                  ...caseMeta,
                  is_final_rejection: finalRejection,
                  rejected_at: new Date().toISOString(),
                  rejected_by: actorId,
                },
              },
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
              approved_role: isClanSetup ? 'CLAN_ADMIN' : 'USER',
              resolved_member_id: resolvedMemberId,
              created_new_member: createdNewMember,
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
          { status: oldUserStatus, role: targetUser.role },
          { status: newStatus, role: nextUserRole },
          actorId,
          finalReason,
          targetUser.tenant_id,
          C,
          tx
        );

        if (updatedTenantData) {
          await auditService.logAction(
            'CAP_NHAT',
            'tenants',
            targetUser.tenant_id,
            { status: targetUser.tenants?.status || null },
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
          role: nextUserRole,
          linkedMemberId: resolvedMemberId,
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
        title = `Hồ sơ gia nhập dòng họ đã được chấp thuận (Lượt #${currentAttemptNo})`;
        content = `Chúc mừng bạn đã trở thành thành viên chính thức của dòng họ. Lời nhắn: ${adminNote}`;
        schemaPayload = {
          approved_role: resultUser.role || 'USER',
          approver_note: adminNote,
          attempt_no: currentAttemptNo,
          tenant_id: resultUser.tenant_id,
          member_id: resultUser.linkedMemberId || null,
        };
      } else {
        title = `Hồ sơ gia nhập dòng họ bị từ chối (Lượt #${currentAttemptNo})`;
        content = `Hồ sơ đăng ký của bạn không được thông qua. Lý do từ ban quản trị: ${adminNote}`;
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
          target_name: resultUser.name || 'Thành viên',
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
              console.error('[reopen][tenant audit]', auditErr.message || auditErr);
            }
          }
        }

        const preservedProfile = lastRejectedMeta.registration_profile || null;
        const reopenedMeta = {
          ...lastRejectedMeta,
          source: 'REOPEN_REJECTED',
          previous_case_id: lastRejectedCase?.id || null,
          reopen_note: finalReason,
          is_final_rejection: false,
          ...(preservedProfile ? { registration_profile: preservedProfile } : {}),
        };

        const newCase = await tx.onboarding_cases.create({
          data: {
            correlation_id: C,
            case_type: caseType,
            process_kind: 'REGISTER',
            status: 'NEEDS_REVISION',
            user_id: userId,
            tenant_id: targetUser.tenant_id,
            submitted_at: new Date(),
            reviewed_by: actorId,
            reviewed_at: new Date(),
            review_note: finalReason,
            changed_by: actorId,
            metadata: reopenedMeta,
          },
        });

        const snapshotName = preservedProfile?.full_name || targetUser.name || 'Thành viên';

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
      console.error('[EGAL][SilentEmit][USER_REOPENED]', emitError.message || emitError);
    }

    return result;
  },

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

        const snapshotName =
          prevMeta.registration_profile?.full_name || targetUser.name || 'Thành viên';

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
      caseId: explicitCaseId,
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

    const sourceUser = await basePrisma.users.findUnique({
      where: { id: userId },
      select: { id: true, status: true },
    });
    if (!sourceUser) {
      throw new Error('Không tìm thấy tài khoản.');
    }

    // Lát 3 (Multi-Home C1 / C1-S): User đã DA_DUYET ở họ gốc A -> ủy quyền sang membershipService.returnMultiHomeForRevision
    if (sourceUser.status === 'DA_DUYET') {
      const targetMultiHomeCase = await basePrisma.onboarding_cases.findFirst({
        where: {
          ...(explicitCaseId ? { id: explicitCaseId } : {}),
          user_id: userId,
          deleted_at: null,
          process_kind: 'REGISTER',
          ...(role !== 'SYSTEM_ADMIN' && actorTenantId && !explicitCaseId
            ? { tenant_id: actorTenantId }
            : {}),
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
        select: { id: true },
      });

      if (targetMultiHomeCase) {
        const membershipService = require('../membership/membership.service');
        return membershipService.returnMultiHomeForRevision({
          caseId: targetMultiHomeCase.id,
          adminNote,
          actorId,
          actorRole: role,
          actorTenantId,
          actorStatus,
          correlationId: correlation_id || correlationIdCamel || null,
        });
      }
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

        const snapshotName =
          openCase.metadata?.registration_profile?.full_name ||
          targetUser.name ||
          'Thành viên';

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

  /**
   * Nộp lại hồ sơ bổ sung (Luồng C2 qua cổng 423 -> revision-notice -> RegisterForm).
   * Lưu registration_profile 21 trường trực tiếp vào onboarding_cases.metadata (không rải lên users).
   */
  submitRegistrationRevision: async (payload, extraData = {}) => {
    const {
      phone,
      email,
      password,
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

    const logIdentifier = phone ? cleanInput(phone, 'phone') : null;
    const cleanEmail = email ? cleanInput(email, 'email') : null;

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
    const cleanProfile = normalizeIncomingRegistrationProfile(
      payload,
      logIdentifier || user.phone
    );
    const displayName = cleanProfile?.full_name || user.name || logIdentifier || 'user';

    const updated = await basePrisma.$transaction(async (tx) => {
      const u = await tx.users.update({
        where: { id: user.id },
        data: { changed_by: user.id },
        select: {
          id: true,
          status: true,
          tenant_id: true,
          role: true,
          phone: true,
          email: true,
        },
      });

      if (
        user.role === 'CLAN_ADMIN' &&
        user.tenant_id &&
        (description !== undefined || clanName !== undefined)
      ) {
        const tenantRow = await tx.tenants.findFirst({
          where: { id: user.tenant_id, deleted_at: null },
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
            ...(clanName !== undefined && String(clanName || '').trim() !== ''
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
                  ...(tenantData.name !== undefined ? { name: tenantData.name } : {}),
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
        const currentMeta =
          openCase.metadata && typeof openCase.metadata === 'object'
            ? openCase.metadata
            : {};

        await tx.onboarding_cases.update({
          where: { id: caseId },
          data: {
            metadata: {
              ...currentMeta,
              registration_profile: cleanProfile,
              revised_at: new Date().toISOString(),
            },
            changed_by: user.id,
          },
        });

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

  /**
   * Đồng bộ users.status dựa trên user_member_links.
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

  /**
   * Chuyển đổi ngữ cảnh dòng họ (Multi-Home Switch Context).
   */
  switchContext: async (userId, targetTenantId, currentAuthHeader = null) => {
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
            social_configs: true,
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
      // Kiểm tra hồ sơ Multi-Home C1 / C1-S đang chờ duyệt hoặc bị từ chối cho dòng họ đích
      const pendingCase = await basePrisma.onboarding_cases.findFirst({
        where: {
          user_id: userId,
          tenant_id: targetTenantId,
          deleted_at: null,
          process_kind: 'REGISTER',
        },
        include: {
          tenants: {
            select: {
              id: true,
              name: true,
              slug: true,
              status: true,
              logo_url: true,
              slogan: true,
              social_configs: true,
            },
          },
        },
        orderBy: { created_at: 'desc' },
      });

      if (!pendingCase) {
        const error = new Error(
          'Bạn không có quyền truy cập hoặc chưa liên kết với dòng họ này.'
        );
        error.status = 403;
        error.code = 'NO_TENANT_ACCESS';
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
      const expiresIn = resolveSwitchExpiresIn(currentAuthHeader);
      const pendingStatus = pendingCase.status === 'REJECTED' ? 'TU_CHOI' : 'CHO_DUYET';
      const pendingRole = pendingCase.case_type === 'CLAN_SETUP' ? 'CLAN_ADMIN' : 'VIEWER';
      const meta = pendingCase.metadata && typeof pendingCase.metadata === 'object' ? pendingCase.metadata : {};
      const resolvedLinkType =
        meta.link_type ||
        (pendingCase.case_type === 'CLAN_SETUP' ? 'PRIMARY_PATERNAL' : 'SPOUSE_FAMILY');

      const contextToken = jwt.sign(
        {
          userId: user.id,
          email: user.email,
          role: pendingRole,
          roleInTenant: pendingRole,
          tenantId: targetTenantId,
          activeTenantId: targetTenantId,
          activeMemberId: null,
          activeLinkStatus: pendingStatus,
          linkType: resolvedLinkType,
          status: user.status,
          tenantStatus: pendingCase.tenants?.status || null,
          isSandbox: false,
        },
        secret,
        { expiresIn }
      );

      return {
        token: contextToken,
        activeTenantId: targetTenantId,
        activeMemberId: null,
        activeLinkStatus: pendingStatus,
        linkType: resolvedLinkType,
        roleInTenant: pendingRole,
        isSandbox: false,
        clanName: pendingCase.tenants?.name || meta.clanName || null,
        activeContext: {
          activeTenantId: targetTenantId,
          activeMemberId: null,
          activeLinkStatus: pendingStatus,
          linkType: resolvedLinkType,
          roleInTenant: pendingRole,
          isSandbox: false,
          tenant: pendingCase.tenants || null,
          member: null,
        },
      };
    }

    if (link.status === 'TU_CHOI' || link.status === 'HUY_LIEN_KET') {
      const error = new Error(
        'Tư cách thành viên của bạn tại dòng họ này đã bị hủy bỏ hoặc từ chối.'
      );
      error.status = 403;
      error.code = 'LINK_INACTIVE';
      throw error;
    }

    const user = await basePrisma.users.findUnique({
      where: { id: userId, deleted_at: null },
      select: {
        id: true,
        email: true,
        phone: true,
        name: true,
        role: true,
        status: true,
      },
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

    const expiresIn = resolveSwitchExpiresIn(currentAuthHeader);
    const sc =
      link.tenant?.social_configs && typeof link.tenant.social_configs === 'object'
        ? link.tenant.social_configs
        : {};
    const isSandbox = Boolean(sc.isSandbox);

    const contextToken = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: link.role_in_tenant || user.role,
        roleInTenant: link.role_in_tenant || user.role,
        tenantId: link.tenant_id,
        activeTenantId: link.tenant_id,
        activeMemberId: link.member_id,
        activeLinkStatus: link.status,
        linkType: link.link_type,
        status: user.status,
        tenantStatus: link.tenant?.status || null,
        isSandbox,
      },
      secret,
      { expiresIn }
    );

    return {
      token: contextToken,
      activeTenantId: link.tenant_id,
      activeMemberId: link.member_id,
      activeLinkStatus: link.status,
      linkType: link.link_type,
      roleInTenant: link.role_in_tenant,
      isSandbox,
      clanName: link.tenant?.name || null,
      activeContext: {
        activeTenantId: link.tenant_id,
        activeMemberId: link.member_id,
        activeLinkStatus: link.status,
        linkType: link.link_type,
        roleInTenant: link.role_in_tenant,
        isSandbox,
        tenant: link.tenant ? { ...link.tenant, isSandbox } : null,
        member: link.member,
      },
    };
  },
};

module.exports = authService;
