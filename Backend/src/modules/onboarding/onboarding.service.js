/**
 * PATH       : src/modules/onboarding/onboarding.service.js
 * DATETIME: 2026-08-22T14:10:00+07:00
 * VERSION: 1.5.3-FE-OP-B3
 * DESCRIPTION:
 * - FE-OP-B1-UI2: Cho phép DRAFT member cũng có thể update profile.
 * - TRÁI TIM NGHIỆP VỤ Onboarding theo EGAL-25.x OPD v1.2.0 (SEC-compliant) + EGAL-SEC v1.1.0.
 * - onboarding_cases = Aggregate Root (L5). SEC L2/L3 guards trên Heavy path; tenant isolation.
 * - Critical notifications: status=PENDING (outbox-ready). Non-critical: best-effort.
 * - BPL Snapshot (context + payload); context.on_behalf_of khi delegation.
 * - MERGE_FAILED được commit trong TX (return result — không throw sau khi đã ghi failed).
 * - Q1: Giữ public API + alias executeMemberProfileCompletion.
 * - Q2: Header chuẩn.
 *
 * CHANGELOG:
 * - 1.0.0–1.3.0: Phase 1–3 / OPD v1.1.0.
 * - 1.4.0 (2026-07-21): OPD v1.2.0 + SEC A–E alignment.
 * - 1.5.0-W3 function BusinessError local, chỉ cần wrapper Q1
 * - FE-OP-B1-UI2: Cho phép DRAFT member cũng có thể update profile.
 * - 1.5.0-FE-OP-B2: List OP cases chờ duyệt + approve OP side-effects
 *   (CHINH_THUC; CLAN_SETUP→CLAN_ADMIN+HOAT_DONG; MEMBER_JOIN→USER).
 * - 1.5.1-FE-OP-B2: SYS startReview/revision/approve/reject dùng basePrisma.
 * - 1.5.2-FE-OP-D1: getCaseTimeline — gom C-RP + USER_APPROVAL + OP by context.target_id.
 * - 1.5.3-FE-OP-B3: note bắt buộc approve/revision/reject; soft/final reject + reopenable;
 *   reopen endpoint; CLAN_SETUP tenant TU_CHOI/NGUNG_HAN/TAM_NGUNG.
 */

/**
 * FE-OP-B3 — policy admin trên case MEMBER_PROMOTE (approve/revision/reject).
 * CLAN_SETUP: chỉ SYSTEM_ADMIN. CLAN_ADMIN: chỉ MEMBER_JOIN cùng tenant.
 */
function _assertOpAdminPolicy(onboardingCase, reviewer) {
  const caseType = onboardingCase.case_type;
  const processKind = onboardingCase.process_kind;
  if (processKind !== 'MEMBER_PROMOTE') return;

  if (caseType === 'CLAN_SETUP' && reviewer.role !== 'SYSTEM_ADMIN') {
    throw BusinessError(
      'FORBIDDEN',
      'Chỉ SYSTEM_ADMIN được xử lý hồ sơ thành lập dòng họ (CLAN_SETUP).',
      { statusCode: 403 }
    );
  }
  if (reviewer.role === 'CLAN_ADMIN' && caseType !== 'MEMBER_JOIN') {
    throw BusinessError(
      'FORBIDDEN',
      'CLAN_ADMIN chỉ được xử lý MEMBER_JOIN của dòng họ mình.',
      { statusCode: 403 }
    );
  }
}

function _requireNote(note, fieldLabel = 'Ghi chú') {
  const v = note != null ? String(note).trim() : '';
  if (!v) {
    throw BusinessError(
      'NOTE_REQUIRED',
      `${fieldLabel} là bắt buộc.`,
      { statusCode: 400 }
    );
  }
  return v;
}

'use strict';

const { prisma, basePrisma } = require('../../lib/prisma.js');
//1.5.0-W3
const { createBusinessError } = require('../../shared/errors');

// ─────────────────────────────────────────────────────────────
// CONSTANTS — OPD v1.2.0 + Prisma enum + SEC criticality
// ─────────────────────────────────────────────────────────────

/** Các status cho phép user chỉnh sửa provisional data (L5) */
const EDITABLE_CASE_STATUSES = Object.freeze([
  'DRAFT',
  'PROFILE_COMPLETED',
  'FAMILY_TREE_DRAFT',
  'NEEDS_REVISION',
]);

/** Process types chuẩn (PostgreSQL enum ↔ Prisma ↔ business-log-schemas) */
const PROCESS_TYPE = Object.freeze({
  ONBOARDING_CASE_CREATE:       'ONBOARDING_CASE_CREATE',
  ONBOARDING_PROFILE_SAVE:      'ONBOARDING_PROFILE_SAVE',
  ONBOARDING_PROFILE_COMPLETE:  'ONBOARDING_PROFILE_COMPLETE',
  ONBOARDING_BRANCH_CREATE:     'ONBOARDING_BRANCH_CREATE',
  ONBOARDING_BRANCH_UPDATE:     'ONBOARDING_BRANCH_UPDATE',
  ONBOARDING_SUBMIT:            'ONBOARDING_SUBMIT',
  ONBOARDING_REVIEW_START:      'ONBOARDING_REVIEW_START',
  ONBOARDING_REVISION_REQUEST:  'ONBOARDING_REVISION_REQUEST',
  ONBOARDING_APPROVE:           'ONBOARDING_APPROVE',
  ONBOARDING_REJECT:            'ONBOARDING_REJECT',
  ONBOARDING_BRANCH_MERGE:      'ONBOARDING_BRANCH_MERGE',
  ONBOARDING_COMPLETE:          'ONBOARDING_COMPLETE',
  ONBOARDING_CANCEL:            'ONBOARDING_CANCEL',
  ONBOARDING_CASE_EXPIRE:       'ONBOARDING_CASE_EXPIRE',
  ONBOARDING_BRANCH_ARCHIVE:    'ONBOARDING_BRANCH_ARCHIVE',
  ONBOARDING_CASE_REOPEN:       'ONBOARDING_CASE_REOPEN',
  CLAN_ONBOARDING_CREATE:       'CLAN_ONBOARDING_CREATE',
  CLAN_ONBOARDING_CONFIGURE:    'CLAN_ONBOARDING_CONFIGURE',
  CLAN_TREE_INITIALIZE:         'CLAN_TREE_INITIALIZE',
  CLAN_ONBOARDING_ACTIVATE:     'CLAN_ONBOARDING_ACTIVATE',
});

/** Notification event types */
const NOTIF_EVENT = Object.freeze({
  ONBOARDING_STARTED:             'ONBOARDING_STARTED',
  ONBOARDING_PROFILE_COMPLETED:   'ONBOARDING_PROFILE_COMPLETED',
  ONBOARDING_SUBMITTED:           'ONBOARDING_SUBMITTED',
  ONBOARDING_UNDER_REVIEW:        'ONBOARDING_UNDER_REVIEW',
  ONBOARDING_REVISION_REQUESTED:  'ONBOARDING_REVISION_REQUESTED',
  ONBOARDING_APPROVED:            'ONBOARDING_APPROVED',
  ONBOARDING_REJECTED:            'ONBOARDING_REJECTED',
  ONBOARDING_BRANCH_MERGED:       'ONBOARDING_BRANCH_MERGED',
  ONBOARDING_COMPLETED:           'ONBOARDING_COMPLETED',
  CLAN_ONBOARDING_ACTIVATED:      'CLAN_ONBOARDING_ACTIVATED',
  ADMIN_ACTION_REQUIRED:          'ADMIN_ACTION_REQUIRED',
});

/**
 * SEC C / OPD VIII — Critical Security notifications.
 * Ghi status=PENDING trong cùng TX (outbox-ready). Worker gửi deliveries sau commit.
 */
const CRITICAL_NOTIF_EVENTS = Object.freeze(new Set([
  NOTIF_EVENT.ONBOARDING_APPROVED,
  NOTIF_EVENT.ONBOARDING_REJECTED,
  NOTIF_EVENT.ONBOARDING_BRANCH_MERGED,
  NOTIF_EVENT.ONBOARDING_COMPLETED,
  NOTIF_EVENT.CLAN_ONBOARDING_ACTIVATED,
]));

/** users.status bị chặn thao tác nghiệp vụ (SEC L2) */
const BLOCKED_USER_STATUSES = Object.freeze([
  'BI_KHOA',
  'BI_CAM',
  'TAM_NGUNG',
  'TU_CHOI',
  'CHO_DUYET',
]);

// ─────────────────────────────────────────────────────────────
// CUSTOM ERROR
// ─────────────────────────────────────────────────────────────

/**
 * BusinessError — Lỗi nghiệp vụ có mã rõ ràng để Frontend map message.
 * @param {string} code
 * @param {string} message
 * @param {object} [details]
 */
/**  1.5.0-W3
 * Q1 adapter — giữ chữ ký cũ:
 *   throw BusinessError(code, message, { statusCode, ...details })
 * → shared createBusinessError
 */
function BusinessError(code, message, details = {}) {
  const { statusCode, ...rest } = details || {};
  return createBusinessError(code, message, {
    statusCode: statusCode || undefined,
    details: Object.keys(rest).length > 0 ? rest : undefined,
  });
}

// ─────────────────────────────────────────────────────────────
// PRIVATE HELPERS
// ─────────────────────────────────────────────────────────────

/**
 * State Guard L5 — Backend lớp 2.
 * Chỉ cho phép mutation provisional data khi case còn editable.
 */
function _assertCaseEditable(onboardingCase) {
  if (!onboardingCase) {
    throw BusinessError('ONBOARDING_CASE_NOT_FOUND', 'Không tìm thấy hồ sơ onboarding.', { statusCode: 404 });
  }
  if (!EDITABLE_CASE_STATUSES.includes(onboardingCase.status)) {
    throw BusinessError(
      'ONBOARDING_CASE_NOT_EDITABLE',
      `Hồ sơ onboarding đang ở trạng thái ${onboardingCase.status}, không được chỉnh sửa.`,
      { statusCode: 423, currentStatus: onboardingCase.status }
    );
  }
}

/**
 * SEC L2 — Actor usable (Heavy / Standard write).
 * CHO_DUYET và lock statuses không được mutate onboarding.
 */
function _assertActorUsable(user, { allowChoDuyet = false } = {}) {
  if (!user) {
    throw BusinessError('USER_NOT_FOUND', 'Tài khoản không tồn tại.', { statusCode: 404 });
  }
  const blocked = allowChoDuyet
    ? BLOCKED_USER_STATUSES.filter((s) => s !== 'CHO_DUYET')
    : BLOCKED_USER_STATUSES;
  if (blocked.includes(user.status)) {
    throw BusinessError(
      'USER_STATUS_BLOCKED',
      `Tài khoản đang ở trạng thái ${user.status}, không thể thực hiện thao tác.`,
      { statusCode: user.status === 'CHO_DUYET' ? 423 : 403, userStatus: user.status }
    );
  }
}

/**
 * SEC S4 — Case thuộc tenant của actor (admin) hoặc SYSTEM_ADMIN.
 * @param {object} onboardingCase
 * @param {object} actorUser - { id, role, tenant_id }
 */
function _assertCaseTenantAccess(onboardingCase, actorUser) {
  if (!onboardingCase) {
    throw BusinessError('ONBOARDING_CASE_NOT_FOUND', 'Không tìm thấy hồ sơ onboarding.', { statusCode: 404 });
  }
  if (actorUser.role === 'SYSTEM_ADMIN') return;
  if (
    onboardingCase.tenant_id &&
    actorUser.tenant_id &&
    onboardingCase.tenant_id !== actorUser.tenant_id
  ) {
    throw BusinessError(
      'ONBOARDING_CASE_FORBIDDEN',
      'Hồ sơ không thuộc dòng họ của bạn.',
      { statusCode: 403 }
    );
  }
}

/**
 * SYSTEM_ADMIN: Prisma ALS gắn tenant 00000000-… → không thấy case tenant thật.
 * Dùng basePrisma để bypass isolation. CLAN_ADMIN giữ prisma (có tenant).
 * @param {string} [role]
 */
function _clientForRole(role) {
  return role === 'SYSTEM_ADMIN' ? basePrisma : prisma;
}

/**
 * Build BPL context — hỗ trợ on_behalf_of (SEC D delegation-ready).
 */
function _bplContext(base, onBehalfOf = null) {
  if (onBehalfOf) {
    return { ...base, on_behalf_of: onBehalfOf };
  }
  return base;
}

/**
 * Ghi Business Process Log theo Snapshot Doctrine (context + payload).
 * context có thể chứa on_behalf_of khi actor là grantee.
 */
async function _writeBusinessLog(tx, {
  correlationId,
  processType,
  actorType = 'USER',
  actorId,
  tenantId = null,
  processStatus = 'SUCCESS',
  context = {},
  payload = {},
  attemptNo = 1,
}) {
  return tx.business_process_logs.create({
    data: {
      correlation_id: correlationId,
      attempt_no: attemptNo,
      process_type: processType,
      actor_type: actorType,
      actor_id: actorId,
      tenant_id: tenantId,
      process_status: processStatus,
      metadata: {
        context,
        payload,
      },
    },
  });
}

/**
 * Ghi Audit Log.
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {object} params
 */
async function _writeAuditLog(tx, {
  tableName,
  recordId,
  action,
  oldData = null,
  newData = null,
  tenantId = null,
  changedBy,
  correlationId,
}) {
  return tx.audit_logs.create({
    data: {
      table_name: tableName,
      record_id: recordId,
      action,
      old_data: oldData || undefined,
      new_data: newData || undefined,
      tenant_id: tenantId,
      changed_by: changedBy,
      correlation_id: correlationId,
    },
  });
}

