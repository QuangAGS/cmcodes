/**
 * ============================================================================
 * PATH       : src/modules/onboarding/onboardingConsentAndRules.service.js
 * DATETIME   : 2026-11-19T14:15:00+07:00
 * VERSION    : 1.0.0-AMEND-RP-OP-2026-03-SPRINT4
 * DESCRIPTION:
 * - [AMEND-RP-OP-2026-03-BASELINE v7.0 - Sprint 4]
 *   Hoàn thiện vòng đời xác thực & tuân thủ hồ sơ Onboarding:
 *   1. [FUNC-11] Cam kết điều khoản & nội quy dòng họ (recordRulesAgreement):
 *      - Kiểm soát độ dài agreed_rules_snapshot <= 30.000 ký tự khớp constraint DB
 *        chk_agreed_rules_snapshot_length.
 *      - Tự động tính SHA-256 agreed_rules_checksum (64 hex) và lưu agreed_at,
 *        agreed_tos_version, agreed_clan_rules_version.
 *   2. [FUNC-01] & [FUNC-10] Đồng thuận người thụ hưởng (Proxy / Beneficiary Consent):
 *      - issueBeneficiaryConsentToken: sinh token ngẫu nhiên, lưu SHA-256 hash vào
 *        beneficiary_token_hash, đặt beneficiary_consent_status = 'PENDING'.
 *      - confirmBeneficiaryConsent: kiểm tra trạng thái terminal (HTTP 410) [FUNC-10],
 *        kiểm tra hết hạn token, đối chiếu timingSafeEqual, cập nhật CONFIRMED,
 *        xóa token một lần dùng và ghi sổ cái ONBOARDING_BENEFICIARY_CONSENT.
 *   3. [ARCH-06] Xác minh ngoại tuyến (appendOfflineVerification):
 *      - Ghi nhận kết quả gọi điện xác minh vào metadata.offline_verifications qua
 *        mergeOnboardingMetadata (src/types/metadata.js).
 * ============================================================================
 * CHANGELOGS:
 * - 2026-11-19T14:15:00+07:00 (v1.0.0-AMEND-RP-OP-2026-03-SPRINT4):
 *   + Khởi tạo OnboardingConsentAndRulesService đáp ứng [FUNC-01], [FUNC-10], [FUNC-11], [ARCH-06].
 * ============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

'use strict';

const crypto = require('crypto');
const { AppError } = require('../../shared/errors');
const { mergeOnboardingMetadata } = require('../../types/metadata');
const { onboardingStateMachineService } = require('./onboardingStateMachine.service');
const { onboardingLockService } = require('./onboardingLock.service');

const MAX_RULES_SNAPSHOT_LENGTH = 30000;
const DEFAULT_BENEFICIARY_TTL_HOURS = 72;

function hashTokenSha256(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken)).digest('hex');
}

class OnboardingConsentAndRulesService {
  /**
   * [FUNC-11] Ghi nhận cam kết điều khoản sử dụng & nội quy dòng họ kèm bản chụp snapshot.
   *
   * @param {import('@prisma/client').Prisma.TransactionClient} tx
   * @param {object} params
   * @param {object} params.caseRecord
   * @param {string} params.rulesSnapshot
   * @param {string|null} [params.tosVersion='1.0']
   * @param {number|null} [params.clanRulesVersion=1]
   * @param {string|null} [params.actorId=null]
   */
  async recordRulesAgreement(
    tx,
    {
      caseRecord,
      rulesSnapshot,
      tosVersion = '1.0',
      clanRulesVersion = 1,
      actorId = null,
    }
  ) {
    if (!tx) {
      throw new AppError(
        'INTERNAL_ERROR',
        'OnboardingConsentAndRulesService.recordRulesAgreement requires tx.',
        { statusCode: 500 }
      );
    }
    if (!caseRecord) {
      throw new AppError('ONBOARDING_CASE_NOT_FOUND', 'Không tìm thấy hồ sơ đăng ký.', {
        statusCode: 404,
      });
    }

    const snapshotText = rulesSnapshot != null ? String(rulesSnapshot) : '';
    if (!snapshotText.trim()) {
      throw new AppError(
        'RULES_SNAPSHOT_REQUIRED',
        'Nội dung bản chụp nội quy cam kết không được để trống.',
        { statusCode: 400 }
      );
    }

    // Khớp tuyệt đối ràng buộc SQL chk_agreed_rules_snapshot_length (<= 30.000 ký tự)
    if (snapshotText.length > MAX_RULES_SNAPSHOT_LENGTH) {
      throw new AppError(
        'RULES_SNAPSHOT_TOO_LONG',
        `Nội dung nội quy cam kết vượt quá giới hạn ${MAX_RULES_SNAPSHOT_LENGTH} ký tự.`,
        {
          statusCode: 400,
          details: {
            actualLength: snapshotText.length,
            maxLength: MAX_RULES_SNAPSHOT_LENGTH,
          },
        }
      );
    }

    const checksum = hashTokenSha256(snapshotText);
    const now = new Date();

    return tx.onboarding_cases.update({
      where: { id: caseRecord.id },
      data: {
        agreed_rules_snapshot: snapshotText,
        agreed_rules_checksum: checksum,
        agreed_tos_version: tosVersion ? String(tosVersion).slice(0, 20) : null,
        agreed_clan_rules_version:
          clanRulesVersion != null ? Number(clanRulesVersion) : null,
        agreed_at: now,
        changed_by: actorId || null,
      },
    });
  }

  /**
   * [FUNC-01] Phát hành token xác nhận đồng thuận cho người thụ hưởng (Beneficiary Consent).
   * Trả về rawToken một lần duy nhất để gửi qua email/SMS; DB chỉ lưu SHA-256 hash.
   *
   * @param {import('@prisma/client').Prisma.TransactionClient} tx
   * @param {object} params
   */
  async issueBeneficiaryConsentToken(
    tx,
    {
      caseRecord,
      beneficiaryUserId = null,
      ttlHours = DEFAULT_BENEFICIARY_TTL_HOURS,
      actorId = null,
    }
  ) {
    if (!tx) {
      throw new AppError(
        'INTERNAL_ERROR',
        'OnboardingConsentAndRulesService.issueBeneficiaryConsentToken requires tx.',
        { statusCode: 500 }
      );
    }
    onboardingStateMachineService.assertCaseNotTerminalForToken(caseRecord);

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashTokenSha256(rawToken);
    const expiresAt = new Date(Date.now() + Number(ttlHours) * 60 * 60 * 1000);

    const updatedCase = await tx.onboarding_cases.update({
      where: { id: caseRecord.id },
      data: {
        is_proxy: true,
        beneficiary_user_id: beneficiaryUserId || caseRecord.beneficiary_user_id || null,
        beneficiary_consent_status: 'PENDING',
        beneficiary_token_hash: tokenHash,
        beneficiary_token_expires_at: expiresAt,
        changed_by: actorId || null,
      },
    });

    return {
      rawToken,
      expiresAt,
      caseRecord: updatedCase,
    };
  }

  /**
   * [FUNC-01] & [FUNC-10] Xác nhận đồng thuận người thụ hưởng qua token.
   * - Chặn HTTP 410 Gone nếu case đã vào trạng thái kết thúc [FUNC-10].
   * - Kiểm tra hết hạn token; đối chiếu SHA-256 bằng timingSafeEqual.
   * - Cập nhật beneficiary_consent_status = 'CONFIRMED', xóa token & ghi BPL.
   *
   * @param {import('@prisma/client').Prisma.TransactionClient} tx
   * @param {object} params
   */
  async confirmBeneficiaryConsent(
    tx,
    { caseRecord, rawToken, actorId = null, correlationId = null, now = new Date() }
  ) {
    if (!tx) {
      throw new AppError(
        'INTERNAL_ERROR',
        'OnboardingConsentAndRulesService.confirmBeneficiaryConsent requires tx.',
        { statusCode: 500 }
      );
    }

    // [FUNC-10] Case đã terminal -> trả HTTP 410 Gone
    onboardingStateMachineService.assertCaseNotTerminalForToken(caseRecord);

    if (!caseRecord.beneficiary_token_hash) {
      throw new AppError(
        'BENEFICIARY_TOKEN_NOT_FOUND',
        'Yêu cầu xác nhận đồng thuận không tồn tại hoặc đã được xử lý.',
        { statusCode: 400 }
      );
    }

    if (
      caseRecord.beneficiary_token_expires_at &&
      new Date(caseRecord.beneficiary_token_expires_at).getTime() <= now.getTime()
    ) {
      await tx.onboarding_cases.update({
        where: { id: caseRecord.id },
        data: {
          beneficiary_consent_status: 'EXPIRED',
          beneficiary_token_hash: null,
          beneficiary_token_expires_at: null,
          changed_by: actorId || null,
        },
      });
      throw new AppError(
        'BENEFICIARY_TOKEN_EXPIRED',
        'Liên kết xác nhận đồng thuận đã hết hạn.',
        { statusCode: 410 }
      );
    }

    const providedHash = hashTokenSha256(rawToken || '');
    const expectedBuf = Buffer.from(caseRecord.beneficiary_token_hash, 'utf8');
    const providedBuf = Buffer.from(providedHash, 'utf8');

    const isMatch =
      expectedBuf.length === providedBuf.length &&
      crypto.timingSafeEqual(expectedBuf, providedBuf);

    if (!isMatch) {
      throw new AppError(
        'INVALID_BENEFICIARY_TOKEN',
        'Mã xác nhận đồng thuận không hợp lệ.',
        { statusCode: 400 }
      );
    }

    const updatedCase = await tx.onboarding_cases.update({
      where: { id: caseRecord.id },
      data: {
        beneficiary_consent_status: 'CONFIRMED',
        beneficiary_token_hash: null,
        beneficiary_token_expires_at: null,
        changed_by: actorId || null,
      },
    });

    await onboardingLockService.writeProcessLogAfterLock(tx, {
      correlationId: correlationId || caseRecord.correlation_id,
      processType: 'ONBOARDING_BENEFICIARY_CONSENT',
      actorId: actorId || caseRecord.beneficiary_user_id || caseRecord.user_id,
      actorType: 'USER',
      tenantId: caseRecord.tenant_id || null,
      processStatus: 'SUCCESS',
      context: {
        target_id: caseRecord.id,
        target_name: `Beneficiary consent CONFIRMED`,
      },
      payload: {
        case_id: caseRecord.id,
        consent_status: 'CONFIRMED',
        beneficiary_user_id: caseRecord.beneficiary_user_id || actorId || null,
      },
    });

    return updatedCase;
  }

  /**
   * [ARCH-06] Ghi nhận kết quả xác minh ngoại tuyến vào metadata.offline_verifications.
   *
   * @param {import('@prisma/client').Prisma.TransactionClient} tx
   * @param {object} params
   */
  async appendOfflineVerification(
    tx,
    { caseRecord, endorserName, callStatus, notes = null, actorId = null }
  ) {
    if (!tx) {
      throw new AppError(
        'INTERNAL_ERROR',
        'OnboardingConsentAndRulesService.appendOfflineVerification requires tx.',
        { statusCode: 500 }
      );
    }
    if (!caseRecord) {
      throw new AppError('ONBOARDING_CASE_NOT_FOUND', 'Không tìm thấy hồ sơ đăng ký.', {
        statusCode: 404,
      });
    }

    const normalizedCallStatus = String(callStatus || '').toUpperCase();
    if (!['VERIFIED', 'UNREACHABLE'].includes(normalizedCallStatus)) {
      throw new AppError(
        'INVALID_CALL_STATUS',
        'Trạng thái cuộc gọi xác minh chỉ nhận VERIFIED hoặc UNREACHABLE.',
        { statusCode: 400 }
      );
    }

    const prevMeta =
      caseRecord.metadata && typeof caseRecord.metadata === 'object' ? caseRecord.metadata : {};
    const prevList = Array.isArray(prevMeta.offline_verifications)
      ? prevMeta.offline_verifications
      : [];

    const entry = {
      id: crypto.randomUUID(),
      endorser_name: String(endorserName || '').trim(),
      call_status: normalizedCallStatus,
      ...(notes ? { notes: String(notes).trim() } : {}),
    };

    const mergedMeta = mergeOnboardingMetadata(prevMeta, {
      offline_verifications: [...prevList, entry],
    });

    return tx.onboarding_cases.update({
      where: { id: caseRecord.id },
      data: {
        metadata: mergedMeta,
        changed_by: actorId || null,
      },
    });
  }
}

module.exports = {
  OnboardingConsentAndRulesService,
  onboardingConsentAndRulesService: new OnboardingConsentAndRulesService(),
  MAX_RULES_SNAPSHOT_LENGTH,
  DEFAULT_BENEFICIARY_TTL_HOURS,
};
