/**
 * PATH       : src/modules/onboarding/onboarding.controller.js
 * DATETIME: 2026-08-22T15:40:00+07:00
 * VERSION: 1.5.3-FE-OP-B3
 * DESCRIPTION: ... + getMyOp + listReviewable + timeline + B3 note/reject/reopen.
 * 1.3.0-W2:
 * - HTTP Adapter cho Onboarding Service (OPD v1.2.0 SEC-compliant).
 * - [1.2.0-W1] handleError → sendError (CED).
 * - [1.3.0-W2] Wave 2 PR-W2-4: Validation sớm → throw + sendError (dual-contract).
 * - Map MERGE_FAILED → HTTP 500 + code ổn định.
 * - Không chứa business logic.
 *
 * CHANGELOG:
 * - 1.1.0-ONBOARDING-CONTROLLER-OPD-1.2: OPD v1.2 alignment.
 * - 1.2.0-W1 (2026-07-22): sendError từ shared/errors.
 * - 1.3.0-W2 (2026-07-25): Validation sớm dual-contract (PR-W2-4).
 * - 1.4.0-FE-OP-B1 (2026-08-16): getMyOp — không business logic trong controller.
 * - 1.5.2-FE-OP-D1 (2026-08-22): GET /cases/:caseId/timeline.
 * - 1.5.3-FE-OP-B3 (2026-08-22): note bắt buộc approve/revision/reject; finalReject; reopen.
 */

'use strict';

const crypto = require('crypto');
const onboardingService = require('./onboarding.service.js');
const { sendError } = require('../../shared/errors');
const { getMyOpInstance } = require('./srpf');

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function getCorrelationId(req) {
  return (
    req.headers['x-correlation-id'] ||
    req.headers['x-request-id'] ||
    crypto.randomUUID()
  );
}

function getActor(req) {
  if (!req.user || !req.user.id) {
    const err = new Error('Unauthorized');
    err.statusCode = 401;
    err.code = 'UNAUTHORIZED';
    err.isOperational = true;
    throw err;
  }
  return req.user;
}

function ok(res, data, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
  });
}

function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.ip ||
    req.connection?.remoteAddress ||
    null
  );
}

/** Helper validation → dual-contract qua sendError */
function validationError(message) {
  const err = new Error(message);
  err.statusCode = 400;
  err.code = 'VALIDATION_ERROR';
  err.isOperational = true;
  return err;
}

/** 1.4.0-FE-OP-B1
 * Thêm helper lấy userId an toàn (sau getActor, trước PHASE 1) — tránh lệch id vs userId trên JWT
 */
function getActorUserId(req) {
  const actor = getActor(req);
  const userId = actor.id || actor.userId || actor.sub || null;
  if (!userId) {
    const err = new Error('Unauthorized');
    err.statusCode = 401;
    err.code = 'UNAUTHORIZED';
    err.isOperational = true;
    throw err;
  }
  return userId;
}


// ─────────────────────────────────────────────────────────────
// PHASE 1
// ─────────────────────────────────────────────────────────────

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

    res.setHeader('X-Correlation-Id', correlationId);
    return ok(res, result, 201);
  } catch (err) {
    return sendError(res, err);
  }
}

