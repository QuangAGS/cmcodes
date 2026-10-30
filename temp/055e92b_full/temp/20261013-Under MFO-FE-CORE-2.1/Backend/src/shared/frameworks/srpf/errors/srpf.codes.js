/**
 * PATH       : backend/src/shared/frameworks/srpf/errors/srpf.codes.js
 * DATETIME   : 2026-08-13T11:40:00+07:00
 * VERSION    : 0.6.0-phase3.3
 * DESCRIPTION: SRPF error codes for Centralized Error Doctrine (CED).
 *              Pure constants — zero business import.
 *              Codes use SRPF_* prefix (underscore) to align with httpMap keys.
 */

'use strict';

const SRPF_ERROR_CODES = Object.freeze({
  PROCESS_NOT_REGISTERED: 'SRPF_PROCESS_NOT_REGISTERED',
  ACTION_NOT_SUPPORTED: 'SRPF_ACTION_NOT_SUPPORTED',
  INVALID_TRANSITION: 'SRPF_INVALID_TRANSITION',
  ENTRY_CONDITION_FAILED: 'SRPF_ENTRY_CONDITION_FAILED',
  PROFILE_INCOMPLETE: 'SRPF_PROFILE_INCOMPLETE',
  FORBIDDEN: 'SRPF_FORBIDDEN',
  INSTANCE_NOT_FOUND: 'SRPF_INSTANCE_NOT_FOUND',
  ALREADY_TERMINAL: 'SRPF_ALREADY_TERMINAL',
});

module.exports = {
  SRPF_ERROR_CODES,
};
