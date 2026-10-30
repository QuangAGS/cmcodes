/**
 * PATH       : backend/src/shared/errors/codes/srpf.codes.js
 * DATETIME   : 2026-08-13T11:40:00+07:00
 * VERSION    : 0.6.0-phase3.3
 * DESCRIPTION: CED domain codes for SRPF (mirror of frameworks/srpf/errors/srpf.codes.js).
 *              Pure constants — zero business import.
 */

'use strict';

const SRPF = Object.freeze({
  PROCESS_NOT_REGISTERED: 'SRPF_PROCESS_NOT_REGISTERED',
  ACTION_NOT_SUPPORTED: 'SRPF_ACTION_NOT_SUPPORTED',
  INVALID_TRANSITION: 'SRPF_INVALID_TRANSITION',
  ENTRY_CONDITION_FAILED: 'SRPF_ENTRY_CONDITION_FAILED',
  PROFILE_INCOMPLETE: 'SRPF_PROFILE_INCOMPLETE',
  FORBIDDEN: 'SRPF_FORBIDDEN',
  INSTANCE_NOT_FOUND: 'SRPF_INSTANCE_NOT_FOUND',
  ALREADY_TERMINAL: 'SRPF_ALREADY_TERMINAL',
});

module.exports = SRPF;
