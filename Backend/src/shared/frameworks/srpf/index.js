/**
 * PATH       : backend/src/shared/frameworks/srpf/index.js
 * DATETIME   : 2026-08-12T16:45:00+07:00
 * VERSION    : 0.5.1-phase3.6
 * DESCRIPTION: Public barrel for Standard Revision Process Framework (SRPF).
 *              Auto-registers MEMBER_PROMOTE definition on load.
 *
 * Usage:
 *   const srpf = require('../../shared/frameworks/srpf');
 *   await srpf.executeAction({ processType: 'MEMBER_PROMOTE', instanceId, action, actorContext });
 *
 * SSOT: Standard-Revision-Process-Framework-SRPF-v1.0-Final
 * Architecture: SRPF-Architecture-Overview-Pseudo-code-v1.1
 */

'use strict';

const registry = require('./registry/ProcessDefinitionRegistry');
const { executeAction } = require('./engine/ActionExecutor');
const processInstanceLoader = require('./storage/ProcessInstanceLoader');
const { SRPF_STATES, SRPF_TERMINAL_STATES, isTerminalState } = require('./constants/states');
const { SRPF_ACTIONS, requiresCorrelation } = require('./constants/actions');
const { SRPF_ERROR_CODES } = require('./errors/srpf.codes');

// Auto-register built-in process definitions
const { registerMemberPromoteDefinition } = require('./definitions/MemberPromote.definition');
registerMemberPromoteDefinition(registry);

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
