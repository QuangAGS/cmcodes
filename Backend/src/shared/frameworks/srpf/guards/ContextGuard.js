/**
 * PATH       : backend/src/shared/frameworks/srpf/guards/ContextGuard.js
 * DATETIME   : 2026-08-11T14:40:00+07:00
 * VERSION    : 0.1.0-skeleton
 * DESCRIPTION: Context Guard — checks role + contextual conditions before an Action.
 *              Roles may include SYSTEM_ADMIN, CLAN_ADMIN, MEMBER, etc.
 *
 * NOTE: Skeleton only. Real CED throw to be wired in Phase 3.
 */

'use strict';

const { SRPF_ERROR_CODES } = require('../errors/srpf.codes');

/**
 * Assert that the actor is allowed to perform the action on the instance.
 *
 * @param {object} definition - Process Definition
 * @param {string} action
 * @param {object} actorContext - { role, actor_id, tenant_id, ... }
 * @param {object} instance - current process instance
 * @returns {Promise<void>}
 * @throws when not allowed
 */
async function assertAllowed(definition, action, actorContext, instance) {
  const allowedRoles = definition.contextGuards && definition.contextGuards[action];

  if (!allowedRoles) {
    // TODO: throw createError(SRPF_ERROR_CODES.ACTION_NOT_SUPPORTED, ...)
    throw new Error(`[SRPF Skeleton] Action not supported: ${action}`);
  }

  const role = actorContext && actorContext.role;
  if (!allowedRoles.includes(role) && !allowedRoles.includes('ANY')) {
    // TODO: throw createError(SRPF_ERROR_CODES.FORBIDDEN, ...)
    throw new Error(`[SRPF Skeleton] Forbidden for role: ${role}`);
  }

  // TODO: additional instance-level checks
  // - tenant ownership for CLAN_ADMIN
  // - entryCondition already passed
  // - etc.
}

module.exports = {
  assertAllowed,
};
