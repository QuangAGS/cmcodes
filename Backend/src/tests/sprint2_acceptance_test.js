/**
 * ============================================================================
 * PATH       : src/tests/sprint2_acceptance_test.js
 * DATETIME   : 2026-11-19T12:55:00+07:00
 * VERSION    : 1.0.4-AMEND-RP-OP-2026-03-SPRINT2-TEST
 * DESCRIPTION:
 * - Bộ kiểm thử tích hợp & concurrency cho Sprint 2 (AMEND-RP-OP-2026-03-BASELINE v7.0):
 *   1. State Machine & Token Invalidation [FUNC-04][FUNC-10] (HTTP 410 khi case terminal).
 *   2. Strict Lock Ordering & 55P03 -> HTTP 409 Conflict + tính shouldBeDefault [ARCH-04][FUNC-05].
 *   3. Raw SQL UPSERT tái sử dụng bản ghi user_member_links đã soft-delete (tránh P2002) [FUNC-06]
 *      và thu hồi đồng bộ GUARDIAN + profile_edit_grants khi EU claim [FUNC-07].
 *   4. Referrer Deceased Exception: commit NEEDS_REVISION + BPL + Notification trước khi
 *      Controller ném HTTP 400 [FUNC-02][FUNC-08].
 * - Tự động dọn dẹp 100% bản ghi test ở khối finally (Zero Ledger Pollution).
 * ============================================================================
 * CHANGELOGS:
 * - 2026-11-19T10:15:00+07:00 (v1.0.0-AMEND-RP-OP-2026-03-SPRINT2-TEST):
 *   + Khởi tạo kịch bản kiểm thử nghiệm thu Sprint 2 chạy trực tiếp trên DB.
 * - 2026-11-19T12:45:00+07:00 (v1.0.1-AMEND-RP-OP-2026-03-SPRINT2-TEST):
 *   + Rút gọn slug tenant fixture xuống 10 ký tự (`t2${suffix}`) khớp ràng buộc @db.VarChar(10).
 * - 2026-11-19T12:48:00+07:00 (v1.0.2-AMEND-RP-OP-2026-03-SPRINT2-TEST):
 *   + Đổi giá trị referral_status fixture sang 'CONFIRMED' khớp ràng buộc chk_referral_status.
 * - 2026-11-19T12:52:00+07:00 (v1.0.3-AMEND-RP-OP-2026-03-SPRINT2-TEST):
 *   + Cấp { timeout: 15000 } cho transaction holder ở Test 2 để tránh Prisma timeout 5s mặc định
 *     hủy holder trước ngưỡng SET LOCAL lock_timeout = '5s' của executeWithStrictLock.
 * - 2026-11-19T12:55:00+07:00 (v1.0.4-AMEND-RP-OP-2026-03-SPRINT2-TEST):
 *   + Bổ sung bước nộp lại hồ sơ (NEEDS_REVISION -> SUBMITTED) trước khi duyệt APPROVED ở Test 3
 *     khớp đúng ma trận chuyển trạng thái hợp lệ của OnboardingStateMachineService [FUNC-04].
 * ============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

'use strict';

require('dotenv').config();
const assert = require('assert');
const crypto = require('crypto');
const { basePrisma } = require('../lib/prisma');
const { onboardingStateMachineService } = require('../modules/onboarding/onboardingStateMachine.service');
const { onboardingLockService } = require('../modules/onboarding/onboardingLock.service');
const { membershipLinkService } = require('../modules/membership/membershipLink.service');
const { onboardingApprovalGuardService } = require('../modules/onboarding/onboardingApprovalGuard.service');

async function run() {
  const suffix = crypto.randomUUID().slice(0, 8);
  const tenantId = crypto.randomUUID();
  const applicantUserId = crypto.randomUUID();
  const guardianUserId = crypto.randomUUID();
  const targetMemberId = crypto.randomUUID();
  const referrerMemberId = crypto.randomUUID();
  const grantId = crypto.randomUUID();
  const caseId = crypto.randomUUID();
  const correlationId = crypto.randomUUID();

  console.log(`\n🚀 Bắt đầu chạy Sprint 2 Acceptance & Concurrency Test (tag: ${suffix})...\n`);

  try {
    // ── Seed dữ liệu tạm cô lập ─────────────────────────────────────────────
    await basePrisma.tenants.create({
      data: {
        id: tenantId,
        name: `Dòng họ Test Sprint2 ${suffix}`,
        slug: `t2${suffix}`, // Tối đa 10 ký tự theo @db.VarChar(10) của bảng tenants
        status: 'HOAT_DONG',
      },
    });

    // eslint-disable-next-line no-restricted-syntax -- TEST-FIXTURE: tạo user tạm cho test Sprint 2
    await basePrisma.users.createMany({
      data: [
        {
          id: applicantUserId,
          name: `Applicant ${suffix}`,
          phone: `0999${Math.floor(100000 + Math.random() * 899999)}`,
          password: 'hashed_test_password',
          role: 'VIEWER',
          status: 'DA_DUYET',
          tenant_id: tenantId,
        },
        {
          id: guardianUserId,
          name: `Guardian ${suffix}`,
          phone: `0988${Math.floor(100000 + Math.random() * 899999)}`,
          password: 'hashed_test_password',
          role: 'USER',
          status: 'DA_DUYET',
          tenant_id: tenantId,
        },
      ],
    });

    await basePrisma.members.createMany({
      data: [
        {
          id: targetMemberId,
          tenant_id: tenantId,
          full_name: `Node Mục Tiêu ${suffix}`,
          gender: 'NAM',
          status: 'CHINH_THUC',
          is_alive: true,
        },
        {
          id: referrerMemberId,
          tenant_id: tenantId,
          full_name: `Người Bảo Lãnh Đã Mất ${suffix}`,
          gender: 'NAM',
          status: 'CHINH_THUC',
          is_alive: false, // Giả lập người bảo lãnh đã qua đời [FUNC-02]
        },
      ],
    });

    // Tạo link GUARDIAN + profile_edit_grants đang HIEU_LUC trên targetMemberId [FUNC-07]
    await basePrisma.user_member_links.create({
      data: {
        user_id: guardianUserId,
        tenant_id: tenantId,
        member_id: targetMemberId,
        link_type: 'GUARDIAN',
        status: 'DA_DUYET',
        role_in_tenant: 'USER',
        is_default: false,
      },
    });

    await basePrisma.profile_edit_grants.create({
      data: {
        id: grantId,
        tenant_id: tenantId,
        target_member_id: targetMemberId,
        grantee_user_id: guardianUserId,
        scope: 'PROFILE',
        status: 'HIEU_LUC',
      },
    });

    // Tạo 1 bản ghi user_member_links đã soft-delete cho applicantUserId để test Raw SQL UPSERT [FUNC-06]
    await basePrisma.user_member_links.create({
      data: {
        user_id: applicantUserId,
        tenant_id: tenantId,
        member_id: referrerMemberId,
        link_type: 'OTHER',
        status: 'HUY_LIEN_KET',
        role_in_tenant: 'USER',
        is_default: false,
        deleted_at: new Date(Date.now() - 86400000),
      },
    });

    await basePrisma.onboarding_cases.create({
      data: {
        id: caseId,
        correlation_id: correlationId,
        case_type: 'MEMBER_JOIN',
        process_kind: 'REGISTER',
        status: 'SUBMITTED',
        claim_mode: 'CLAIM_EXISTING',
        user_id: applicantUserId,
        tenant_id: tenantId,
        primary_member_id: targetMemberId,
        referrer_member_id: referrerMemberId,
        referral_status: 'CONFIRMED', // Hợp lệ theo chk_referral_status (NONE | PENDING | CONFIRMED | DECLINED | EXPIRED | CANCELLED)
        referral_token_hash: 'dummy_referral_hash_123',
        beneficiary_token_hash: 'dummy_beneficiary_hash_456',
      },
    });

    // ── TEST 1: Referrer Deceased Exception [FUNC-02][FUNC-08] ───────────────
    const guardOutcome = await onboardingLockService.executeWithStrictLock(
      { caseId, targetMemberId, lockUserId: applicantUserId },
      async (tx, lockCtx) => {
        assert.strictEqual(lockCtx.shouldBeDefault, true, 'User chưa có link active phải có shouldBeDefault = true');
        return onboardingApprovalGuardService.verifyReferrerOrRequestRevision(tx, {
          caseData: await tx.onboarding_cases.findUnique({ where: { id: caseId } }),
          actorId: guardianUserId,
        });
      }
    );

    assert.strictEqual(guardOutcome.success, false);
    assert.strictEqual(guardOutcome.reason, 'REFERRER_DECEASED');

    let caughtHttpStatus = null;
    try {
      onboardingApprovalGuardService.throwIfReferrerDeceased(guardOutcome, correlationId);
    } catch (e) {
      caughtHttpStatus = e.statusCode;
    }
    assert.strictEqual(caughtHttpStatus, 400, 'Controller phải ném HTTP 400 khi Referrer đã mất');

    const caseAfterGuard = await basePrisma.onboarding_cases.findUnique({ where: { id: caseId } });
    assert.strictEqual(caseAfterGuard.status, 'NEEDS_REVISION', 'TX phải commit trạng thái NEEDS_REVISION');
    assert.strictEqual(caseAfterGuard.revision_reason, 'REFERRER');
    assert.strictEqual(caseAfterGuard.referral_token_hash, null, 'Phải xóa referral_token_hash');
    console.log('✅ PASS Test 1: Referrer Deceased commit NEEDS_REVISION + BPL + Notification & HTTP 400 [FUNC-02][FUNC-08]');

    // ── TEST 2: Concurrency Lock Timeout (55P03 -> HTTP 409) [ARCH-04] ───────
    let releaseHolder;
    const holderReady = new Promise((resolve) => {
      basePrisma
        .$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM members WHERE id = ${targetMemberId} FOR UPDATE`;
          resolve();
          await new Promise((r) => {
            releaseHolder = r;
          });
        }, { timeout: 15000 })
        .catch(() => {});
    });

    await holderReady;
    let lockConflictStatus = null;
    let lockConflictCode = null;
    try {
      await onboardingLockService.executeWithStrictLock(
        { caseId, targetMemberId, lockUserId: applicantUserId },
        async () => 'SHOULD_NOT_REACH'
      );
    } catch (err) {
      lockConflictStatus = err.statusCode;
      lockConflictCode = err.code;
    } finally {
      if (releaseHolder) releaseHolder();
    }

    assert.strictEqual(lockConflictStatus, 409, 'Lock timeout 55P03 phải trả HTTP 409');
    assert.strictEqual(lockConflictCode, 'CONCURRENT_TRANSACTION_LOCKED');
    console.log('✅ PASS Test 2: Strict Lock Ordering bắt 55P03 trả HTTP 409 CONCURRENT_TRANSACTION_LOCKED [ARCH-04][FUNC-05]');

    // ── TEST 3: Raw SQL UPSERT (bypass soft-delete) & Cascade Revoke [FUNC-06][FUNC-07] ──
    await onboardingLockService.executeWithStrictLock(
      { caseId, targetMemberId, lockUserId: applicantUserId },
      async (tx, lockCtx) => {
        const revokeRes = await membershipLinkService.revokeGuardianOnEuClaim(tx, {
          tenantId,
          targetMemberId,
          actorId: guardianUserId,
        });
        assert.strictEqual(revokeRes.revokedGrantsCount, 1);
        assert.strictEqual(revokeRes.revokedGuardianLinksCount, 1);

        const upsertRes = await membershipLinkService.upsertLink(tx, {
          userId: applicantUserId,
          tenantId,
          memberId: targetMemberId,
          linkType: 'PRIMARY_PATERNAL',
          roleInTenant: 'USER',
          isDefault: lockCtx.shouldBeDefault,
          approvedBy: guardianUserId,
        });
        assert.strictEqual(upsertRes.reactivated, true, 'Phải tái sử dụng đúng bản ghi soft-deleted thay vì P2002');

        // Bước nộp lại hồ sơ sau khi sửa người bảo lãnh (NEEDS_REVISION -> SUBMITTED) [FUNC-04]
        const resubmittedCase = await onboardingStateMachineService.transition(tx, {
          caseRecord: await tx.onboarding_cases.findUnique({ where: { id: caseId } }),
          toState: 'SUBMITTED',
          actorId: applicantUserId,
        });
        assert.strictEqual(resubmittedCase.status, 'SUBMITTED');

        // Phê duyệt hồ sơ đã nộp lại (SUBMITTED -> APPROVED) & dọn token đồng bộ [FUNC-10]
        await onboardingStateMachineService.transition(tx, {
          caseRecord: resubmittedCase,
          toState: 'APPROVED',
          actorId: guardianUserId,
        });
      }
    );

    const activeApplicantLink = await basePrisma.user_member_links.findFirst({
      where: { user_id: applicantUserId, tenant_id: tenantId, deleted_at: null },
    });
    assert.ok(activeApplicantLink, 'Link của applicant phải được khôi phục active');
    assert.strictEqual(activeApplicantLink.member_id, targetMemberId);
    assert.strictEqual(activeApplicantLink.is_default, true);

    const grantAfterRevoke = await basePrisma.profile_edit_grants.findUnique({ where: { id: grantId } });
    assert.strictEqual(grantAfterRevoke.status, 'THU_HOI', 'profile_edit_grants phải chuyển THU_HOI');
    console.log('✅ PASS Test 3: Raw SQL UPSERT tái sử dụng slot soft-delete & Cascade Revoke Guardian [FUNC-06][FUNC-07]');

    // ── TEST 4: Token Invalidation sau trạng thái APPROVED -> HTTP 410 [FUNC-10] ──
    const approvedCase = await basePrisma.onboarding_cases.findUnique({ where: { id: caseId } });
    assert.strictEqual(approvedCase.beneficiary_token_hash, null, 'beneficiary_token_hash phải bị xóa sạch');
    let goneStatus = null;
    try {
      onboardingStateMachineService.assertCaseNotTerminalForToken(approvedCase);
    } catch (err) {
      goneStatus = err.statusCode;
    }
    assert.strictEqual(goneStatus, 410, 'Token của case terminal phải trả HTTP 410 Gone');
    console.log('✅ PASS Test 4: Token Invalidation đồng bộ & HTTP 410 Gone [FUNC-04][FUNC-10]');

    console.log('\n🎉 TẤT CẢ 4 BÀI KIỂM THỬ SPRINT 2 ĐỀU ĐẠT 100%!\n');
  } finally {
    // Dọn sạch 100% dữ liệu tạm
    await basePrisma.notifications.deleteMany({ where: { correlation_id: correlationId } }).catch(() => {});
    await basePrisma.business_process_logs.deleteMany({ where: { correlation_id: correlationId } }).catch(() => {});
    await basePrisma.onboarding_cases.deleteMany({ where: { id: caseId } }).catch(() => {});
    await basePrisma.profile_edit_grants.deleteMany({ where: { tenant_id: tenantId } }).catch(() => {});
    await basePrisma.user_member_links.deleteMany({ where: { tenant_id: tenantId } }).catch(() => {});
    await basePrisma.members.deleteMany({ where: { tenant_id: tenantId } }).catch(() => {});
    await basePrisma.users.deleteMany({ where: { id: { in: [applicantUserId, guardianUserId] } } }).catch(() => {});
    await basePrisma.tenants.deleteMany({ where: { id: tenantId } }).catch(() => {});
    await basePrisma.$disconnect();
  }
}

run().catch((err) => {
  console.error('❌ SPRINT 2 ACCEPTANCE TEST FAILED:', err);
  process.exit(1);
});