/**
 * Tạo notification + recipient (Communication Ledger).
 * SEC C / OPD VIII:
 * - Critical events → status=PENDING (outbox-ready; worker gửi delivery sau commit).
 * - Non-critical → PENDING hoặc SENT best-effort (mặc định PENDING thống nhất worker).
 * notification_deliveries không tạo trong TX nghiệp vụ.
 */
async function _createNotification(tx, {
  userId,
  tenantId = null,
  title,
  content,
  eventType,
  correlationId,
  level = 'INFO',
  type = 'HE_THONG',
  changedBy = null,
}) {
  const isCritical = CRITICAL_NOTIF_EVENTS.has(eventType);
  const notification = await tx.notifications.create({
    data: {
      user_id: userId,
      tenant_id: tenantId,
      type,
      title,
      content,
      is_read: false,
      level: isCritical ? (level === 'INFO' ? 'IMPORTANT' : level) : level,
      // Outbox-ready: PENDING cho mọi event; worker/delivery tách biệt (SEC S7)
      status: 'PENDING',
      event_type: eventType,
      correlation_id: correlationId,
      reliability: isCritical ? 'HIGH' : 'LOW',
    },
  });

  await tx.notification_recipients.create({
    data: {
      notification_id: notification.id,
      user_id: userId,
      changed_by: changedBy || userId,
    },
  });

  return notification;
}

/**
 * Lấy onboarding case đang active của user (chưa terminal).
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {string} userId
 * @param {string} [tenantId]
 */
async function _findActiveCase(tx, userId, tenantId = null) {
  const where = {
    user_id: userId,
    deleted_at: null,
    status: {
      notIn: ['MERGED', 'REJECTED', 'CANCELLED', 'EXPIRED'],
    },
  };
  if (tenantId) where.tenant_id = tenantId;

  return tx.onboarding_cases.findFirst({
    where,
    orderBy: { created_at: 'desc' },
  });
}

// ─────────────────────────────────────────────────────────────
// PUBLIC API — PHASE 1
// ─────────────────────────────────────────────────────────────

/**
 * Tạo mới onboarding_cases (Aggregate Root).
 * Thường gọi khi user bấm "Bắt đầu nhập tộc" hoặc hệ thống tự tạo sau khi user được DA_DUYET.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {string|null} params.tenantId
 * @param {'MEMBER_ONBOARDING'|'CLAN_ONBOARDING'} params.caseType
 * @param {string} params.correlationId
 * @param {object} [params.metadata]
 * @param {string} [params.ipAddress]
 * @param {string} [params.userAgent]
 * @returns {Promise<{ caseId: string, status: string, correlationId: string }>}
 *
 * Process Type: ONBOARDING_CASE_CREATE
 */
async function createOnboardingCase({
  userId,
  tenantId = null,
  caseType = 'MEMBER_ONBOARDING',
  correlationId,
  metadata = {},
  ipAddress = null,
  userAgent = null,
}) {
  return prisma.$transaction(async (tx) => {
    // 1. Guard: user tồn tại + status an ninh
    const user = await tx.users.findUnique({ where: { id: userId } });
    if (!user) {
      throw BusinessError('USER_NOT_FOUND', 'Tài khoản không tồn tại.', { statusCode: 404 });
    }
    if (['BI_KHOA', 'BI_CAM', 'TAM_NGUNG'].includes(user.status)) {
      throw BusinessError('USER_STATUS_BLOCKED', `Tài khoản đang ở trạng thái ${user.status}.`, { statusCode: 403 });
    }

    // 2. Không cho tạo case mới nếu đã có case active
    const existing = await _findActiveCase(tx, userId, tenantId);
    if (existing) {
      throw BusinessError(
        'ONBOARDING_CASE_ALREADY_EXISTS',
        'Bạn đang có hồ sơ onboarding chưa hoàn tất. Vui lòng tiếp tục hồ sơ hiện tại.',
        { statusCode: 409, existingCaseId: existing.id, existingStatus: existing.status }
      );
    }

    // 3. Tạo case
    const newCase = await tx.onboarding_cases.create({
      data: {
        correlation_id: correlationId,
        case_type: caseType,
        status: 'DRAFT',
        user_id: userId,
        tenant_id: tenantId,
        metadata: {
          ...metadata,
          created_from: 'WEB',
          created_ip: ipAddress,
          created_ua: userAgent,
        },
      },
    });

    // 4. BPL
    await _writeBusinessLog(tx, {
      correlationId,
      processType: PROCESS_TYPE.ONBOARDING_CASE_CREATE,
      actorId: userId,
      tenantId,
      context: {
        target_id: newCase.id,
        target_name: `Onboarding case of user ${userId}`,
        user_id: userId,
      },
      payload: {
        case_type: caseType,
        initial_status: 'DRAFT',
      },
    });

    // 5. Notification (optional)
    await _createNotification(tx, {
      userId,
      tenantId,
      title: 'Bắt đầu quá trình nhập tộc',
      content: 'Hồ sơ onboarding của bạn đã được tạo. Vui lòng hoàn thiện thông tin cá nhân.',
      eventType: NOTIF_EVENT.ONBOARDING_STARTED,
      correlationId,
      level: 'INFO',
      changedBy: userId,
    });

    return {
      caseId: newCase.id,
      status: newCase.status,
      correlationId,
    };
  });
}

/**
 * Hoàn thiện hồ sơ cá nhân + khởi tạo Member dự bị (Member Onboarding Step 1).
 * Cập nhật / tạo onboarding_cases → PROFILE_COMPLETED.
 * Tạo address + member (DU_BI) + gán users.member_id.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {string|null} params.tenantId
 * @param {object} params.formData - { full_name, gender, birth_year, phone, full_address, province_name, ... }
 * @param {string} params.correlationId
 * @param {string} [params.caseId] - Nếu đã có case trước đó
 * @param {string} [params.ipAddress]
 * @param {string} [params.userAgent]
 * @returns {Promise<{ caseId: string, memberId: string, status: string }>}
 *
 * Process Type: ONBOARDING_PROFILE_COMPLETE
 */
async function completeMemberProfile({
  userId,
  tenantId = null,
  formData,
  correlationId,
  caseId = null,
  ipAddress = null,
  userAgent = null,
}) {
  return prisma.$transaction(async (tx) => {
    // 1. Load user + guard an ninh
    const user = await tx.users.findUnique({ where: { id: userId } });
    if (!user) {
      throw BusinessError('USER_NOT_FOUND', 'Tài khoản không tồn tại.', { statusCode: 404 });
    }
    if (['BI_KHOA', 'BI_CAM', 'TAM_NGUNG'].includes(user.status)) {
      throw BusinessError('USER_STATUS_BLOCKED', `Tài khoản đang ở trạng thái ${user.status}.`, { statusCode: 403 });
    }

    // 2. Nếu user đã có member_id chính thức → chặn
    if (user.member_id) {
      const existingMember = await tx.members.findUnique({ where: { id: user.member_id } });
      if (existingMember && existingMember.status === 'CHINH_THUC') {
        throw BusinessError('ALREADY_ONBOARDED', 'Tài khoản đã được liên kết thành viên chính thức.', { statusCode: 400 });
      }
    }

    // 3. Lấy hoặc tạo onboarding_cases
    let onboardingCase = null;
    if (caseId) {
      onboardingCase = await tx.onboarding_cases.findUnique({ where: { id: caseId } });
      if (!onboardingCase || onboardingCase.user_id !== userId) {
        throw BusinessError('ONBOARDING_CASE_NOT_FOUND', 'Hồ sơ onboarding không tồn tại hoặc không thuộc về bạn.', { statusCode: 404 });
      }
      _assertCaseEditable(onboardingCase);
    } else {
      onboardingCase = await _findActiveCase(tx, userId, tenantId);
      if (!onboardingCase) {
        // Tự tạo case DRAFT nếu chưa có (tiện cho luồng cũ)
        onboardingCase = await tx.onboarding_cases.create({
          data: {
            correlation_id: correlationId,
            case_type: 'MEMBER_ONBOARDING',
            status: 'DRAFT',
            user_id: userId,
            tenant_id: tenantId,
            metadata: {
              auto_created: true,
              created_ip: ipAddress,
              created_ua: userAgent,
            },
          },
        });
        await _writeBusinessLog(tx, {
          correlationId,
          processType: PROCESS_TYPE.ONBOARDING_CASE_CREATE,
          actorId: userId,
          tenantId,
          context: {
            target_id: onboardingCase.id,
            target_name: `Onboarding case (auto) of user ${userId}`,
            user_id: userId,
          },
          payload: { case_type: 'MEMBER_ONBOARDING', initial_status: 'DRAFT', auto_created: true },
        });
      } else {
        _assertCaseEditable(onboardingCase);
      }
    }

    // 4. Tạo / cập nhật Address
    const addressData = {
      tenant_id: tenantId,
      full_address: formData.full_address || null,
      province_name: formData.province_name || null,
      changed_by: userId,
    };

    let currentAddress;
    // Đơn giản Phase 1: luôn tạo mới (có thể tối ưu reuse sau)
    currentAddress = await tx.addresses.create({ data: addressData });

    // 5. Tạo hoặc cập nhật Member dự bị
    let member;
    if (user.member_id) {
      // Đã có member DU_BI từ lần trước → update
      member = await tx.members.update({
        where: { id: user.member_id },
        data: {
          full_name: formData.full_name || user.name || user.full_name,
          gender: formData.gender,
          birth_year: formData.birth_year,
          phone_number: formData.phone || formData.phone_number || user.phone,
          current_address_id: currentAddress.id,
          status: 'DU_BI',
          changed_by: userId,
        },
      });
    } else {
      member = await tx.members.create({
        data: {
          tenant_id: tenantId,
          full_name: formData.full_name || user.name || user.full_name,
          gender: formData.gender,
          birth_year: formData.birth_year,
          phone_number: formData.phone || formData.phone_number || user.phone,
          current_address_id: currentAddress.id,
          status: 'DU_BI',
          role: 'THANH_VIEN',
          changed_by: userId,
        },
      });

      // Gán users.member_id
      await tx.users.update({
        where: { id: userId },
        data: { member_id: member.id },
      });
    }

    // 6. Cập nhật onboarding_cases → PROFILE_COMPLETED + primary_member_id
    const updatedCase = await tx.onboarding_cases.update({
      where: { id: onboardingCase.id },
      data: {
        status: 'PROFILE_COMPLETED',
        primary_member_id: member.id,
        metadata: {
          ...(onboardingCase.metadata || {}),
          profile_completion: {
            contacts_completed: !!(formData.phone || formData.phone_number),
            address_completed: !!formData.full_address,
            birth_date_completed: !!formData.birth_year,
            gender_completed: !!formData.gender,
            completed_at: new Date().toISOString(),
          },
          last_ip: ipAddress,
        },
      },
    });

    // 7. Business Process Log (Snapshot Doctrine)
    await _writeBusinessLog(tx, {
      correlationId,
      processType: PROCESS_TYPE.ONBOARDING_PROFILE_COMPLETE,
      actorId: userId,
      tenantId,
      context: {
        target_id: updatedCase.id,
        target_name: `Onboarding case of ${member.full_name}`,
        user_id: userId,
        member_id: member.id,
      },
      payload: {
        address_id: currentAddress.id,
        full_name: member.full_name,
        gender: member.gender,
        birth_year: member.birth_year,
      },
    });

    // 8. Audit Log
    await _writeAuditLog(tx, {
      tableName: 'members',
      recordId: member.id,
      action: user.member_id ? 'CAP_NHAT' : 'THEM_MOI',
      newData: {
        full_name: member.full_name,
        status: 'DU_BI',
        role: member.role || 'THANH_VIEN',
      },
      tenantId,
      changedBy: userId,
      correlationId,
    });

    // 9. Notification
    await _createNotification(tx, {
      userId,
      tenantId,
      title: 'Hoàn thành thông tin cá nhân',
      content: 'Bạn đã hoàn thành hồ sơ cá nhân. Tiếp theo hãy khai báo nhánh gia đình.',
      eventType: NOTIF_EVENT.ONBOARDING_PROFILE_COMPLETED,
      correlationId,
      level: 'INFO',
      changedBy: userId,
    });

    return {
      caseId: updatedCase.id,
      memberId: member.id,
      status: updatedCase.status,
    };
  });
}

/**
 * Alias backward-compatible cho code cũ gọi executeMemberProfileCompletion.
 * Q1: Không break caller hiện tại.
 */
async function executeMemberProfileCompletion(params) {
  return completeMemberProfile(params);
}

/**
 * Kích hoạt không gian dòng họ (Clan Onboarding Step 4) — OPD IX.B + SEC B.
 * KHÔNG thay cho Identity Approval (users CHO_DUYET → DA_DUYET).
 * Chỉ tenants → HOAT_DONG khi identity đã DA_DUYET và actor thuộc tenant.
 * Heavy path: re-validate user + tenant trong TX.
 *
 * Process Type: CLAN_ONBOARDING_ACTIVATE
 * Notification : CLAN_ONBOARDING_ACTIVATED (critical / PENDING)
 */
