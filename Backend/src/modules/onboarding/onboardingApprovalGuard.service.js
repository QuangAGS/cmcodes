/**
 * ============================================================================
 * PATH       : src/modules/onboarding/onboardingApprovalGuard.service.js
 * DATETIME   : 2026-11-19T09:43:00+07:00
 * VERSION    : 1.0.0-AMEND-RP-OP-2026-03-SPRINT2
 * DESCRIPTION:
 * - [AMEND-RP-OP-2026-03-BASELINE v7.0 - Sprint 2 / Task 2.4]
 *   Xử lý ngoại lệ Người bảo lãnh qua đời tại thời điểm Approve ([FUNC-02]):
 *   + Kiểm tra members.is_alive của referrer_member_id dưới khóa transaction.
 *   + Nếu người bảo lãnh đã mất (hoặc không còn tồn tại):
 *     1. Cập nhật onboarding_cases về NEEDS_REVISION (revision_reason = 'REFERRER'),
 *        xóa referral_token_hash và referral_expires_at.
 *     2. Ghi sổ cái business_process_logs (ONBOARDING_REVISION_REQUEST).
 *     3. Ghi thông báo Transactional Outbox (ONBOARDING_REVISION_REQUESTED) gửi Applicant.
 *     4. RETURN { success: false, reason: 'REFERRER_DECEASED' } (tuyệt đối KHÔNG throw
 *        trong $transaction để Prisma commit trạng thái NEEDS_REVISION và log).
 *   + Cung cấp helper throwIfReferrerDeceased() cho tầng Controller ném HTTP 400.
 * ============================================================================
 * CHANGELOGS:
 * - 2026-11-19T09:43:00+07:00 (v1.0.0-AMEND-RP-OP-2026-03-SPRINT2):
 *   + Khởi tạo OnboardingApprovalGuardService bảo vệ luồng phê duyệt hồ sơ.
 * ============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

'use strict';

const { AppError } = require('../../shared/errors');
const { onboardingLockService } = require('./onboardingLock.service');

class OnboardingApprovalGuardService {
  /**
   * [FUNC-02] Xác minh người bảo lãnh còn sống trong transaction phê duyệt.
   * Lý do: Không được ném Exception bên trong $transaction vì Prisma sẽ rollback
   * toàn bộ việc cập nhật NEEDS_REVISION và ghi log; phải trả về object báo lỗi
   * để transaction commit trước khi Controller ném HTTP 400.
   *
   * @param {import('@prisma/client').Prisma.TransactionClient} tx
   * @param {object} params
   * @param {object} params.caseData
   * @param {string|null} [params.actorId=null]
   */
  async verifyReferrerOrRequestRevision(tx, { caseData, actorId = null }) {
    if (!caseData || !caseData.referrer_member_id) {
      return { success: true };
    }

    const referrer = await tx.members.findFirst({
      where: {
        id: caseData.referrer_member_id,
        deleted_at: null,
      },
      select: {
        id: true,
        full_name: true,
        is_alive: true,
      },
    });

    if (referrer && referrer.is_alive !== false) {
      return { success: true, referrer };
    }

    const revisionMessage =
      'Người bảo lãnh được chỉ định đã qua đời. Vui lòng cập nhật và chọn người bảo lãnh khác trong dòng họ.';

    // 1. Đẩy hồ sơ về NEEDS_REVISION và vô hiệu hóa token bảo lãnh hiện tại
    await tx.onboarding_cases.update({
      where: { id: caseData.id },
      data: {
        status: 'NEEDS_REVISION',
        revision_reason: 'REFERRER',
        revision_request: revisionMessage,
        referral_status: 'NONE',
        referral_token_hash: null,
        referral_expires_at: null,
        changed_by: actorId || null,
      },
    });

    // 2. Ghi sổ cái business_process_logs sau khóa [FUNC-08]
    await onboardingLockService.writeProcessLogAfterLock(tx, {
      correlationId: caseData.correlation_id,
      processType: 'ONBOARDING_REVISION_REQUEST',
      actorId: actorId || caseData.user_id,
      actorType: actorId ? 'USER' : 'SYSTEM',
      tenantId: caseData.tenant_id || null,
      processStatus: 'SUCCESS',
      context: {
        target_id: caseData.id,
        target_name: referrer?.full_name || caseData.referrer_member_id,
      },
      payload: {
        case_id: caseData.id,
        revision_reason: 'REFERRER',
        referrer_member_id: caseData.referrer_member_id,
        reason: 'REFERRER_DECEASED',
      },
    });

    // 3. Ghi thông báo Transactional Outbox gửi Applicant [NFR-01]
    await tx.notifications.create({
      data: {
        user_id: caseData.user_id,
        tenant_id: caseData.tenant_id || null,
        correlation_id: caseData.correlation_id,
        type: 'ONBOARDING',
        event_type: 'ONBOARDING_REVISION_REQUESTED',
        title: 'Yêu cầu bổ sung người bảo lãnh hồ sơ gia nhập',
        content: revisionMessage,
        level: 'WARNING',
        status: 'PENDING',
        reliability: 'HIGH',
        changed_by: actorId || null,
        metadata: {
          case_id: caseData.id,
          revision_reason: 'REFERRER',
          referrer_member_id: caseData.referrer_member_id,
        },
      },
    });

    // 4. Trả về object thất bại để transaction được COMMIT
    return {
      success: false,
      reason: 'REFERRER_DECEASED',
      message: revisionMessage,
    };
  }

  /**
   * Ném HTTP 400 tại tầng Controller sau khi transaction đã commit trạng thái NEEDS_REVISION.
   *
   * @param {object} result
   * @param {string|null} [correlationId=null]
   */
  throwIfReferrerDeceased(result, correlationId = null) {
    if (result && result.success === false && result.reason === 'REFERRER_DECEASED') {
      throw new AppError(
        'ONBOARDING_REFERRER_DECEASED',
        result.message || 'Người bảo lãnh đã qua đời. Vui lòng chọn người bảo lãnh khác.',
        {
          statusCode: 400,
          correlationId,
          details: { reason: 'REFERRER_DECEASED', revision_reason: 'REFERRER' },
        }
      );
    }
  }
}

module.exports = {
  OnboardingApprovalGuardService,
  onboardingApprovalGuardService: new OnboardingApprovalGuardService(),
};
