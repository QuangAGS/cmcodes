/**
 * PATH       : backend/src/shared/frameworks/srpf/index.js
 * DATETIME   : 2026-08-11T14:40:00+07:00
 * VERSION    : 0.1.0-skeleton
 * DESCRIPTION: Public barrel for Standard Revision Process Framework (SRPF).
 *
 * Usage (future):
 *   const srpf = require('../../shared/frameworks/srpf');
 *   srpf.registry.register('MEMBER_PROMOTE', definition);
 *   await srpf.executeAction({ processType, instanceId, action, actorContext });
 *
 * NOTE: Skeleton only — no production logic.
 * SSOT: Standard-Revision-Process-Framework-SRPF-v1.0-Final
 * Architecture: SRPF-Architecture-Overview-Pseudo-code-v1.1
 */

'use strict';

const registry = require('./registry/ProcessDefinitionRegistry');
const { executeAction } = require('./engine/ActionExecutor');
const { SRPF_STATES, SRPF_TERMINAL_STATES, isTerminalState } = require('./constants/states');
const { SRPF_ACTIONS, requiresCorrelation } = require('./constants/actions');
const { SRPF_ERROR_CODES } = require('./errors/srpf.codes');

module.exports = {
  // Core API
  executeAction,
  registry,

  // Constants
  SRPF_STATES,
  SRPF_TERMINAL_STATES,
  SRPF_ACTIONS,
  SRPF_ERROR_CODES,

  // Helpers
  isTerminalState,
  requiresCorrelation,
};
