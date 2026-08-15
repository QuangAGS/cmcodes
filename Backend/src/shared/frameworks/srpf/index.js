/**
 * PATH       : backend/src/shared/frameworks/srpf/index.js
 * DATETIME   : 2026-08-14T18:35:00+07:00
 * VERSION    : 0.8.1-C6
 * DESCRIPTION: Public barrel for Standard Revision Process Framework (SRPF).
 *              Generic engine only — no process-definition auto-registration.
 *
 *              MEMBER_PROMOTE (ONBOARDING PROCESS - [OP] realization) lives under:
 *                modules/onboarding/srpf/
 *              Register at app/onboarding bootstrap:
 *                require('./modules/onboarding/srpf/registerMemberPromote')
 *                  .registerMemberPromote();
 *
 * Usage:
 *   const srpf = require('../../shared/frameworks/srpf');
 *   // After onboarding has registered MEMBER_PROMOTE:
 *   await srpf.executeAction({
 *     processType: 'MEMBER_PROMOTE',
 *     instanceId,
 *     action,
 *     actorContext,
 *   });
 *
 * SSOT: Standard-Revision-Process-Framework-SRPF-v1.0-Final
 * Architecture: SRPF-Architecture-Overview-Pseudo-code-v1.1
 * Contract: Register-to-OP-Handoff-Contract-2026-08-13 v1.0
 * C6: OP definition + openMemberPromoteInstance moved to modules/onboarding/srpf
 */

'use strict';

const registry = require('./registry/ProcessDefinitionRegistry');
const { executeAction } = require('./engine/ActionExecutor');
const processInstanceLoader = require('./storage/ProcessInstanceLoader');
const { SRPF_STATES, SRPF_TERMINAL_STATES, isTerminalState } = require('./constants/states');
const { SRPF_ACTIONS, requiresCorrelation } = require('./constants/actions');
const { SRPF_ERROR_CODES } = require('./errors/srpf.codes');

// C6: Do NOT auto-register MEMBER_PROMOTE here.
// Registration: modules/onboarding/srpf/registerMemberPromote.js (onboarding routes / app bootstrap).

module.exports = {
  // Core API
  executeAction,
  registry,

  // Storage (temporary: onboarding_cases)
  processInstanceLoader,

  // Constants
  SRPF_STATES,
  SRPF_TERMINAL_STATES,
  SRPF_ACTIONS,
  SRPF_ERROR_CODES,

  // Helpers
  isTerminalState,
  requiresCorrelation,
};
