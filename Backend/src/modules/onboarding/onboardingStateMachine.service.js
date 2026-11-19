/**
 * ============================================================================
 * PATH       : src/modules/onboarding/onboardingStateMachine.service.js
 * DATETIME   : 2026-11-19T09:43:00+07:00
 * VERSION    : 1.0.0-AMEND-RP-OP-2026-03-SPRINT2
 * DESCRIPTION:
 * - [AMEND-RP-OP-2026-03-BASELINE v7.0 - Sprint 2 / Task 2.1]
 *   Quản lý máy trạng thái hồ sơ đăng ký/gia nhập (onboarding_cases):
 *   + [FUNC-04] Phân luồng cửa vào Khách mới (CHO_DUYET -> DRAFT, bắt buộc OTP)
 *     và Multi-Home (DA_DUYET -> bỏ qua OTP, vào thẳng PENDING_VERIFICATION/SUBMITTED).
 *   + [FUNC-10] Vô hiệu hóa đồng bộ toàn bộ token (beneficiary_token_hash,
 *     referral_token_hash, thời hạn) ngay trong DB transaction khi case chuyển
 *     sang các trạng thái kết thúc (APPROVED, REJECTED, CANCELLED, EXPIRED).
 * ============================================================================
 * CHANGELOGS:
 * - 2026-11-19T09:43:00+07:00 (v1.0.0-AMEND-RP-OP-2026-03-SPRINT2):
 *   + Khởi tạo OnboardingStateMachineService với ma trận chuyển trạng thái hợp lệ,
 *     kiểm tra điều kiện rời DRAFT, kiểm tra token terminal (HTTP 410) và
 *     hàm transition() đồng bộ dọn token trong transaction.
 * ============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

'use strict';

const { AppError } = require('../../shared/errors');

/**
 * Tập trạng thái kết thúc vòng đời hồ sơ: khi đạt các trạng thái này,
 * mọi token xác thực (OTP/Proxy/Referral) bắt buộc bị hủy đồng bộ [FUNC-10].
 */
const TERMINAL_STATES = new Set(['APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED']);

/**
 * Bảng chuyển trạng thái hợp lệ của onboarding_cases (khớp enum onboarding_case_status).
 */
