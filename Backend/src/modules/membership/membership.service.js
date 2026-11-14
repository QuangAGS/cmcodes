/**
 * ============================================================================
 * PATH       : src/modules/membership/membership.service.js
 * DATETIME   : 2026-11-14T11:15:00+07:00
 * VERSION    : 1.2.0-MULTIHOME-UAT-BUG4-PROACTIVE-CHECK
 * DESCRIPTION:
 * - [AMEND-RP-OP-2026-02 V1.5.0 Lát 3] Service xử lý trọn vẹn luồng Multi-Home C1
 *   (Gia nhập dòng họ khác) & C1-S (Lập dòng họ mới):
 *   + checkMultiHomeEligibility: Kiểm tra chủ động (proactive) ngay khi EEU chọn dòng họ đích
 *     xem user đã gắn với member nào trong tenant đó chưa hoặc đang có hồ sơ chờ duyệt không.
 *   + submitMultiHomeClaim (C1): Giữ nguyên users.status = DA_DUYET và link họ gốc A.
 *     Tạo onboarding_cases (case_type = 'MEMBER_JOIN', process_kind = 'REGISTER', status = 'SUBMITTED')
 *     với metadata.registration_profile (Claim EM 3 lớp hoặc 21 trường phả hệ).
 *   + submitMultiHomeClanSetup (C1-S): Giữ nguyên users.status = DA_DUYET và link họ gốc A.
 *     Tạo tenants mới (status = 'CHO_DUYET') + onboarding_cases (case_type = 'CLAN_SETUP',
 *     process_kind = 'REGISTER', status = 'SUBMITTED') với hồ sơ người sáng lập.
 *   + approveMultiHomeCase: Phê duyệt / Từ chối (soft/final) hồ sơ C1 & C1-S:
 *     * Chặn chủ động nếu user đã có liên kết DA_DUYET tại tenant đích trước khi ghi user_member_links.
 *     * Tạo/nối member CHINH_THUC bên dòng họ đích B.
 *     * Tạo user_member_links (status = 'DA_DUYET', is_default = false, role_in_tenant = USER | CLAN_ADMIN).
 *     * Tuyệt đối KHÔNG sửa users.status, users.role, users.tenant_id, KHÔNG ghi users.member_id,
 *       và KHÔNG làm thay đổi liên kết họ gốc A.
 *   + returnMultiHomeForRevision: Trả hồ sơ C1 / C1-S về NEEDS_REVISION kèm review_note.
 *   + submitMultiHomeRevision & reopenMultiHomeCase: User bổ sung hoặc mở lại hồ sơ từ chối mềm.
 *   + getMultiHomeStatus: Đọc review_note và trạng thái hồ sơ C1 / C1-S.
 * ============================================================================
 * CHANGELOGS:
 * - 2026-11-13T09:45:00+07:00 (v1.0.0-MULTIHOME-AMEND02-V15-LAT3):
 *   + Khởi tạo submitMultiHomeClaim, submitMultiHomeClanSetup, submitMultiHomeRevision, reopenMultiHomeCase.
 * - 2026-11-13T10:30:00+07:00 (v1.1.0-MULTIHOME-AMEND02-V15-LAT3):
 *   + Bổ sung approveMultiHomeCase và returnMultiHomeForRevision chuyên biệt cho C1 / C1-S
 *     (link DA_DUYET, is_default = false, giữ nguyên họ A, không ghi users.member_id).
 *   + Sửa getMultiHomeStatus ưu tiên đọc review_note từ onboarding_cases.
 * - 2026-11-13T18:05:00+07:00 (v1.1.2-MULTIHOME-UAT-BUG3-PERSIST-CHILD-TYPE):
 *   + Ghi nhận child_type & is_clan khi tạo member CHINH_THUC từ hồ sơ 21 trường.
 * - 2026-11-14T11:15:00+07:00 (v1.2.0-MULTIHOME-UAT-BUG4-PROACTIVE-CHECK):
 *   + Fix UAT Bug 4: Thêm checkMultiHomeEligibility(userId, targetTenantId) để kiểm tra chủ động
 *     ngay khi EEU chọn tenant; chặn sớm trùng (user_id, tenant_id) ở cả submit và approve.
 * ============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

'use strict';

const crypto = require('crypto');
const { basePrisma } = require('../../lib/prisma.js');
const { formatNumericSlug } = require('../../shared/utils/slug.utils');
const { validateRegistrationProfile, UUID_REGEX } = require('../auth/registrationValidator');
const businessLogger = require('../../services/ledger.service');
const auditService = require('../../services/audit.service');
const notificationBuilder = require('../notifications/services/notification-builder');
const { creatorStamp } = require('../members/profileAccess.service.js');

const VALID_LINK_TYPES = new Set([
  'PRIMARY_PATERNAL',
  'MATERNAL',
  'SPOUSE_FAMILY',
  'DESCENDANT_FAMILY',
  'GUARDIAN',
  'OTHER',
]);

const VALID_MEMBER_GENDERS = new Set(['NAM', 'NU', 'KHAC']);
const VALID_MEMBER_ROLES = new Set([
  'TRUONG_TOC',
  'TRUONG_NGANH',
  'TRUONG_CHI',
  'THANH_VIEN',
  'TRUONG_HO',
  'KHAC',
]);
const VALID_MEMBER_CHILD_TYPES = new Set([
  'CON_DE',
  'CON_DAU',
  'CON_RE',
  'CON_NUOI',
  'CON_DO_DAU',
  'CON_RIENG',
  'KHAC',
]);

const ADMIN_APPROVER_ROLES = new Set([
  'SYSTEM_ADMIN',
  'CLAN_ADMIN',
  'TRUONG_HO',
  'TRUONG_TOC',
  'TRUONG_NGANH',
  'TRUONG_CHI',
]);

function makeHttpError(status, code, message) {
  const err = new Error(message);
  err.status = status;
  err.statusCode = status;
  err.code = code;
  return err;
}

function normalizeMultiHomeProfile(payload, user) {
  const rawProfile =
    payload?.registration_profile && typeof payload.registration_profile === 'object'
      ? payload.registration_profile
      : payload || {};

  const claimedMemberId =
    payload?.claimed_member_id || rawProfile.claimed_member_id || undefined;

  return validateRegistrationProfile({
    ...rawProfile,
    full_name:
      rawProfile.full_name ||
      payload?.full_name ||
      payload?.temp_full_name ||
      user?.name ||
      'Thành viên mới',
    gender: rawProfile.gender || payload?.gender || 'NAM',
    birth_year:
      rawProfile.birth_year !== undefined && rawProfile.birth_year !== ''
        ? Number(rawProfile.birth_year)
        : undefined,
    birth_month:
      rawProfile.birth_month !== undefined && rawProfile.birth_month !== ''
        ? Number(rawProfile.birth_month)
        : undefined,
    birth_day:
      rawProfile.birth_day !== undefined && rawProfile.birth_day !== ''
        ? Number(rawProfile.birth_day)
        : undefined,
    death_year:
      rawProfile.death_year !== undefined && rawProfile.death_year !== ''
        ? Number(rawProfile.death_year)
        : undefined,
    generation:
      rawProfile.generation !== undefined && rawProfile.generation !== ''
        ? Number(rawProfile.generation)
        : undefined,
    claimed_member_id: claimedMemberId,
    phone: user?.phone || rawProfile.phone || undefined,
    email: user?.email || rawProfile.email || undefined,
  });
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

const membershipService = {
  /**
   * Kiểm tra chủ động (Proactive Eligibility Check) trước khi EEU khai báo gia nhập dòng họ:
   * - Mỗi EEU chỉ được gắn với duy nhất 1 member trong 1 tenant (@@unique([user_id, tenant_id])).
   * - Trả về eligible = false ngay lập tức nếu user đã có liên kết hoặc đang có hồ sơ chờ duyệt tại tenant đó.
   */
  checkMultiHomeEligibility: async (userId, targetTenantId) => {
    const cleanTenantId = String(targetTenantId || '').trim();
    if (!cleanTenantId || !UUID_REGEX.test(cleanTenantId)) {
      throw makeHttpError(
        400,
        'INVALID_TENANT_ID',
        'Mã định danh dòng họ không hợp lệ.'
      );
    }

    const tenant = await basePrisma.tenants.findFirst({
      where: {
        id: cleanTenantId,
        deleted_at: null,
      },
      select: { id: true, name: true, slug: true, status: true },
    });

    if (!tenant) {
      throw makeHttpError(
        404,
        'TENANT_NOT_FOUND',
        'Không tìm thấy dòng họ được chọn.'
      );
    }

    const existingLink = await basePrisma.user_member_links.findFirst({
      where: {
        user_id: userId,
        tenant_id: cleanTenantId,
        deleted_at: null,
        status: { in: ['DA_DUYET', 'CHO_DUYET', 'DRAFT'] },
      },
      include: {
        member: {
          select: { id: true, full_name: true, generation: true },
        },
      },
    });

    if (existingLink) {
      const memberDisplay = existingLink.member?.full_name
        ? ` (hồ sơ: ${existingLink.member.full_name})`
        : '';
      return {
        eligible: false,
        reasonCode: 'ALREADY_LINKED_TO_TENANT',
        linkStatus: existingLink.status,
        memberId: existingLink.member_id,
        memberName: existingLink.member?.full_name || null,
        tenantId: tenant.id,
        clanName: tenant.name,
        message:
          existingLink.status === 'DA_DUYET'
            ? `Tài khoản của bác đã là thành viên của dòng họ ${tenant.name}${memberDisplay}. Mỗi tài khoản chỉ được gắn với một thành viên trong một dòng họ.`
            : `Tài khoản của bác đã có liên kết đang chờ xử lý tại dòng họ ${tenant.name}${memberDisplay}.`,
      };
    }

    const existingOpenCase = await basePrisma.onboarding_cases.findFirst({
      where: {
        user_id: userId,
        tenant_id: cleanTenantId,
        deleted_at: null,
        process_kind: 'REGISTER',
        status: {
          in: [
            'DRAFT',
            'PROFILE_COMPLETED',
            'FAMILY_TREE_DRAFT',
            'SUBMITTED',
            'UNDER_REVIEW',
            'NEEDS_REVISION',
          ],
        },
      },
      orderBy: { created_at: 'desc' },
      select: { id: true, status: true },
    });

    if (existingOpenCase) {
      return {
        eligible: false,
        reasonCode: 'DUPLICATE_PENDING_CASE',
        caseId: existingOpenCase.id,
        caseStatus: existingOpenCase.status,
        tenantId: tenant.id,
        clanName: tenant.name,
        message: `Bác đã nộp một hồ sơ xin gia nhập dòng họ ${tenant.name} và đang chờ Ban Quản trị xét duyệt. Không thể nộp thêm hồ sơ trùng lặp.`,
      };
    }

    if (['BI_KHOA', 'TU_CHOI', 'NGUNG_HAN'].includes(tenant.status)) {
      return {
        eligible: false,
        reasonCode: 'TENANT_INACTIVE',
        tenantId: tenant.id,
        clanName: tenant.name,
        message: `Dòng họ ${tenant.name} hiện đang tạm ngừng tiếp nhận thành viên mới.`,
      };
    }

    return {
      eligible: true,
      tenantId: tenant.id,
      clanName: tenant.name,
    };
  },

  /**
   * Luồng C1: User đã có tài khoản gửi đơn xin gia nhập dòng họ khác (Tenant B).
   * - Không đổi users.status (giữ DA_DUYET).
   * - Không đụng link của họ gốc A.
   * - Tạo onboarding_cases (MEMBER_JOIN, process_kind = REGISTER, status = SUBMITTED).
   */
  submitMultiHomeClaim: async (userId, payload = {}, extra = {}) => {
    const targetTenantId = String(
      payload.tenantId || payload.tenant_id || ''
    ).trim();

    if (!targetTenantId || !UUID_REGEX.test(targetTenantId)) {
      throw makeHttpError(
        400,
        'INVALID_TENANT_ID',
        'Vui lòng chọn dòng họ hợp lệ để xin gia nhập.'
      );
    }

    const user = await basePrisma.users.findFirst({
      where: { id: userId, deleted_at: null },
      select: { id: true, name: true, phone: true, email: true, status: true, role: true },
    });

    if (!user) {
      throw makeHttpError(404, 'USER_NOT_FOUND', 'Không tìm thấy tài khoản người dùng.');
    }
    if (['BI_KHOA', 'BI_CAM', 'TAM_NGUNG'].includes(user.status)) {
      throw makeHttpError(403, 'USER_BLOCKED', 'Tài khoản hiện không thể thực hiện thao tác này.');
    }

    const tenant = await basePrisma.tenants.findFirst({
      where: {
        id: targetTenantId,
        deleted_at: null,
        status: { notIn: ['BI_KHOA', 'TU_CHOI', 'NGUNG_HAN'] },
      },
      select: { id: true, name: true, slug: true, status: true },
    });

    if (!tenant) {
      throw makeHttpError(
        404,
        'TENANT_NOT_FOUND',
        'Dòng họ không tồn tại hoặc đang tạm ngừng tiếp nhận.'
      );
    }

    // 1. Kiểm tra chủ động: EEU đã có liên kết thành viên tại dòng họ B chưa (1 user -> tối đa 1 member / tenant)
    const existingLink = await basePrisma.user_member_links.findFirst({
      where: {
        user_id: userId,
        tenant_id: targetTenantId,
        deleted_at: null,
        status: { in: ['DA_DUYET', 'CHO_DUYET', 'DRAFT'] },
      },
      include: {
        member: {
          select: { id: true, full_name: true },
        },
      },
    });
    if (existingLink) {
      const memberLabel = existingLink.member?.full_name
        ? ` (hồ sơ: ${existingLink.member.full_name})`
        : '';
      throw makeHttpError(
        409,
        'ALREADY_LINKED_TO_TENANT',
        `Tài khoản của bạn đã gắn với một thành viên trong dòng họ ${tenant.name}${memberLabel}. Không thể gia nhập 2 lần vào cùng một dòng họ.`
      );
    }

    // 2. Kiểm tra đã có hồ sơ C1 đang mở tại dòng họ B chưa
    const existingOpenCase = await basePrisma.onboarding_cases.findFirst({
      where: {
        user_id: userId,
        tenant_id: targetTenantId,
        deleted_at: null,
        process_kind: 'REGISTER',
        status: {
          in: [
            'DRAFT',
            'PROFILE_COMPLETED',
            'FAMILY_TREE_DRAFT',
            'SUBMITTED',
            'UNDER_REVIEW',
            'NEEDS_REVISION',
          ],
        },
      },
      orderBy: { created_at: 'desc' },
    });

    if (existingOpenCase) {
      throw makeHttpError(
        409,
        'DUPLICATE_PENDING_CASE',
        `Bạn đã có một hồ sơ xin gia nhập ${tenant.name} đang chờ xử lý.`
      );
    }

    const validatedProfile = normalizeMultiHomeProfile(payload, user);
    const linkType = VALID_LINK_TYPES.has(payload.link_type)
      ? payload.link_type
      : 'SPOUSE_FAMILY';

    // Nếu là Claim EM, kiểm tra member tồn tại & CHINH_THUC trên tenant B
    if (validatedProfile.claimed_member_id) {
      const em = await basePrisma.members.findFirst({
        where: {
          id: validatedProfile.claimed_member_id,
          tenant_id: targetTenantId,
          deleted_at: null,
        },
        select: { id: true, status: true },
      });

      if (!em || em.status !== 'CHINH_THUC') {
        throw makeHttpError(
          400,
          'INVALID_CLAIMED_MEMBER',
          'Thành viên được chọn trên cây không tồn tại hoặc chưa ở trạng thái chính thức.'
        );
      }

      const takenLink = await basePrisma.user_member_links.findFirst({
        where: {
          tenant_id: targetTenantId,
          member_id: em.id,
          status: 'DA_DUYET',
          deleted_at: null,
          user_id: { not: userId },
        },
      });
      if (takenLink) {
        throw makeHttpError(
          409,
          'EM_ALREADY_CLAIMED',
          'Hồ sơ thành viên này trên cây đã được liên kết với một tài khoản khác.'
        );
      }
    }

    const correlationId = extra.correlationId || crypto.randomUUID();

    const createdCase = await basePrisma.$transaction(async (tx) => {
      const newCase = await tx.onboarding_cases.create({
        data: {
          correlation_id: correlationId,
          case_type: 'MEMBER_JOIN',
          process_kind: 'REGISTER',
          status: 'SUBMITTED',
          user_id: userId,
          tenant_id: targetTenantId,
          primary_member_id: validatedProfile.claimed_member_id || null,
          submitted_at: new Date(),
          changed_by: userId,
          metadata: {
            source: 'MULTIHOME_C1',
            registrationType: 'JOIN_CLAN',
            link_type: linkType,
            clanName: tenant.name,
            tenantSlug: tenant.slug,
            registration_profile: validatedProfile,
          },
        },
      });

      try {
        await businessLogger.createLog(
          {
            correlation_id: correlationId,
            attempt_no: 1,
            process_type: 'ONBOARDING_CASE_CREATE',
            actor_type: 'USER',
            actor_id: userId,
            tenant_id: targetTenantId,
            process_status: 'SUCCESS',
            context: {
              target_id: newCase.id,
              target_name: `Multi-Home C1 Join ${tenant.name}`,
              user_id: userId,
            },
            payload: {
              case_type: 'MEMBER_JOIN',
              source: 'MULTIHOME_C1',
              link_type: linkType,
              claimed_member_id: validatedProfile.claimed_member_id || null,
            },
          },
          tx
        );
      } catch (bplErr) {
        console.error('[MULTIHOME_C1][BPL]', bplErr.message || bplErr);
      }

      try {
        await auditService.logAction(
          'THEM_MOI',
          'onboarding_cases',
          newCase.id,
          null,
          {
            case_type: 'MEMBER_JOIN',
            status: 'SUBMITTED',
            tenant_id: targetTenantId,
            source: 'MULTIHOME_C1',
          },
          userId,
          'MULTIHOME_C1_SUBMIT',
          targetTenantId,
          correlationId,
          tx
        );
      } catch (auditErr) {
        console.error('[MULTIHOME_C1][AUDIT]', auditErr.message || auditErr);
      }

      return newCase;
    });

    return {
      caseId: createdCase.id,
      tenantId: tenant.id,
      clanName: tenant.name,
      status: 'CHO_DUYET',
      caseStatus: createdCase.status,
      correlationId,
    };
  },

  /**
   * Luồng C1-S: User đã có tài khoản lập dòng họ mới (Tenant B).
   * - Giữ nguyên users.status = DA_DUYET và link họ gốc A.
   * - Tạo Tenant B mới (status = 'CHO_DUYET') và onboarding_cases (CLAN_SETUP, SUBMITTED).
   */
  submitMultiHomeClanSetup: async (userId, payload = {}, extra = {}) => {
    const clanName = String(payload.clanName || '').trim();
    const description = String(payload.description || '').trim();

    if (!clanName || clanName.length < 3) {
      throw makeHttpError(
        400,
        'CLAN_NAME_REQUIRED',
        'Vui lòng nhập tên dòng họ (tối thiểu 3 ký tự).'
      );
    }

    const user = await basePrisma.users.findFirst({
      where: { id: userId, deleted_at: null },
      select: { id: true, name: true, phone: true, email: true, status: true },
    });

    if (!user) {
      throw makeHttpError(404, 'USER_NOT_FOUND', 'Không tìm thấy tài khoản người dùng.');
    }
    if (['BI_KHOA', 'BI_CAM', 'TAM_NGUNG'].includes(user.status)) {
      throw makeHttpError(403, 'USER_BLOCKED', 'Tài khoản hiện không thể thực hiện thao tác này.');
    }

    const validatedProfile = normalizeMultiHomeProfile(
      {
        ...payload,
        registration_profile: {
          ...(payload.registration_profile || {}),
          claim_mode: 'CLAN_SETUP',
          generation: 1,
          member_role: 'TRUONG_HO',
          is_alive: true,
        },
      },
      user
    );

    const correlationId = extra.correlationId || crypto.randomUUID();

    const result = await basePrisma.$transaction(async (tx) => {
      const currentYear = new Date().getFullYear();
      const counter = await tx.slug_counters.upsert({
        where: { year: currentYear },
        update: { last_value: { increment: 1 } },
        create: { year: currentYear, last_value: 1 },
      });

      const tenantSlug = formatNumericSlug(currentYear, counter.last_value);

      const newTenant = await tx.tenants.create({
        data: {
          name: clanName,
          slug: tenantSlug,
          description: description || null,
          status: 'CHO_DUYET',
          changed_by: userId,
        },
      });

      const newCase = await tx.onboarding_cases.create({
        data: {
          correlation_id: correlationId,
          case_type: 'CLAN_SETUP',
          process_kind: 'REGISTER',
          status: 'SUBMITTED',
          user_id: userId,
          tenant_id: newTenant.id,
          submitted_at: new Date(),
          changed_by: userId,
          metadata: {
            source: 'MULTIHOME_C1S',
            registrationType: 'NEW_CLAN',
            link_type: 'PRIMARY_PATERNAL',
            clanName: newTenant.name,
            tenantSlug: newTenant.slug,
            description: newTenant.description,
            registration_profile: validatedProfile,
          },
        },
      });

      try {
        await businessLogger.createLog(
          {
            correlation_id: correlationId,
            attempt_no: 1,
            process_type: 'CLAN_CREATE',
            actor_type: 'USER',
            actor_id: userId,
            tenant_id: newTenant.id,
            process_status: 'SUCCESS',
            context: {
              target_id: newCase.id,
              target_name: `Multi-Home C1-S Setup ${newTenant.name}`,
              user_id: userId,
            },
            payload: {
              case_type: 'CLAN_SETUP',
              source: 'MULTIHOME_C1S',
              tenant_slug: tenantSlug,
            },
          },
          tx
        );
      } catch (bplErr) {
        console.error('[MULTIHOME_C1S][BPL]', bplErr.message || bplErr);
      }

      return { newTenant, newCase };
    });

    return {
      caseId: result.newCase.id,
      tenantId: result.newTenant.id,
      clanName: result.newTenant.name,
      slug: result.newTenant.slug,
      status: 'CHO_DUYET',
      caseStatus: result.newCase.status,
      correlationId,
    };
  },

  /**
   * Phê duyệt / Từ chối hồ sơ Multi-Home C1 & C1-S (Admin họ B hoặc SYSTEM_ADMIN):
   * - Duyệt (DA_DUYET):
   *   + Case EM: Kiểm tra EM chính thức & chưa có chủ, nối user_member_links tới EM.
   *   + Case 21 trường / C1-S: Tạo members status = 'CHINH_THUC' từ metadata.
   *   + Tạo user_member_links: status = 'DA_DUYET', is_default = false, role_in_tenant = CLAN_ADMIN | USER.
   *   + C1-S: Kích hoạt Tenant B sang 'HOAT_DONG' kèm cờ social_configs.isSandbox = true.
   *   + Tuyệt đối KHÔNG đụng users.status, users.role, users.tenant_id, KHÔNG ghi users.member_id,
   *     và KHÔNG thay đổi liên kết họ gốc A.
   * - Từ chối (TU_CHOI):
   *   + Cập nhật onboarding_cases -> REJECTED (hỗ trợ isFinalRejection).
   *   + Giữ nguyên users.status và liên kết họ gốc A.
   */
  approveMultiHomeCase: async ({
    caseId,
    newStatus,
    adminNote,
    actorId,
    actorRole,
    actorTenantId,
    actorStatus,
    isFinalRejection = false,
    targetMemberId = null,
    correlationId = null,
  }) => {
    if (!caseId) {
      throw makeHttpError(400, 'CASE_ID_REQUIRED', 'Thiếu mã hồ sơ Multi-Home cần duyệt.');
    }
    if (!['DA_DUYET', 'TU_CHOI'].includes(newStatus)) {
      throw makeHttpError(400, 'INVALID_STATUS', 'newStatus chỉ nhận DA_DUYET hoặc TU_CHOI.');
    }
    const finalReason = String(adminNote || '').trim();
    if (!finalReason) {
      throw makeHttpError(400, 'NOTE_REQUIRED', 'Ghi chú phê duyệt không được để trống.');
    }
    if (!ADMIN_APPROVER_ROLES.has(String(actorRole || '').toUpperCase())) {
      throw makeHttpError(403, 'DENIED', 'Bạn không có quyền phê duyệt hồ sơ này.');
    }
    if (actorRole !== 'SYSTEM_ADMIN' && actorStatus && actorStatus !== 'DA_DUYET') {
      throw makeHttpError(403, 'DENIED', 'Tài khoản quản trị chưa được kích hoạt.');
    }

    const finalRejection =
      isFinalRejection === true ||
      isFinalRejection === 'true' ||
      isFinalRejection === 1;

    const C = correlationId || crypto.randomUUID();

    const result = await basePrisma.$transaction(
      async (tx) => {
        const openCase = await tx.onboarding_cases.findFirst({
          where: {
            id: caseId,
            deleted_at: null,
            process_kind: 'REGISTER',
          },
          include: {
            users: {
              select: {
                id: true,
                name: true,
                phone: true,
                email: true,
                role: true,
                status: true,
                tenant_id: true,
              },
            },
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

        if (!openCase || !openCase.users) {
          throw makeHttpError(404, 'CASE_NOT_FOUND', 'Không tìm thấy hồ sơ xét duyệt.');
        }

        const editableStatuses = [
          'SUBMITTED',
          'UNDER_REVIEW',
          'NEEDS_REVISION',
          'DRAFT',
          'PROFILE_COMPLETED',
          'FAMILY_TREE_DRAFT',
        ];
        if (!editableStatuses.includes(openCase.status)) {
          throw makeHttpError(
            403,
            'CASE_NOT_PENDING',
            `Hồ sơ đang ở trạng thái ${openCase.status}, không thể duyệt lại.`
          );
        }

        if (actorId === openCase.user_id) {
          throw makeHttpError(403, 'DENIED', 'Không thể tự phê duyệt hồ sơ của chính mình.');
        }

        const isClanSetup = openCase.case_type === 'CLAN_SETUP';
        if (isClanSetup && actorRole !== 'SYSTEM_ADMIN') {
          throw makeHttpError(
            403,
            'DENIED',
            'Chỉ Quản trị hệ thống Trung tâm được duyệt hồ sơ thành lập dòng họ mới.'
          );
        }

        const targetTenantId = openCase.tenant_id;
        if (!targetTenantId) {
          throw makeHttpError(400, 'TENANT_REQUIRED', 'Hồ sơ thiếu mã định danh dòng họ.');
        }

        if (actorRole !== 'SYSTEM_ADMIN' && targetTenantId !== actorTenantId) {
          throw makeHttpError(
            403,
            'DENIED',
            'Hồ sơ này thuộc dòng họ khác, bạn không có quyền xét duyệt.'
          );
        }

        const targetUser = openCase.users;
        const caseMeta =
          openCase.metadata && typeof openCase.metadata === 'object'
            ? openCase.metadata
            : {};
        const profile =
          caseMeta.registration_profile &&
          typeof caseMeta.registration_profile === 'object'
            ? caseMeta.registration_profile
            : caseMeta;

        const snapshotName = profile.full_name || targetUser.name || 'Thành viên';
        const now = new Date();
        let resolvedMemberId = null;
        let createdNewMember = false;

        if (newStatus === 'DA_DUYET') {
          const claimedMemberId =
            targetMemberId || profile.claimed_member_id || openCase.primary_member_id || null;

          if (claimedMemberId && !isClanSetup) {
            // ── C1 Case 1: Claim EM có sẵn trên cây dòng họ B ──
            const existingEm = await tx.members.findFirst({
              where: {
                id: claimedMemberId,
                tenant_id: targetTenantId,
                deleted_at: null,
              },
              select: { id: true, full_name: true, status: true },
            });

            if (!existingEm || existingEm.status !== 'CHINH_THUC') {
              throw makeHttpError(
                400,
                'INVALID_CLAIMED_MEMBER',
                'Thành viên được chọn trên cây không tồn tại hoặc chưa ở trạng thái chính thức.'
              );
            }

            const existingActiveOwner = await tx.user_member_links.findFirst({
              where: {
                tenant_id: targetTenantId,
                member_id: existingEm.id,
                status: 'DA_DUYET',
                deleted_at: null,
                user_id: { not: targetUser.id },
              },
              select: { id: true },
            });

            if (existingActiveOwner) {
              throw makeHttpError(
                409,
                'EM_ALREADY_CLAIMED',
                'Thành viên này trên cây phả hệ đã được liên kết với một tài khoản khác.'
              );
            }

            resolvedMemberId = existingEm.id;
          } else {
            // ── C1 Case 2 (21 trường) hoặc C1-S (Founder dòng họ mới B) ──
            const memberGender = VALID_MEMBER_GENDERS.has(profile.gender)
              ? profile.gender
              : 'NAM';
            const memberRole = isClanSetup
              ? 'TRUONG_HO'
              : VALID_MEMBER_ROLES.has(profile.member_role)
                ? profile.member_role
                : 'THANH_VIEN';
            const memberChildType = isClanSetup
              ? 'CON_DE'
              : VALID_MEMBER_CHILD_TYPES.has(profile.child_type)
                ? profile.child_type
                : VALID_MEMBER_CHILD_TYPES.has(profile.temp_relationship)
                  ? profile.temp_relationship
                  : 'CON_DE';
            const memberIsClan = isClanSetup
              ? true
              : !['CON_DAU', 'CON_RE'].includes(memberChildType);

            const newMember = await tx.members.create({
              data: {
                tenant_id: targetTenantId,
                full_name: profile.full_name || targetUser.name || 'Thành viên mới',
                alias: profile.alias || null,
                gender: memberGender,
                is_clan: memberIsClan,
                child_type: memberChildType,
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
                tenant_id: targetTenantId,
              },
              actorId,
              finalReason,
              targetTenantId,
              C,
              tx
            );
          }

          // Ghi user_member_links: nếu user chưa có họ mặc định nào -> is_default = true;
          // nếu đã có họ gốc A (DA_DUYET, is_default = true) -> is_default = false.
          const assignedRoleInTenant = isClanSetup ? 'CLAN_ADMIN' : 'USER';
          const resolvedLinkType = VALID_LINK_TYPES.has(caseMeta.link_type)
            ? caseMeta.link_type
            : isClanSetup
              ? 'PRIMARY_PATERNAL'
              : 'SPOUSE_FAMILY';

          const existingDefaultLink = await tx.user_member_links.findFirst({
            where: {
              user_id: targetUser.id,
              is_default: true,
              status: 'DA_DUYET',
              deleted_at: null,
            },
            select: { id: true },
          });
          const isFirstDefaultLink = !existingDefaultLink;

          const existingTenantLink = await tx.user_member_links.findFirst({
            where: {
              user_id: targetUser.id,
              tenant_id: targetTenantId,
              deleted_at: null,
            },
            include: {
              member: { select: { id: true, full_name: true } },
            },
          });

          if (existingTenantLink && existingTenantLink.status === 'DA_DUYET') {
            throw makeHttpError(
              409,
              'ALREADY_LINKED_TO_TENANT',
              `Tài khoản này đã được liên kết với thành viên ${existingTenantLink.member?.full_name || ''} trong dòng họ. Không thể tạo thêm liên kết thứ hai.`
            );
          }

          if (existingTenantLink) {
            await tx.user_member_links.update({
              where: { id: existingTenantLink.id },
              data: {
                member_id: resolvedMemberId,
                status: 'DA_DUYET',
                role_in_tenant: assignedRoleInTenant,
                is_default: existingTenantLink.is_default || isFirstDefaultLink,
                link_type: resolvedLinkType,
                approved_by: actorId,
                approved_at: now,
                changed_by: actorId,
              },
            });
          } else {
            await tx.user_member_links.create({
              data: {
                user_id: targetUser.id,
                tenant_id: targetTenantId,
                member_id: resolvedMemberId,
                link_type: resolvedLinkType,
                status: 'DA_DUYET',
                role_in_tenant: assignedRoleInTenant,
                is_default: isFirstDefaultLink,
                approved_by: actorId,
                approved_at: now,
                changed_by: actorId,
              },
            });
          }

          // Nếu là C1-S: Kích hoạt Tenant B sang HOAT_DONG + cờ isSandbox = true
          if (isClanSetup && openCase.tenants && openCase.tenants.status === 'CHO_DUYET') {
            const currentSc =
              openCase.tenants.social_configs &&
              typeof openCase.tenants.social_configs === 'object'
                ? openCase.tenants.social_configs
                : {};

            await tx.tenants.update({
              where: { id: targetTenantId },
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

          await tx.onboarding_cases.update({
            where: { id: openCase.id },
            data: {
              status: 'APPROVED',
              approved_at: now,
              reviewed_by: actorId,
              reviewed_at: now,
              review_note: finalReason,
              primary_member_id: resolvedMemberId,
              changed_by: actorId,
            },
          });
        } else {
          // ── Từ chối hồ sơ C1 / C1-S (không ảnh hưởng họ gốc A) ──
          await tx.onboarding_cases.update({
            where: { id: openCase.id },
            data: {
              status: 'REJECTED',
              rejected_at: now,
              reviewed_by: actorId,
              reviewed_at: now,
              rejection_reason: finalReason,
              review_note: finalReason,
              changed_by: actorId,
              metadata: {
                ...caseMeta,
                is_final_rejection: finalRejection,
                rejected_at: now.toISOString(),
                rejected_by: actorId,
              },
            },
          });

          if (
            isClanSetup &&
            openCase.tenants &&
            openCase.tenants.status === 'CHO_DUYET'
          ) {
            await tx.tenants.update({
              where: { id: targetTenantId },
              data: {
                status: 'TU_CHOI',
                changed_by: actorId,
              },
            });
          }
        }

        await businessLogger.createLog(
          {
            correlation_id: C,
            attempt_no: 1,
            process_type: 'USER_APPROVAL',
            actor_type: 'USER',
            actor_id: actorId,
            tenant_id: targetTenantId,
            process_status: 'SUCCESS',
            context: {
              target_id: targetUser.id,
              target_name: snapshotName,
              attempt_no: 1,
            },
            payload: {
              action:
                newStatus === 'DA_DUYET'
                  ? 'APPROVE'
                  : finalRejection
                    ? 'FINAL_REJECT'
                    : 'REJECT',
              source: isClanSetup ? 'MULTIHOME_C1S' : 'MULTIHOME_C1',
              admin_note: finalReason,
              approver_note: finalReason,
              status_before: 'CHO_DUYET',
              status_after: newStatus,
              is_final: newStatus === 'TU_CHOI' ? finalRejection : false,
              approved_role: isClanSetup ? 'CLAN_ADMIN' : 'USER',
              resolved_member_id: resolvedMemberId,
              created_new_member: createdNewMember,
              case_id: openCase.id,
              case_status_after: newStatus === 'DA_DUYET' ? 'APPROVED' : 'REJECTED',
            },
          },
          tx
        );

        await auditService.logAction(
          'CAP_NHAT',
          'onboarding_cases',
          openCase.id,
          { status: openCase.status },
          {
            status: newStatus === 'DA_DUYET' ? 'APPROVED' : 'REJECTED',
            resolved_member_id: resolvedMemberId,
          },
          actorId,
          finalReason,
          targetTenantId,
          C,
          tx
        );

        return {
          id: targetUser.id,
          userId: targetUser.id,
          caseId: openCase.id,
          tenantId: targetTenantId,
          clanName: openCase.tenants?.name || caseMeta.clanName || 'Dòng họ',
          status: newStatus,
          role: isClanSetup ? 'CLAN_ADMIN' : 'USER',
          linkedMemberId: resolvedMemberId,
          isDefault: false,
          isFinalRejection: newStatus === 'TU_CHOI' ? finalRejection : false,
        };
      },
      { maxWait: 5000, timeout: 15000 }
    );

    // Thông báo cho người dùng về kết quả hồ sơ Multi-Home
    try {
      const eventType =
        newStatus === 'DA_DUYET' ? 'USER_APPROVED' : 'USER_REJECTED';
      const title =
        newStatus === 'DA_DUYET'
          ? `Hồ sơ gia nhập ${result.clanName} đã được chấp thuận`
          : `Hồ sơ gia nhập ${result.clanName} chưa được chấp thuận`;
      const content =
        newStatus === 'DA_DUYET'
          ? `Bạn đã được liên kết với ${result.clanName}. Hãy dùng bộ chuyển dòng họ trên thanh tiêu đề để truy cập. Lời nhắn: ${finalReason}`
          : `Hồ sơ tại ${result.clanName} bị từ chối. Lý do: ${finalReason}`;

      const notifPayload = notificationBuilder.build({
        user_id: result.userId,
        tenant_id: result.tenantId,
        correlation_id: C,
        event_type: eventType,
        title,
        content,
        level: 'INFO',
        reliability: 'LOW',
        status: 'PENDING',
        context: {
          target_id: result.userId,
          target_name: result.clanName,
          attempt_no: 1,
        },
        payload: {
          approved_role: result.role,
          approver_note: finalReason,
          tenant_id: result.tenantId,
          member_id: result.linkedMemberId || null,
        },
      });

      await basePrisma.notifications.create({
        data: {
          ...notifPayload,
          tenant_id: result.tenantId,
          changed_by: actorId,
        },
      });
    } catch (notifErr) {
      console.error('[MULTIHOME_APPROVAL][NOTIF]', notifErr.message || notifErr);
    }

    return result;
  },

  /**
   * Admin trả hồ sơ C1 / C1-S về bổ sung (NEEDS_REVISION) kèm review_note.
   */
  returnMultiHomeForRevision: async ({
    caseId,
    adminNote,
    actorId,
    actorRole,
    actorTenantId,
    actorStatus,
    correlationId = null,
  }) => {
    if (!caseId) {
      throw makeHttpError(400, 'CASE_ID_REQUIRED', 'Thiếu mã hồ sơ.');
    }
    const finalReason = String(adminNote || '').trim();
    if (!finalReason) {
      throw makeHttpError(400, 'NOTE_REQUIRED', 'Ghi chú yêu cầu bổ sung không được để trống.');
    }
    if (!ADMIN_APPROVER_ROLES.has(String(actorRole || '').toUpperCase())) {
      throw makeHttpError(403, 'DENIED', 'Bạn không có quyền thao tác trên hồ sơ này.');
    }
    if (actorRole !== 'SYSTEM_ADMIN' && actorStatus && actorStatus !== 'DA_DUYET') {
      throw makeHttpError(403, 'DENIED', 'Tài khoản quản trị chưa được kích hoạt.');
    }

    const openCase = await basePrisma.onboarding_cases.findFirst({
      where: {
        id: caseId,
        deleted_at: null,
        process_kind: 'REGISTER',
      },
      include: {
        users: { select: { id: true, name: true } },
      },
    });

    if (!openCase) {
      throw makeHttpError(404, 'CASE_NOT_FOUND', 'Không tìm thấy hồ sơ.');
    }
    if (actorId === openCase.user_id) {
      throw makeHttpError(403, 'DENIED', 'Không thể thao tác trên hồ sơ của chính mình.');
    }
    if (openCase.case_type === 'CLAN_SETUP' && actorRole !== 'SYSTEM_ADMIN') {
      throw makeHttpError(403, 'DENIED', 'Chỉ SYSTEM_ADMIN được xử lý hồ sơ lập dòng họ.');
    }
    if (actorRole !== 'SYSTEM_ADMIN' && openCase.tenant_id !== actorTenantId) {
      throw makeHttpError(403, 'DENIED', 'Hồ sơ thuộc dòng họ khác.');
    }

    const C = correlationId || crypto.randomUUID();
    const now = new Date();

    await basePrisma.$transaction(async (tx) => {
      await tx.onboarding_cases.update({
        where: { id: openCase.id },
        data: {
          status: 'NEEDS_REVISION',
          review_note: finalReason,
          reviewed_by: actorId,
          reviewed_at: now,
          changed_by: actorId,
        },
      });

      await businessLogger.createLog(
        {
          correlation_id: C,
          attempt_no: 1,
          process_type: 'USER_APPROVAL',
          actor_type: 'USER',
          actor_id: actorId,
          tenant_id: openCase.tenant_id,
          process_status: 'SUCCESS',
          context: {
            target_id: openCase.user_id,
            target_name: openCase.users?.name || 'Thành viên',
            attempt_no: 1,
          },
          payload: {
            action: 'RETURN_FOR_REVISION',
            admin_note: finalReason,
            status_before: 'CHO_DUYET',
            status_after: 'CHO_DUYET',
            case_id: openCase.id,
            case_status_after: 'NEEDS_REVISION',
          },
        },
        tx
      );
    });

    return {
      id: openCase.user_id,
      userId: openCase.user_id,
      caseId: openCase.id,
      status: 'CHO_DUYET',
      caseStatus: 'NEEDS_REVISION',
      reviewNote: finalReason,
      correlationId: C,
    };
  },

  /**
   * User cập nhật hồ sơ C1 / C1-S khi Admin yêu cầu bổ sung (NEEDS_REVISION).
   */
  submitMultiHomeRevision: async (userId, caseId, payload = {}, extra = {}) => {
    if (!caseId) {
      throw makeHttpError(400, 'CASE_ID_REQUIRED', 'Thiếu mã hồ sơ cần bổ sung.');
    }

    const existingCase = await basePrisma.onboarding_cases.findFirst({
      where: {
        id: caseId,
        user_id: userId,
        deleted_at: null,
        process_kind: 'REGISTER',
      },
      include: {
        tenants: { select: { id: true, name: true, slug: true, status: true } },
      },
    });

    if (!existingCase) {
      throw makeHttpError(404, 'CASE_NOT_FOUND', 'Không tìm thấy hồ sơ của bạn.');
    }

    if (!['NEEDS_REVISION', 'DRAFT'].includes(existingCase.status)) {
      throw makeHttpError(
        403,
        'CASE_NOT_EDITABLE',
        'Hồ sơ hiện không ở trạng thái cho phép chỉnh sửa.'
      );
    }

    const user = await basePrisma.users.findFirst({
      where: { id: userId, deleted_at: null },
      select: { id: true, name: true, phone: true, email: true },
    });

    const cleanProfile = normalizeMultiHomeProfile(payload, user);
    const prevMeta =
      existingCase.metadata && typeof existingCase.metadata === 'object'
        ? existingCase.metadata
        : {};
    const correlationId = extra.correlationId || crypto.randomUUID();

    await basePrisma.$transaction(async (tx) => {
      if (
        existingCase.case_type === 'CLAN_SETUP' &&
        existingCase.tenant_id &&
        (payload.clanName !== undefined || payload.description !== undefined)
      ) {
        const clanNameClean = String(payload.clanName || '').trim();
        const descClean = String(payload.description || '').trim();
        if (
          existingCase.tenants &&
          ['CHO_DUYET', 'TU_CHOI', 'TAM_NGUNG'].includes(existingCase.tenants.status)
        ) {
          await tx.tenants.update({
            where: { id: existingCase.tenant_id },
            data: {
              ...(clanNameClean ? { name: clanNameClean } : {}),
              ...(payload.description !== undefined ? { description: descClean || null } : {}),
              changed_by: userId,
            },
          });
        }
      }

      await tx.onboarding_cases.update({
        where: { id: existingCase.id },
        data: {
          status: 'SUBMITTED',
          submitted_at: new Date(),
          primary_member_id: cleanProfile.claimed_member_id || null,
          changed_by: userId,
          metadata: {
            ...prevMeta,
            ...(payload.link_type && VALID_LINK_TYPES.has(payload.link_type)
              ? { link_type: payload.link_type }
              : {}),
            ...(payload.clanName ? { clanName: String(payload.clanName).trim() } : {}),
            ...(payload.description !== undefined
              ? { description: String(payload.description || '').trim() }
              : {}),
            registration_profile: cleanProfile,
            revised_at: new Date().toISOString(),
          },
        },
      });
    });

    return {
      caseId: existingCase.id,
      tenantId: existingCase.tenant_id,
      status: 'CHO_DUYET',
      caseStatus: 'SUBMITTED',
      correlationId,
    };
  },

  /**
   * User mở lại hồ sơ C1 / C1-S sau khi bị từ chối mềm (REJECTED & is_final_rejection !== true).
   */
  reopenMultiHomeCase: async (userId, caseId) => {
    const existingCase = await basePrisma.onboarding_cases.findFirst({
      where: {
        id: caseId,
        user_id: userId,
        deleted_at: null,
        process_kind: 'REGISTER',
      },
    });

    if (!existingCase) {
      throw makeHttpError(404, 'CASE_NOT_FOUND', 'Không tìm thấy hồ sơ.');
    }

    if (existingCase.status !== 'REJECTED') {
      throw makeHttpError(
        400,
        'INVALID_CASE_STATE',
        'Chỉ có thể mở lại hồ sơ đã bị từ chối.'
      );
    }

    const meta =
      existingCase.metadata && typeof existingCase.metadata === 'object'
        ? existingCase.metadata
        : {};

    if (meta.is_final_rejection === true) {
      throw makeHttpError(
        403,
        'ACCOUNT_PERMANENTLY_REJECTED',
        'Hồ sơ đã bị từ chối vĩnh viễn và không thể mở lại.'
      );
    }

    await basePrisma.$transaction(async (tx) => {
      await tx.onboarding_cases.update({
        where: { id: existingCase.id },
        data: {
          status: 'NEEDS_REVISION',
          changed_by: userId,
          metadata: {
            ...meta,
            reopened_by_user_at: new Date().toISOString(),
          },
        },
      });

      if (existingCase.case_type === 'CLAN_SETUP' && existingCase.tenant_id) {
        await tx.tenants.updateMany({
          where: {
            id: existingCase.tenant_id,
            status: 'TU_CHOI',
          },
          data: {
            status: 'CHO_DUYET',
            changed_by: userId,
          },
        });
      }
    });

    return {
      caseId: existingCase.id,
      caseType: existingCase.case_type,
      status: 'NEEDS_REVISION',
    };
  },

  /**
   * Lấy trạng thái chi tiết hồ sơ C1 / C1-S của user hiện tại (dùng cho MembershipStatusPage & Revision).
   * Ưu tiên đọc review_note từ bảng onboarding_cases.
   */
  getMultiHomeStatus: async (userId, { caseId = null, tenantId = null } = {}) => {
    const where = {
      user_id: userId,
      deleted_at: null,
      process_kind: 'REGISTER',
      ...(caseId ? { id: caseId } : {}),
      ...(!caseId && tenantId ? { tenant_id: tenantId } : {}),
    };

    const targetCase = await basePrisma.onboarding_cases.findFirst({
      where,
      include: {
        tenants: {
          select: { id: true, name: true, slug: true, description: true, status: true },
        },
      },
      orderBy: { updated_at: 'desc' },
    });

    if (!targetCase) {
      return null;
    }

    const meta =
      targetCase.metadata && typeof targetCase.metadata === 'object'
        ? targetCase.metadata
        : {};
    const isFinalRejection =
      targetCase.status === 'REJECTED' && meta.is_final_rejection === true;

    let uiStatus = 'CHO_DUYET';
    if (targetCase.status === 'APPROVED' || targetCase.status === 'MERGED') {
      uiStatus = 'DA_DUYET';
    } else if (targetCase.status === 'NEEDS_REVISION') {
      uiStatus = 'NEEDS_REVISION';
    } else if (targetCase.status === 'REJECTED') {
      uiStatus = isFinalRejection ? 'TU_CHOI_LAN_CUOI' : 'TU_CHOI';
    }

    const adminFeedback = targetCase.review_note || null;

    return {
      caseId: targetCase.id,
      id: targetCase.id,
      caseType: targetCase.case_type,
      caseStatus: targetCase.status,
      status: uiStatus,
      isFinalRejection,
      tenantId: targetCase.tenant_id,
      tenantName: targetCase.tenants?.name || meta.clanName || 'Dòng họ',
      tenantSlug: targetCase.tenants?.slug || meta.tenantSlug || '',
      description: targetCase.tenants?.description || meta.description || '',
      linkType: meta.link_type || 'SPOUSE_FAMILY',
      reviewNote: adminFeedback || targetCase.rejection_reason || null,
      revisionRequest: adminFeedback,
      submittedAt: targetCase.submitted_at || targetCase.created_at,
      caseMetadata: meta,
      registration_profile: meta.registration_profile || null,
    };
  },
};

module.exports = membershipService;