async function executeClanActivation({
  userId,
  tenantId,
  correlationId,
  caseId = null,
  ipAddress = null,
  userAgent = null,
  onBehalfOf = null,
}) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.users.findUnique({ where: { id: userId } });
    _assertActorUsable(user); // SEC: không CHO_DUYET / BI_KHOA...

    if (user.tenant_id && user.tenant_id !== tenantId && user.role !== 'SYSTEM_ADMIN') {
      throw BusinessError(
        'TENANT_MISMATCH',
        'Bạn không thuộc không gian dòng họ này.',
        { statusCode: 403 }
      );
    }

    const tenant = await tx.tenants.findUnique({ where: { id: tenantId } });
    if (!tenant || tenant.deleted_at) {
      throw BusinessError('TENANT_NOT_FOUND', 'Không tìm thấy dòng họ.', { statusCode: 404 });
    }
    if (tenant.status === 'HOAT_DONG') {
      throw BusinessError(
        'TENANT_ALREADY_ACTIVE',
        'Dòng họ đã được kích hoạt.',
        { statusCode: 409 }
      );
    }
    // Cho phép từ CHO_DUYET / CHO_KICH_HOAT / TAM_NGUNG (holding) — không từ BI_KHOA
    if (['BI_KHOA', 'NGUNG_HAN', 'TU_CHOI'].includes(tenant.status)) {
      throw BusinessError(
        'TENANT_DISABLED',
        `Dòng họ đang ở trạng thái ${tenant.status}, không thể kích hoạt.`,
        { statusCode: 403, tenantStatus: tenant.status }
      );
    }

    // Role: CLAN_ADMIN hoặc SYSTEM_ADMIN (wizard creator thường đã là CLAN_ADMIN lúc register)
    if (!['CLAN_ADMIN', 'SYSTEM_ADMIN'].includes(user.role)) {
      throw BusinessError(
        'FORBIDDEN',
        'Chỉ CLAN_ADMIN được kích hoạt không gian dòng họ.',
        { statusCode: 403 }
      );
    }

    const oldTenantStatus = tenant.status;
    const updatedTenant = await tx.tenants.update({
      where: { id: tenantId },
      data: { status: 'HOAT_DONG', changed_by: userId },
    });

    // Giữ CLAN_ADMIN; không downgrade/escalate lung tung
    if (user.role !== 'CLAN_ADMIN' && user.role !== 'SYSTEM_ADMIN') {
      await tx.users.update({
        where: { id: userId },
        data: { role: 'CLAN_ADMIN' },
      });
    }

    let onboardingCase = null;
    if (caseId) {
      onboardingCase = await tx.onboarding_cases.findUnique({ where: { id: caseId } });
    } else {
      onboardingCase = await _findActiveCase(tx, userId, tenantId);
    }

    if (onboardingCase && onboardingCase.case_type === 'CLAN_ONBOARDING') {
      await tx.onboarding_cases.update({
        where: { id: onboardingCase.id },
        data: {
          status: 'MERGED',
          merged_at: new Date(),
          metadata: {
            ...(onboardingCase.metadata || {}),
            activated_at: new Date().toISOString(),
            activated_ip: ipAddress,
            previous_tenant_status: oldTenantStatus,
          },
        },
      });
    }

    await _writeBusinessLog(tx, {
      correlationId,
      processType: PROCESS_TYPE.CLAN_ONBOARDING_ACTIVATE,
      actorId: userId,
      tenantId,
      context: _bplContext({
        target_id: onboardingCase?.id || tenantId,
        target_name: `Clan activation of ${updatedTenant.name || tenantId}`,
        user_id: userId,
        tenant_id: tenantId,
      }, onBehalfOf),
      payload: {
        final_tenant_status: 'HOAT_DONG',
        previous_tenant_status: oldTenantStatus,
        final_user_role: 'CLAN_ADMIN',
        identity_note: 'Requires users.status=DA_DUYET before call (SEC L2 gate)',
      },
    });

    await _writeAuditLog(tx, {
      tableName: 'tenants',
      recordId: tenantId,
      action: 'CAP_NHAT',
      oldData: { status: oldTenantStatus },
      newData: { status: 'HOAT_DONG' },
      tenantId,
      changedBy: userId,
      correlationId,
    });

    // Critical outbox-ready
    await _createNotification(tx, {
      userId,
      tenantId,
      title: 'Kích hoạt không gian số dòng họ thành công',
      content: `Không gian dòng họ ${updatedTenant.name || ''} đã chính thức hoạt động (HOAT_DONG). Bạn có thể chia sẻ mã mời.`,
      eventType: NOTIF_EVENT.CLAN_ONBOARDING_ACTIVATED,
      correlationId,
      level: 'IMPORTANT',
      changedBy: userId,
    });

    return {
      tenantId,
      status: 'HOAT_DONG',
      caseId: onboardingCase?.id || null,
      previousTenantStatus: oldTenantStatus,
    };
  });
}

// ─────────────────────────────────────────────────────────────
// PHASE 2 — SUBMIT / REVIEW / REVISION / APPROVE / REJECT / CANCEL
// ─────────────────────────────────────────────────────────────

/**
 * User gửi hồ sơ onboarding (SUBMITTED).
 * Điều kiện: case phải ở PROFILE_COMPLETED | FAMILY_TREE_DRAFT | NEEDS_REVISION.
 * Cập nhật case + primary_branch (nếu có) → SUBMITTED, ghi BPL, thông báo Admin.
 *
 * @param {object} params
 * @param {string} params.caseId
 * @param {string} params.userId          - Actor (chủ hồ sơ)
 * @param {string} params.correlationId
 * @param {object} [params.payload]       - { member_count, generation_depth, submitted_from }
 * @param {string} [params.ipAddress]
 * @returns {Promise<{ caseId: string, status: string, submittedAt: Date }>}
 *
 * Process Type: ONBOARDING_SUBMIT
 * Notification : ONBOARDING_SUBMITTED + ADMIN_ACTION_REQUIRED
 */
async function submitOnboardingCase({
  caseId,
  userId,
  correlationId,
  payload = {},
  ipAddress = null,
}) {
  return prisma.$transaction(async (tx) => {
    const onboardingCase = await tx.onboarding_cases.findUnique({
      where: { id: caseId },
      include: { /* primary_branch optional nếu relation đã có */ },
    });

    if (!onboardingCase || onboardingCase.deleted_at) {
      throw BusinessError('ONBOARDING_CASE_NOT_FOUND', 'Hồ sơ onboarding không tồn tại.', { statusCode: 404 });
    }
    if (onboardingCase.user_id !== userId) {
      throw BusinessError('ONBOARDING_CASE_FORBIDDEN', 'Bạn không có quyền gửi hồ sơ này.', { statusCode: 403 });
    }

    // Chỉ cho submit từ các status hợp lệ
    //-FE-OP-B1-UI2
    const processKind = onboardingCase.process_kind || null;
    const isOpPromote = processKind === 'MEMBER_PROMOTE';

    const submittableLegacy = [
      'PROFILE_COMPLETED',
      'FAMILY_TREE_DRAFT',
      'NEEDS_REVISION',
    ];

    const submittableOp = ['DRAFT', 'NEEDS_REVISION'];

    const allowed = isOpPromote ? submittableOp : submittableLegacy;

    if (!allowed.includes(onboardingCase.status)) {
      const err = BusinessError(
        'ONBOARDING_CASE_NOT_SUBMITTABLE',
        `Hồ sơ đang ở trạng thái ${onboardingCase.status}, không thể gửi.`,
        { statusCode: 423 }
      );
      // nếu BusinessError hỗ trợ details:
      // err.details = { currentStatus: onboardingCase.status, process_kind: processKind };
      throw err;
    }

    // Bắt buộc đã có primary_member_id
    if (!onboardingCase.primary_member_id) {
      throw BusinessError(
        'ONBOARDING_PROFILE_INCOMPLETE',
        'Chưa hoàn thành thông tin thành viên. Vui lòng hoàn thiện hồ sơ cá nhân trước.',
        { statusCode: 400 }
      );
    }

    const now = new Date();

    // 1. Update case → SUBMITTED
    const updatedCase = await tx.onboarding_cases.update({
      where: { id: caseId },
      data: {
        status: 'SUBMITTED',
        submitted_at: now,
        revision_request: null, // clear yêu cầu cũ nếu resubmit từ NEEDS_REVISION
        metadata: {
          ...(onboardingCase.metadata || {}),
          submission: {
            submitted_from: payload.submitted_from || 'WEB',
            submitted_ip: ipAddress,
            member_count: payload.member_count ?? (onboardingCase.metadata?.family_tree?.member_count || null),
            generation_depth: payload.generation_depth ?? (onboardingCase.metadata?.family_tree?.generation_depth || null),
            submitted_at: now.toISOString(),
          },
        },
      },
    });

    // 2. Update primary branch → SUBMITTED (nếu có)
    if (onboardingCase.primary_branch_id) {
      try {
        await tx.branches.update({
          where: { id: onboardingCase.primary_branch_id },
          data: { status: 'SUBMITTED' },
        });
      } catch (e) {
        // Branch model có thể chưa có hoặc status enum khác — log nhưng không fail toàn bộ
        // (Phase 2 cho phép branch optional)
      }
    }

    // 3. BPL
    await _writeBusinessLog(tx, {
      correlationId,
      processType: PROCESS_TYPE.ONBOARDING_SUBMIT,
      actorId: userId,
      tenantId: onboardingCase.tenant_id,
      context: {
        target_id: caseId,
        target_name: `Onboarding case submit`,
        user_id: userId,
        member_id: onboardingCase.primary_member_id,
        branch_id: onboardingCase.primary_branch_id || null,
      },
      payload: {
        member_count: payload.member_count ?? null,
        generation_depth: payload.generation_depth ?? null,
        submitted_from: payload.submitted_from || 'WEB',
        previous_status: onboardingCase.status,
      },
    });

    // 4. Audit
    await _writeAuditLog(tx, {
      tableName: 'onboarding_cases',
      recordId: caseId,
      action: 'CAP_NHAT',
      oldData: { status: onboardingCase.status },
      newData: { status: 'SUBMITTED', submitted_at: now },
      tenantId: onboardingCase.tenant_id,
      changedBy: userId,
      correlationId,
    });

    // 5. Notification cho chính user
    await _createNotification(tx, {
      userId,
      tenantId: onboardingCase.tenant_id,
      title: 'Đã gửi hồ sơ nhập tộc',
      content: 'Hồ sơ của bạn đã được gửi thành công và đang chờ Ban Quản trị xem xét.',
      eventType: NOTIF_EVENT.ONBOARDING_SUBMITTED,
      correlationId,
      level: 'INFO',
      changedBy: userId,
    });

    // 6. Notification ADMIN_ACTION_REQUIRED
    //    (Gửi cho CLAN_ADMIN của tenant — Phase 2 đơn giản: tạo notif với event, 
    //     hệ thống notification dispatcher sẽ fan-out theo role sau)
    if (onboardingCase.tenant_id) {
      await _createNotification(tx, {
        userId, // temporary; dispatcher sẽ resolve recipients theo role CLAN_ADMIN
        tenantId: onboardingCase.tenant_id,
        title: 'Có hồ sơ nhập tộc mới cần duyệt',
        content: `Hồ sơ onboarding #${caseId.slice(0, 8)} vừa được gửi. Vui lòng vào trang Quản trị để thẩm định.`,
        eventType: NOTIF_EVENT.ADMIN_ACTION_REQUIRED,
        correlationId,
        level: 'IMPORTANT',
        type: 'HE_THONG',
        changedBy: userId,
      });
    }

    return {
      caseId,
      status: 'SUBMITTED',
      submittedAt: now,
    };
  });
}

/**
 * Admin bắt đầu review hồ sơ (SUBMITTED → UNDER_REVIEW).
 *
 * @param {object} params
 * @param {string} params.caseId
 * @param {string} params.reviewerId     - Admin thực hiện
 * @param {string} params.correlationId
 * @param {string} [params.note]
 * @returns {Promise<{ caseId: string, status: string, reviewedBy: string }>}
 *
 * Process Type: ONBOARDING_REVIEW_START
 * Notification : ONBOARDING_UNDER_REVIEW
 */
