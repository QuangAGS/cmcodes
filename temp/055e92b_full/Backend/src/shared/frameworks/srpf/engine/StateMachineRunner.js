/**
 * PATH       : backend/src/shared/frameworks/srpf/engine/StateMachineRunner.js
 * DATETIME   : 2026-10-14T12:00:00+07:00
 * VERSION    : 0.3.1-FIX-TERMINAL-OVERRIDE
 * DESCRIPTION:
 * - Vá dứt điểm Bug 1 (SRPF_INVALID_TRANSITION khi SUBMIT Cửa 2 ở trạng thái APPROVED).
 * - Cho phép tra cứu definition.transitions riêng trước khi rơi vào fallback check Terminal mặc định.
 * RULE COMPLIANCE:
 * - Q1 (Bảo tồn): Bảo toàn 100% logic apply, buildOnboardingCasePatch và DEFAULT_TRANSITIONS.
 * - Q2 (Code Format): Đầy đủ docstring header và chú thích thời gian <2026-10-14T12:00:00+07:00>.
 */

'use strict';

const { SRPF_STATES, isTerminalState } = require('../constants/states');
const { SRPF_ACTIONS } = require('../constants/actions');
const { normalizeFromOnboardingCase } = require('../storage/ProcessInstanceLoader');

/**
 * Default transition map (fromState → { action → toState }).
 * Process Definitions may supply a custom transitions object.
 */
const DEFAULT_TRANSITIONS = Object.freeze({
  [SRPF_STATES.DRAFT]: {
    [SRPF_ACTIONS.SUBMIT]: SRPF_STATES.SUBMITTED,
    [SRPF_ACTIONS.CANCEL]: SRPF_STATES.CANCELLED,
    [SRPF_ACTIONS.SAVE_DRAFT]: SRPF_STATES.DRAFT,
  },
  [SRPF_STATES.SUBMITTED]: {
    [SRPF_ACTIONS.START_REVIEW]: SRPF_STATES.UNDER_REVIEW,
    [SRPF_ACTIONS.CANCEL]: SRPF_STATES.CANCELLED,
  },
  [SRPF_STATES.UNDER_REVIEW]: {
    [SRPF_ACTIONS.RETURN_FOR_REVISION]: SRPF_STATES.NEEDS_REVISION,
    [SRPF_ACTIONS.APPROVE]: SRPF_STATES.APPROVED,
    [SRPF_ACTIONS.REJECT]: SRPF_STATES.REJECTED,
    [SRPF_ACTIONS.CANCEL]: SRPF_STATES.CANCELLED,
  },
  [SRPF_STATES.NEEDS_REVISION]: {
    [SRPF_ACTIONS.SUBMIT]: SRPF_STATES.SUBMITTED,
    [SRPF_ACTIONS.CANCEL]: SRPF_STATES.CANCELLED,
    [SRPF_ACTIONS.SAVE_DRAFT]: SRPF_STATES.NEEDS_REVISION,
  },
});

/**
 * <2026-10-14T12:00:00+07:00>
 * Purpose: Ưu tiên tra cứu ma trận transitions trong definition trước để cho phép Cửa 2 chuyển từ APPROVED sang UNDER_REVIEW.
 */
function resolve(definition, currentState, action) {
  const table = definition?.transitions || DEFAULT_TRANSITIONS;
  const fromMap = table[currentState];

  // Nếu definition có khai báo transition cụ thể cho (currentState + action), ưu tiên sử dụng
  if (fromMap && fromMap[action]) {
    return fromMap[action];
  }

  // Nếu không có khai báo riêng trong definition, áp dụng chốt chặn terminal mặc định
  if (isTerminalState(currentState)) {
    return null;
  }

  return null;
}

/**
 * Build Prisma data patch for onboarding_cases based on action + nextState.
 */
function buildOnboardingCasePatch(nextState, action, payload = {}, actorContext = {}) {
  const now = new Date();
  const data = {
    status: nextState,
  };

  const actorId = actorContext.actor_id || actorContext.user_id || null;
  if (actorId) {
    data.changed_by = actorId;
  }

  switch (action) {
    case SRPF_ACTIONS.SUBMIT:
      data.submitted_at = now;
      break;
    case SRPF_ACTIONS.START_REVIEW:
      data.reviewed_at = now;
      if (actorId) data.reviewed_by = actorId;
      break;
    case SRPF_ACTIONS.RETURN_FOR_REVISION:
      data.reviewed_at = now;
      if (actorId) data.reviewed_by = actorId;
      if (payload.revision_request != null) {
        data.revision_request = String(payload.revision_request);
      }
      if (payload.review_note != null) {
        data.review_note = String(payload.review_note);
      }
      break;
    case SRPF_ACTIONS.APPROVE:
      data.approved_at = now;
      data.reviewed_at = data.reviewed_at || now;
      if (actorId) data.reviewed_by = actorId;
      if (payload.review_note != null) {
        data.review_note = String(payload.review_note);
      }
      break;
    case SRPF_ACTIONS.REJECT:
      data.rejected_at = now;
      data.reviewed_at = data.reviewed_at || now;
      if (actorId) data.reviewed_by = actorId;
      if (payload.rejection_reason != null) {
        data.rejection_reason = String(payload.rejection_reason);
      }
      if (payload.review_note != null) {
        data.review_note = String(payload.review_note);
      }
      break;
    case SRPF_ACTIONS.CANCEL:
    case SRPF_ACTIONS.WITHDRAW:
      data.cancelled_at = now;
      break;
    default:
      break;
  }

  return data;
}

/**
 * Apply transition — persist new state on the instance.
 */
async function apply(tx, instance, nextState, action, payload = {}, options = {}) {
  if (!tx || typeof tx.onboarding_cases?.update !== 'function') {
    throw new Error('[SRPF] StateMachineRunner.apply requires a Prisma transaction client (tx)');
  }
  if (!instance || !instance.id) {
    throw new Error('[SRPF] StateMachineRunner.apply: invalid instance');
  }
  if (!nextState) {
    throw new Error('[SRPF] StateMachineRunner.apply: nextState is required');
  }

  const storage = instance._storage || 'onboarding_cases';
  if (storage === 'proposals') {
    return { ...instance, status: nextState, currentState: nextState };
  }
  if (storage !== 'onboarding_cases') {
    throw new Error(`[SRPF] StateMachineRunner.apply: unsupported storage "${storage}"`);
  }

  const actorContext = options.actorContext || {};
  const data = buildOnboardingCasePatch(nextState, action, payload, actorContext);

  const updatedRow = await tx.onboarding_cases.update({
    where: { id: instance.id },
    data,
  });

  return normalizeFromOnboardingCase(updatedRow);
}

module.exports = {
  resolve,
  apply,
  DEFAULT_TRANSITIONS,
  buildOnboardingCasePatch,
};