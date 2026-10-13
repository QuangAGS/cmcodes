/**
 * PATH       : src/jobs/notificationClaim.worker.js
 * DATETIME   : 2026-07-27T16:40:00+07:00
 * VERSION    : 1.0.0-W4
 * DESCRIPTION:
 * - PR-W4-3: Claim notifications PENDING (+ reclaim SENDING stale)
 *   bằng FOR UPDATE SKIP LOCKED (multi-instance safe).
 * - correlation_id bắt buộc trong log (CED).
 * - Delivery channel: stub SUCCESS trong W4-3; W4-4 max-retry SMTP thật.
 *
 * CHANGELOG:
 * - 1.0.0-W4 (2026-07-27): claim + reclaim 10m + attempts.
 */

'use strict';

const { prisma } = require('../lib/prisma.js');

const DEFAULTS = {
  batchSize: 10,
  maxAttempts: 3,
  reclaimMinutes: 10,
};

/**
 * Claim một batch notification an toàn multi-instance.
 * @returns {Promise<object[]>} rows đã chuyển SENDING
 */
async function claimBatch(options = {}) {
  const batchSize = options.batchSize || DEFAULTS.batchSize;
  const maxAttempts = options.maxAttempts || DEFAULTS.maxAttempts;
  const reclaimMinutes = options.reclaimMinutes || DEFAULTS.reclaimMinutes;

  return prisma.$transaction(async (tx) => {
    // Postgres: enum cast + SKIP LOCKED
    const rows = await tx.$queryRaw`
      SELECT id, correlation_id, attempts, user_id, tenant_id,
             title, content, event_type, status, locked_at
      FROM notifications
      WHERE deleted_at IS NULL
        AND attempts < ${maxAttempts}
        AND (
          status = 'PENDING'::"notification_status"
          OR (
            status = 'SENDING'::"notification_status"
            AND locked_at IS NOT NULL
            AND locked_at < (NOW() - (${reclaimMinutes}::text || ' minutes')::interval)
          )
        )
      ORDER BY created_at ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    `;

    if (!rows || rows.length === 0) {
      return [];
    }

    const ids = rows.map((r) => r.id);

    await tx.$executeRaw`
      UPDATE notifications
      SET status = 'SENDING'::"notification_status",
          locked_at = NOW(),
          attempts = attempts + 1,
          updated_at = NOW()
      WHERE id = ANY(${ids}::text[])
    `;

    return rows.map((r) => ({
      ...r,
      attempts: Number(r.attempts) + 1,
      status: 'SENDING',
    }));
  });
}

/**
 * Đánh dấu hoàn tất sau khi "gửi" (W4-3 stub).
 */
async function markSent(id, { correlationId } = {}) {
  await prisma.notifications.update({
    where: { id },
    data: {
      status: 'SENT',
      locked_at: null,
      external_sent_status: true,
      updated_at: new Date(),
    },
  });
  console.log(
    `[notif-worker] SENT id=${id} correlationId=${correlationId || 'n/a'}`
  );
}

/**
 * Đánh dấu FAILED (attempts đã tăng lúc claim).
 */
async function markFailed(id, reason, { correlationId } = {}) {
  await prisma.notifications.update({
    where: { id },
    data: {
      status: 'FAILED',
      locked_at: null,
      metadata: {
        failed_reason: String(reason || 'UNKNOWN').slice(0, 500),
        failed_at: new Date().toISOString(),
      },
      updated_at: new Date(),
    },
  });
  console.warn(
    `[notif-worker] FAILED id=${id} correlationId=${correlationId || 'n/a'} reason=${reason}`
  );
}

/**
 * Xử lý 1 row đã claim — W4-3: stub success (in-app ledger).
 * W4-4: gọi SMTP/Zalo thật; fail → PENDING nếu attempts < max else FAILED.
 */
async function processOne(row, options = {}) {
  const maxAttempts = options.maxAttempts || DEFAULTS.maxAttempts;
  const correlationId = row.correlation_id;
  const attempts = Number(row.attempts) || 0;

  try {
    console.log(
      `[notif-worker] process id=${row.id} event=${row.event_type} correlationId=${correlationId} attempts=${attempts}`
    );

    // --- W4-4: chỗ gửi channel thật ---
    // Hiện stub: luôn success. Để smoke FAIL path, bật FORCE_FAIL:
    if (process.env.NOTIF_WORKER_FORCE_FAIL === 'true') {
      throw new Error('FORCED_CHANNEL_FAILURE');
    }
    // TODO: await sendEmail / Zalo / ...
    await markSent(row.id, { correlationId });
    return { id: row.id, ok: true, status: 'SENT' };
  } catch (err) {
    const reason = err.message || String(err);
    if (attempts >= maxAttempts) {
      await markFailed(row.id, reason, { correlationId });
      return { id: row.id, ok: false, status: 'FAILED', reason };
    }
    await markRetryPending(row.id, reason, { correlationId, attempts });
    return { id: row.id, ok: false, status: 'PENDING', reason, attempts };
  }
}

/**
 * Một vòng worker.
 */
async function runOnce(options = {}) {
  const claimed = await claimBatch(options);
  if (claimed.length === 0) {
    console.log('[notif-worker] no claimable rows');
    return { claimed: 0, results: [] };
  }
  console.log(`[notif-worker] claimed=${claimed.length}`);
  const results = [];
  for (const row of claimed) {
    results.push(await processOne(row, options));
  }
  return { claimed: claimed.length, results };
}

/**
 * Gửi fail nhưng còn lượt → về PENDING (bỏ lock) để vòng sau claim lại.
 */
async function markRetryPending(id, reason, { correlationId, attempts } = {}) {
  await prisma.notifications.update({
    where: { id },
    data: {
      status: 'PENDING',
      locked_at: null,
      metadata: {
        last_error: String(reason || 'UNKNOWN').slice(0, 500),
        last_failed_at: new Date().toISOString(),
        attempts_at_error: attempts,
      },
      updated_at: new Date(),
    },
  });
  console.warn(
    `[notif-worker] RETRY_PENDING id=${id} correlationId=${correlationId || 'n/a'} attempts=${attempts} reason=${reason}`
  );
}

module.exports = {
  claimBatch,
  markSent,
  markFailed,
  processOne,
  runOnce,
  markRetryPending,
  DEFAULTS,
};