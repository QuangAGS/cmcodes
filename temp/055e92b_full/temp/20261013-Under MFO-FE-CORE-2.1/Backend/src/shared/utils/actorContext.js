/**
 * PATH       : src/shared/utils/actorContext.js
 * DATETIME   : 2026-07-27T18:15:00+07:00
 * VERSION    : 1.0.0-W5
 * DESCRIPTION:
 * - PR-W5-1: SEC D — actor vs subject (on_behalf_of).
 * - Không ghi đè req.user.userId.
 */

'use strict';

/**
 * @param {import('express').Request} req
 * @param {{ onBehalfOf?: string|null }} [opts]
 */
function buildActorContext(req, opts = {}) {
  const user = req.user || {};
  const actorId = user.userId || user.id || user.sub || null;
  const onBehalfOf =
    opts.onBehalfOf ||
    req.body?.on_behalf_of ||
    req.body?.onBehalfOf ||
    null;

  return {
    actor_type: 'USER',
    actor_id: actorId,
    on_behalf_of: onBehalfOf || null,
    correlation_id: req.correlationId || null,
    tenant_id: user.tenantId || user.tenant_id || null,
    role: user.role || null,
  };
}

/** Context cho background job */
function buildJobActorContext({ jobName, correlationId, tenantId } = {}) {
  return {
    actor_type: 'JOB_RUNNER',
    actor_id: jobName || 'job_runner',
    on_behalf_of: null,
    correlation_id: correlationId || null,
    tenant_id: tenantId || null,
    role: null,
  };
}

/**
 * Metadata chuẩn ghi BPL
 * @param {object} actorContext
 * @param {string} action - BPL_ACTIONS.*
 * @param {object} [extra]
 */
function toBplMetadata(actorContext, action, extra = {}) {
  return {
    action,
    actor_type: actorContext.actor_type,
    actor_id: actorContext.actor_id,
    on_behalf_of: actorContext.on_behalf_of || null,
    correlation_id: actorContext.correlation_id || null,
    ...extra,
  };
}

module.exports = {
  buildActorContext,
  buildJobActorContext,
  toBplMetadata,
};