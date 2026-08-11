/**
 * PATH       : backend/src/shared/frameworks/srpf/constants/states.js
 * DATETIME   : 2026-08-11T14:40:00+07:00
 * VERSION    : 0.1.0-skeleton
 * DESCRIPTION: SRPF standard state constants (generic State Machine).
 *              Source of truth: Standard-Revision-Process-Framework-SRPF-v1.0-Final
 *
 * NOTE: Skeleton only — no runtime logic.
 */

'use strict';

const SRPF_STATES = Object.freeze({
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  NEEDS_REVISION: 'NEEDS_REVISION',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
});

/** Terminal states — no further normal business transitions */
const SRPF_TERMINAL_STATES = Object.freeze([
  SRPF_STATES.APPROVED,
  SRPF_STATES.REJECTED,
  SRPF_STATES.CANCELLED,
  SRPF_STATES.EXPIRED,
]);

/**
 * @param {string} state
 * @returns {boolean}
 */
function isTerminalState(state) {
  return SRPF_TERMINAL_STATES.includes(state);
}

module.exports = {
  SRPF_STATES,
  SRPF_TERMINAL_STATES,
  isTerminalState,
};
