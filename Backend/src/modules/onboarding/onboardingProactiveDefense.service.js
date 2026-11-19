/**
 * ============================================================================
 * PATH       : src/modules/onboarding/onboardingProactiveDefense.service.js
 * DATETIME   : 2026-11-19T14:00:00+07:00
 * VERSION    : 1.0.0-AMEND-RP-OP-2026-03-SPRINT3
 * DESCRIPTION:
 * - [AMEND-RP-OP-2026-03-BASELINE v7.0 - Sprint 3 / Task 3.2]
 *   Các chốt chặn phòng vệ chủ động ở tầng nghiệp vụ Onboarding:
 *   1. [FUNC-03] Khóa câu hỏi bảo mật (QA Lock):
 *      - Tăng qa_attempt_count mỗi lần trả lời sai; sai 3 lần liên tiếp -> qa_locked = true,
 *        chặn tự nộp lại (HTTP 423 ONBOARDING_QA_LOCKED) và đẩy sang Admin duyệt thủ công.
 *      - Hàm unlockQaByAdmin mở khóa bởi Admin và ghi sổ cái ONBOARDING_QA_UNLOCK.
 *   2. [FUNC-09] Cooldown bảo lãnh 7 ngày:
 *      - Ghi vết từ chối của người bảo lãnh vào metadata.referral_history
 *        ({ referrer_id, status: 'DECLINED', decided_at }) đúng hợp đồng metadata.js.
 *      - Chặn gửi lại yêu cầu bảo lãnh tới cùng referrer_id trong vòng < 7 ngày (HTTP 400).
 *   3. [NFR-03] Ngắt mạch Claim-Hopping 90 ngày:
 *      - Kiểm tra TRƯỚC KHI tạo hồ sơ CLAIM_EXISTING bằng truy vấn khớp đúng thứ tự
 *        6 cột của index idx_onboarding_claim_hopping
 *        (user_id, tenant_id, claim_mode, status, reopenable, updated_at).
 *      - Nếu có >= 2 hồ sơ REJECTED vĩnh viễn (reopenable = false) trong 90 ngày -> HTTP 403.
 * ============================================================================
 * CHANGELOGS:
 * - 2026-11-19T14:00:00+07:00 (v1.0.0-AMEND-RP-OP-2026-03-SPRINT3):
 *   + Khởi tạo OnboardingProactiveDefenseService đáp ứng đầy đủ [FUNC-03], [FUNC-09], [NFR-03].
 * ============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

'use strict';

const { basePrisma } = require('../../lib/prisma.js');
const { AppError } = require('../../shared/errors');
const { onboardingLockService } = require('./onboardingLock.service');

const MAX_QA_ATTEMPTS = 3;
const REFERRER_COOLDOWN_DAYS = 7;
const REFERRER_COOLDOWN_MS = REFERRER_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
const CLAIM_HOPPING_WINDOW_DAYS = 90;
const CLAIM_HOPPING_WINDOW_MS = CLAIM_HOPPING_WINDOW_DAYS * 24 * 60 * 60 * 1000;
const CLAIM_HOPPING_MAX_REJECTED = 2;

class OnboardingProactiveDefenseService {
  // ==========================================================================
  // 1. [FUNC-03] KHÓA CÂU HỎI BẢO MẬT (QA LOCK)
  // ==========================================================================

  /**
   * Chặn tự nộp lại / trả lời tiếp nếu hồ sơ đã bị khóa QA (qa_locked = true).
   *
   * @param {object} caseRecord
   */
  assertQaNotLocked(caseRecord) {
    if (caseRecord && caseRecord.qa_locked === true) {
      throw new AppError(
        'ONBOARDING_QA_LOCKED',
        'Hồ sơ đã bị khóa xác thực câu hỏi bảo mật do trả lời sai quá 3 lần. Vui lòng chờ Ban Quản trị xét duyệt thủ công.',
        {
          statusCode: 423,
          details: {
            qa_locked: true,
            qa_attempt_count: caseRecord.qa_attempt_count || MAX_QA_ATTEMPTS,
          },
        }
      );
    }
  }

  /**
   * [FUNC-03] Ghi nhận kết quả trả lời câu hỏi bảo mật trong transaction:
   * - Đúng: reset qa_attempt_count = 0.
   * - Sai: tăng qa_attempt_count + 1; nếu >= 3 thì bật qa_locked = true và giữ case ở trạng thái
   *   chờ Admin duyệt thủ công (chặn tự nộp lại).
   *
   * @param {import('@prisma/client').Prisma.TransactionClient} tx
   * @param {object} params
   * @param {object} params.caseRecord
   * @param {boolean} params.isAnswerCorrect
   * @param {string|null} [params.actorId=null]
   */
  async recordSecurityQuestionAttempt(tx, { caseRecord, isAnswerCorrect, actorId = null }) {
    if (!tx) {
      throw new AppError(
        'INTERNAL_ERROR',
        'OnboardingProactiveDefenseService.recordSecurityQuestionAttempt requires tx.',
        { statusCode: 500 }
      );
    }
    if (!caseRecord) {
      throw new AppError('ONBOARDING_CASE_NOT_FOUND', 'Không tìm thấy hồ sơ đăng ký.', {
        statusCode: 404,
      });
    }

    this.assertQaNotLocked(caseRecord);

    if (isAnswerCorrect) {
      const updated = await tx.onboarding_cases.update({
        where: { id: caseRecord.id },
        data: {
          qa_attempt_count: 0,
          qa_locked: false,
          changed_by: actorId || null,
        },
      });
      return {
        passed: true,
        qaLocked: false,
        attemptCount: 0,
        caseRecord: updated,
      };
    }

    const nextAttempts = Number(caseRecord.qa_attempt_count || 0) + 1;
    const shouldLock = nextAttempts >= MAX_QA_ATTEMPTS;

    const updated = await tx.onboarding_cases.update({
      where: { id: caseRecord.id },
      data: {
        qa_attempt_count: nextAttempts,
        qa_locked: shouldLock,
        changed_by: actorId || null,
      },
    });

    return {
      passed: false,
      qaLocked: shouldLock,
      attemptCount: nextAttempts,
      remainingAttempts: Math.max(0, MAX_QA_ATTEMPTS - nextAttempts),
      requiresAdminManualReview: shouldLock,
      caseRecord: updated,
    };
  }

  /**
   * [FUNC-03] Admin mở khóa QA cho hồ sơ bị khóa và ghi sổ cái ONBOARDING_QA_UNLOCK.
   *
   * @param {import('@prisma/client').Prisma.TransactionClient} tx
   * @param {object} params
   */
  async unlockQaByAdmin(tx, { caseRecord, adminId, correlationId = null, note = null }) {
    if (!tx) {
      throw new AppError(
        'INTERNAL_ERROR',
        'OnboardingProactiveDefenseService.unlockQaByAdmin requires tx.',
        { statusCode: 500 }
      );
    }
    if (!caseRecord) {
      throw new AppError('ONBOARDING_CASE_NOT_FOUND', 'Không tìm thấy hồ sơ đăng ký.', {
        statusCode: 404,
      });
    }

    const updated = await tx.onboarding_cases.update({
      where: { id: caseRecord.id },
      data: {
        qa_locked: false,
        qa_attempt_count: 0,
        changed_by: adminId || null,
      },
    });

    await onboardingLockService.writeProcessLogAfterLock(tx, {
      correlationId: correlationId || caseRecord.correlation_id,
      processType: 'ONBOARDING_QA_UNLOCK',
      actorId: adminId,
      actorType: 'USER',
      tenantId: caseRecord.tenant_id || null,
      processStatus: 'SUCCESS',
      context: {
        target_id: caseRecord.id,
        target_name: `QA Unlock case ${caseRecord.id}`,
      },
      payload: {
        case_id: caseRecord.id,
        unlocked_by: adminId,
        note: note || null,
      },
    });

    return updated;
  }

  // ==========================================================================
  // 2. [FUNC-09] COOLDOWN BẢO LÃNH 7 NGÀY
  // ==========================================================================

  /**
   * [FUNC-09] Kiểm tra người dùng có đang bị chặn gửi lại yêu cầu bảo lãnh cho cùng referrer_id
   * trong vòng 7 ngày kể từ lần từ chối (DECLINED) gần nhất hay không.
   *
   * @param {object} caseRecord
   * @param {string|null} targetReferrerId
   * @param {Date} [now=new Date()]
   */
  assertReferrerCooldown(caseRecord, targetReferrerId, now = new Date()) {
    if (!caseRecord || !targetReferrerId) return;

    const meta =
      caseRecord.metadata && typeof caseRecord.metadata === 'object' ? caseRecord.metadata : {};
    const history = Array.isArray(meta.referral_history) ? meta.referral_history : [];

    const nowMs = now.getTime();
    for (const entry of history) {
      if (
        entry &&
        entry.referrer_id === targetReferrerId &&
        entry.status === 'DECLINED' &&
        entry.decided_at
      ) {
        const decidedMs = new Date(entry.decided_at).getTime();
        if (Number.isFinite(decidedMs) && nowMs - decidedMs < REFERRER_COOLDOWN_MS) {
          const retryAt = new Date(decidedMs + REFERRER_COOLDOWN_MS).toISOString();
          throw new AppError(
            'REFERRER_COOLDOWN_ACTIVE',
            `Người bảo lãnh này vừa từ chối yêu cầu của bạn. Vui lòng chọn người bảo lãnh khác hoặc thử lại sau 7 ngày (từ ${retryAt}).`,
            {
              statusCode: 400,
              details: {
                referrer_id: targetReferrerId,
                decided_at: entry.decided_at,
                retry_after: retryAt,
                cooldown_days: REFERRER_COOLDOWN_DAYS,
              },
            }
          );
        }
      }
    }
  }

  /**
   * [FUNC-09] Ghi nhận quyết định của người bảo lãnh; nếu từ chối (DECLINED) thì lưu vết
   * vào metadata.referral_history và vô hiệu hóa token bảo lãnh hiện tại.
   *
   * @param {import('@prisma/client').Prisma.TransactionClient} tx
   * @param {object} params
   */
  async recordReferrerDecision(
    tx,
    { caseRecord, referrerId, decision, actorId = null, correlationId = null, decidedAt = new Date() }
  ) {
    if (!tx) {
      throw new AppError(
        'INTERNAL_ERROR',
        'OnboardingProactiveDefenseService.recordReferrerDecision requires tx.',
        { statusCode: 500 }
      );
    }
    if (!caseRecord) {
      throw new AppError('ONBOARDING_CASE_NOT_FOUND', 'Không tìm thấy hồ sơ đăng ký.', {
        statusCode: 404,
      });
    }

    const normalizedDecision = String(decision || '').toUpperCase();
    if (!['CONFIRMED', 'DECLINED'].includes(normalizedDecision)) {
      throw new AppError('INVALID_REFERRAL_DECISION', 'Quyết định bảo lãnh không hợp lệ.', {
        statusCode: 400,
      });
    }

    const prevMeta =
      caseRecord.metadata && typeof caseRecord.metadata === 'object' ? caseRecord.metadata : {};
    const prevHistory = Array.isArray(prevMeta.referral_history) ? prevMeta.referral_history : [];

    const nextHistory =
      normalizedDecision === 'DECLINED'
        ? [
            ...prevHistory,
            {
              referrer_id: referrerId || caseRecord.referrer_member_id,
              status: 'DECLINED',
              decided_at: decidedAt.toISOString(),
            },
          ]
        : prevHistory;

    const updated = await tx.onboarding_cases.update({
      where: { id: caseRecord.id },
      data: {
        referral_status: normalizedDecision,
        referral_token_hash: null,
        referral_expires_at: null,
        changed_by: actorId || null,
        metadata: {
          ...prevMeta,
          referral_history: nextHistory,
        },
      },
    });

    await onboardingLockService.writeProcessLogAfterLock(tx, {
      correlationId: correlationId || caseRecord.correlation_id,
      processType: 'ONBOARDING_REFERRAL_DECIDE',
      actorId: actorId || caseRecord.user_id,
      actorType: actorId ? 'USER' : 'SYSTEM',
      tenantId: caseRecord.tenant_id || null,
      processStatus: 'SUCCESS',
      context: {
        target_id: caseRecord.id,
        target_name: `Referral ${normalizedDecision}`,
      },
      payload: {
        case_id: caseRecord.id,
        decision: normalizedDecision,
        referrer_member_id: referrerId || caseRecord.referrer_member_id || null,
      },
    });

    return updated;
  }

  // ==========================================================================
  // 3. [NFR-03] NGẮT MẠCH CLAIM-HOPPING 90 NGÀY
  // ==========================================================================

  /**
   * [NFR-03] Kiểm tra trước khi khởi tạo hồ sơ CLAIM_EXISTING:
   * Đếm số hồ sơ REJECTED vĩnh viễn (reopenable = false) trong 90 ngày qua khớp đúng thứ tự
   * 6 cột của index idx_onboarding_claim_hopping:
   *   (user_id, tenant_id, claim_mode, status, reopenable, updated_at)
   * Nếu >= 2 -> ném HTTP 403 CLAIM_HOPPING_DETECTED.
   *
   * @param {import('@prisma/client').PrismaClient} [prismaClient=basePrisma]
   * @param {object} params
   * @param {string} params.userId
   * @param {string|null} params.tenantId
   * @param {string} [params.claimMode='CLAIM_EXISTING']
   * @param {Date} [params.now=new Date()]
   */
  async assertNoClaimHopping(
    prismaClient = basePrisma,
    { userId, tenantId, claimMode = 'CLAIM_EXISTING', now = new Date() }
  ) {
    if (claimMode !== 'CLAIM_EXISTING' || !userId || !tenantId) {
      return { blocked: false, rejectedCount: 0 };
    }

    const cutoffDate = new Date(now.getTime() - CLAIM_HOPPING_WINDOW_MS);

    // Truy vấn tuân thủ chính xác thứ tự 6 cột của index idx_onboarding_claim_hopping
    const rejectedCount = await prismaClient.onboarding_cases.count({
      where: {
        user_id: userId,
        tenant_id: tenantId,
        claim_mode: 'CLAIM_EXISTING',
        status: 'REJECTED',
        reopenable: false,
        updated_at: {
          gte: cutoffDate,
        },
      },
    });

    if (rejectedCount >= CLAIM_HOPPING_MAX_REJECTED) {
      throw new AppError(
        'CLAIM_HOPPING_DETECTED',
        'Bạn đã có từ 2 hồ sơ nhận diện thành viên bị từ chối vĩnh viễn tại dòng họ này trong vòng 90 ngày qua. Tạm thời không thể gửi thêm yêu cầu mới.',
        {
          statusCode: 403,
          details: {
            rejectedCount,
            windowDays: CLAIM_HOPPING_WINDOW_DAYS,
            maxAllowed: CLAIM_HOPPING_MAX_REJECTED - 1,
          },
        }
      );
    }

    return { blocked: false, rejectedCount };
  }
}

module.exports = {
  OnboardingProactiveDefenseService,
  onboardingProactiveDefenseService: new OnboardingProactiveDefenseService(),
  MAX_QA_ATTEMPTS,
  REFERRER_COOLDOWN_DAYS,
  REFERRER_COOLDOWN_MS,
  CLAIM_HOPPING_WINDOW_DAYS,
  CLAIM_HOPPING_MAX_REJECTED,
};
