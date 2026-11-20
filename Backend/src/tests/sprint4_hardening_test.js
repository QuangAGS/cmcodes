/**
 * ============================================================================
 * PATH       : src/tests/sprint4_hardening_test.js
 * DATETIME   : 2026-11-19T14:28:00+07:00
 * VERSION    : 1.0.0-AMEND-RP-OP-2026-03-SPRINT4-HARDENING
 * DESCRIPTION:
 * - Bộ kiểm thử hoàn thiện Sprint 4 (Hardening & Concurrent Race):
 *   1. [ARCH-05] R2 Hard-Delete Staging Objects:
 *      + Chặn an toàn prefix ngoài staging/ (R2_INVALID_STAGING_PREFIX).
 *      + Xóa hàng loạt nhiều trang (ListObjectsV2 + DeleteObjects) qua expireOne -> CLEANED.
 *      + Xử lý lỗi R2 -> đánh dấu staging_cleanup = FAILED mà vẫn chuyển EXPIRED & xóa token.
 *   2. [ARCH-04] Concurrent Race Test (Claim vs Approve song song qua Promise.allSettled):
 *      + Chạy đồng thời 2 luồng tranh chấp trên cùng 1 hồ sơ / 1 primary_member_id;
 *        xác nhận đúng 1 luồng thắng và 1 luồng nhận HTTP 409 CONCURRENT_TRANSACTION_LOCKED.
 * - Tự động dọn sạch 100% dữ liệu fixture ở khối finally.
 * ============================================================================
 * CHANGELOGS:
 * - 2026-11-19T14:28:00+07:00 (v1.0.0-AMEND-RP-OP-2026-03-SPRINT4-HARDENING):
 *   + Khởi tạo bộ kiểm thử R2 staging hard-delete và concurrent race Claim vs Approve.
 * ============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

'use strict';

require('dotenv').config();
const assert = require('assert');
const crypto = require('crypto');
const { basePrisma } = require('../lib/prisma');
const { deleteObjectsByPrefix } = require('../shared/storage/r2.storage.service');
const { expireOne } = require('../jobs/onboardingExpire.worker');
const { onboardingLockService } = require('../modules/onboarding/onboardingLock.service');
const { onboardingStateMachineService } = require('../modules/onboarding/onboardingStateMachine.service');
const { membershipLinkService } = require('../modules/membership/membershipLink.service');

async function run() {
  const suffix = crypto.randomUUID().slice(0, 8);
  const tenantId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const adminId = crypto.randomUUID();
  const targetMemberId = crypto.randomUUID();
  const expireOkCaseId = crypto.randomUUID();
  const expireFailCaseId = crypto.randomUUID();
  const raceCaseId = crypto.randomUUID();
  const corrOk = crypto.randomUUID();
  const corrFail = crypto.randomUUID();
  const corrRace = crypto.randomUUID();

  console.log(`\n🚀 Bắt đầu chạy Sprint 4 Hardening & Concurrent Race Test (tag: ${suffix})...\n`);

  try {
    // ── TEST 1: R2 Prefix Safety Guard [ARCH-05] ────────────────────────────
    let invalidPrefixCode = null;
    try {
      await deleteObjectsByPrefix('avatars/tenant-1/', {
        s3Client: { send: async () => ({}) },
        bucket: 'mock-bucket',
      });
    } catch (e) {
      invalidPrefixCode = e.code;
    }
    assert.strictEqual(
      invalidPrefixCode,
      'R2_INVALID_STAGING_PREFIX',
      'Phải chặn prefix ngoài staging/ để tránh xóa nhầm dữ liệu chính thức'
    );
    console.log('✅ PASS Test 1: Chặn an toàn prefix ngoài staging/ (R2_INVALID_STAGING_PREFIX) [ARCH-05]');

    // ── Seed DB tạm cho Test 2, 3, 4 ────────────────────────────────────────
    await basePrisma.tenants.create({
      data: {
        id: tenantId,
        name: `Dòng họ Hardening ${suffix}`,
        slug: `h4${suffix}`,
        status: 'HOAT_DONG',
      },
    });

    // eslint-disable-next-line no-restricted-syntax -- TEST-FIXTURE: tạo user tạm cho test Hardening
    await basePrisma.users.createMany({
      data: [
        {
          id: userId,
          name: `Applicant H4 ${suffix}`,
          phone: `0933${Math.floor(100000 + Math.random() * 899999)}`,
          password: 'hashed_test_password',
          role: 'VIEWER',
          status: 'DA_DUYET',
          tenant_id: tenantId,
        },
        {
          id: adminId,
          name: `Admin H4 ${suffix}`,
          phone: `0922${Math.floor(100000 + Math.random() * 899999)}`,
          password: 'hashed_test_password',
          role: 'CLAN_ADMIN',
          status: 'DA_DUYET',
          tenant_id: tenantId,
        },
      ],
    });

    await basePrisma.members.create({
      data: {
        id: targetMemberId,
        tenant_id: tenantId,
        full_name: `Node Tranh Chấp ${suffix}`,
        gender: 'NAM',
        status: 'CHINH_THUC',
        is_alive: true,
      },
    });

    await basePrisma.onboarding_cases.createMany({
      data: [
        {
          id: expireOkCaseId,
          correlation_id: corrOk,
          case_type: 'MEMBER_JOIN',
          process_kind: 'REGISTER',
          status: 'DRAFT',
          user_id: userId,
          tenant_id: tenantId,
          referral_token_hash: 'tok_ref_ok',
          metadata: {
            staging_cleanup: {
              cleanup_status: 'PENDING',
              prefix: `staging/${expireOkCaseId}/`,
            },
          },
        },
        {
          id: expireFailCaseId,
          correlation_id: corrFail,
          case_type: 'MEMBER_JOIN',
          process_kind: 'REGISTER',
          status: 'DRAFT',
          user_id: userId,
          tenant_id: tenantId,
          beneficiary_token_hash: 'tok_ben_fail',
          metadata: {
            staging_cleanup: {
              cleanup_status: 'PENDING',
              prefix: `staging/${expireFailCaseId}/`,
            },
          },
        },
        {
          id: raceCaseId,
          correlation_id: corrRace,
          case_type: 'MEMBER_JOIN',
          process_kind: 'REGISTER',
          status: 'SUBMITTED',
          claim_mode: 'CLAIM_EXISTING',
          user_id: userId,
          tenant_id: tenantId,
          primary_member_id: targetMemberId,
        },
      ],
    });

    // ── TEST 2: R2 Hard-Delete đa trang qua expireOne -> CLEANED [ARCH-05] ──
    const deletedKeys = [];
    let pageCalls = 0;
    const healthyMockS3 = {
      send: async (cmd) => {
        if (cmd.constructor.name === 'ListObjectsV2Command') {
          pageCalls += 1;
          if (pageCalls === 1) {
            return {
              Contents: [
                { Key: `staging/${expireOkCaseId}/id-front.jpg` },
                { Key: `staging/${expireOkCaseId}/id-back.jpg` },
              ],
              IsTruncated: true,
              NextContinuationToken: 'page-2-token',
            };
          }
          return {
            Contents: [{ Key: `staging/${expireOkCaseId}/selfie.jpg` }],
            IsTruncated: false,
          };
        }
        if (cmd.constructor.name === 'DeleteObjectsCommand') {
          for (const obj of cmd.input.Delete.Objects) {
            deletedKeys.push(obj.Key);
          }
          return { Deleted: cmd.input.Delete.Objects };
        }
        return {};
      },
    };

    const rowOk = await basePrisma.onboarding_cases.findUnique({ where: { id: expireOkCaseId } });
    const resOk = await expireOne(rowOk, { s3Client: healthyMockS3, bucket: 'test-r2-bucket' });
    assert.strictEqual(resOk.ok, true);
    assert.strictEqual(deletedKeys.length, 3, 'Phải xóa đủ 3 object qua 2 trang phân trang R2');

    const dbOk = await basePrisma.onboarding_cases.findUnique({ where: { id: expireOkCaseId } });
    assert.strictEqual(dbOk.status, 'EXPIRED');
    assert.strictEqual(dbOk.referral_token_hash, null);
    assert.strictEqual(dbOk.metadata.staging_cleanup.cleanup_status, 'CLEANED');
    console.log('✅ PASS Test 2: Hard-delete R2 Staging đa trang (3 objects) -> CLEANED [ARCH-05]');

    // ── TEST 3: R2 Lỗi mạng -> FAILED nhưng vẫn EXPIRED & dọn token [ARCH-05][FUNC-10] ──
    const failingMockS3 = {
      send: async () => {
        throw new Error('R2_NETWORK_TIMEOUT');
      },
    };
    const rowFail = await basePrisma.onboarding_cases.findUnique({ where: { id: expireFailCaseId } });
    const resFail = await expireOne(rowFail, { s3Client: failingMockS3, bucket: 'test-r2-bucket' });
    assert.strictEqual(resFail.ok, true);

    const dbFail = await basePrisma.onboarding_cases.findUnique({ where: { id: expireFailCaseId } });
    assert.strictEqual(dbFail.status, 'EXPIRED');
    assert.strictEqual(dbFail.beneficiary_token_hash, null, 'Token vẫn phải bị xóa dù R2 lỗi');
    assert.strictEqual(dbFail.metadata.staging_cleanup.cleanup_status, 'FAILED');
    console.log('✅ PASS Test 3: R2 lỗi -> ghi nhận FAILED nhưng vẫn EXPIRED & dọn token [ARCH-05][FUNC-10]');

    // ── TEST 4: Concurrent Race (Claim vs Approve song song) [ARCH-04] ──────
    const approveWorker = () =>
      onboardingLockService.executeWithStrictLock(
        { caseId: raceCaseId, targetMemberId, lockUserId: userId },
        async (tx, lockCtx) => {
          // Giữ khóa 5.3s để ép luồng tranh chấp thứ 2 chạm lock_timeout = 5s
          await new Promise((r) => setTimeout(r, 5300));
          const c = await tx.onboarding_cases.findUnique({ where: { id: raceCaseId } });
          await onboardingStateMachineService.transition(tx, {
            caseRecord: c,
            toState: 'APPROVED',
            actorId: adminId,
          });
          await membershipLinkService.upsertLink(tx, {
            userId,
            tenantId,
            memberId: targetMemberId,
            linkType: 'PRIMARY_PATERNAL',
            roleInTenant: 'USER',
            isDefault: lockCtx.shouldBeDefault,
            approvedBy: adminId,
          });
          return 'WINNER_APPROVED';
        }
      );

    const concurrentClaimWorker = async () => {
      // Khởi chạy sau 150ms để tạo đụng độ trực tiếp trên cùng khóa hàng
      await new Promise((r) => setTimeout(r, 150));
      return onboardingLockService.executeWithStrictLock(
        { caseId: raceCaseId, targetMemberId, lockUserId: userId },
        async () => 'SHOULD_CONFLICT_409'
      );
    };

    const outcomes = await Promise.allSettled([approveWorker(), concurrentClaimWorker()]);
    const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
    const rejected = outcomes.filter((o) => o.status === 'rejected');

    assert.strictEqual(fulfilled.length, 1, 'Chỉ đúng 1 giao dịch được phép thắng khóa');
    assert.strictEqual(fulfilled[0].value, 'WINNER_APPROVED');
    assert.strictEqual(rejected.length, 1, 'Giao dịch tranh chấp đến sau phải bị từ chối');
    assert.strictEqual(rejected[0].reason.statusCode, 409);
    assert.strictEqual(rejected[0].reason.code, 'CONCURRENT_TRANSACTION_LOCKED');

    const linksCount = await basePrisma.user_member_links.count({
      where: { user_id: userId, tenant_id: tenantId, deleted_at: null },
    });
    assert.strictEqual(linksCount, 1, 'Chỉ tồn tại duy nhất 1 liên kết thành viên active');
    console.log('✅ PASS Test 4: Concurrent Race (Claim vs Approve song song) -> 1 thắng, 1 HTTP 409 [ARCH-04]');

    console.log('\n🎉 TẤT CẢ 4 BÀI KIỂM THỬ HARDENING & CONCURRENCY SPRINT 4 ĐẠT 100%!\n');
  } finally {
    await basePrisma.notifications.deleteMany({
      where: { correlation_id: { in: [corrOk, corrFail, corrRace] } },
    }).catch(() => {});
    await basePrisma.business_process_logs.deleteMany({
      where: { correlation_id: { in: [corrOk, corrFail, corrRace] } },
    }).catch(() => {});
    await basePrisma.onboarding_cases.deleteMany({
      where: { id: { in: [expireOkCaseId, expireFailCaseId, raceCaseId] } },
    }).catch(() => {});
    await basePrisma.user_member_links.deleteMany({ where: { tenant_id: tenantId } }).catch(() => {});
    await basePrisma.members.deleteMany({ where: { tenant_id: tenantId } }).catch(() => {});
    await basePrisma.users.deleteMany({ where: { id: { in: [userId, adminId] } } }).catch(() => {});
    await basePrisma.tenants.deleteMany({ where: { id: tenantId } }).catch(() => {});
    await basePrisma.$disconnect();
  }
}

run().catch((err) => {
  console.error('❌ SPRINT 4 HARDENING TEST FAILED:', err);
  process.exit(1);
});
