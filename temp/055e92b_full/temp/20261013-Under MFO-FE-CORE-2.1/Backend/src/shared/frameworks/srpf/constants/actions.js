/**
 * PATH       : backend/src/shared/frameworks/srpf/constants/actions.js
 * DATETIME   : 2026-08-11T14:40:00+07:00
 * VERSION    : 0.1.0-skeleton
 * DESCRIPTION: SRPF standard action constants.
 *              Source of truth: Standard-Revision-Process-Framework-SRPF-v1.0-Final
 *
 * NOTE: Skeleton only — no runtime logic.
 *       SAVE_DRAFT does NOT generate Correlation (Architecture v1.1 decision).
 */

'use strict';

const SRPF_ACTIONS = Object.freeze({
  CREATE: 'CREATE',
  START: 'START',
  SAVE_DRAFT: 'SAVE_DRAFT',
  SUBMIT: 'SUBMIT',
  START_REVIEW: 'START_REVIEW',
  RETURN_FOR_REVISION: 'RETURN_FOR_REVISION',
  APPROVE: 'APPROVE',
  REJECT: 'REJECT',
  CANCEL: 'CANCEL',
  WITHDRAW: 'WITHDRAW',
});

/**
 * Actions that MUST generate a new Correlation_id.
 * SAVE_DRAFT is intentionally excluded.
 */
const SRPF_ACTIONS_REQUIRING_CORRELATION = Object.freeze([
  SRPF_ACTIONS.SUBMIT,
  SRPF_ACTIONS.START_REVIEW,
  SRPF_ACTIONS.RETURN_FOR_REVISION,
  SRPF_ACTIONS.APPROVE,
  SRPF_ACTIONS.REJECT,
  SRPF_ACTIONS.CANCEL,
  SRPF_ACTIONS.WITHDRAW,
  // CREATE / START — decide per Process Definition if needed
]);

/**
 * @param {string} action
 * @returns {boolean}
 */
function requiresCorrelation(action) {
  return SRPF_ACTIONS_REQUIRING_CORRELATION.includes(action);
}

module.exports = {
  SRPF_ACTIONS,
  SRPF_ACTIONS_REQUIRING_CORRELATION,
  requiresCorrelation,
};
