/**
 * PATH       : src/modules/onboarding/onboarding.controller.js
 * DATETIME   : 2026-07-22T10:20:00+07:00
 * VERSION    : 1.2.0-W1
 * DESCRIPTION:
 * - HTTP Adapter cho Onboarding Service (OPD v1.2.0 SEC-compliant).
 * - [1.2.0-W1] Wave 1 PR-6: handleError → sendError (CED).
 * - Map MERGE_FAILED → HTTP 500 + code ổn định.
 * - Không chứa business logic.
 *
 * CHANGELOG:
 * - 1.1.0-ONBOARDING-CONTROLLER-OPD-1.2: OPD v1.2 alignment.
 * - 1.2.0-W1 (2026-07-22): sendError từ shared/errors.
 */

'use strict';

const crypto = require('crypto');
const onboardingService = require('./onboarding.service.js');
const { sendError } = require('../../shared/errors');

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

/**
 * Lấy correlationId từ header hoặc sinh mới (UUID v4).
 */
function getCorrelationId(req) {
  return (
    req.headers['x-correlation-id'] ||
    req.headers['x-request-id'] ||
    crypto.randomUUID()
  );
}

/**
 * Lấy actor (user đang đăng nhập) từ middleware auth.
 * Giả định req.user = { id, role, member_id, tenant_id, status }
 */
function getActor(req) {
  if (!req.user || !req.user.id) {
    const err = new Error('Unauthorized');
    err.statusCode = 401;
    err.code = 'UNAUTHORIZED';
    throw err;
  }
  return req.user;
}

/**
 * Chuẩn hóa response thành công.
 */
function ok(res, data, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
  });
}


/**
 * Lấy IP client.
 */
function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.ip ||
    req.connection?.remoteAddress ||
    null
  );
}

// ─────────────────────────────────────────────────────────────
// PHASE 1 CONTROLLERS
// ─────────────────────────────────────────────────────────────

/**
 * POST /onboarding/cases
 * Tạo onboarding_cases mới (DRAFT).
 * Body: { caseType?: 'MEMBER_ONBOARDING'|'CLAN_ONBOARDING', tenantId?, metadata? }
 */
async function createCase(req, res, next) {
  try {
    const actor = getActor(req);
    const correlationId = getCorrelationId(req);
    const { caseType, tenantId, metadata } = req.body || {};

    const result = await onboardingService.createOnboardingCase({
      userId: actor.id,
      tenantId: tenantId || actor.tenant_id || null,
      caseType: caseType || 'MEMBER_ONBOARDING',
      correlationId,
      metadata: metadata || {},
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] || null,
    });

    // Trả correlationId cho client trace
    res.setHeader('X-Correlation-Id', correlationId);
    return ok(res, result, 201);
  } catch (err) {
    return sendError(res, err);
  }
}

/**
 * POST /onboarding/profile
 * Hoàn thiện hồ sơ cá nhân + tạo Member DU_BI.
 * Body: { formData: { full_name, gender, birth_year, phone, full_address, province_name, ... }, caseId?, tenantId? }
 */
async function completeProfile(req, res, next) {
  try {
    const actor = getActor(req);
    const correlationId = getCorrelationId(req);
    const { formData, caseId, tenantId } = req.body || {};

    if (!formData || typeof formData !== 'object') {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'formData là bắt buộc.' },
      });
    }

    const result = await onboardingService.completeMemberProfile({
      userId: actor.id,
      tenantId: tenantId || actor.tenant_id || null,
      formData,
      correlationId,
      caseId: caseId || null,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] || null,
    });

    res.setHeader('X-Correlation-Id', correlationId);
    return ok(res, result);
  } catch (err) {
    return sendError(res, err);
  }
}

/**
 * POST /onboarding/clan/activate
 * Kích hoạt tenant (Clan Onboarding Step 4).
 * Body: { tenantId, caseId? }
 */
async function activateClan(req, res, next) {
  try {
    const actor = getActor(req);
    const correlationId = getCorrelationId(req);
    const { tenantId, caseId } = req.body || {};

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'tenantId là bắt buộc.' },
      });
    }

    const result = await onboardingService.executeClanActivation({
      userId: actor.id,
      tenantId,
      correlationId,
      caseId: caseId || null,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] || null,
    });

    res.setHeader('X-Correlation-Id', correlationId);
    return ok(res, result);
  } catch (err) {
    return sendError(res, err);
  }
}

