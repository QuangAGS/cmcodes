/**
 * PATH       : backend/src/shared/frameworks/srpf/engine/StateMachineRunner.js
 * DATETIME   : 2026-08-11T18:55:00+07:00
 * VERSION    : 0.3.0-phase3.5
 * DESCRIPTION: Resolves and applies state transitions for SRPF.
 *
 * Phase 3.5:
 * - apply() persists status onto onboarding_cases (temporary storage).
 * - Sets related timestamps by action when applicable.
 *
 * Long-term note: prefer dedicated process_instances model.
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
 * Resolve next state for (currentState, action) given a definition.
 * @param {object} definition
 * @param {string} currentState
 * @param {string} action
 * @returns {string|null} nextState or null if transition is invalid
 */
function resolve(definition, currentState, action) {
  if (isTerminalState(currentState)) {
    return null;
  }

  const table = definition.transitions || DEFAULT_TRANSITIONS;
  const fromMap = table[currentState];
  if (!fromMap) return null;

  return fromMap[action] || null;
}

/**
 * Build Prisma data patch for onboarding_cases based on action + nextState.
 * @param {string} nextState
 * @param {string} action
 * @param {object} [payload]
 * @param {object} [actorContext]
 * @returns {object}
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

  // Optional metadata merge (shallow) if payload.metadata is an object
  if (payload.metadata && typeof payload.metadata === 'object') {
    // Caller should pass full metadata if they need merge; keep simple in v1:
    // only set when explicitly provided as replacement fragment under payload.metadata_patch
  }
  if (payload.metadata_patch && typeof payload.metadata_patch === 'object') {
    // Applied by caller via read-modify if needed; skip deep merge here for safety
  }

  return data;
}

/**
 * Apply transition — persist new state on the instance.
 *
 * Temporary storage: onboarding_cases.
 * Long-term: process_instances (Architecture v1.1 note).
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {object} instance - normalized instance from ProcessInstanceLoader
 * @param {string} nextState
 * @param {string} action
 * @param {object} [payload]
 * @param {object} [options]
 * @param {object} [options.actorContext]
 * @returns {Promise<object>} updated normalized instance
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
