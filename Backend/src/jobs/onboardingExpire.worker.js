/**
 * PATH       : src/jobs/onboardingExpire.worker.js
 * DATETIME   : 2026-07-27T18:30:00+07:00
 * VERSION    : 1.0.0-W5
 * DESCRIPTION:
 * - PR-W5-2: Expire onboarding cases quá hạn (updated_at + 30d).
 * - Whitelist: DRAFT, PROFILE_COMPLETED, FAMILY_TREE_DRAFT, NEEDS_REVISION.
 * - Batch LIMIT + FOR UPDATE SKIP LOCKED.
 * - Atomic TX: status EXPIRED + notification PENDING + BPL ONBOARDING_EXPIRED.
 *
 * CHANGELOG:
 * - 1.0.0-W5 (2026-07-27): policy Q1 confirmed.
 */

'use strict';

const crypto = require('crypto');
const { prisma } = require('../lib/prisma.js');
const { writeBpl } = require('../services/bpl.service');
const { buildJobActorContext } = require('../shared/utils/actorContext');
const { BPL_ACTIONS } = require('../shared/constants/bplActions');

const DEFAULTS = {
  batchSize: 100,
  expireDays: 30,
  whitelist: [
    'DRAFT',
    'PROFILE_COMPLETED',
    'FAMILY_TREE_DRAFT',
    'NEEDS_REVISION',
  ],
};

/**
 * Claim batch case đủ điều kiện expire.
 */
async function claimExpiredCases(options = {}) {
  const batchSize = options.batchSize || DEFAULTS.batchSize;
  const expireDays = options.expireDays || DEFAULTS.expireDays;
  const whitelist = options.whitelist || DEFAULTS.whitelist;

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`
      SELECT id, correlation_id, user_id, tenant_id, status, updated_at
      FROM onboarding_cases
      WHERE deleted_at IS NULL
        AND status::text = ANY(${whitelist}::text[])
        AND updated_at < (NOW() - (${expireDays}::text || ' days')::interval)
      ORDER BY updated_at ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    `;
    return rows || [];
  });
}

/**
 * 1 case: EXPIRED + PENDING notif + BPL trong cùng TX.
 */
async function expireOne(caseRow) {
  const correlationId =
    caseRow.correlation_id || crypto.randomUUID();

  return prisma.$transaction(async (tx) => {
    const updated = await tx.onboarding_cases.updateMany({
      where: {
        id: caseRow.id,
        status: { in: DEFAULTS.whitelist },
        deleted_at: null,
      },
      data: {
        status: 'EXPIRED',
        expired_at: new Date(),
        updated_at: new Date(),
      },
    });

    if (updated.count === 0) {
      return { id: caseRow.id, ok: false, reason: 'ALREADY_CHANGED' };
    }

    await tx.notifications.create({
      data: {
        user_id: caseRow.user_id,
        tenant_id: caseRow.tenant_id || null,
        title: 'Hồ sơ onboarding đã hết hạn',
        content:
          'Hồ sơ đăng ký/gia nhập của bác đã hết thời hạn xử lý và được hệ thống đánh dấu hết hạn. Vui lòng tạo hồ sơ mới nếu vẫn có nhu cầu.',
        status: 'PENDING',
        event_type: 'ONBOARDING_CANCELLED',
        correlation_id: correlationId,
        level: 'WARNING',
        reliability: 'HIGH',
        metadata: {
          case_id: caseRow.id,
          previous_status: caseRow.status,
          reason: 'AUTO_EXPIRE_30D',
        },
      },
    });

    const actorContext = buildJobActorContext({
      jobName: 'onboardingExpire',
      correlationId,
      tenantId: caseRow.tenant_id || null,
    });

    await writeBpl({
      processType: 'ONBOARDING_CASE_EXPIRE',
      actorContext,
      action: BPL_ACTIONS.ONBOARDING_EXPIRED,
      tx,
      extraMetadata: {
        case_id: caseRow.id,
        previous_status: caseRow.status,
        user_id: caseRow.user_id,
      },
    });

    console.log(
      `[onboardingExpire] EXPIRED case=${caseRow.id} correlationId=${correlationId}`
    );
    return { id: caseRow.id, ok: true, correlationId };
  });
}

async function runOnce(options = {}) {
  const claimed = await claimExpiredCases(options);
  if (claimed.length === 0) {
    console.log('[onboardingExpire] no cases to expire');
    return { claimed: 0, results: [] };
  }
  console.log(`[onboardingExpire] claimed=${claimed.length}`);
  const results = [];
  for (const row of claimed) {
    try {
      results.push(await expireOne(row));
    } catch (err) {
      console.error(`[onboardingExpire] fail case=${row.id}`, err.message);
      results.push({ id: row.id, ok: false, reason: err.message });
    }
  }
  return { claimed: claimed.length, results };
}

module.exports = {
  claimExpiredCases,
  expireOne,
  runOnce,
  DEFAULTS,
};