async function startReview({
  caseId,
  reviewerId,
  correlationId,
  note = null,
  onBehalfOf = null,
}) {
  const reviewer = await basePrisma.users.findUnique({ where: { id: reviewerId } });
  _assertActorUsable(reviewer);
  const db = _clientForRole(reviewer.role);

  return db.$transaction(async (tx) => {
    const onboardingCase = await tx.onboarding_cases.findUnique({ where: { id: caseId } });

    if (!onboardingCase || onboardingCase.deleted_at) {
      throw BusinessError('ONBOARDING_CASE_NOT_FOUND', 'Hồ sơ onboarding không tồn tại.', { statusCode: 404 });
    }

    if (onboardingCase.status !== 'SUBMITTED' && onboardingCase.status !== 'UNDER_REVIEW') {
      throw BusinessError(
        'ONBOARDING_CASE_INVALID_TRANSITION',
        `Chỉ có thể bắt đầu review khi hồ sơ ở SUBMITTED (hiện tại: ${onboardingCase.status}).`,
        { statusCode: 423, currentStatus: onboardingCase.status }
      );
    }

    _assertCaseTenantAccess(onboardingCase, reviewer);

    const now = new Date();

    const updatedCase = await tx.onboarding_cases.update({
      where: { id: caseId },
      data: {
        status: 'UNDER_REVIEW',
        reviewed_at: now,
        reviewed_by: reviewerId,
        review_note: note || onboardingCase.review_note,
      },
    });

    // Update branch nếu có
    if (onboardingCase.primary_branch_id) {
      try {
        await tx.branches.update({
          where: { id: onboardingCase.primary_branch_id },
          data: { status: 'UNDER_REVIEW' },
        });
      } catch (_) { /* optional */ }
    }

    await _writeBusinessLog(tx, {
      correlationId,
      processType: PROCESS_TYPE.ONBOARDING_REVIEW_START,
      actorType: 'USER',
      actorId: reviewerId,
      tenantId: onboardingCase.tenant_id,
      context: _bplContext({
        target_id: caseId,
        target_name: `Onboarding case review start`,
        user_id: onboardingCase.user_id,
        member_id: onboardingCase.primary_member_id,
        branch_id: onboardingCase.primary_branch_id || null,
        reviewer_id: reviewerId,
      }, onBehalfOf),
      payload: {
        previous_status: onboardingCase.status,
        note: note || null,
      },
    });

    await _writeAuditLog(tx, {
      tableName: 'onboarding_cases',
      recordId: caseId,
      action: 'CAP_NHAT',
      oldData: { status: onboardingCase.status, reviewed_by: onboardingCase.reviewed_by },
      newData: { status: 'UNDER_REVIEW', reviewed_by: reviewerId, reviewed_at: now },
      tenantId: onboardingCase.tenant_id,
      changedBy: reviewerId,
      correlationId,
    });

    // Thông báo cho chủ hồ sơ
    await _createNotification(tx, {
      userId: onboardingCase.user_id,
      tenantId: onboardingCase.tenant_id,
      title: 'Hồ sơ đang được thẩm định',
      content: 'Ban Quản trị đã bắt đầu xem xét hồ sơ nhập tộc của bạn.',
      eventType: NOTIF_EVENT.ONBOARDING_UNDER_REVIEW,
      correlationId,
      level: 'INFO',
      changedBy: reviewerId,
    });

    return {
      caseId,
      status: 'UNDER_REVIEW',
      reviewedBy: reviewerId,
    };
  });
}

/**
 * Admin yêu cầu bổ sung thông tin (→ NEEDS_REVISION).
 * User sẽ được mở lại quyền chỉnh sửa (State Guard cho phép NEEDS_REVISION).
 *
 * @param {object} params
 * @param {string} params.caseId
 * @param {string} params.reviewerId
 * @param {string} params.revisionRequest  - Nội dung yêu cầu bổ sung (bắt buộc)
 * @param {string} params.correlationId
 * @param {string} [params.note]
 * @returns {Promise<{ caseId: string, status: string }>}
 *
 * Process Type: ONBOARDING_REVISION_REQUEST
 * Notification : ONBOARDING_REVISION_REQUESTED
 */
async function requestRevision({
  caseId,
  reviewerId,
  revisionRequest,
  correlationId,
  note = null,
}) {
  const reviewer = await basePrisma.users.findUnique({ where: { id: reviewerId } });
  _assertActorUsable(reviewer);
  const db = _clientForRole(reviewer.role);

  const revisionText = _requireNote(revisionRequest, 'Nội dung yêu cầu bổ sung');
  const noteText = _requireNote(note, 'Ghi chú');

  return db.$transaction(async (tx) => {
    const onboardingCase = await tx.onboarding_cases.findUnique({ where: { id: caseId } });

    if (!onboardingCase || onboardingCase.deleted_at) {
      throw BusinessError('ONBOARDING_CASE_NOT_FOUND', 'Hồ sơ onboarding không tồn tại.', { statusCode: 404 });
    }

    const allowedFrom = ['SUBMITTED', 'UNDER_REVIEW'];
    if (!allowedFrom.includes(onboardingCase.status)) {
      throw BusinessError(
        'ONBOARDING_CASE_INVALID_TRANSITION',
        `Chỉ có thể yêu cầu bổ sung khi hồ sơ ở SUBMITTED hoặc UNDER_REVIEW (hiện tại: ${onboardingCase.status}).`,
        { statusCode: 423, currentStatus: onboardingCase.status }
      );
    }

    _assertCaseTenantAccess(onboardingCase, reviewer);
    _assertOpAdminPolicy(onboardingCase, reviewer);

    await tx.onboarding_cases.update({
      where: { id: caseId },
      data: {
        status: 'NEEDS_REVISION',
        revision_request: revisionText,
        reviewed_by: reviewerId,
        reviewed_at: new Date(),
        review_note: noteText,
      },
    });

    if (onboardingCase.primary_branch_id) {
      try {
        await tx.branches.update({
          where: { id: onboardingCase.primary_branch_id },
          data: { status: 'PROVISIONAL' },
        });
      } catch (_) { /* optional */ }
    }

    await _writeBusinessLog(tx, {
      correlationId,
      processType: PROCESS_TYPE.ONBOARDING_REVISION_REQUEST,
      actorId: reviewerId,
      tenantId: onboardingCase.tenant_id,
      context: {
        target_id: caseId,
        target_name: `Onboarding case revision request`,
        user_id: onboardingCase.user_id,
        member_id: onboardingCase.primary_member_id,
        branch_id: onboardingCase.primary_branch_id || null,
        reviewer_id: reviewerId,
      },
      payload: {
        action: 'REVISION_REQUEST',
        revision_request: revisionText,
        previous_status: onboardingCase.status,
        note: noteText,
      },
    });

    await _writeAuditLog(tx, {
      tableName: 'onboarding_cases',
      recordId: caseId,
      action: 'CAP_NHAT',
      oldData: { status: onboardingCase.status },
      newData: { status: 'NEEDS_REVISION', revision_request: revisionText },
      tenantId: onboardingCase.tenant_id,
      changedBy: reviewerId,
      correlationId,
    });

    await _createNotification(tx, {
      userId: onboardingCase.user_id,
      tenantId: onboardingCase.tenant_id,
      title: 'Yêu cầu bổ sung hồ sơ nhập tộc',
      content: `Ban Quản trị yêu cầu bạn bổ sung: ${revisionText}`,
      eventType: NOTIF_EVENT.ONBOARDING_REVISION_REQUESTED,
      correlationId,
      level: 'IMPORTANT',
      changedBy: reviewerId,
    });

    return {
      caseId,
      status: 'NEEDS_REVISION',
      revision_request: revisionText,
    };
  });
}

/**
 * Admin phê duyệt hồ sơ về nguyên tắc (→ APPROVED).
 * Chưa merge cây. Sau bước này Admin/hệ thống gọi mergeProvisionalBranch (Phase 3).
 *
 * Luồng: UNDER_REVIEW | SUBMITTED → APPROVED
 *
 * @param {object} params
 * @param {string} params.caseId
 * @param {string} params.reviewerId
 * @param {string} params.correlationId
 * @param {string} [params.reviewNote]
 * @returns {Promise<{ caseId: string, status: string, approvedAt: Date }>}
 *
 * Process Type: ONBOARDING_APPROVE
 * Notification : ONBOARDING_APPROVED
 */
async function approveOnboardingCase({
  caseId,
  reviewerId,
  correlationId,
  reviewNote = null,
  onBehalfOf = null,
}) {
  const reviewer = await basePrisma.users.findUnique({ where: { id: reviewerId } });
  _assertActorUsable(reviewer);
  const db = _clientForRole(reviewer.role);
  const noteText = _requireNote(reviewNote, 'Ghi chú phê duyệt');

  return db.$transaction(async (tx) => {
    const onboardingCase = await tx.onboarding_cases.findUnique({ where: { id: caseId } });

    if (!onboardingCase || onboardingCase.deleted_at) {
      throw BusinessError('ONBOARDING_CASE_NOT_FOUND', 'Hồ sơ onboarding không tồn tại.', { statusCode: 404 });
    }

    const allowedFrom = ['SUBMITTED', 'UNDER_REVIEW'];
    if (!allowedFrom.includes(onboardingCase.status)) {
      throw BusinessError(
        'ONBOARDING_CASE_INVALID_TRANSITION',
        `Chỉ có thể phê duyệt khi hồ sơ ở SUBMITTED hoặc UNDER_REVIEW (hiện tại: ${onboardingCase.status}).`,
        { statusCode: 423, currentStatus: onboardingCase.status }
      );
    }

    if (!onboardingCase.primary_member_id) {
      throw BusinessError(
        'ONBOARDING_PROFILE_INCOMPLETE',
        'Hồ sơ thiếu primary_member_id, không thể phê duyệt.',
        { statusCode: 400 }
      );
    }

    _assertCaseTenantAccess(onboardingCase, reviewer);
    _assertOpAdminPolicy(onboardingCase, reviewer);

    const caseType = onboardingCase.case_type;
    const processKind = onboardingCase.process_kind;

    const now = new Date();

    const updatedCase = await tx.onboarding_cases.update({
      where: { id: caseId },
      data: {
        status: 'APPROVED',
        approved_at: now,
        reviewed_by: reviewerId,
        reviewed_at: onboardingCase.reviewed_at || now,
        review_note: noteText,
        rejection_reason: null,
        revision_request: null,
        metadata: {
          ...(onboardingCase.metadata || {}),
          reopenable: false,
        },
      },
    });

    // Branch → APPROVED
    if (onboardingCase.primary_branch_id) {
      try {
        await tx.branches.update({
          where: { id: onboardingCase.primary_branch_id },
          data: { status: 'APPROVED' },
        });
      } catch (_) { /* optional */ }
    }

    // ── FE-OP-B2 side-effects (MEMBER_PROMOTE) ────────────────
    // member DU_BI → CHINH_THUC
    // CLAN_SETUP → user.role = CLAN_ADMIN + tenant HOAT_DONG
    // MEMBER_JOIN → user.role = USER
    let nextUserRole = null;
    if (processKind === 'MEMBER_PROMOTE' && onboardingCase.primary_member_id) {
      await tx.members.update({
        where: { id: onboardingCase.primary_member_id },
        data: {
          status: 'CHINH_THUC',
          changed_by: reviewerId,
        },
      });

      await _writeAuditLog(tx, {
        tableName: 'members',
        recordId: onboardingCase.primary_member_id,
        action: 'CAP_NHAT',
        oldData: { status: 'DU_BI' },
        newData: { status: 'CHINH_THUC' },
        tenantId: onboardingCase.tenant_id,
        changedBy: reviewerId,
        correlationId,
      });

      if (onboardingCase.user_id) {
        nextUserRole = caseType === 'CLAN_SETUP' ? 'CLAN_ADMIN' : 'USER';
        const owner = await tx.users.findUnique({
          where: { id: onboardingCase.user_id },
          select: { id: true, role: true },
        });
        if (owner) {
          await tx.users.update({
            where: { id: onboardingCase.user_id },
            data: { role: nextUserRole },
          });
          await _writeAuditLog(tx, {
            tableName: 'users',
            recordId: onboardingCase.user_id,
            action: 'CAP_NHAT',
            oldData: { role: owner.role },
            newData: { role: nextUserRole },
            tenantId: onboardingCase.tenant_id,
            changedBy: reviewerId,
            correlationId,
          });
        }
      }

      if (caseType === 'CLAN_SETUP' && onboardingCase.tenant_id) {
        const tenant = await tx.tenants.findUnique({
          where: { id: onboardingCase.tenant_id },
          select: { id: true, status: true },
        });
        if (tenant && tenant.status !== 'HOAT_DONG') {
          await tx.tenants.update({
            where: { id: onboardingCase.tenant_id },
            data: { status: 'HOAT_DONG' },
          });
          await _writeAuditLog(tx, {
            tableName: 'tenants',
            recordId: onboardingCase.tenant_id,
            action: 'CAP_NHAT',
            oldData: { status: tenant.status },
            newData: { status: 'HOAT_DONG' },
            tenantId: onboardingCase.tenant_id,
            changedBy: reviewerId,
            correlationId,
          });
        }
      }
    }

    await _writeBusinessLog(tx, {
      correlationId,
      processType: PROCESS_TYPE.ONBOARDING_APPROVE,
      actorId: reviewerId,
      tenantId: onboardingCase.tenant_id,
      context: _bplContext({
        target_id: caseId,
        target_name: `Onboarding case approved`,
        user_id: onboardingCase.user_id,
        member_id: onboardingCase.primary_member_id,
        branch_id: onboardingCase.primary_branch_id || null,
        reviewer_id: reviewerId,
      }, onBehalfOf),
      payload: {
        previous_status: onboardingCase.status,
        review_note: reviewNote || null,
        approved_at: now.toISOString(),
        process_kind: processKind,
        case_type: caseType,
        member_status:
          processKind === 'MEMBER_PROMOTE' ? 'CHINH_THUC' : undefined,
        user_role: nextUserRole || undefined,
        tenant_status:
          processKind === 'MEMBER_PROMOTE' && caseType === 'CLAN_SETUP'
            ? 'HOAT_DONG'
            : undefined,
      },
    });

    await _writeAuditLog(tx, {
      tableName: 'onboarding_cases',
      recordId: caseId,
      action: 'CAP_NHAT',
      oldData: { status: onboardingCase.status },
      newData: { status: 'APPROVED', approved_at: now, reviewed_by: reviewerId },
      tenantId: onboardingCase.tenant_id,
      changedBy: reviewerId,
      correlationId,
    });

    await _createNotification(tx, {
      userId: onboardingCase.user_id,
      tenantId: onboardingCase.tenant_id,
      title: 'Hồ sơ nhập tộc đã được phê duyệt',
      content: 'Chúc mừng! Hồ sơ của bạn đã được Ban Quản trị chấp thuận. Hệ thống sẽ tiến hành ghép nhánh gia đình vào cây phả hệ chính thức.',
      eventType: NOTIF_EVENT.ONBOARDING_APPROVED,
      correlationId,
      level: 'IMPORTANT',
      changedBy: reviewerId,
    });

    return {
      caseId,
      status: 'APPROVED',
      approvedAt: now,
      process_kind: processKind,
      case_type: caseType,
      member_status:
        processKind === 'MEMBER_PROMOTE' ? 'CHINH_THUC' : undefined,
      user_role: nextUserRole || undefined,
    };
  });
}

