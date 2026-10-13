/**
 * PATH       : src/services/bpl.service.js
 * DATETIME   : 2026-09-01T15:30:00+07:00
 * VERSION    : 1.1.0-BFA-222-B1
 * DESCRIPTION: Cửa BL duy nhất (2.2.2 B1). Bắt schema + tx. Không nuốt lỗi.
 *              ledger.service.createLog wrapper gọi hàm này.
 */

'use strict';

const { prisma } = require('../lib/prisma.js');
const { BusinessLogSchemas } = require('./businessLogSchemas.js');

function deny(message, code = 'BPL_REJECT') {
  const err = new Error(message);
  err.statusCode = 400;
  err.code = code;
  err.isOperational = true;
  throw err;
}

/**
 * @param {object} params
 * @param {string} params.processType
 * @param {object} params.actorContext  { actor_id, actor_type, tenant_id, correlation_id }
 * @param {string} [params.action]
 * @param {string} [params.processStatus='SUCCESS']
 * @param {number} [params.attemptNo]
 * @param {object} [params.context]     { target_id, target_name }
 * @param {object} [params.payload]
 * @param {object} [params.extraMetadata]
 * @param {import('@prisma/client').Prisma.TransactionClient} params.tx
 */
async function writeBpl({
  processType,
  actorContext = {},
  action = null,
  processStatus = 'SUCCESS',
  attemptNo,
  context = {},
  payload = {},
  extraMetadata = {},
  tx,
}) {
  if (!tx) deny('writeBpl requires tx từ withTransaction.', 'BPL_TX_REQUIRED');
  if (!processType) deny('writeBpl requires process_type.');

  const schemaValidator = BusinessLogSchemas[processType];
  if (typeof schemaValidator !== 'function') {
    deny(`Process type [${processType}] chưa có trong BusinessLogSchemas.`, 'BPL_UNKNOWN_TYPE');
  }

  const actorId = actorContext.actor_id || actorContext.actorId;
  if (!actorId) deny('writeBpl requires actor_id.');

  const correlationId =
    actorContext.correlation_id ||
    actorContext.correlationId ||
    extraMetadata.correlation_id;
  if (!correlationId) deny('writeBpl requires correlation_id.');

  const sanitizedPayload = schemaValidator({
    ...payload,
    action: payload.action || action,
    attempt_no: attemptNo || payload.attempt_no,
  });

  const attempt =
    attemptNo != null
      ? parseInt(attemptNo, 10)
      : parseInt(sanitizedPayload.attempt_no || 1, 10) || 1;

  return tx.business_process_logs.create({
    data: {
      correlation_id: String(correlationId),
      attempt_no: attempt,
      process_type: processType,
      actor_type: actorContext.actor_type || 'USER',
      actor_id: String(actorId),
      tenant_id: actorContext.tenant_id || actorContext.tenantId || null,
      process_status: processStatus,
      metadata: {
        context: {
          target_id: context.target_id || null,
          target_name: context.target_name || null,
          attempt_no: attempt,
          action: action || sanitizedPayload.action || null,
        },
        payload: {
          ...sanitizedPayload,
          attempt_no: attempt,
          ...extraMetadata,
        },
      },
    },
  });
}

/** Tương thích chỗ cũ gọi prisma client mặc định — vẫn bắt tx. */
async function writeBplLegacy(args) {
  return writeBpl(args);
}

module.exports = { writeBpl, writeBplLegacy };