async function completeProfile(req, res, next) {
  try {
    const actor = getActor(req);
    const correlationId = getCorrelationId(req);
    const { formData, caseId, tenantId } = req.body || {};

    if (!formData || typeof formData !== 'object') {
      throw validationError('formData là bắt buộc.');
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

async function activateClan(req, res, next) {
  try {
    const actor = getActor(req);
    const correlationId = getCorrelationId(req);
    const { tenantId, caseId } = req.body || {};

    if (!tenantId) {
      throw validationError('tenantId là bắt buộc.');
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
// PHASE 2
// ─────────────────────────────────────────────────────────────

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

async function requestRevision(req, res, next) {
  try {
    const actor = getActor(req);
    const correlationId = getCorrelationId(req);
    const { caseId } = req.params;
    const { revisionRequest, note } = req.body || {};

    if (!revisionRequest || !String(revisionRequest).trim()) {
      throw validationError('revisionRequest là bắt buộc.');
    }
    if (!note || !String(note).trim()) {
      throw validationError('note là bắt buộc.');
    }

    const result = await onboardingService.requestRevision({
      caseId,
      reviewerId: actor.id,
      revisionRequest,
      correlationId,
      note,
    });

    res.setHeader('X-Correlation-Id', correlationId);
    return ok(res, result);
  } catch (err) {
    return sendError(res, err);
  }
}

async function approveCase(req, res, next) {
  try {
    const actor = getActor(req);
    const correlationId = getCorrelationId(req);
    const { caseId } = req.params;
    const { reviewNote, note } = req.body || {};
    const noteText = reviewNote || note || null;

    if (!noteText || !String(noteText).trim()) {
      throw validationError('reviewNote (ghi chú phê duyệt) là bắt buộc.');
    }

    const result = await onboardingService.approveOnboardingCase({
      caseId,
      reviewerId: actor.id,
      correlationId,
      reviewNote: noteText,
    });

    res.setHeader('X-Correlation-Id', correlationId);
    return ok(res, result);
  } catch (err) {
    return sendError(res, err);
  }
}

async function rejectCase(req, res, next) {
  try {
    const actor = getActor(req);
    const correlationId = getCorrelationId(req);
    const { caseId } = req.params;
    const { rejectionReason, note, finalReject } = req.body || {};

    if (!rejectionReason || !String(rejectionReason).trim()) {
      throw validationError('rejectionReason là bắt buộc.');
    }

    const result = await onboardingService.rejectOnboardingCase({
      caseId,
      reviewerId: actor.id,
      rejectionReason,
      correlationId,
      note: note || rejectionReason,
      finalReject: !!finalReject,
    });

    res.setHeader('X-Correlation-Id', correlationId);
    return ok(res, result);
  } catch (err) {
    return sendError(res, err);
  }
}

async function reopenCase(req, res, next) {
  try {
    const actor = getActor(req);
    const correlationId = getCorrelationId(req);
    const { caseId } = req.params;
    const { note } = req.body || {};

    const result = await onboardingService.reopenOnboardingCase({
      caseId,
      userId: actor.id,
      correlationId,
      note: note || null,
    });

    res.setHeader('X-Correlation-Id', correlationId);
    return ok(res, result);
  } catch (err) {
    return sendError(res, err);
  }
}

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
// PHASE 3
// ─────────────────────────────────────────────────────────────

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

async function mergeBranch(req, res, next) {
  try {
    const actor = getActor(req);
    const correlationId = getCorrelationId(req);
    const { caseId } = req.params;
    const { targetParentMemberId, targetRelation, newUserRole, note } = req.body || {};

    if (!targetParentMemberId) {
      throw validationError('targetParentMemberId là bắt buộc.');
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

    // OPD: MERGE_FAILED committed in TX — map HTTP 500 qua sendError
    if (result && result.status === 'MERGE_FAILED') {
      const err = new Error(
        (result.error && result.error.message) ||
          'Ghép nhánh thất bại. Hồ sơ ở MERGE_FAILED — có thể retry.'
      );
      err.statusCode = 500;
      err.code = (result.error && result.error.code) || 'ONBOARDING_MERGE_FAILED';
      err.isOperational = true;
      err.details = { caseId: result.caseId, status: 'MERGE_FAILED' };
      return sendError(res, err);
    }

    return ok(res, result);
  } catch (err) {
    return sendError(res, err);
  }
}

/** 1.4.0-FE-OP-B1
 * GET /onboarding/my-op
 * Read-only OP status for current user (FE hub / guard).
 * DATETIME: 2026-08-16T20:00:00+07:00
 * VERSION: 1.0.0-FE-OP-B1
 */
async function getMyOp(req, res, next) {
  try {
    const userId = getActorUserId(req);
    const data = await getMyOpInstance({ userId });
    return ok(res, data);
  } catch (err) {
    return sendError(res, err);
  }
}
/**
 * GET /onboarding/cases/reviewable
 * DATETIME: 2026-08-18T10:30:00+07:00
 * VERSION: 1.5.0-FE-OP-B2
 */
async function listReviewableOpCases(req, res, next) {
  try {
    const actor = getActor(req);
    const correlationId = getCorrelationId(req);

    const data = await onboardingService.listReviewableOpCases({
      actor,
      processKind: req.query.process_kind || 'MEMBER_PROMOTE',
      caseType: req.query.case_type || null,
      statusCsv: req.query.status || 'SUBMITTED,UNDER_REVIEW',
      page: Number(req.query.page) || 1,
      pageSize: Number(req.query.pageSize) || 20,
    });

    res.setHeader('X-Correlation-Id', correlationId);
    return ok(res, data);
  } catch (err) {
    return sendError(res, err);
  }
}

/**
 * GET /onboarding/cases/:caseId/timeline
 * FE-OP-D1: RP + OP BPL timeline (payload.action ưu tiên)
 */
async function getCaseTimeline(req, res, next) {
  try {
    const actor = getActor(req);
    const correlationId = getCorrelationId(req);
    const caseId = req.params.caseId;

    const data = await onboardingService.getCaseTimeline({
      caseId,
      actor,
    });

    res.setHeader('X-Correlation-Id', correlationId);
    return ok(res, data);
  } catch (err) {
    return sendError(res, err);
  }
}

// ─────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────

module.exports = {
  createCase,
  completeProfile,
  activateClan,
  submitCase,
  startReview,
  requestRevision,
  approveCase,
  rejectCase,
  cancelCase,
  createBranch,
  updateBranch,
  mergeBranch,
  getMyOp, // 1.4.0-FE-OP-B1
  listReviewableOpCases, // 1.5.0-FE-OP-B2
  getCaseTimeline, // 1.5.2-FE-OP-D1
  reopenCase, // 1.5.3-FE-OP-B3
};