/**
 * Admin từ chối hồ sơ (→ REJECTED).
 * Giữ lại branches/members dự bị làm bằng chứng (theo Data Lifecycle OPD XI).
 *
 * @param {object} params
 * @param {string} params.caseId
 * @param {string} params.reviewerId
 * @param {string} params.rejectionReason  - Bắt buộc
 * @param {string} params.correlationId
 * @param {string} [params.note]
 * @returns {Promise<{ caseId: string, status: string }>}
 *
 * Process Type: ONBOARDING_REJECT
 * Notification : ONBOARDING_REJECTED
 */
async function rejectOnboardingCase({
  caseId,
  reviewerId,
  rejectionReason,
  correlationId,
  note = null,
  finalReject = false,
  onBehalfOf = null,
}) {
  const reviewer = await basePrisma.users.findUnique({ where: { id: reviewerId } });
  _assertActorUsable(reviewer);
  const db = _clientForRole(reviewer.role);
  const reasonText = _requireNote(rejectionReason, 'Lý do từ chối');
  // note bắt buộc; nếu client chỉ gửi rejectionReason thì dùng chung
  const noteText = note != null && String(note).trim()
    ? String(note).trim()
    : reasonText;
  const isFinal = finalReject === true || finalReject === 'true' || finalReject === 1;

  return db.$transaction(async (tx) => {
    const onboardingCase = await tx.onboarding_cases.findUnique({ where: { id: caseId } });

    if (!onboardingCase || onboardingCase.deleted_at) {
      throw BusinessError('ONBOARDING_CASE_NOT_FOUND', 'Hồ sơ onboarding không tồn tại.', { statusCode: 404 });
    }

    const allowedFrom = ['SUBMITTED', 'UNDER_REVIEW', 'NEEDS_REVISION'];
    if (!allowedFrom.includes(onboardingCase.status)) {
      throw BusinessError(
        'ONBOARDING_CASE_INVALID_TRANSITION',
        `Không thể từ chối hồ sơ đang ở trạng thái ${onboardingCase.status}.`,
        { statusCode: 423, currentStatus: onboardingCase.status }
      );
    }

    _assertCaseTenantAccess(onboardingCase, reviewer);
    _assertOpAdminPolicy(onboardingCase, reviewer);

    const now = new Date();
    const reopenable = !isFinal;
    const action = isFinal ? 'FINAL_REJECT' : 'REJECT';
    const prevMeta =
      onboardingCase.metadata && typeof onboardingCase.metadata === 'object'
        ? onboardingCase.metadata
        : {};

    await tx.onboarding_cases.update({
      where: { id: caseId },
      data: {
        status: 'REJECTED',
        rejected_at: now,
        rejection_reason: reasonText,
        reviewed_by: reviewerId,
        reviewed_at: now,
        review_note: noteText,
        metadata: {
          ...prevMeta,
          reopenable,
          reject_action: action,
          rejected_at: now.toISOString(),
          rejected_by: reviewerId,
        },
      },
    });

    if (onboardingCase.primary_branch_id) {
      try {
        await tx.branches.update({
          where: { id: onboardingCase.primary_branch_id },
          data: { status: 'REJECTED' },
        });
      } catch (_) { /* optional */ }
    }

    // CLAN_SETUP: soft → TU_CHOI | final → NGUNG_HAN
    let tenantStatusAfter = null;
    if (
      onboardingCase.process_kind === 'MEMBER_PROMOTE' &&
      onboardingCase.case_type === 'CLAN_SETUP' &&
      onboardingCase.tenant_id
    ) {
      tenantStatusAfter = isFinal ? 'NGUNG_HAN' : 'TU_CHOI';
      try {
        await tx.tenants.update({
          where: { id: onboardingCase.tenant_id },
          data: { status: tenantStatusAfter, changed_by: reviewerId },
        });
      } catch (e) {
        console.error('[rejectOnboardingCase][tenant]', e.message || e);
        throw e;
      }
    }

    await _writeBusinessLog(tx, {
      correlationId,
      processType: PROCESS_TYPE.ONBOARDING_REJECT,
      actorId: reviewerId,
      tenantId: onboardingCase.tenant_id,
      context: _bplContext({
        target_id: caseId,
        target_name: `Onboarding case rejected`,
        user_id: onboardingCase.user_id,
        member_id: onboardingCase.primary_member_id,
        branch_id: onboardingCase.primary_branch_id || null,
        reviewer_id: reviewerId,
      }, onBehalfOf),
      payload: {
        action,
        rejection_reason: reasonText,
        previous_status: onboardingCase.status,
        note: noteText,
        reopenable,
        tenant_status_after: tenantStatusAfter,
      },
    });

    await _writeAuditLog(tx, {
      tableName: 'onboarding_cases',
      recordId: caseId,
      action: 'CAP_NHAT',
      oldData: { status: onboardingCase.status },
      newData: {
        status: 'REJECTED',
        rejected_at: now,
        rejection_reason: reasonText,
        reopenable,
        action,
      },
      tenantId: onboardingCase.tenant_id,
      changedBy: reviewerId,
      correlationId,
    });

    await _createNotification(tx, {
      userId: onboardingCase.user_id,
      tenantId: onboardingCase.tenant_id,
      title: isFinal
        ? 'Hồ sơ nhập tộc bị từ chối lần cuối'
        : 'Hồ sơ nhập tộc bị từ chối',
      content: isFinal
        ? `Hồ sơ đã bị từ chối lần cuối. Lý do: ${reasonText}`
        : `Hồ sơ bị từ chối. Lý do: ${reasonText}. Bạn có thể mở lại và bổ sung rồi gửi duyệt.`,
      eventType: NOTIF_EVENT.ONBOARDING_REJECTED,
      correlationId,
      level: 'IMPORTANT',
      changedBy: reviewerId,
    });

    return {
      caseId,
      status: 'REJECTED',
      reopenable,
      action,
      tenant_status: tenantStatusAfter,
    };
  });
}

/**
 * FE-OP-B3: Member mở lại hồ sơ soft-reject (REJECTED + metadata.reopenable).
 * → DRAFT; CLAN_SETUP tenant TU_CHOI → TAM_NGUNG.
 */
async function reopenOnboardingCase({
  caseId,
  userId,
  correlationId,
  note = null,
}) {
  return prisma.$transaction(async (tx) => {
    const onboardingCase = await tx.onboarding_cases.findUnique({ where: { id: caseId } });

    if (!onboardingCase || onboardingCase.deleted_at) {
      throw BusinessError('ONBOARDING_CASE_NOT_FOUND', 'Hồ sơ onboarding không tồn tại.', { statusCode: 404 });
    }
    if (onboardingCase.user_id !== userId) {
      throw BusinessError(
        'ONBOARDING_CASE_FORBIDDEN',
        'Bạn không có quyền mở lại hồ sơ này.',
        { statusCode: 403 }
      );
    }
    if (onboardingCase.status !== 'REJECTED') {
      throw BusinessError(
        'ONBOARDING_CASE_INVALID_TRANSITION',
        `Chỉ mở lại được hồ sơ đã từ chối (hiện tại: ${onboardingCase.status}).`,
        { statusCode: 423, currentStatus: onboardingCase.status }
      );
    }

    const meta =
      onboardingCase.metadata && typeof onboardingCase.metadata === 'object'
        ? onboardingCase.metadata
        : {};
    if (meta.reopenable !== true) {
      throw BusinessError(
        'ONBOARDING_CASE_NOT_REOPENABLE',
        'Hồ sơ đã bị từ chối lần cuối, không thể mở lại.',
        { statusCode: 423 }
      );
    }

    const now = new Date();
    await tx.onboarding_cases.update({
      where: { id: caseId },
      data: {
        status: 'DRAFT',
        rejection_reason: null,
        rejected_at: null,
        revision_request: null,
        metadata: {
          ...meta,
          reopenable: false,
          reopened_at: now.toISOString(),
          reopened_by: userId,
          last_rejection_reason: onboardingCase.rejection_reason || meta.last_rejection_reason || null,
        },
      },
    });

    if (onboardingCase.primary_branch_id) {
      try {
        await tx.branches.update({
          where: { id: onboardingCase.primary_branch_id },
          data: { status: 'PROVISIONAL' },
        });
      } catch (_) { /* optional */ }
    }

    let tenantStatusAfter = null;
    if (
      onboardingCase.process_kind === 'MEMBER_PROMOTE' &&
      onboardingCase.case_type === 'CLAN_SETUP' &&
      onboardingCase.tenant_id
    ) {
      const tenant = await tx.tenants.findUnique({
        where: { id: onboardingCase.tenant_id },
        select: { id: true, status: true },
      });
      if (tenant && tenant.status === 'TU_CHOI') {
        tenantStatusAfter = 'TAM_NGUNG';
        await tx.tenants.update({
          where: { id: tenant.id },
          data: { status: 'TAM_NGUNG', changed_by: userId },
        });
      }
    }

    await _writeBusinessLog(tx, {
      correlationId,
      processType: PROCESS_TYPE.ONBOARDING_CASE_REOPEN,
      actorId: userId,
      tenantId: onboardingCase.tenant_id,
      context: {
        target_id: caseId,
        target_name: 'Onboarding case reopened',
        user_id: userId,
        member_id: onboardingCase.primary_member_id,
      },
      payload: {
        action: 'REOPEN_REJECTED',
        previous_status: 'REJECTED',
        note: note ? String(note).trim() : null,
        tenant_status_after: tenantStatusAfter,
      },
    });

    await _writeAuditLog(tx, {
      tableName: 'onboarding_cases',
      recordId: caseId,
      action: 'CAP_NHAT',
      oldData: { status: 'REJECTED' },
      newData: { status: 'DRAFT', reopened: true },
      tenantId: onboardingCase.tenant_id,
      changedBy: userId,
      correlationId,
    });

    return {
      caseId,
      status: 'DRAFT',
      tenant_status: tenantStatusAfter,
    };
  });
}

/**
 * User tự hủy hồ sơ (→ CANCELLED).
 * Chỉ cho phép khi case còn editable hoặc vừa SUBMITTED (chưa review sâu).
 *
 * @param {object} params
 * @param {string} params.caseId
 * @param {string} params.userId
 * @param {string} params.correlationId
 * @param {string} [params.reason]
 * @returns {Promise<{ caseId: string, status: string }>}
 *
 * Process Type: ONBOARDING_CANCEL
 */
async function cancelOnboardingCase({
  caseId,
  userId,
  correlationId,
  reason = null,
}) {
  return prisma.$transaction(async (tx) => {
    const onboardingCase = await tx.onboarding_cases.findUnique({ where: { id: caseId } });

    if (!onboardingCase || onboardingCase.deleted_at) {
      throw BusinessError('ONBOARDING_CASE_NOT_FOUND', 'Hồ sơ onboarding không tồn tại.', { statusCode: 404 });
    }
    if (onboardingCase.user_id !== userId) {
      throw BusinessError('ONBOARDING_CASE_FORBIDDEN', 'Bạn không có quyền hủy hồ sơ này.', { statusCode: 403 });
    }

    // Cho phép cancel khi còn DRAFT → SUBMITTED (chưa APPROVED/MERGING/MERGED)
    const cancellable = [
      'DRAFT',
      'PROFILE_COMPLETED',
      'FAMILY_TREE_DRAFT',
      'SUBMITTED',
      'NEEDS_REVISION',
      'UNDER_REVIEW',
    ];
    if (!cancellable.includes(onboardingCase.status)) {
      throw BusinessError(
        'ONBOARDING_CASE_NOT_CANCELLABLE',
        `Hồ sơ đang ở trạng thái ${onboardingCase.status}, không thể hủy.`,
        { statusCode: 423, currentStatus: onboardingCase.status }
      );
    }

    await tx.onboarding_cases.update({
      where: { id: caseId },
      data: {
        status: 'CANCELLED',
        metadata: {
          ...(onboardingCase.metadata || {}),
          cancelled_at: new Date().toISOString(),
          cancel_reason: reason || 'User cancelled',
        },
      },
    });

    // Branch → ARCHIVED (giữ dữ liệu theo Data Lifecycle)
    if (onboardingCase.primary_branch_id) {
      try {
        await tx.branches.update({
          where: { id: onboardingCase.primary_branch_id },
          data: { status: 'ARCHIVED' },
        });
      } catch (_) { /* optional */ }
    }

    // Members giữ DU_BI

    await _writeBusinessLog(tx, {
      correlationId,
      processType: PROCESS_TYPE.ONBOARDING_CANCEL,
      actorId: userId,
      tenantId: onboardingCase.tenant_id,
      context: {
        target_id: caseId,
        target_name: `Onboarding case cancelled by user`,
        user_id: userId,
        member_id: onboardingCase.primary_member_id,
        branch_id: onboardingCase.primary_branch_id || null,
      },
      payload: {
        previous_status: onboardingCase.status,
        reason: reason || 'User cancelled',
      },
    });

    await _writeAuditLog(tx, {
      tableName: 'onboarding_cases',
      recordId: caseId,
      action: 'CAP_NHAT',
      oldData: { status: onboardingCase.status },
      newData: { status: 'CANCELLED' },
      tenantId: onboardingCase.tenant_id,
      changedBy: userId,
      correlationId,
    });

    return {
      caseId,
      status: 'CANCELLED',
    };
  });
}

