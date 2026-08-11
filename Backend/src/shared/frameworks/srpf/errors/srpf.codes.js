/**
 * PATH       : backend/src/shared/frameworks/srpf/errors/srpf.codes.js
 * DATETIME   : 2026-08-11T14:40:00+07:00
 * VERSION    : 0.1.0-skeleton
 * DESCRIPTION: SRPF-specific error codes for Centralized Error Doctrine (CED).
 *              Pure constants — zero business import.
 *
 * NOTE: Skeleton only. Integrate with shared/errors later.
 */

'use strict';

const SRPF_ERROR_CODES = Object.freeze({
  PROCESS_NOT_REGISTERED: 'SRPF.PROCESS_NOT_REGISTERED',
  ACTION_NOT_SUPPORTED: 'SRPF.ACTION_NOT_SUPPORTED',
  INVALID_TRANSITION: 'SRPF.INVALID_TRANSITION',
  ENTRY_CONDITION_FAILED: 'SRPF.ENTRY_CONDITION_FAILED',
  PROFILE_INCOMPLETE: 'SRPF.PROFILE_INCOMPLETE',
  FORBIDDEN: 'SRPF.FORBIDDEN',
  INSTANCE_NOT_FOUND: 'SRPF.INSTANCE_NOT_FOUND',
  ALREADY_TERMINAL: 'SRPF.ALREADY_TERMINAL',
});

module.exports = {
  SRPF_ERROR_CODES,
};
