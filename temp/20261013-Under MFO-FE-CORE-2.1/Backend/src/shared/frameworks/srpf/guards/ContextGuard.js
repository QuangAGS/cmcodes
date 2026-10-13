/**
 * PATH       : backend/src/shared/frameworks/srpf/guards/ContextGuard.js
 * DATETIME   : 2026-08-13T11:40:00+07:00
 * VERSION    : 0.6.0-phase3.3
 * DESCRIPTION: Context Guard — CED throws (Phase 3.3).
 */

'use strict';

const { srpfError, SRPF_ERROR_CODES } = require('../errors/srpfCreateError');

/**
 * @param {object} definition
 * @param {string} action
 * @param {object} actorContext
 * @param {object} instance
 */
async function assertAllowed(definition, action, actorContext, instance) {
  const allowedRoles = definition.contextGuards && definition.contextGuards[action];

  if (!allowedRoles) {
    throw srpfError(
      SRPF_ERROR_CODES.ACTION_NOT_SUPPORTED,
      `Action not supported: ${action}`,
      { details: { action, processType: definition.processType } }
    );
  }

  const role = actorContext && actorContext.role;
  if (!allowedRoles.includes(role) && !allowedRoles.includes('ANY')) {
    throw srpfError(
      SRPF_ERROR_CODES.FORBIDDEN,
      `Forbidden for role: ${role}`,
      {
        details: {
          role,
          action,
          allowedRoles,
          instanceId: instance && instance.id,
        },
      }
    );
  }
}

module.exports = {
  assertAllowed,
};