/**
 * List OP cases chờ duyệt.
 * DATETIME: 2026-08-18T10:30:00+07:00
 * VERSION: 1.5.0-FE-OP-B2
 */
async function listReviewableOpCases({
  actor,
  processKind = 'MEMBER_PROMOTE',
  caseType = null,
  statusCsv = 'SUBMITTED,UNDER_REVIEW',
  page = 1,
  pageSize = 20,
}) {
  const role = actor?.role;
  const actorTenantId = actor?.tenant_id || actor?.tenantId || null;

  if (!['SYSTEM_ADMIN', 'CLAN_ADMIN'].includes(role)) {
    throw BusinessError(
      'FORBIDDEN',
      'Bạn không có quyền xem danh sách hồ sơ xét duyệt.',
      { statusCode: 403 }
    );
  }

  const statuses = String(statusCsv)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const where = {
    deleted_at: null,
    process_kind: processKind || 'MEMBER_PROMOTE',
    status: { in: statuses.length ? statuses : ['SUBMITTED', 'UNDER_REVIEW'] },
  };

  if (role === 'CLAN_ADMIN') {
    if (!actorTenantId) {
      throw BusinessError(
        'FORBIDDEN',
        'Thiếu tenant. CLAN_ADMIN chỉ xem hồ sơ dòng họ mình.',
        { statusCode: 403 }
      );
    }
    where.tenant_id = actorTenantId;
    where.case_type = 'MEMBER_JOIN';
  } else if (caseType) {
    where.case_type = caseType;
  }

  const take = Math.min(Math.max(pageSize, 1), 100);
  const skip = (Math.max(page, 1) - 1) * take;

  // 2. Chọn client phù hợp: SYSTEM_ADMIN dùng basePrisma để bypass tenant isolation
  const db = role === 'SYSTEM_ADMIN' ? basePrisma : prisma; //[cite: 2]

  const [total, rows] = await Promise.all([
    db.onboarding_cases.count({ where }),
    db.onboarding_cases.findMany({
      where,
      orderBy: [{ submitted_at: 'asc' }, { created_at: 'asc' }],
      skip,
      
      take,
      include: {
        primary_member: {
          select: {
            id: true,
            full_name: true,
            gender: true,
            is_alive: true,
            birth_year: true,
            birth_month: true,
            birth_day: true,
            generation: true,
            status: true,
            role: true,
          },
        },
        users: {
          select: { id: true, phone: true, email: true, role: true, status: true },
        },
        tenants: {
          select: { id: true, name: true, status: true },
        },
      },
    }),
  ]);

  return {
    items: rows.map((c) => ({
      id: c.id,
      correlation_id: c.correlation_id,
      process_kind: c.process_kind,
      case_type: c.case_type,
      status: c.status,
      submitted_at: c.submitted_at,
      tenant_id: c.tenant_id,
      tenant: c.tenants
        ? { id: c.tenants.id, name: c.tenants.name, status: c.tenants.status }
        : null,
      user: c.users,
      primary: c.primary_member,
    })),
    pagination: {
      total_records: total,
      current_page: Math.max(page, 1),
      page_size: take,
      total_pages: Math.max(1, Math.ceil(total / take)),
    },
  };
}

// ─────────────────────────────────────────────────────────────
// FE-OP-D1 — Case timeline (RP C + USER_APPROVAL + OP by target_id)
// ─────────────────────────────────────────────────────────────

const TIMELINE_ACTION_LABELS = Object.freeze({
  APPROVE: 'Phê duyệt',
  REJECT: 'Từ chối',
  FINAL_REJECT: 'Từ chối lần cuối',
  REVISION_SUBMIT: 'Gửi lại sau yêu cầu sửa',
  REOPEN_REJECTED: 'Mở lại hồ sơ từ chối',
});

const TIMELINE_PROCESS_LABELS = Object.freeze({
  USER_REGISTER: 'Đăng ký',
  ONBOARDING_CASE_CREATE: 'Tạo hồ sơ đăng ký',
  USER_APPROVAL: 'Xét duyệt đăng ký',
  ONBOARDING_SUBMIT: 'Gửi duyệt hồ sơ',
  ONBOARDING_APPROVE: 'Phê duyệt thành viên chính thức',
  ONBOARDING_REJECT: 'Từ chối hồ sơ',
  ONBOARDING_REVISION_REQUEST: 'Yêu cầu bổ sung',
  ONBOARDING_REVIEW_START: 'Bắt đầu xem xét',
  ONBOARDING_PROFILE_SAVE: 'Lưu nháp hồ sơ',
  ONBOARDING_PROFILE_COMPLETE: 'Hoàn thiện hồ sơ',
});

function _timelineActionLabel(processType, action) {
  if (action && TIMELINE_ACTION_LABELS[action]) {
    if (processType === 'USER_APPROVAL' && action === 'APPROVE') {
      return 'Phê duyệt đăng ký';
    }
    return TIMELINE_ACTION_LABELS[action];
  }
  return TIMELINE_PROCESS_LABELS[processType] || processType;
}

function _normalizeTimelineRow(row, phase) {
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const payload = meta.payload && typeof meta.payload === 'object' ? meta.payload : {};
  const context = meta.context && typeof meta.context === 'object' ? meta.context : {};
  const action = payload.action ? String(payload.action) : null;

  return {
    at: row.created_at,
    phase,
    process_type: row.process_type,
    action,
    actionLabel: _timelineActionLabel(row.process_type, action),
    process_status: row.process_status,
    actor_id: row.actor_id || null,
    correlation_id: row.correlation_id,
    summary:
      payload.admin_note ||
      payload.approver_note ||
      payload.rejection_reason ||
      payload.review_note ||
      null,
    payload: {
      previous_status: payload.previous_status || payload.status_before || null,
      status_after: payload.status_after || payload.case_status_after || null,
      case_type: payload.case_type || null,
      process_kind: payload.process_kind || null,
      member_status: payload.member_status || null,
      user_role: payload.user_role || null,
    },
    context: {
      target_id: context.target_id || null,
      user_id: context.user_id || null,
      member_id: context.member_id || null,
      reviewer_id: context.reviewer_id || null,
    },
  };
}

/**
 * FE-OP-D1: Lịch sử BPL ghép RP + OP cho một onboarding case (OP).
 * - RP: correlation_id = source_register_correlation_id + USER_APPROVAL theo payload.case_id
 * - OP: process_type ONBOARDING_* và context.target_id = caseId
 * - Nhãn: ưu tiên payload.action, không có thì map process_type
 * - SYS: basePrisma (bypass tenant ALS)
 *
 * @param {object} params
 * @param {string} params.caseId
 * @param {object} params.actor - { id, role, tenant_id }
 */
