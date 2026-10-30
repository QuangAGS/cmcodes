/**
 * PATH       : src/services/onboarding.service.js
 * DATETIME   : 2026-08-15T18:30:00+07:00
 * VERSION    : 1.1.0-PR1-process-kind
 * DESCRIPTION: (+ PR-1) process_kind REGISTER khi createCaseFromRegister;
             findOpenCaseByUser chỉ RP (process_kind REGISTER).
 * - Domain service cho onboarding_cases (dùng chung).
 * - M1: createCaseFromRegister → status SUBMITTED + submitted_at (override default DRAFT).
 * - Chuẩn bị 1b: updateCaseStatus (APPROVED / REJECTED / UNDER_REVIEW…).
 * - Không ghi BPL / audit / notification (orchestration tại auth.service).
 * - Q1: không đụng users/members; chỉ aggregate state của case.
 */

'use strict';

const { basePrisma } = require('../lib/prisma.js');

/**
 * Timestamp fields theo onboarding_case_status (OPD).
 * @param {string} status
 * @returns {Object} partial data for update
 */
function timestampsForStatus(status) {
  const now = new Date();
  switch (status) {
    case 'SUBMITTED':
      return { submitted_at: now };
    case 'UNDER_REVIEW':
      return { reviewed_at: now };
    case 'APPROVED':
      return { approved_at: now, reviewed_at: now };
    case 'REJECTED':
      return { rejected_at: now };
    case 'MERGED':
      return { merged_at: now };
    case 'CANCELLED':
      return { cancelled_at: now };
    case 'EXPIRED':
      return { expired_at: now };
    default:
      return {};
  }
}

const onboardingService = {
  /**
   * Tạo case ngay sau Register (Join hoặc CreateClan) — ngoài TX user (M1).
   *
   * @param {Object} input
   * @param {string} input.correlationId - Root correlation (unique trên case)
   * @param {string} input.caseType - MEMBER_JOIN | CLAN_SETUP
   * @param {string} input.userId
   * @param {string|null} [input.tenantId]
   * @param {string} [input.changedBy] - mặc định = userId
   * @param {Object} [input.metadata]
   * @param {Object} [input.client] - Prisma client (mặc định basePrisma)
   * @returns {Promise<Object>} onboarding_cases row
   */
  createCaseFromRegister: async (input = {}) => {
    const {
      correlationId,
      caseType,
      userId,
      tenantId = null,
      changedBy = null,
      metadata = {},
      client = basePrisma,
    } = input;

    if (!correlationId || typeof correlationId !== 'string') {
      throw new Error(
        '[onboardingService.createCaseFromRegister]: correlationId is required'
      );
    }
    if (!caseType) {
      throw new Error(
        '[onboardingService.createCaseFromRegister]: caseType is required'
      );
    }
    if (!userId) {
      throw new Error(
        '[onboardingService.createCaseFromRegister]: userId is required'
      );
    }

    const allowedTypes = ['MEMBER_JOIN', 'CLAN_SETUP'];
    if (!allowedTypes.includes(caseType)) {
      throw new Error(
        `[onboardingService.createCaseFromRegister]: invalid caseType "${caseType}"`
      );
    }

    const now = new Date();
    const actorId = changedBy || userId;

    //1.1.0-PR1-process-kind
    return client.onboarding_cases.create({
      data: {
        correlation_id: correlationId,
        case_type: caseType,
        process_kind: 'REGISTER', // PR-1: RP case
        status: 'SUBMITTED',
        user_id: userId,
        tenant_id: tenantId || null,
        submitted_at: now,
        changed_by: actorId,
        metadata:
          metadata && typeof metadata === 'object' ? metadata : {},
      },
    });
  },

  /**
   * Cập nhật status case + timestamp tương ứng (dùng cho 1b / OPD).
   * M1: skeleton — có thể gọi sau khi admin duyệt.
   *
   * @param {Object} input
   * @param {string} [input.caseId]
   * @param {string} [input.correlationId] - dùng nếu không có caseId
   * @param {string} input.status
   * @param {string} input.changedBy
   * @param {string} [input.reviewedBy]
   * @param {string} [input.reviewNote]
   * @param {string} [input.rejectionReason]
   * @param {Object} [input.client] - truyền tx khi 1b atomic
   * @returns {Promise<Object>}
   */
  updateCaseStatus: async (input = {}) => {
    const {
      caseId,
      correlationId,
      status,
      changedBy,
      reviewedBy = null,
      reviewNote = null,
      rejectionReason = null,
      client = basePrisma,
    } = input;

    if (!status) {
      throw new Error(
        '[onboardingService.updateCaseStatus]: status is required'
      );
    }
    if (!changedBy) {
      throw new Error(
        '[onboardingService.updateCaseStatus]: changedBy is required'
      );
    }
    if (!caseId && !correlationId) {
      throw new Error(
        '[onboardingService.updateCaseStatus]: caseId or correlationId is required'
      );
    }

    const where = caseId
      ? { id: caseId, deleted_at: null }
      : { correlation_id: correlationId, deleted_at: null };

    const existing = await client.onboarding_cases.findFirst({ where });
    if (!existing) {
      throw new Error(
        '[onboardingService.updateCaseStatus]: onboarding case not found'
      );
    }

    const data = {
      status,
      changed_by: changedBy,
      updated_at: new Date(),
      ...timestampsForStatus(status),
    };

    if (reviewedBy) data.reviewed_by = reviewedBy;
    if (reviewNote != null) data.review_note = reviewNote;
    if (rejectionReason != null) data.rejection_reason = rejectionReason;

    return client.onboarding_cases.update({
      where: { id: existing.id },
      data,
    });
  },

  /**
   * Tìm case đang mở theo user (tránh duplicate / backfill).
   *
   * @param {string} userId
   * @param {string|null} [tenantId]
   * @param {Object} [client]
   * @returns {Promise<Object|null>}
   */
  findOpenCaseByUser: async (userId, tenantId = null, client = basePrisma) => {
    if (!userId) {
      throw new Error(
        '[onboardingService.findOpenCaseByUser]: userId is required'
      );
    }

    const openStatuses = [
      'DRAFT',
      'PROFILE_COMPLETED',
      'FAMILY_TREE_DRAFT',
      'SUBMITTED',
      'UNDER_REVIEW',
      'NEEDS_REVISION',
    ];

    return client.onboarding_cases.findFirst({
      where: {
        user_id: userId,
        deleted_at: null,
        process_kind: 'REGISTER', // PR-1: chỉ RP
        status: { in: openStatuses },
        ...(tenantId ? { tenant_id: tenantId } : {}),
      },
      orderBy: { created_at: 'desc' },
    });
  },
};

module.exports = onboardingService;