/**
 * PATH       : src/jobs/tempUnlock.worker.js
 * DATETIME   : 2026-07-27T19:05:00+07:00
 * VERSION    : 1.0.0-W5
 * DESCRIPTION:
 * - PR-W5-3: Auto unlock khi locked_until < NOW().
 * - Skip BI_CAM (permanent). Batch LIMIT + SKIP LOCKED.
 * - BPL USER_TEMP_UNLOCKED / process_type USER_UNLOCK.
 *
 * CHANGELOG:
 * - 1.0.0-W5 (2026-07-27): restore pre_lock_status hoặc DA_DUYET.
 */

'use strict';

const crypto = require('crypto');
const { prisma } = require('../lib/prisma.js');
const { writeBpl } = require('../services/bpl.service');
const { buildJobActorContext } = require('../shared/utils/actorContext');
const { BPL_ACTIONS } = require('../shared/constants/bplActions');

const DEFAULTS = {
  batchSize: 100,
  /** Không auto-unlock */
  skipStatuses: ['BI_CAM'],
};

/**
 * Claim user hết hạn lock.
 */
async function claimUnlockable(options = {}) {
  const batchSize = options.batchSize || DEFAULTS.batchSize;
  const skipStatuses = options.skipStatuses || DEFAULTS.skipStatuses;

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`
      SELECT id, status, locked_until, pre_lock_status, tenant_id
      FROM users
      WHERE deleted_at IS NULL
        AND locked_until IS NOT NULL
        AND locked_until < NOW()
        AND status::text <> ALL(${skipStatuses}::text[])
      ORDER BY locked_until ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    `;
    return rows || [];
  });
}

/**
 * Unlock 1 user + BPL trong TX.
 */
async function unlockOne(userRow) {
  const correlationId = crypto.randomUUID();
  const restoreStatus =
    userRow.pre_lock_status ||
    (userRow.status === 'BI_KHOA' ? 'DA_DUYET' : userRow.status);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.users.updateMany({
      where: {
        id: userRow.id,
        locked_until: { not: null, lt: new Date() },
        status: { not: 'BI_CAM' },
        deleted_at: null,
      },
      data: {
        status: restoreStatus,
        locked_until: null,
        pre_lock_status: null,
        updated_at: new Date(),
      },
    });

    if (updated.count === 0) {
      return { id: userRow.id, ok: false, reason: 'ALREADY_CHANGED' };
    }

    const actorContext = buildJobActorContext({
      jobName: 'tempUnlock',
      correlationId,
      tenantId: userRow.tenant_id || null,
    });

    await writeBpl({
      processType: 'USER_UNLOCK',
      actorContext,
      action: BPL_ACTIONS.USER_TEMP_UNLOCKED,
      tx,
      extraMetadata: {
        user_id: userRow.id,
        previous_status: userRow.status,
        restored_status: restoreStatus,
        locked_until_was: userRow.locked_until,
      },
    });

    console.log(
      `[tempUnlock] UNLOCKED user=${userRow.id} ${userRow.status}→${restoreStatus} correlationId=${correlationId}`
    );
    return {
      id: userRow.id,
      ok: true,
      restored_status: restoreStatus,
      correlationId,
    };
  });
}

async function runOnce(options = {}) {
  const claimed = await claimUnlockable(options);
  if (claimed.length === 0) {
    console.log('[tempUnlock] no users to unlock');
    return { claimed: 0, results: [] };
  }
  console.log(`[tempUnlock] claimed=${claimed.length}`);
  const results = [];
  for (const row of claimed) {
    try {
      results.push(await unlockOne(row));
    } catch (err) {
      console.error(`[tempUnlock] fail user=${row.id}`, err.message);
      results.push({ id: row.id, ok: false, reason: err.message });
    }
  }
  return { claimed: claimed.length, results };
}

module.exports = {
  claimUnlockable,
  unlockOne,
  runOnce,
  DEFAULTS,
};