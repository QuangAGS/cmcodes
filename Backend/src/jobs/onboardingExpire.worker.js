/**
 * ============================================================================
 * PATH       : src/jobs/onboardingExpire.worker.js
 * DATETIME   : 2026-11-19T14:28:00+07:00
 * VERSION    : 1.2.0-AMEND-RP-OP-2026-03-SPRINT4
 * DESCRIPTION:
 * - PR-W5-2 & [AMEND-RP-OP-2026-03-BASELINE v7.0 - Sprint 4]:
 *   + Expire onboarding cases quá hạn (updated_at + 30d).
 *   + Whitelist: DRAFT, PENDING_VERIFICATION, PROFILE_COMPLETED, FAMILY_TREE_DRAFT, NEEDS_REVISION.
 *   + Batch LIMIT + FOR UPDATE SKIP LOCKED trên basePrisma (an toàn ngoài AsyncLocalStorage tenantContext).
 *   + [FUNC-10] Vô hiệu hóa đồng bộ toàn bộ token (beneficiary_token_hash, referral_token_hash,
 *     thời hạn) ngay khi hồ sơ chuyển sang EXPIRED.
 *   + [ARCH-05][ARCH-06] Đánh dấu dọn dẹp metadata.staging_cleanup = CLEANED nếu có staging data.
 *   + Atomic TX: status EXPIRED + notification PENDING + BPL ONBOARDING_CASE_EXPIRE.
 * ============================================================================
 * CHANGELOGS:
 * - 1.0.0-W5 (2026-07-27): policy Q1 confirmed.
 * - 1.1.0-AMEND-RP-OP-2026-03-SPRINT4 (2026-11-19):
 *   + Chuyển sang basePrisma để chạy nền không bị STRICT_TENANT_MODELS chặn.
 *   + Bổ sung PENDING_VERIFICATION vào whitelist; vô hiệu hóa đồng bộ token [FUNC-10]
 *     và cập nhật trạng thái staging_cleanup [ARCH-05][ARCH-06].
 * - 1.1.1-AMEND-RP-OP-2026-03-SPRINT4 (2026-11-19):
 *   + Truyền đầy đủ payload { case_id, previous_status, user_id } và context cho writeBpl
 *     để khớp hợp đồng schemaValidator ONBOARDING_CASE_EXPIRE trong bpl.service.js.
 * - 1.2.0-AMEND-RP-OP-2026-03-SPRINT4 (2026-11-19):
 *   + Gọi deleteObjectsByPrefix (hard-delete R2 staging objects) ngoài TX DB; cập nhật
 *     cleanup_status = CLEANED hoặc FAILED vào metadata.staging_cleanup [ARCH-05].
 * ============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

'use strict';

const crypto = require('crypto');
const { basePrisma } = require('../lib/prisma.js');
const { writeBpl } = require('../services/bpl.service');
const { buildJobActorContext } = require('../shared/utils/actorContext');
const { BPL_ACTIONS } = require('../shared/constants/bplActions');
const { mergeOnboardingMetadata } = require('../types/metadata');
const { deleteObjectsByPrefix } = require('../shared/storage/r2.storage.service');

const DEFAULTS = {
  batchSize: 100,
  expireDays: 30,
  whitelist: [
    'DRAFT',
    'PENDING_VERIFICATION',
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

  return basePrisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`
      SELECT id, correlation_id, user_id, tenant_id, status, metadata, updated_at
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
 * 1 case: Hard-delete staging R2 [ARCH-05] + EXPIRED + dọn token đồng bộ [FUNC-10] + PENDING notif + BPL.
 */
async function expireOne(caseRow, options = {}) {
  const correlationId =
    caseRow.correlation_id || crypto.randomUUID();

  const prevMeta =
    caseRow.metadata && typeof caseRow.metadata === 'object' ? caseRow.metadata : {};

  let stagingResult = null;
  let nextMeta = prevMeta;

  if (
    prevMeta.staging_cleanup &&
    typeof prevMeta.staging_cleanup === 'object' &&
    prevMeta.staging_cleanup.prefix
  ) {
    try {
      const delOut = await deleteObjectsByPrefix(prevMeta.staging_cleanup.prefix, {
        s3Client: options.s3Client || null,
        bucket: options.bucket || null,
      });
      stagingResult = {
        status: 'CLEANED',
        deletedCount: delOut.deletedCount || 0,
        skipped: Boolean(delOut.skipped),
      };
    } catch (r2Err) {
      stagingResult = {
        status: 'FAILED',
        deletedCount: 0,
        error: r2Err.message || 'R2_CLEANUP_FAILED',
      };
    }

    nextMeta = mergeOnboardingMetadata(prevMeta, {
      staging_cleanup: {
        prefix: prevMeta.staging_cleanup.prefix,
        cleanup_status: stagingResult.status,
      },
    });
  }

  return basePrisma.$transaction(async (tx) => {

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
        // [FUNC-10] Vô hiệu hóa đồng bộ toàn bộ token khi case tự động hết hạn
        beneficiary_token_hash: null,
        beneficiary_token_expires_at: null,
        referral_token_hash: null,
        referral_expires_at: null,
        metadata: nextMeta,
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
      context: {
        target_id: caseRow.id,
        target_name: `Onboarding case expired (${caseRow.status})`,
      },
      payload: {
        case_id: caseRow.id,
        previous_status: caseRow.status,
        user_id: caseRow.user_id,
      },
      extraMetadata: {
        case_id: caseRow.id,
        previous_status: caseRow.status,
        user_id: caseRow.user_id,
        ...(stagingResult ? { staging_cleanup_result: stagingResult } : {}),
      },
      tx,
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
      results.push(await expireOne(row, options));
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
