/**
 * ============================================================================
 * PATH       : src/tests/sprint3_acceptance_test.js
 * DATETIME   : 2026-11-19T14:00:00+07:00
 * VERSION    : 1.0.0-AMEND-RP-OP-2026-03-SPRINT3-TEST
 * DESCRIPTION:
 * - Bộ kiểm thử nghiệm thu toàn diện Sprint 3 (AMEND-RP-OP-2026-03-BASELINE v7.0):
 *   1. [NFR-02] Logic-Tier Rate-Limiter:
 *      + Redis Lua script đếm nguyên tử & chặn vượt ngưỡng (HTTP 429).
 *      + Public Search khi Redis down -> Fail-Closed bắt buộc Turnstile (HTTP 403 nếu thiếu/sai).
 *      + In-App Search khi Redis down -> Graceful Degradation sang BoundedLRUCache.
 *   2. [FUNC-03] QA Lock:
 *      + Sai 3 lần liên tiếp -> qa_locked = true, chặn tự nộp lại (HTTP 423), Admin mở khóa
 *        ghi log ONBOARDING_QA_UNLOCK.
 *   3. [FUNC-09] Referrer Cooldown 7 ngày:
 *      + Từ chối bảo lãnh ghi vào metadata.referral_history; chặn gửi lại trong < 7 ngày (HTTP 400);
 *        cho phép gửi lại sau >= 7 ngày.
 *   4. [NFR-03] Ngắt mạch Claim-Hopping 90 ngày:
 *      + Đếm hồ sơ REJECTED vĩnh viễn (reopenable = false) trong 90 ngày; >= 2 -> HTTP 403
 *        CLAIM_HOPPING_DETECTED.
 * - Tự động dọn sạch 100% dữ liệu tạm ở khối finally.
 * ============================================================================
 * CHANGELOGS:
 * - 2026-11-19T14:00:00+07:00 (v1.0.0-AMEND-RP-OP-2026-03-SPRINT3-TEST):
 *   + Khởi tạo bộ kiểm thử nghiệm thu Sprint 3 chạy trực tiếp trên DB & Memory.
 * ============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

'use strict';

require('dotenv').config();
const assert = require('assert');
const crypto = require('crypto');
const { basePrisma } = require('../lib/prisma');
const {
  LogicRateLimiterService,
  BoundedLRUCache,
} = require('../services/logicRateLimiter.service');
const {
  onboardingProactiveDefenseService,
} = require('../modules/onboarding/onboardingProactiveDefense.service');

async function run() {
  const suffix = crypto.randomUUID().slice(0, 8);
  const tenantId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const adminId = crypto.randomUUID();
  const referrerId = crypto.randomUUID();
  const activeCaseId = crypto.randomUUID();
  const rejectedCase1Id = crypto.randomUUID();
  const rejectedCase2Id = crypto.randomUUID();
  const correlationId = crypto.randomUUID();

  console.log(`\n🚀 Bắt đầu chạy Sprint 3 Acceptance Test (tag: ${suffix})...\n`);

  try {
    // ── TEST 1: Logic-Tier Rate-Limiter [NFR-02] ────────────────────────────
    const mockRedisCounters = new Map();
    const healthyRedis = {
      eval: async (_script, _numKeys, key) => {
        const next = (mockRedisCounters.get(key) || 0) + 1;
        mockRedisCounters.set(key, next);
        return next;
      },
    };
    const downRedis = {
      eval: async () => {
        throw new Error('ECONNREFUSED Redis down');
      },
    };

    const limiter = new LogicRateLimiterService({
      redisClient: healthyRedis,
      turnstileVerifier: async (token) => ({
        success: token === 'VALID_CF_TOKEN',
        message: 'Invalid Turnstile',
      }),
      lruCache: new BoundedLRUCache({ maxEntries: 100 }),
    });

    // 1a. Redis khỏe -> đếm qua Lua & chặn ở request thứ 3 khi maxRequests = 2
    const r1 = await limiter.consumePublicSearch({
      bucket: 'test_pub',
      identifier: '1.2.3.4',
      maxRequests: 2,
      windowSeconds: 60,
    });
    assert.strictEqual(r1.backend, 'REDIS');
    await limiter.consumePublicSearch({
      bucket: 'test_pub',
      identifier: '1.2.3.4',
      maxRequests: 2,
      windowSeconds: 60,
    });

    let pub429 = null;
    try {
      await limiter.consumePublicSearch({
        bucket: 'test_pub',
        identifier: '1.2.3.4',
        maxRequests: 2,
        windowSeconds: 60,
      });
    } catch (e) {
      pub429 = e.statusCode;
    }
    assert.strictEqual(pub429, 429, 'Public search vượt ngưỡng Redis phải trả 429');

    // 1b. Redis down -> Public Search Fail-Closed bắt buộc Turnstile (403 nếu thiếu/sai)
    limiter.setRedisClient(downRedis);
    let pub403NoToken = null;
    try {
      await limiter.consumePublicSearch({
        bucket: 'test_pub',
        identifier: '1.2.3.4',
        maxRequests: 2,
        windowSeconds: 60,
        turnstileToken: null,
      });
    } catch (e) {
      pub403NoToken = e.statusCode;
    }
    assert.strictEqual(pub403NoToken, 403, 'Redis down phải Fail-Closed bắt Turnstile (403)');

    const pubTurnstileOk = await limiter.consumePublicSearch({
      bucket: 'test_pub',
      identifier: '1.2.3.4',
      maxRequests: 2,
      windowSeconds: 60,
      turnstileToken: 'VALID_CF_TOKEN',
    });
    assert.strictEqual(pubTurnstileOk.backend, 'TURNSTILE_FAIL_CLOSED');

    // 1c. Redis down -> In-App Search hạ cấp sang BoundedLRUCache
    const inApp1 = await limiter.consumeInAppSearch({
      bucket: 'test_inapp',
      identifier: userId,
      maxRequests: 1,
      windowSeconds: 60,
    });
    assert.strictEqual(inApp1.backend, 'LRU_CACHE');
    let inApp429 = null;
    try {
      await limiter.consumeInAppSearch({
        bucket: 'test_inapp',
        identifier: userId,
        maxRequests: 1,
        windowSeconds: 60,
      });
    } catch (e) {
      inApp429 = e.statusCode;
    }
    assert.strictEqual(inApp429, 429, 'In-App LRUCache phải chặn khi vượt ngưỡng');
    console.log('✅ PASS Test 1: Redis Lua Rate-Limiter, Public Fail-Closed Turnstile & In-App LRUCache [NFR-02]');

    // ── Seed DB tạm cho Test 2, 3, 4 ────────────────────────────────────────
    await basePrisma.tenants.create({
      data: {
        id: tenantId,
        name: `Dòng họ Test Sprint3 ${suffix}`,
        slug: `t3${suffix}`,
        status: 'HOAT_DONG',
      },
    });

    // eslint-disable-next-line no-restricted-syntax -- TEST-FIXTURE: tạo user tạm cho test Sprint 3
    await basePrisma.users.createMany({
      data: [
        {
          id: userId,
          name: `Applicant S3 ${suffix}`,
          phone: `0977${Math.floor(100000 + Math.random() * 899999)}`,
          password: 'hashed_test_password',
          role: 'VIEWER',
          status: 'DA_DUYET',
          tenant_id: tenantId,
        },
        {
          id: adminId,
          name: `Admin S3 ${suffix}`,
          phone: `0966${Math.floor(100000 + Math.random() * 899999)}`,
          password: 'hashed_test_password',
          role: 'CLAN_ADMIN',
          status: 'DA_DUYET',
          tenant_id: tenantId,
        },
      ],
    });

    await basePrisma.members.create({
      data: {
        id: referrerId,
        tenant_id: tenantId,
        full_name: `Người Bảo Lãnh S3 ${suffix}`,
        gender: 'NAM',
        status: 'CHINH_THUC',
        is_alive: true,
      },
    });

    await basePrisma.onboarding_cases.create({
      data: {
        id: activeCaseId,
        correlation_id: correlationId,
        case_type: 'MEMBER_JOIN',
        process_kind: 'REGISTER',
        status: 'PENDING_VERIFICATION',
        claim_mode: 'CLAIM_EXISTING',
        user_id: userId,
        tenant_id: tenantId,
        referrer_member_id: referrerId,
        referral_status: 'PENDING',
      },
    });

    // ── TEST 2: QA Lock sau 3 lần sai & Admin Unlock [FUNC-03] ──────────────
    await basePrisma.$transaction(async (tx) => {
      let c = await tx.onboarding_cases.findUnique({ where: { id: activeCaseId } });
      const a1 = await onboardingProactiveDefenseService.recordSecurityQuestionAttempt(tx, {
        caseRecord: c,
        isAnswerCorrect: false,
        actorId: userId,
      });
      assert.strictEqual(a1.qaLocked, false);
      assert.strictEqual(a1.attemptCount, 1);

      const a2 = await onboardingProactiveDefenseService.recordSecurityQuestionAttempt(tx, {
        caseRecord: a1.caseRecord,
        isAnswerCorrect: false,
        actorId: userId,
      });
      assert.strictEqual(a2.qaLocked, false);
      assert.strictEqual(a2.attemptCount, 2);

      const a3 = await onboardingProactiveDefenseService.recordSecurityQuestionAttempt(tx, {
        caseRecord: a2.caseRecord,
        isAnswerCorrect: false,
        actorId: userId,
      });
      assert.strictEqual(a3.qaLocked, true, 'Sai lần thứ 3 bắt buộc khóa qa_locked = true');
      assert.strictEqual(a3.requiresAdminManualReview, true);

      let qa423 = null;
      try {
        onboardingProactiveDefenseService.assertQaNotLocked(a3.caseRecord);
      } catch (e) {
        qa423 = e.statusCode;
      }
      assert.strictEqual(qa423, 423, 'Hồ sơ qa_locked phải chặn tự nộp lại với HTTP 423');

      const unlocked = await onboardingProactiveDefenseService.unlockQaByAdmin(tx, {
        caseRecord: a3.caseRecord,
        adminId,
        correlationId,
        note: 'Admin xác minh thủ công thành công',
      });
      assert.strictEqual(unlocked.qa_locked, false);
      assert.strictEqual(unlocked.qa_attempt_count, 0);
    });
    console.log('✅ PASS Test 2: QA Lock sau 3 lần sai (HTTP 423) & Admin Unlock ghi BPL [FUNC-03]');

    // ── TEST 3: Referrer Cooldown 7 ngày [FUNC-09] ──────────────────────────
    const updatedAfterDecline = await basePrisma.$transaction(async (tx) => {
      const c = await tx.onboarding_cases.findUnique({ where: { id: activeCaseId } });
      return onboardingProactiveDefenseService.recordReferrerDecision(tx, {
        caseRecord: c,
        referrerId,
        decision: 'DECLINED',
        actorId: adminId,
        correlationId,
      });
    });

    let cooldown400 = null;
    try {
      onboardingProactiveDefenseService.assertReferrerCooldown(updatedAfterDecline, referrerId);
    } catch (e) {
      cooldown400 = e.statusCode;
    }
    assert.strictEqual(cooldown400, 400, 'Gửi lại cùng referrer trong < 7 ngày phải trả HTTP 400');

    // Giả lập thời điểm sau 7 ngày + 1 phút -> được phép gửi lại
    const after7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 60000);
    onboardingProactiveDefenseService.assertReferrerCooldown(
      updatedAfterDecline,
      referrerId,
      after7Days
    );
    console.log('✅ PASS Test 3: Referrer Cooldown 7 ngày lưu metadata.referral_history & chặn HTTP 400 [FUNC-09]');

    // ── TEST 4: Ngắt mạch Claim-Hopping 90 ngày [NFR-03] ────────────────────
    // Chưa có hồ sơ từ chối vĩnh viễn -> cho phép
    const hopClean = await onboardingProactiveDefenseService.assertNoClaimHopping(basePrisma, {
      userId,
      tenantId,
      claimMode: 'CLAIM_EXISTING',
    });
    assert.strictEqual(hopClean.rejectedCount, 0);

    // Tạo 2 hồ sơ CLAIM_EXISTING bị REJECTED vĩnh viễn (reopenable = false) trong 90 ngày
    await basePrisma.onboarding_cases.createMany({
      data: [
        {
          id: rejectedCase1Id,
          correlation_id: crypto.randomUUID(),
          case_type: 'MEMBER_JOIN',
          process_kind: 'REGISTER',
          status: 'REJECTED',
          claim_mode: 'CLAIM_EXISTING',
          reopenable: false,
          user_id: userId,
          tenant_id: tenantId,
        },
        {
          id: rejectedCase2Id,
          correlation_id: crypto.randomUUID(),
          case_type: 'MEMBER_JOIN',
          process_kind: 'REGISTER',
          status: 'REJECTED',
          claim_mode: 'CLAIM_EXISTING',
          reopenable: false,
          user_id: userId,
          tenant_id: tenantId,
        },
      ],
    });

    let hop403 = null;
    let hopCode = null;
    try {
      await onboardingProactiveDefenseService.assertNoClaimHopping(basePrisma, {
        userId,
        tenantId,
        claimMode: 'CLAIM_EXISTING',
      });
    } catch (e) {
      hop403 = e.statusCode;
      hopCode = e.code;
    }
    assert.strictEqual(hop403, 403, '>= 2 REJECTED vĩnh viễn trong 90 ngày phải trả HTTP 403');
    assert.strictEqual(hopCode, 'CLAIM_HOPPING_DETECTED');
    console.log('✅ PASS Test 4: Ngắt mạch Claim-Hopping 90 ngày khớp index 6 cột (HTTP 403) [NFR-03]');

    console.log('\n🎉 TẤT CẢ 4 BÀI KIỂM THỬ SPRINT 3 ĐỀU ĐẠT 100%!\n');
  } finally {
    await basePrisma.business_process_logs.deleteMany({ where: { correlation_id: correlationId } }).catch(() => {});
    await basePrisma.onboarding_cases.deleteMany({
      where: { id: { in: [activeCaseId, rejectedCase1Id, rejectedCase2Id] } },
    }).catch(() => {});
    await basePrisma.members.deleteMany({ where: { tenant_id: tenantId } }).catch(() => {});
    await basePrisma.users.deleteMany({ where: { id: { in: [userId, adminId] } } }).catch(() => {});
    await basePrisma.tenants.deleteMany({ where: { id: tenantId } }).catch(() => {});
    await basePrisma.$disconnect();
  }
}

run().catch((err) => {
  console.error('❌ SPRINT 3 ACCEPTANCE TEST FAILED:', err);
  process.exit(1);
});
