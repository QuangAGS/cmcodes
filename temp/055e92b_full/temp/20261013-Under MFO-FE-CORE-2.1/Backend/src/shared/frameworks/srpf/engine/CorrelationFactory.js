/**
 * PATH       : backend/src/shared/frameworks/srpf/engine/CorrelationFactory.js
 * DATETIME   : 2026-08-11T14:40:00+07:00
 * VERSION    : 0.1.0-skeleton
 * DESCRIPTION: Creates or reuses Correlation_id for SRPF actions.
 *              Decision (Architecture v1.1): SAVE_DRAFT does NOT generate Correlation.
 *
 * NOTE: Skeleton only. Prefer reusing existing correlation.service.js later.
 */

'use strict';

const { randomUUID } = require('crypto');
const { requiresCorrelation } = require('../constants/actions');

/**
 * Create or reuse a correlation id.
 *
 * @param {object} params
 * @param {string} params.action
 * @param {object} [params.actorContext]
 * @param {import('@prisma/client').Prisma.TransactionClient} [params.tx] - reserved for future persistence
 * @returns {Promise<string|null>} correlationId or null when action does not require it
 */
async function create({ action, actorContext = {}, tx }) {
  // SAVE_DRAFT and other non-requiring actions → no correlation
  if (!requiresCorrelation(action)) {
    return null;
  }

  // Prefer existing correlation from current request context
  if (actorContext.correlation_id) {
    return actorContext.correlation_id;
  }

  // TODO: optionally persist into correlations table via existing service
  const correlationId = randomUUID();
  return correlationId;
}

module.exports = {
  create,
};
