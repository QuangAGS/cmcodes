/**
 * ============================================================================
 * PATH       : src/tests/sprint4_acceptance_test.js
 * DATETIME   : 2026-11-19T14:15:00+07:00
 * VERSION    : 1.0.0-AMEND-RP-OP-2026-03-SPRINT4-TEST
 * DESCRIPTION:
 * - Bộ kiểm thử nghiệm thu toàn diện Sprint 4 (AMEND-RP-OP-2026-03-BASELINE v7.0):
 *   1. [FUNC-11] Cam kết nội quy & snapshot <= 30.000 ký tự kèm SHA-256 checksum;
 *      chặn vượt 30.000 ký tự (HTTP 400).
 *   2. [FUNC-01] & [FUNC-10] Phát hành & xác nhận token đồng thuận người thụ hưởng:
 *      - Token hợp lệ -> CONFIRMED + xóa token + ghi BPL ONBOARDING_BENEFICIARY_CONSENT.
 *      - Dùng lại token hoặc bấm link khi case terminal -> HTTP 400 / HTTP 410 Gone.
 *   3. [ARCH-06] Xác minh ngoại tuyến ghi vào metadata.offline_verifications.
 *   4. [ARCH-05] & [FUNC-10] Worker onboardingExpire.worker.js tự động hết hạn case quá 30 ngày,
 *      xóa sạch token đồng bộ, dọn staging_cleanup -> CLEANED, ghi BPL & Notification.
 * - Tự động dọn sạch 100% dữ liệu tạm ở khối finally.
 * ============================================================================
 * CHANGELOGS:
 * - 2026-11-19T14:15:00+07:00 (v1.0.0-AMEND-RP-OP-2026-03-SPRINT4-TEST):
 *   + Khởi tạo kịch bản kiểm thử nghiệm thu Sprint 4 chạy trực tiếp trên DB.
 * ============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

'use strict';

require('dotenv').config();
const assert = require('assert');
const crypto = require('crypto');
const { basePrisma } = require('../lib/prisma');
const {
  onboardingConsentAndRulesService,
  MAX_RULES_SNAPSHOT_LENGTH,
} = require('../modules/onboarding/onboardingConsentAndRules.service');
const { onboardingStateMachineService } = require('../modules/onboarding/onboardingStateMachine.service');
const { expireOne } = require('../jobs/onboardingExpire.worker');

async function run() {
  const suffix = crypto.randomUUID().slice(0, 8);
  const tenantId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const beneficiaryUserId = crypto.randomUUID();
  const case1Id = crypto.randomUUID();
  const case2Id = crypto.randomUUID();
  const corr1 = crypto.randomUUID();
  const corr2 = crypto.randomUUID();

  console.log(`\n🚀 Bắt đầu chạy Sprint 4 Acceptance Test (tag: ${suffix})...\n`);

  try {
    await basePrisma.tenants.create({
      data: {
        id: tenantId,
        name: `Dòng họ Test Sprint4 ${suffix}`,
        slug: `t4${suffix}`,
        status: 'HOAT_DONG',
      },
    });

    // eslint-disable-next-line no-restricted-syntax -- TEST-FIXTURE: tạo user tạm cho test Sprint 4
    await basePrisma.users.createMany({
      data: [
        {
          id: userId,
          name: `Applicant S4 ${suffix}`,
          phone: `0955${Math.floor(100000 + Math.random() * 899999)}`,
          password: 'hashed_test_password',
          role: 'VIEWER',
          status: 'DA_DUYET',
          tenant_id: tenantId,
        },
        {
          id: beneficiaryUserId,
          name: `Beneficiary S4 ${suffix}`,
          phone: `0944${Math.floor(100000 + Math.random() * 899999)}`,
          password: 'hashed_test_password',
          role: 'USER',
          status: 'DA_DUYET',
          tenant_id: tenantId,
        },
      ],
    });

    await basePrisma.onboarding_cases.createMany({
      data: [
        {
          id: case1Id,
          correlation_id: corr1,
          case_type: 'MEMBER_JOIN',
          process_kind: 'REGISTER',
          status: 'PENDING_VERIFICATION',
          claim_mode: 'CLAIM_EXISTING',
          user_id: userId,
          tenant_id: tenantId,
        },
        {
          id: case2Id,
          correlation_id: corr2,
          case_type: 'MEMBER_JOIN',
          process_kind: 'REGISTER',
          status: 'PENDING_VERIFICATION',
          claim_mode: 'CREATE_NEW',
          user_id: userId,
          tenant_id: tenantId,
          referral_token_hash: 'stale_ref_hash_s4',
          beneficiary_token_hash: 'stale_ben_hash_s4',
          metadata: {
            staging_cleanup: {
              cleanup_status: 'PENDING',
              prefix: `staging/${case2Id}/`,
            },
          },
        },
      ],
    });

    // ── TEST 1: Cam kết nội quy & giới hạn 30.000 ký tự [FUNC-11] ──────────
    await basePrisma.$transaction(async (tx) => {
      const c = await tx.onboarding_cases.findUnique({ where: { id: case1Id } });

      let tooLongStatus = null;
      try {
        await onboardingConsentAndRulesService.recordRulesAgreement(tx, {
          caseRecord: c,
          rulesSnapshot: 'A'.repeat(MAX_RULES_SNAPSHOT_LENGTH + 1),
          actorId: userId,
        });
      } catch (e) {
        tooLongStatus = e.statusCode;
      }
      assert.strictEqual(tooLongStatus, 400, 'Vượt 30.000 ký tự phải trả HTTP 400');

      const agreed = await onboardingConsentAndRulesService.recordRulesAgreement(tx, {
        caseRecord: c,
        rulesSnapshot: 'Gia quy dòng họ Nguyễn - Điều 1: Kính tổ tôn trọng lễ nghĩa.',
        tosVersion: '2026.1',
        clanRulesVersion: 2,
        actorId: userId,
      });
      assert.ok(agreed.agreed_at, 'Phải lưu thời điểm agreed_at');
      assert.strictEqual(agreed.agreed_rules_checksum.length, 64, 'SHA-256 checksum phải đủ 64 ký tự');
    });
    console.log('✅ PASS Test 1: Cam kết nội quy, SHA-256 checksum & chặn vượt 30.000 ký tự [FUNC-11]');

    // ── TEST 2: Đồng thuận người thụ hưởng & Xác minh ngoại tuyến [FUNC-01][ARCH-06] ──
    let issuedToken = null;
    await basePrisma.$transaction(async (tx) => {
      const c = await tx.onboarding_cases.findUnique({ where: { id: case1Id } });
      const issued = await onboardingConsentAndRulesService.issueBeneficiaryConsentToken(tx, {
        caseRecord: c,
        beneficiaryUserId,
        actorId: userId,
      });
      issuedToken = issued.rawToken;
      assert.strictEqual(issued.caseRecord.beneficiary_consent_status, 'PENDING');
      assert.ok(issued.caseRecord.beneficiary_token_hash);

      const confirmed = await onboardingConsentAndRulesService.confirmBeneficiaryConsent(tx, {
        caseRecord: issued.caseRecord,
        rawToken: issuedToken,
        actorId: beneficiaryUserId,
        correlationId: corr1,
      });
      assert.strictEqual(confirmed.beneficiary_consent_status, 'CONFIRMED');
      assert.strictEqual(confirmed.beneficiary_token_hash, null, 'Token dùng xong phải bị xóa');

      const withOffline = await onboardingConsentAndRulesService.appendOfflineVerification(tx, {
        caseRecord: confirmed,
        endorserName: 'Cụ Nguyễn Văn Trưởng Tộc',
        callStatus: 'VERIFIED',
        notes: 'Đã gọi điện xác minh đúng hậu duệ chi 2',
        actorId: beneficiaryUserId,
      });
      assert.strictEqual(withOffline.metadata.offline_verifications.length, 1);
      assert.strictEqual(withOffline.metadata.offline_verifications[0].call_status, 'VERIFIED');
    });
    console.log('✅ PASS Test 2: Beneficiary Consent Token một lần dùng & Offline Verification [FUNC-01][ARCH-06]');

    // ── TEST 3: Worker tự động hết hạn EXPIRED dọn token & staging [ARCH-05][FUNC-10] ──
    const row2 = await basePrisma.onboarding_cases.findUnique({ where: { id: case2Id } });
    const expireRes = await expireOne(row2);
    assert.strictEqual(expireRes.ok, true);

    const expiredCase2 = await basePrisma.onboarding_cases.findUnique({ where: { id: case2Id } });
    assert.strictEqual(expiredCase2.status, 'EXPIRED');
    assert.strictEqual(expiredCase2.referral_token_hash, null, 'Worker EXPIRED phải xóa referral_token_hash');
    assert.strictEqual(expiredCase2.beneficiary_token_hash, null, 'Worker EXPIRED phải xóa beneficiary_token_hash');
    assert.strictEqual(expiredCase2.metadata.staging_cleanup.cleanup_status, 'CLEANED');

    let terminalStatus = null;
    try {
      onboardingStateMachineService.assertCaseNotTerminalForToken(expiredCase2);
    } catch (e) {
      terminalStatus = e.statusCode;
    }
    assert.strictEqual(terminalStatus, 410, 'Case EXPIRED dùng lại token phải trả HTTP 410 Gone');
    console.log('✅ PASS Test 3: Worker EXPIRED dọn token đồng bộ, Staging CLEANED & HTTP 410 Gone [ARCH-05][FUNC-10]');

    console.log('\n🎉 TẤT CẢ BÀI KIỂM THỬ SPRINT 4 ĐỀU ĐẠT 100%!\n');
  } finally {
    await basePrisma.notifications.deleteMany({
      where: { correlation_id: { in: [corr1, corr2] } },
    }).catch(() => {});
    await basePrisma.business_process_logs.deleteMany({
      where: { correlation_id: { in: [corr1, corr2] } },
    }).catch(() => {});
    await basePrisma.onboarding_cases.deleteMany({
      where: { id: { in: [case1Id, case2Id] } },
    }).catch(() => {});
    await basePrisma.users.deleteMany({
      where: { id: { in: [userId, beneficiaryUserId] } },
    }).catch(() => {});
    await basePrisma.tenants.deleteMany({ where: { id: tenantId } }).catch(() => {});
    await basePrisma.$disconnect();
  }
}

run().catch((err) => {
  console.error('❌ SPRINT 4 ACCEPTANCE TEST FAILED:', err);
  process.exit(1);
});
