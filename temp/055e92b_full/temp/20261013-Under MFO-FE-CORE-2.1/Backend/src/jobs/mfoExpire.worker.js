/**
 * PATH       : src/jobs/mfoExpire.worker.js
 * DATETIME   : 2026-10-10T21:32:00+07:00
 * VERSION    : 1.0.0-AMENDMENT3-EXPIRE
 * DESCRIPTION: Hết hạn thì nhả cửa người soạn. PENDING và UNDER_REVIEW chỉ nhắc.
 */
'use strict';

const { prisma } = require('../lib/prisma.js');

const RELEASE_STATUSES = ['DRAFT', 'NEEDS_REVISION', 'APPROVED'];
const REMIND_STATUSES = ['PENDING', 'UNDER_REVIEW'];

async function runOnce(options = {}) {
  const batchSize = options.batchSize || 100;
  const now = new Date();

  const due = await prisma.proposals.findMany({
    where: {
      deleted_at: null,
      expires_at: { lte: now },
      status: { in: [...RELEASE_STATUSES, ...REMIND_STATUSES] },
    },
    select: {
      id: true,
      status: true,
      tenant_id: true,
      requester_user_id: true,
      payload: true,
    },
    orderBy: { expires_at: 'asc' },
    take: batchSize,
  });

  const released = [];
  const reminded = [];

  for (const row of due) {
    const payload = row.payload || {};
    if (payload.result_ok === true) continue;

    if (REMIND_STATUSES.includes(row.status)) {
      console.warn('[mfoExpire] remind only', { id: row.id, status: row.status });
      reminded.push(row.id);
      continue;
    }

    await prisma.proposals.update({
      where: { id: row.id },
      data: {
        status: 'WITHDRAWN',
        hold_member_ids: [],
        expires_at: null,
        payload: {
          ...payload,
          expired_at: now.toISOString(),
          hold_released: true,
        },
        updated_at: now,
      },
    });
    released.push(row.id);
  }

  return { scanned: due.length, released, reminded };
}

module.exports = { runOnce };