// ─────────────────────────────────────────────────────────────
// PHASE 2 CONTROLLERS
// ─────────────────────────────────────────────────────────────

/**
 * POST /onboarding/cases/:caseId/submit
 * User gửi hồ sơ.
 * Body: { member_count?, generation_depth?, submitted_from? }
 */
async function submitCase(req, res, next) {
  try {
    const actor = getActor(req);
    const correlationId = getCorrelationId(req);
    const { caseId } = req.params;
    const payload = req.body || {};

    const result = await onboardingService.submitOnboardingCase({
      caseId,
      userId: actor.id,
      correlationId,
      payload: {
        member_count: payload.member_count,
        generation_depth: payload.generation_depth,
        submitted_from: payload.submitted_from || 'WEB',
      },
      ipAddress: getClientIp(req),
    });

    res.setHeader('X-Correlation-Id', correlationId);
    return ok(res, result);
  } catch (err) {
    return sendError(res, err);
  }
}

/**
 * POST /onboarding/cases/:caseId/review/start
 * Admin bắt đầu review.
 * Body: { note? }
 * Yêu cầu role: CLAN_ADMIN | SYSTEM_ADMIN (middleware check)
 */
async function startReview(req, res, next) {
  try {
    const actor = getActor(req);
    const correlationId = getCorrelationId(req);
    const { caseId } = req.params;
    const { note } = req.body || {};

    const result = await onboardingService.startReview({
      caseId,
      reviewerId: actor.id,
      correlationId,
      note: note || null,
    });

    res.setHeader('X-Correlation-Id', correlationId);
    return ok(res, result);
  } catch (err) {
    return sendError(res, err);
  }
}

/**
 * POST /onboarding/cases/:caseId/revision
 * Admin yêu cầu bổ sung.
 * Body: { revisionRequest: string, note? }
 */
async function requestRevision(req, res, next) {
  try {
    const actor = getActor(req);
    const correlationId = getCorrelationId(req);
    const { caseId } = req.params;
    const { revisionRequest, note } = req.body || {};

    if (!revisionRequest || !String(revisionRequest).trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'revisionRequest là bắt buộc.' },
      });
    }

    const result = await onboardingService.requestRevision({
      caseId,
      reviewerId: actor.id,
      revisionRequest,
      correlationId,
      note: note || null,
    });

    res.setHeader('X-Correlation-Id', correlationId);
    return ok(res, result);
  } catch (err) {
    return sendError(res, err);
  }
}

/**
 * POST /onboarding/cases/:caseId/approve
 * Admin phê duyệt (→ APPROVED, chưa merge).
 * Body: { reviewNote? }
 */
async function approveCase(req, res, next) {
  try {
    const actor = getActor(req);
    const correlationId = getCorrelationId(req);
    const { caseId } = req.params;
    const { reviewNote } = req.body || {};

    const result = await onboardingService.approveOnboardingCase({
      caseId,
      reviewerId: actor.id,
      correlationId,
      reviewNote: reviewNote || null,
    });

    res.setHeader('X-Correlation-Id', correlationId);
    return ok(res, result);
  } catch (err) {
    return sendError(res, err);
  }
}

/**
 * POST /onboarding/cases/:caseId/reject
 * Admin từ chối.
 * Body: { rejectionReason: string, note? }
 */
async function rejectCase(req, res, next) {
  try {
    const actor = getActor(req);
    const correlationId = getCorrelationId(req);
    const { caseId } = req.params;
    const { rejectionReason, note } = req.body || {};

    if (!rejectionReason || !String(rejectionReason).trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'rejectionReason là bắt buộc.' },
      });
    }

    const result = await onboardingService.rejectOnboardingCase({
      caseId,
      reviewerId: actor.id,
      rejectionReason,
      correlationId,
      note: note || null,
    });

    res.setHeader('X-Correlation-Id', correlationId);
    return ok(res, result);
  } catch (err) {
    return sendError(res, err);
  }
}

/**
 * POST /onboarding/cases/:caseId/cancel
 * User tự hủy hồ sơ.
 * Body: { reason? }
 */
async function cancelCase(req, res, next) {
  try {
    const actor = getActor(req);
    const correlationId = getCorrelationId(req);
    const { caseId } = req.params;
    const { reason } = req.body || {};

    const result = await onboardingService.cancelOnboardingCase({
      caseId,
      userId: actor.id,
      correlationId,
      reason: reason || null,
    });

    res.setHeader('X-Correlation-Id', correlationId);
    return ok(res, result);
  } catch (err) {
    return sendError(res, err);
  }
}

