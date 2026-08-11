/**
 * PATH       : backend/src/shared/frameworks/srpf/engine/StateMachineRunner.js
 * DATETIME   : 2026-08-11T14:40:00+07:00
 * VERSION    : 0.1.0-skeleton
 * DESCRIPTION: Resolves and applies state transitions for SRPF.
 *
 * NOTE: Skeleton only — default transition table is placeholder.
 *       Process Definition may override via definition.transitions.
 */

'use strict';

const { SRPF_STATES, isTerminalState } = require('../constants/states');
const { SRPF_ACTIONS } = require('../constants/actions');

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
 * Apply transition (persist new state on the instance).
 * Implementation is intentionally left as TODO — depends on storage strategy
 * (onboarding_cases vs future process_instances).
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {object} instance
 * @param {string} nextState
 * @param {string} action
 * @param {object} [payload]
 * @returns {Promise<object>} updated instance
 */
async function apply(tx, instance, nextState, action, payload) {
  // TODO (Phase 3):
  // - Persist state change according to storage strategy
  // - Temporary: map onto onboarding_cases (+ metadata)
  // - Long-term note: prefer dedicated process_instances model
  throw new Error('StateMachineRunner.apply is not implemented (skeleton)');
}

module.exports = {
  resolve,
  apply,
  DEFAULT_TRANSITIONS,
};