async function getCaseTimeline({ caseId, actor }) {
  const role = actor?.role;
  const actorTenantId = actor?.tenant_id || actor?.tenantId || null;

  if (!['SYSTEM_ADMIN', 'CLAN_ADMIN'].includes(role)) {
    throw BusinessError(
      'FORBIDDEN',
      'Bạn không có quyền xem lịch sử hồ sơ.',
      { statusCode: 403 }
    );
  }

  if (!caseId) {
    throw BusinessError('VALIDATION_ERROR', 'Thiếu caseId.', { statusCode: 400 });
  }

  const db = _clientForRole(role);

  const onboardingCase = await db.onboarding_cases.findFirst({
    where: { id: caseId, deleted_at: null },
  });

  if (!onboardingCase) {
    throw BusinessError(
      'ONBOARDING_CASE_NOT_FOUND',
      'Hồ sơ onboarding không tồn tại.',
      { statusCode: 404 }
    );
  }

  _assertCaseTenantAccess(onboardingCase, {
    role,
    tenant_id: actorTenantId,
  });

  if (role === 'CLAN_ADMIN' && onboardingCase.case_type === 'CLAN_SETUP') {
    throw BusinessError(
      'FORBIDDEN',
      'CLAN_ADMIN không xem timeline hồ sơ thành lập dòng họ (CLAN_SETUP).',
      { statusCode: 403 }
    );
  }

  const meta =
    onboardingCase.metadata && typeof onboardingCase.metadata === 'object'
      ? onboardingCase.metadata
      : {};
  const sourceRegisterCaseId = meta.source_register_case_id || null;
  const sourceRegisterCorrelationId =
    meta.source_register_correlation_id || null;

  const items = [];

  // 1) RP logs theo C-RP
  if (sourceRegisterCorrelationId) {
    const rpRows = await db.business_process_logs.findMany({
      where: { correlation_id: sourceRegisterCorrelationId },
      orderBy: { created_at: 'asc' },
      take: 100,
    });
    for (const row of rpRows) {
      items.push(_normalizeTimelineRow(row, 'RP'));
    }
  }

  // 2) USER_APPROVAL theo payload.case_id = source_register_case_id
  //    (C approve RP thường khác C-RP — factory mới trong processUserApproval)
  if (sourceRegisterCaseId) {
    const approvalRows = await db.$queryRaw`
      SELECT id, created_at, correlation_id, process_type, process_status, actor_id, metadata
      FROM business_process_logs
      WHERE process_type = 'USER_APPROVAL'
        AND metadata->'payload'->>'case_id' = ${sourceRegisterCaseId}
      ORDER BY created_at ASC
      LIMIT 50
    `;
    for (const row of approvalRows) {
      items.push(_normalizeTimelineRow(row, 'RP'));
    }
  }

  // 3) OP logs neo context.target_id = caseId
  //    (C-OP trên cases.correlation_id hiện không khớp BPL — D0 confirmed)
  const opRows = await db.$queryRaw`
    SELECT id, created_at, correlation_id, process_type, process_status, actor_id, metadata
    FROM business_process_logs
    WHERE process_type IN (
      'ONBOARDING_SUBMIT',
      'ONBOARDING_APPROVE',
      'ONBOARDING_REJECT',
      'ONBOARDING_REVISION_REQUEST',
      'ONBOARDING_REVIEW_START',
      'ONBOARDING_PROFILE_SAVE',
      'ONBOARDING_PROFILE_COMPLETE'
    )
      AND (
        metadata->'context'->>'target_id' = ${caseId}
        OR metadata->'context'->>'onboarding_case_id' = ${caseId}
        OR metadata->'payload'->>'case_id' = ${caseId}
      )
    ORDER BY created_at ASC
    LIMIT 100
  `;
  for (const row of opRows) {
    items.push(_normalizeTimelineRow(row, 'OP'));
  }

  items.sort((a, b) => new Date(a.at) - new Date(b.at));

  const seen = new Set();
  const deduped = [];
  for (const it of items) {
    const key = `${it.correlation_id}|${it.process_type}|${it.at}|${it.action || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(it);
  }

  return {
    caseId: onboardingCase.id,
    process_kind: onboardingCase.process_kind,
    case_type: onboardingCase.case_type,
    status: onboardingCase.status,
    correlation_id: onboardingCase.correlation_id,
    source_register_case_id: sourceRegisterCaseId,
    source_register_correlation_id: sourceRegisterCorrelationId,
    items: deduped,
  };
}

// ─────────────────────────────────────────────────────────────
// PHASE 3 — PROVISIONAL BRANCH + MERGE ENGINE
// ─────────────────────────────────────────────────────────────

/**
 * Tạo Provisional / Unlinked Branch + danh sách members dự bị (Family Tree Draft).
 * Phase 6B: 1 case ↔ 1 primary_branch (đơn giản).
 * Root member của branch = primary_member của case (người đang onboarding).
 *
 * @param {object} params
 * @param {string} params.caseId
 * @param {string} params.userId
 * @param {string} params.correlationId
 * @param {object} params.branchData
 *   - name?: string
 *   - description?: string
 * @param {Array<object>} params.membersData
 *   Mảng members phụ (vợ/chồng, con, bố/mẹ, ông/bà...).
 *   Mỗi phần tử: { full_name, gender, birth_year, relation_to_root, phone_number?, ... }
 *   relation_to_root ví dụ: 'SPOUSE' | 'CHILD' | 'FATHER' | 'MOTHER' | 'GRANDFATHER' | 'GRANDMOTHER' | 'OTHER'
 * @param {string} [params.ipAddress]
 * @returns {Promise<{ caseId: string, branchId: string, memberIds: string[], status: string }>}
 *
 * Process Type: ONBOARDING_BRANCH_CREATE
 */
async function createProvisionalBranch({
  caseId,
  userId,
  correlationId,
  branchData = {},
  membersData = [],
  ipAddress = null,
}) {
  return prisma.$transaction(async (tx) => {
    const onboardingCase = await tx.onboarding_cases.findUnique({ where: { id: caseId } });

    if (!onboardingCase || onboardingCase.deleted_at) {
      throw BusinessError('ONBOARDING_CASE_NOT_FOUND', 'Hồ sơ onboarding không tồn tại.', { statusCode: 404 });
    }
    if (onboardingCase.user_id !== userId) {
      throw BusinessError('ONBOARDING_CASE_FORBIDDEN', 'Bạn không có quyền thao tác hồ sơ này.', { statusCode: 403 });
    }

    _assertCaseEditable(onboardingCase);

    if (!onboardingCase.primary_member_id) {
      throw BusinessError(
        'ONBOARDING_PROFILE_INCOMPLETE',
        'Chưa có primary_member. Vui lòng hoàn thành hồ sơ cá nhân trước.',
        { statusCode: 400 }
      );
    }

    // Nếu đã có primary_branch → không cho tạo mới (Phase 6B: 1 branch / case)
    if (onboardingCase.primary_branch_id) {
      throw BusinessError(
        'ONBOARDING_BRANCH_ALREADY_EXISTS',
        'Hồ sơ đã có nhánh dự bị. Hãy dùng updateProvisionalBranch để chỉnh sửa.',
        { statusCode: 409, existingBranchId: onboardingCase.primary_branch_id }
      );
    }

    const rootMember = await tx.members.findUnique({ where: { id: onboardingCase.primary_member_id } });
    if (!rootMember) {
      throw BusinessError('MEMBER_NOT_FOUND', 'Primary member không tồn tại.', { statusCode: 404 });
    }

    // 1. Tạo branch PROVISIONAL
    const branch = await tx.branches.create({
      data: {
        tenant_id: onboardingCase.tenant_id,
        name: branchData.name || `Nhánh của ${rootMember.full_name}`,
        description: branchData.description || 'Provisional branch — onboarding',
        status: 'PROVISIONAL',
        // root / owner
        // Tùy schema thực tế có thể có root_member_id, owner_user_id, is_provisional...
        // Dùng các field phổ biến; nếu schema khác sẽ adjust sau
        changed_by: userId,
      },
    });

    // 2. Gắn root member vào branch (nếu schema có branch_id trên members)
    try {
      await tx.members.update({
        where: { id: rootMember.id },
        data: {
          branch_id: branch.id,
          status: 'DU_BI',
          changed_by: userId,
        },
      });
    } catch (_) {
      // Một số schema dùng bảng quan hệ members_on_branches — bỏ qua nếu không có branch_id
    }

    // 3. Tạo các members phụ (DU_BI)
    const createdMemberIds = [rootMember.id];
    const createdMembersMeta = [];

    for (const m of membersData) {
      if (!m.full_name) continue;

      const newMember = await tx.members.create({
        data: {
          tenant_id: onboardingCase.tenant_id,
          full_name: m.full_name,
          gender: m.gender || null,
          birth_year: m.birth_year || null,
          phone_number: m.phone_number || m.phone || null,
          status: 'DU_BI',
          role: m.role || 'THANH_VIEN',
          branch_id: branch.id, // optional field
          // Lưu quan hệ tạm trong note/metadata nếu chưa có bảng relationships
          note: m.relation_to_root ? `relation_to_root:${m.relation_to_root}` : null,
          changed_by: userId,
        },
      });

      createdMemberIds.push(newMember.id);
      createdMembersMeta.push({
        id: newMember.id,
        full_name: newMember.full_name,
        relation_to_root: m.relation_to_root || null,
      });

      await _writeAuditLog(tx, {
        tableName: 'members',
        recordId: newMember.id,
        action: 'THEM_MOI',
        newData: {
          full_name: newMember.full_name,
          status: 'DU_BI',
          relation_to_root: m.relation_to_root || null,
          branch_id: branch.id,
        },
        tenantId: onboardingCase.tenant_id,
        changedBy: userId,
        correlationId,
      });
    }

    // 4. Update case → FAMILY_TREE_DRAFT + primary_branch_id
    const generationDepth = payloadGenerationDepth(membersData);
    const updatedCase = await tx.onboarding_cases.update({
      where: { id: caseId },
      data: {
        status: 'FAMILY_TREE_DRAFT',
        primary_branch_id: branch.id,
        metadata: {
          ...(onboardingCase.metadata || {}),
          family_tree: {
            generation_depth: generationDepth,
            member_count: createdMemberIds.length,
            root_member_id: rootMember.id,
            branch_id: branch.id,
            members: createdMembersMeta,
          },
          last_ip: ipAddress,
        },
      },
    });

    // 5. BPL
    await _writeBusinessLog(tx, {
      correlationId,
      processType: PROCESS_TYPE.ONBOARDING_BRANCH_CREATE,
      actorId: userId,
      tenantId: onboardingCase.tenant_id,
      context: {
        target_id: caseId,
        target_name: `Provisional branch created`,
        user_id: userId,
        member_id: rootMember.id,
        branch_id: branch.id,
      },
      payload: {
        branch_name: branch.name,
        member_count: createdMemberIds.length,
        generation_depth: generationDepth,
        member_ids: createdMemberIds,
      },
    });

    // 6. Audit branch
    await _writeAuditLog(tx, {
      tableName: 'branches',
      recordId: branch.id,
      action: 'THEM_MOI',
      newData: { name: branch.name, status: 'PROVISIONAL', member_count: createdMemberIds.length },
      tenantId: onboardingCase.tenant_id,
      changedBy: userId,
      correlationId,
    });

    return {
      caseId,
      branchId: branch.id,
      memberIds: createdMemberIds,
      status: updatedCase.status,
    };
  });
}

/**
 * Helper nội bộ: ước lượng generation_depth từ membersData.
 */
function payloadGenerationDepth(membersData = []) {
  if (!Array.isArray(membersData) || membersData.length === 0) return 1;
  const relations = membersData.map((m) => (m.relation_to_root || '').toUpperCase());
  if (relations.some((r) => r.includes('GRAND'))) return 4;
  if (relations.some((r) => r === 'FATHER' || r === 'MOTHER')) return 3;
  if (relations.some((r) => r === 'CHILD' || r === 'SPOUSE')) return 2;
  return Math.min(4, 1 + membersData.length);
}

/**
 * Cập nhật Provisional Branch (thêm/sửa/xóa members dự bị).
 * Chỉ khi case còn editable (DRAFT / PROFILE_COMPLETED / FAMILY_TREE_DRAFT / NEEDS_REVISION).
 *
 * @param {object} params
 * @param {string} params.caseId
 * @param {string} params.userId
 * @param {string} params.correlationId
 * @param {object} [params.branchData] - { name, description }
 * @param {Array<object>} [params.membersToAdd]
 * @param {Array<object>} [params.membersToUpdate] - { id, full_name, gender, ... }
 * @param {string[]} [params.memberIdsToRemove]
 * @returns {Promise<{ caseId: string, branchId: string, memberCount: number, status: string }>}
 *
 * Process Type: ONBOARDING_BRANCH_UPDATE
 */
async function updateProvisionalBranch({
  caseId,
  userId,
  correlationId,
  branchData = {},
  membersToAdd = [],
  membersToUpdate = [],
  memberIdsToRemove = [],
}) {
  return prisma.$transaction(async (tx) => {
    const onboardingCase = await tx.onboarding_cases.findUnique({ where: { id: caseId } });

    if (!onboardingCase || onboardingCase.deleted_at) {
      throw BusinessError('ONBOARDING_CASE_NOT_FOUND', 'Hồ sơ onboarding không tồn tại.', { statusCode: 404 });
    }
    if (onboardingCase.user_id !== userId) {
      throw BusinessError('ONBOARDING_CASE_FORBIDDEN', 'Bạn không có quyền thao tác hồ sơ này.', { statusCode: 403 });
    }

    _assertCaseEditable(onboardingCase);

    if (!onboardingCase.primary_branch_id) {
      throw BusinessError(
        'ONBOARDING_BRANCH_NOT_FOUND',
        'Chưa có nhánh dự bị. Hãy gọi createProvisionalBranch trước.',
        { statusCode: 400 }
      );
    }

    const branchId = onboardingCase.primary_branch_id;

    // 1. Update branch meta
    if (branchData.name || branchData.description) {
      try {
        await tx.branches.update({
          where: { id: branchId },
          data: {
            ...(branchData.name ? { name: branchData.name } : {}),
            ...(branchData.description ? { description: branchData.description } : {}),
            changed_by: userId,
          },
        });
      } catch (_) { /* schema variance */ }
    }

    // 2. Remove members (chỉ DU_BI, không xóa primary_member)
    const removedIds = [];
    for (const mid of memberIdsToRemove) {
      if (mid === onboardingCase.primary_member_id) continue; // không cho xóa root
      try {
        const m = await tx.members.findUnique({ where: { id: mid } });
        if (m && m.status === 'DU_BI') {
          // Soft approach: đánh dấu hoặc hard delete tùy policy.
          // Theo OPD: có thể hard-delete provisional members khi còn editable.
          await tx.members.delete({ where: { id: mid } });
          removedIds.push(mid);
        }
      } catch (_) { /* ignore */ }
    }

    // 3. Update existing members
    const updatedIds = [];
    for (const m of membersToUpdate) {
      if (!m.id) continue;
      if (m.id === onboardingCase.primary_member_id) {
        // Cho phép update thông tin root
      }
      try {
        await tx.members.update({
          where: { id: m.id },
          data: {
            ...(m.full_name !== undefined ? { full_name: m.full_name } : {}),
            ...(m.gender !== undefined ? { gender: m.gender } : {}),
            ...(m.birth_year !== undefined ? { birth_year: m.birth_year } : {}),
            ...(m.phone_number !== undefined || m.phone !== undefined
              ? { phone_number: m.phone_number || m.phone }
              : {}),
            ...(m.relation_to_root
              ? { note: `relation_to_root:${m.relation_to_root}` }
              : {}),
            changed_by: userId,
          },
        });
        updatedIds.push(m.id);
      } catch (_) { /* ignore */ }
    }

    // 4. Add new members
    const addedIds = [];
    const addedMeta = [];
    for (const m of membersToAdd) {
      if (!m.full_name) continue;
      const newMember = await tx.members.create({
        data: {
          tenant_id: onboardingCase.tenant_id,
          full_name: m.full_name,
          gender: m.gender || null,
          birth_year: m.birth_year || null,
          phone_number: m.phone_number || m.phone || null,
          status: 'DU_BI',
          role: m.role || 'THANH_VIEN',
          branch_id: branchId,
          note: m.relation_to_root ? `relation_to_root:${m.relation_to_root}` : null,
          changed_by: userId,
        },
      });
      addedIds.push(newMember.id);
      addedMeta.push({
        id: newMember.id,
        full_name: newMember.full_name,
        relation_to_root: m.relation_to_root || null,
      });

      await _writeAuditLog(tx, {
        tableName: 'members',
        recordId: newMember.id,
        action: 'THEM_MOI',
        newData: { full_name: newMember.full_name, status: 'DU_BI', branch_id: branchId },
        tenantId: onboardingCase.tenant_id,
        changedBy: userId,
        correlationId,
      });
    }

    // 5. Đếm lại member_count (best-effort)
    let memberCount = 1; // root
    try {
      memberCount = await tx.members.count({
        where: {
          branch_id: branchId,
          status: 'DU_BI',
          deleted_at: null,
        },
      });
    } catch (_) {
      memberCount = 1 + addedIds.length - removedIds.length;
    }

    // 6. Update case metadata + đảm bảo status FAMILY_TREE_DRAFT nếu đang PROFILE_COMPLETED
    const newStatus =
      onboardingCase.status === 'PROFILE_COMPLETED' ? 'FAMILY_TREE_DRAFT' : onboardingCase.status;

    await tx.onboarding_cases.update({
      where: { id: caseId },
      data: {
        status: newStatus,
        metadata: {
          ...(onboardingCase.metadata || {}),
          family_tree: {
            ...(onboardingCase.metadata?.family_tree || {}),
            member_count: memberCount,
            branch_id: branchId,
            last_updated_at: new Date().toISOString(),
            last_added: addedMeta,
            last_removed_ids: removedIds,
          },
        },
      },
    });

    // 7. BPL
    await _writeBusinessLog(tx, {
      correlationId,
      processType: PROCESS_TYPE.ONBOARDING_BRANCH_UPDATE,
      actorId: userId,
      tenantId: onboardingCase.tenant_id,
      context: {
        target_id: caseId,
        target_name: `Provisional branch updated`,
        user_id: userId,
        member_id: onboardingCase.primary_member_id,
        branch_id: branchId,
      },
      payload: {
        added_count: addedIds.length,
        updated_count: updatedIds.length,
        removed_count: removedIds.length,
        member_count: memberCount,
        added_ids: addedIds,
        removed_ids: removedIds,
      },
    });

    return {
      caseId,
      branchId,
      memberCount,
      status: newStatus,
    };
  });
}

/**
 * Ghép nhánh dự bị vào cây phả hệ chính thức.
 * Luồng trạng thái bắt buộc:
 *   APPROVED → MERGING → MERGED
 *              ↘ MERGE_FAILED (nếu lỗi, có thể retry)
 *
 * Trong transaction:
 *  - Đổi case → MERGING (optimistic lock bằng version nếu có)
 *  - Gắn branch vào vị trí target trên cây chính (targetParentMemberId)
 *  - Đổi toàn bộ members trong branch: DU_BI → CHINH_THUC
 *  - Nâng users.role của chủ hồ sơ: VIEWER → USER (hoặc EDITOR)
 *  - case → MERGED, branch → MERGED
 *  - BPL (MERGE + COMPLETE) + Audit + Notification
 *
 * @param {object} params
 * @param {string} params.caseId
 * @param {string} params.adminId              - Người thực hiện merge (CLAN_ADMIN)
 * @param {string} params.correlationId
 * @param {string} params.targetParentMemberId - Member trên cây chính sẽ làm cha/mẹ của root nhánh
 * @param {string} [params.targetRelation]     - 'CHILD' | 'ADOPTED' | ... (tùy model quan hệ)
 * @param {'USER'|'EDITOR'} [params.newUserRole='USER']
 * @param {string} [params.note]
 * @returns {Promise<{ caseId: string, branchId: string, status: string, mergedMemberCount: number }>}
 *
 * Process Types: ONBOARDING_BRANCH_MERGE + ONBOARDING_COMPLETE
 * Notifications : ONBOARDING_BRANCH_MERGED + ONBOARDING_COMPLETED
 */
async function mergeProvisionalBranch({
  caseId,
  adminId,
  correlationId,
  targetParentMemberId,
  targetRelation = 'CHILD',
  newUserRole = 'USER',
  note = null,
  onBehalfOf = null,
}) {
  // Heavy path — SEC: DB re-validate; MERGE_FAILED được commit (return, không throw sau update)
  return prisma.$transaction(async (tx) => {
    const onboardingCase = await tx.onboarding_cases.findUnique({ where: { id: caseId } });

    if (!onboardingCase || onboardingCase.deleted_at) {
      throw BusinessError('ONBOARDING_CASE_NOT_FOUND', 'Hồ sơ onboarding không tồn tại.', { statusCode: 404 });
    }

    // Chỉ merge khi APPROVED hoặc retry từ MERGE_FAILED
    if (!['APPROVED', 'MERGE_FAILED'].includes(onboardingCase.status)) {
      throw BusinessError(
        'ONBOARDING_CASE_INVALID_TRANSITION',
        `Chỉ merge được khi hồ sơ ở APPROVED hoặc MERGE_FAILED (hiện tại: ${onboardingCase.status}).`,
        { statusCode: 423, currentStatus: onboardingCase.status }
      );
    }

    if (!onboardingCase.primary_branch_id || !onboardingCase.primary_member_id) {
      throw BusinessError(
        'ONBOARDING_MERGE_PRECONDITION',
        'Thiếu primary_branch_id hoặc primary_member_id.',
        { statusCode: 400 }
      );
    }

    if (!targetParentMemberId) {
      throw BusinessError(
        'TARGET_PARENT_REQUIRED',
        'Phải chỉ định targetParentMemberId (vị trí ghép trên cây chính).',
        { statusCode: 400 }
      );
    }

    // Heavy: admin usable + same tenant
    const admin = await tx.users.findUnique({ where: { id: adminId } });
    _assertActorUsable(admin);
    _assertCaseTenantAccess(onboardingCase, admin);

    // target parent: CHINH_THUC + cùng tenant (SEC tree poisoning)
    const targetParent = await tx.members.findUnique({ where: { id: targetParentMemberId } });
    if (!targetParent || targetParent.status !== 'CHINH_THUC') {
      throw BusinessError(
        'TARGET_PARENT_INVALID',
        'targetParentMemberId không tồn tại hoặc chưa phải thành viên chính thức.',
        { statusCode: 400 }
      );
    }
    if (
      onboardingCase.tenant_id &&
      targetParent.tenant_id &&
      onboardingCase.tenant_id !== targetParent.tenant_id
    ) {
      throw BusinessError(
        'TARGET_PARENT_INVALID',
        'targetParentMemberId không thuộc cùng dòng họ với hồ sơ onboarding.',
        { statusCode: 403 }
      );
    }

    const branchId = onboardingCase.primary_branch_id;
    const rootMemberId = onboardingCase.primary_member_id;

    // ─── Bước 1: Chuyển sang MERGING ─────────────────────────
    let mergingCase;
    try {
      mergingCase = await tx.onboarding_cases.update({
        where: {
          id: caseId,
          // Optimistic lock nếu có version
          ...(typeof onboardingCase.version === 'number' ? { version: onboardingCase.version } : {}),
        },
        data: {
          status: 'MERGING',
          ...(typeof onboardingCase.version === 'number' ? { version: { increment: 1 } } : {}),
        },
      });
    } catch (e) {
      throw BusinessError(
        'ONBOARDING_CONCURRENT_MODIFICATION',
        'Hồ sơ đang được xử lý bởi tiến trình khác. Vui lòng thử lại.',
        { statusCode: 409 }
      );
    }

    try {
      // ─── Bước 2: Lấy toàn bộ members thuộc branch ──────────
      let branchMembers = [];
      try {
        branchMembers = await tx.members.findMany({
          where: {
            branch_id: branchId,
            status: 'DU_BI',
            deleted_at: null,
          },
        });
      } catch (_) {
        // Fallback: chỉ có primary_member
        const root = await tx.members.findUnique({ where: { id: rootMemberId } });
        if (root) branchMembers = [root];
      }

      // Đảm bảo root luôn có trong list
      if (!branchMembers.find((m) => m.id === rootMemberId)) {
        const root = await tx.members.findUnique({ where: { id: rootMemberId } });
        if (root) branchMembers.unshift(root);
      }

      if (branchMembers.length === 0) {
        throw new Error('NO_MEMBERS_TO_MERGE');
      }

      // ─── Bước 3: Gắn quan hệ root → targetParent ───────────
      // Tùy schema: có thể dùng parent_id, hoặc bảng relationships/edges.
      // Best-effort: set parent_id trên root member nếu field tồn tại.
      try {
        await tx.members.update({
          where: { id: rootMemberId },
          data: {
            parent_id: targetParentMemberId,
            // hoặc father_id / mother_id tùy gender target — để controller quyết định
            changed_by: adminId,
          },
        });
      } catch (_) {
        // Schema không có parent_id — quan hệ sẽ được tạo ở tầng khác (genealogy service)
      }

      // ─── Bước 4: Đổi status toàn bộ members → CHINH_THUC ───
      const mergedMemberIds = [];
      for (const m of branchMembers) {
        await tx.members.update({
          where: { id: m.id },
          data: {
            status: 'CHINH_THUC',
            changed_by: adminId,
          },
        });
        mergedMemberIds.push(m.id);

        await _writeAuditLog(tx, {
          tableName: 'members',
          recordId: m.id,
          action: 'CAP_NHAT',
          oldData: { status: 'DU_BI' },
          newData: { status: 'CHINH_THUC', merged_into_parent: targetParentMemberId },
          tenantId: onboardingCase.tenant_id,
          changedBy: adminId,
          correlationId,
        });
      }

      // ─── Bước 5: Branch → MERGED ───────────────────────────
      try {
        await tx.branches.update({
          where: { id: branchId },
          data: {
            status: 'MERGED',
            changed_by: adminId,
          },
        });
      } catch (_) { /* optional */ }

      // ─── Bước 6: Nâng quyền user ───────────────────────────
      const owner = await tx.users.findUnique({ where: { id: onboardingCase.user_id } });
      if (owner && ['VIEWER', 'GUEST', 'KHAC'].includes(owner.role)) {
        await tx.users.update({
          where: { id: onboardingCase.user_id },
          data: { role: newUserRole === 'EDITOR' ? 'EDITOR' : 'USER' },
        });

        await _writeAuditLog(tx, {
          tableName: 'users',
          recordId: onboardingCase.user_id,
          action: 'CAP_NHAT',
          oldData: { role: owner.role },
          newData: { role: newUserRole === 'EDITOR' ? 'EDITOR' : 'USER' },
          tenantId: onboardingCase.tenant_id,
          changedBy: adminId,
          correlationId,
        });
      }

      // ─── Bước 7: Case → MERGED ─────────────────────────────
      const now = new Date();
      await tx.onboarding_cases.update({
        where: { id: caseId },
        data: {
          status: 'MERGED',
          merged_at: now,
          reviewed_by: adminId,
          review_note: note || onboardingCase.review_note,
          metadata: {
            ...(onboardingCase.metadata || {}),
            merge: {
              target_parent_member_id: targetParentMemberId,
              target_relation: targetRelation,
              merged_member_ids: mergedMemberIds,
              merged_member_count: mergedMemberIds.length,
              merged_at: now.toISOString(),
              merged_by: adminId,
            },
          },
          ...(typeof onboardingCase.version === 'number' ? { version: { increment: 1 } } : {}),
        },
      });

      // ─── Bước 8: BPL — MERGE ───────────────────────────────
      await _writeBusinessLog(tx, {
        correlationId,
        processType: PROCESS_TYPE.ONBOARDING_BRANCH_MERGE,
        actorId: adminId,
        tenantId: onboardingCase.tenant_id,
        context: {
          target_id: branchId,
          target_name: `Branch merge into tree`,
          user_id: onboardingCase.user_id,
          member_id: rootMemberId,
          branch_id: branchId,
          onboarding_case_id: caseId,
        },
        payload: {
          source_branch_id: branchId,
          target_parent_member_id: targetParentMemberId,
          target_relation: targetRelation,
          merged_member_count: mergedMemberIds.length,
          merged_member_ids: mergedMemberIds,
          member_status_before: 'DU_BI',
          member_status_after: 'CHINH_THUC',
        },
      });

      // ─── Bước 9: BPL — COMPLETE ────────────────────────────
      await _writeBusinessLog(tx, {
        correlationId,
        processType: PROCESS_TYPE.ONBOARDING_COMPLETE,
        actorId: adminId,
        tenantId: onboardingCase.tenant_id,
        context: {
          target_id: caseId,
          target_name: `Onboarding completed`,
          user_id: onboardingCase.user_id,
          member_id: rootMemberId,
          branch_id: branchId,
        },
        payload: {
          final_status: 'MERGED',
          merged_member_count: mergedMemberIds.length,
          new_user_role: newUserRole === 'EDITOR' ? 'EDITOR' : 'USER',
        },
      });

      // ─── Bước 10: Notifications ────────────────────────────
      await _createNotification(tx, {
        userId: onboardingCase.user_id,
        tenantId: onboardingCase.tenant_id,
        title: 'Nhánh gia đình đã được ghép vào cây chính',
        content: `Chúc mừng! Nhánh gia đình của bạn đã được ghép thành công vào cây phả hệ. ${mergedMemberIds.length} thành viên đã trở thành chính thức.`,
        eventType: NOTIF_EVENT.ONBOARDING_BRANCH_MERGED,
        correlationId,
        level: 'IMPORTANT',
        changedBy: adminId,
      });

      await _createNotification(tx, {
        userId: onboardingCase.user_id,
        tenantId: onboardingCase.tenant_id,
        title: 'Hoàn tất quá trình nhập tộc',
        content: 'Quá trình onboarding đã hoàn tất. Bạn đã là thành viên chính thức của dòng họ.',
        eventType: NOTIF_EVENT.ONBOARDING_COMPLETED,
        correlationId,
        level: 'IMPORTANT',
        changedBy: adminId,
      });

      return {
        caseId,
        branchId,
        status: 'MERGED',
        mergedMemberCount: mergedMemberIds.length,
        mergedMemberIds,
      };
    } catch (mergeError) {
      // ─── OPD: MERGING → MERGE_FAILED (COMMIT trong TX) ──────
      // KHÔNG throw sau khi ghi MERGE_FAILED — throw sẽ rollback cả failed state.
      // Controller/service caller: nếu status==='MERGE_FAILED' → HTTP 500 + code.
      const errMsg = mergeError.message || String(mergeError);

      await tx.onboarding_cases.update({
        where: { id: caseId },
        data: {
          status: 'MERGE_FAILED',
          metadata: {
            ...(onboardingCase.metadata || {}),
            merge_error: {
              message: errMsg,
              at: new Date().toISOString(),
              target_parent_member_id: targetParentMemberId,
            },
          },
          ...(typeof onboardingCase.version === 'number' ? { version: { increment: 1 } } : {}),
        },
      });

      await _writeBusinessLog(tx, {
        correlationId,
        processType: PROCESS_TYPE.ONBOARDING_BRANCH_MERGE,
        actorId: adminId,
        tenantId: onboardingCase.tenant_id,
        processStatus: 'FAILED',
        context: _bplContext({
          target_id: caseId,
          target_name: `Branch merge FAILED`,
          user_id: onboardingCase.user_id,
          branch_id: branchId,
        }, onBehalfOf),
        payload: {
          error: errMsg,
          target_parent_member_id: targetParentMemberId,
        },
      });

      return {
        caseId,
        branchId,
        status: 'MERGE_FAILED',
        mergedMemberCount: 0,
        error: {
          code: 'ONBOARDING_MERGE_FAILED',
          message: `Ghép nhánh thất bại: ${errMsg}. Hồ sơ ở MERGE_FAILED — có thể retry.`,
          originalError: errMsg,
        },
      };
    }
  }, {
    maxWait: 10000,
    timeout: 30000,
  });
}

// ─────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────

module.exports = {
  // Constants (test / controller / SEC)
  EDITABLE_CASE_STATUSES,
  PROCESS_TYPE,
  NOTIF_EVENT,
  CRITICAL_NOTIF_EVENTS,
  BLOCKED_USER_STATUSES,
  BusinessError,

  // Phase 1
  createOnboardingCase,
  completeMemberProfile,
  executeMemberProfileCompletion, // alias Q1
  executeClanActivation,

  // Phase 2
  submitOnboardingCase,
  startReview,
  requestRevision,
  approveOnboardingCase,
  rejectOnboardingCase,
  cancelOnboardingCase,
  listReviewableOpCases,
  getCaseTimeline, // 1.5.2-FE-OP-D1
  reopenOnboardingCase, // 1.5.3-FE-OP-B3

  // Phase 3
  createProvisionalBranch,
  updateProvisionalBranch,
  mergeProvisionalBranch,
};