const ALLOWED_TRANSITIONS = Object.freeze({
  DRAFT: new Set(['PENDING_VERIFICATION', 'PROFILE_COMPLETED', 'SUBMITTED', 'CANCELLED', 'EXPIRED']),
  PENDING_VERIFICATION: new Set(['SUBMITTED', 'NEEDS_REVISION', 'REJECTED', 'CANCELLED', 'EXPIRED']),
  PROFILE_COMPLETED: new Set(['FAMILY_TREE_DRAFT', 'SUBMITTED', 'CANCELLED', 'EXPIRED']),
  FAMILY_TREE_DRAFT: new Set(['SUBMITTED', 'CANCELLED', 'EXPIRED']),
  SUBMITTED: new Set(['UNDER_REVIEW', 'NEEDS_REVISION', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED']),
  UNDER_REVIEW: new Set(['NEEDS_REVISION', 'APPROVED', 'REJECTED', 'CANCELLED']),
  NEEDS_REVISION: new Set(['PENDING_VERIFICATION', 'SUBMITTED', 'CANCELLED', 'EXPIRED']),
  APPROVED: new Set(['MERGING', 'MERGED']),
  MERGING: new Set(['MERGED', 'MERGE_FAILED']),
  MERGE_FAILED: new Set(['MERGING', 'CANCELLED']),
  MERGED: new Set([]),
  REJECTED: new Set(['DRAFT']),
  CANCELLED: new Set([]),
  EXPIRED: new Set([]),
});

class OnboardingStateMachineService {
  /**
   * [FUNC-04] Xác định trạng thái khởi tạo & yêu cầu OTP dựa trên cửa vào Khách mới vs Multi-Home.
   * Lý do: Tài khoản đã được duyệt chính thức (users.status = 'DA_DUYET') đã xác thực danh tính,
   * được bỏ qua bước OTP và đi thẳng vào PENDING_VERIFICATION hoặc SUBMITTED.
   *
   * @param {object} params
   * @param {object} params.user
   * @param {boolean} [params.requiresVerification=true]
   * @returns {{ skipOtp: boolean, initialStatus: string }}
   */
  resolveInitialEntry({ user, requiresVerification = true }) {
    const isMultiHomeApprovedUser = user && user.status === 'DA_DUYET';
    if (isMultiHomeApprovedUser) {
      return {
        skipOtp: true,
        initialStatus: requiresVerification ? 'PENDING_VERIFICATION' : 'SUBMITTED',
      };
    }
    return {
      skipOtp: false,
      initialStatus: 'DRAFT',
    };
  }

  /**
   * [FUNC-04] Kiểm tra điều kiện rời khỏi trạng thái DRAFT đối với tài khoản Khách mới (CHO_DUYET).
   * Lý do: Chặn khách mới vượt qua bước xác thực OTP trước khi nộp/chuyển hồ sơ.
   *
   * @param {object} params
   * @param {object} params.user
   * @param {object} params.caseRecord
   */
  assertCanLeaveDraft({ user, caseRecord }) {
    if (user && user.status === 'DA_DUYET') return;
    if (!caseRecord || !caseRecord.otp_verified_at) {
      throw new AppError(
        'ONBOARDING_OTP_REQUIRED',
        'Tài khoản mới bắt buộc xác thực OTP trước khi chuyển trạng thái hồ sơ.',
        { statusCode: 422 }
      );
    }
  }

  /**
   * [FUNC-10] Chặn thao tác qua Magic Link / OTP khi case đã rơi vào trạng thái kết thúc.
   * Lý do: Đảm bảo tiêu chí AC9 — bấm link của case đã APPROVED/REJECTED/CANCELLED/EXPIRED trả HTTP 410 Gone.
   *
   * @param {object} caseRecord
   */
  assertCaseNotTerminalForToken(caseRecord) {
    if (!caseRecord) {
      throw new AppError('ONBOARDING_CASE_NOT_FOUND', 'Không tìm thấy hồ sơ đăng ký.', {
        statusCode: 404,
      });
    }
    if (TERMINAL_STATES.has(caseRecord.status)) {
      throw new AppError(
        'ONBOARDING_TOKEN_INVALIDATED',
        'Liên kết xác thực không còn hiệu lực do hồ sơ đã kết thúc xử lý.',
        { statusCode: 410 }
      );
    }
  }

  /**
   * [FUNC-04] & [FUNC-10] Chuyển trạng thái onboarding_cases và vô hiệu hóa toàn bộ token đồng bộ
   * trong cùng transaction khi đích đến thuộc TERMINAL_STATES.
   *
   * @param {import('@prisma/client').Prisma.TransactionClient} tx
   * @param {object} params
   * @param {object} params.caseRecord
   * @param {string} params.toState
   * @param {string|null} [params.actorId=null]
   * @param {object} [params.extraData={}]
   */
  async transition(tx, { caseRecord, toState, actorId = null, extraData = {} }) {
    if (!tx) {
      throw new AppError('INTERNAL_ERROR', 'OnboardingStateMachineService.transition requires tx.', {
        statusCode: 500,
      });
    }
    if (!caseRecord) {
      throw new AppError('ONBOARDING_CASE_NOT_FOUND', 'Không tìm thấy hồ sơ đăng ký.', {
        statusCode: 404,
      });
    }

    const fromState = caseRecord.status;
    if (fromState !== toState) {
      const allowed = ALLOWED_TRANSITIONS[fromState];
      if (!allowed || !allowed.has(toState)) {
        throw new AppError(
          'ONBOARDING_CASE_INVALID_STATUS',
          `Không thể chuyển trạng thái hồ sơ từ ${fromState} sang ${toState}.`,
          { statusCode: 423, details: { fromState, toState } }
        );
      }
    }

    const now = new Date();
    const isTerminal = TERMINAL_STATES.has(toState);

    // Ghi nhận mốc thời gian tương ứng với trạng thái đích
    const statusTimestampPatch = {};
    if (toState === 'SUBMITTED') statusTimestampPatch.submitted_at = now;
    if (toState === 'UNDER_REVIEW') statusTimestampPatch.reviewed_at = now;
    if (toState === 'APPROVED') statusTimestampPatch.approved_at = now;
    if (toState === 'REJECTED') statusTimestampPatch.rejected_at = now;
    if (toState === 'MERGED') statusTimestampPatch.merged_at = now;
    if (toState === 'CANCELLED') statusTimestampPatch.cancelled_at = now;
    if (toState === 'EXPIRED') statusTimestampPatch.expired_at = now;

    // [FUNC-10] Xóa sạch hash & thời hạn token ngay trong transaction khi kết thúc case
    const tokenInvalidationPatch = isTerminal
      ? {
          beneficiary_token_hash: null,
          beneficiary_token_expires_at: null,
          referral_token_hash: null,
          referral_expires_at: null,
        }
      : {};

    return tx.onboarding_cases.update({
      where: { id: caseRecord.id },
      data: {
        ...statusTimestampPatch,
        ...extraData,
        ...tokenInvalidationPatch,
        status: toState,
        changed_by: actorId || caseRecord.changed_by || null,
      },
    });
  }
}

module.exports = {
  OnboardingStateMachineService,
  onboardingStateMachineService: new OnboardingStateMachineService(),
  TERMINAL_STATES,
  ALLOWED_TRANSITIONS,
};
