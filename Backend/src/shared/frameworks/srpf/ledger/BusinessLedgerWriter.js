/**
 * PATH       : backend/src/shared/frameworks/srpf/ledger/BusinessLedgerWriter.js
 * DATETIME   : 2026-08-11T14:40:00+07:00
 * VERSION    : 0.1.0-skeleton
 * DESCRIPTION: Writes Business Process Log (BPL) AND audit_logs.
 *              Decision (Architecture v1.1): BusinessLedgerWriter covers both.
 *
 * NOTE: Skeleton only. Reuse existing bpl.service.js + audit mechanism in Phase 3.
 */

'use strict';

/**
 * Write BPL + audit_logs for a completed action.
 *
 * @param {object} params
 * @param {import('@prisma/client').Prisma.TransactionClient} params.tx
 * @param {string} params.correlationId
 * @param {string} params.processType - concrete type for BPL (from actionToProcessType)
 * @param {string} params.action
 * @param {object} params.actorContext
 * @param {object} params.instance - updated instance after transition
 * @param {object} [params.metadata]
 * @returns {Promise<void>}
 */
async function write({
  tx,
  correlationId,
  processType,
  action,
  actorContext,
  instance,
  metadata = {},
}) {
  if (!correlationId) {
    // SAVE_DRAFT path — no ledger write required
    return;
  }

  // TODO (Phase 3):
  // 1. Call existing writeBpl(...) from services/bpl.service.js
  // 2. Write corresponding audit_logs entry (actor, before/after, correlation_id, ...)
  // Keep both inside the same transaction (tx).

  throw new Error('BusinessLedgerWriter.write is not implemented (skeleton)');
}

module.exports = {
  write,
};