// ─────────────────────────────────────────────────────────────
// PHASE 3 CONTROLLERS
// ─────────────────────────────────────────────────────────────

/**
 * POST /onboarding/cases/:caseId/branch
 * Tạo Provisional Branch + members dự bị.
 * Body: {
 *   branchData?: { name, description },
 *   membersData?: [{ full_name, gender, birth_year, relation_to_root, phone? }]
 * }
 */
async function createBranch(req, res, next) {
  try {
    const actor = getActor(req);
    const correlationId = getCorrelationId(req);
    const { caseId } = req.params;
    const { branchData, membersData } = req.body || {};

    const result = await onboardingService.createProvisionalBranch({
      caseId,
      userId: actor.id,
      correlationId,
      branchData: branchData || {},
      membersData: Array.isArray(membersData) ? membersData : [],
      ipAddress: getClientIp(req),
    });

    res.setHeader('X-Correlation-Id', correlationId);
    return ok(res, result, 201);
  } catch (err) {
    return sendError(res, err);
  }
}

/**
 * PATCH /onboarding/cases/:caseId/branch
 * Cập nhật Provisional Branch (add/update/remove members).
 * Body: {
 *   branchData?: { name, description },
 *   membersToAdd?: [],
 *   membersToUpdate?: [{ id, ... }],
 *   memberIdsToRemove?: string[]
 * }
 */
async function updateBranch(req, res, next) {
  try {
    const actor = getActor(req);
    const correlationId = getCorrelationId(req);
    const { caseId } = req.params;
    const { branchData, membersToAdd, membersToUpdate, memberIdsToRemove } = req.body || {};

    const result = await onboardingService.updateProvisionalBranch({
      caseId,
      userId: actor.id,
      correlationId,
      branchData: branchData || {},
      membersToAdd: Array.isArray(membersToAdd) ? membersToAdd : [],
      membersToUpdate: Array.isArray(membersToUpdate) ? membersToUpdate : [],
      memberIdsToRemove: Array.isArray(memberIdsToRemove) ? memberIdsToRemove : [],
    });

    res.setHeader('X-Correlation-Id', correlationId);
    return ok(res, result);
  } catch (err) {
    return sendError(res, err);
  }
}

/**
 * POST /onboarding/cases/:caseId/merge
 * Admin ghép nhánh vào cây chính (APPROVED → MERGING → MERGED).
 * Body: {
 *   targetParentMemberId: string,   // bắt buộc
 *   targetRelation?: string,
 *   newUserRole?: 'USER' | 'EDITOR',
 *   note?
 * }
 */
async function mergeBranch(req, res, next) {
  try {
    const actor = getActor(req);
    const correlationId = getCorrelationId(req);
    const { caseId } = req.params;
    const { targetParentMemberId, targetRelation, newUserRole, note } = req.body || {};

    if (!targetParentMemberId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'targetParentMemberId là bắt buộc.' },
      });
    }

    const result = await onboardingService.mergeProvisionalBranch({
      caseId,
      adminId: actor.id,
      correlationId,
      targetParentMemberId,
      targetRelation: targetRelation || 'CHILD',
      newUserRole: newUserRole === 'EDITOR' ? 'EDITOR' : 'USER',
      note: note || null,
    });

    res.setHeader('X-Correlation-Id', correlationId);

    // OPD: MERGE_FAILED committed in TX — map HTTP 500 (không throw để tránh rollback)
    if (result && result.status === 'MERGE_FAILED') {
      return res.status(500).json({
        success: false,
        error: {
          code: (result.error && result.error.code) || 'ONBOARDING_MERGE_FAILED',
          message:
            (result.error && result.error.message) ||
            'Ghép nhánh thất bại. Hồ sơ ở MERGE_FAILED — có thể retry.',
          details: { caseId: result.caseId, status: 'MERGE_FAILED' },
        },
      });
    }

    return ok(res, result);
  } catch (err) {
    return sendError(res, err);
  }
}

// ─────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────

module.exports = {
  // Phase 1
  createCase,
  completeProfile,
  activateClan,

  // Phase 2
  submitCase,
  startReview,
  requestRevision,
  approveCase,
  rejectCase,
  cancelCase,

  // Phase 3
  createBranch,
  updateBranch,
  mergeBranch,
};
