/**
 * PATH       : src/services/bpl.service.js
 * DATETIME   : 2026-07-27T18:15:00+07:00
 * VERSION    : 1.0.0-W5
 * DESCRIPTION: Insert business_process_logs — PR-W5-1 actor_context.
 */

'use strict';

const { prisma } = require('../lib/prisma.js');
const { toBplMetadata } = require('../shared/utils/actorContext');

/**
 * @param {object} params
 * @param {string} params.processType - enum business_process_type
 * @param {object} params.actorContext - từ buildActorContext / buildJobActorContext
 * @param {string} params.action - BPL_ACTIONS.*
 * @param {string} [params.processStatus='SUCCESS']
 * @param {number} [params.attemptNo=1]
 * @param {object} [params.extraMetadata]
 * @param {import('@prisma/client').Prisma.TransactionClient} [params.tx]
 */
async function writeBpl({
  processType,
  actorContext,
  action,
  processStatus = 'SUCCESS',
  attemptNo = 1,
  extraMetadata = {},
  tx,
}) {
  const client = tx || prisma;
  const correlationId =
    actorContext.correlation_id ||
    require('crypto').randomUUID();

  return client.business_process_logs.create({
    data: {
      correlation_id: correlationId,
      attempt_no: attemptNo,
      process_type: processType,
      actor_type: actorContext.actor_type || 'USER',
      actor_id: String(actorContext.actor_id || 'unknown'),
      tenant_id: actorContext.tenant_id || null,
      process_status: processStatus,
      metadata: toBplMetadata(actorContext, action, extraMetadata),
    },
  });
}

module.exports = { writeBpl };