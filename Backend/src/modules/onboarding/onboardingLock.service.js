/**
 * ============================================================================
 * PATH       : src/modules/onboarding/onboardingLock.service.js
 * DATETIME   : 2026-11-19T12:52:00+07:00
 * VERSION    : 1.0.1-AMEND-RP-OP-2026-03-SPRINT2
 * DESCRIPTION:
 * - [AMEND-RP-OP-2026-03-BASELINE v7.0 - Sprint 2 / Task 2.2]
 *   Cung cấp cơ chế khóa hàng một chiều (Strict Lock Ordering) & ghi log sau khóa:
 *   + [ARCH-04] Khóa tuần tự đúng 4 bước:
 *       1. members (WHERE id = targetMemberId FOR UPDATE)
 *       2. users (WHERE id = lockUserId FOR UPDATE)
 *       3. user_member_links (WHERE user_id = lockUserId ORDER BY id ASC FOR UPDATE)
 *       4. onboarding_cases (ORDER BY id ASC FOR UPDATE)
 *     kèm SET LOCAL lock_timeout = '5s' và ánh xạ mã lỗi Postgres 55P03 -> HTTP 409.
 *   + [FUNC-05] Tính chính xác shouldBeDefault dưới khóa #3.
 *   + [FUNC-08] Helper writeProcessLogAfterLock ghi business_process_logs sau khóa #4,
 *     tự động tăng attempt_no theo correlation_id để tránh xung đột unique key.
 * ============================================================================
 * CHANGELOGS:
 * - 2026-11-19T09:43:00+07:00 (v1.0.0-AMEND-RP-OP-2026-03-SPRINT2):
 *   + Khởi tạo OnboardingLockService sử dụng basePrisma.$transaction để khóa chéo bảng
 *     an toàn không phụ thuộc AsyncLocalStorage tenantContext.
 * - 2026-11-19T12:52:00+07:00 (v1.0.1-AMEND-RP-OP-2026-03-SPRINT2):
 *   + Bổ sung nhận diện fallback '55P03' / 'lock timeout' trên err.message khi Prisma bọc lỗi raw query.
 * ============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

'use strict';

const { basePrisma } = require('../../lib/prisma.js');
const { AppError } = require('../../shared/errors');
const { writeBpl } = require('../../services/bpl.service.js');

class OnboardingLockService {
  /**
   * [ARCH-04] Thực thi nghiệp vụ bên trong transaction có khóa hàng một chiều (Strict Lock Ordering).
   * Lý do: Triệt tiêu deadlock khi nhiều request duyệt/claim chạm cùng node hoặc cùng user,
   * đồng thời đảm bảo tính toán is_default chuẩn xác ở bước #3 [FUNC-05].
   *
   * @template T
   * @param {object} params
   * @param {string|null} [params.caseId=null]
   * @param {string|null} [params.targetMemberId=null]
   * @param {string|null} [params.lockUserId=null]
   * @param {(tx: import('@prisma/client').Prisma.TransactionClient, lockCtx: { shouldBeDefault: boolean, lockedAt: Date }) => Promise<T>} work
   * @param {import('@prisma/client').PrismaClient} [prismaClient=basePrisma]
   * @returns {Promise<T>}
   */
  async executeWithStrictLock(params, work, prismaClient = basePrisma) {
    const { caseId = null, targetMemberId = null, lockUserId = null } = params || {};

    try {
      return await prismaClient.$transaction(async (tx) => {
        // Giới hạn thời gian chờ khóa 5 giây; quá hạn Postgres ném lỗi 55P03
        await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;

        // Bước 1: Khóa Node mục tiêu trên bảng members (nếu luồng Claim node có sẵn)
        if (targetMemberId) {
          await tx.$queryRaw`
            SELECT id FROM members WHERE id = ${targetMemberId} FOR UPDATE
          `;
        }

        // Bước 2 & Bước 3: Khóa User và toàn bộ danh sách liên kết của User theo thứ tự id tăng dần
        let shouldBeDefault = false;
        if (lockUserId) {
          await tx.$queryRaw`
            SELECT id FROM users WHERE id = ${lockUserId} FOR UPDATE
          `;
          await tx.$queryRaw`
            SELECT id FROM user_member_links
            WHERE user_id = ${lockUserId}
            ORDER BY id ASC
            FOR UPDATE
          `;

          // [FUNC-05] Đếm số liên kết mặc định hiện có ngay dưới khóa #3
          const defaultCount = await tx.user_member_links.count({
            where: {
              user_id: lockUserId,
              status: 'DA_DUYET',
              is_default: true,
              deleted_at: null,
            },
          });
          shouldBeDefault = defaultCount === 0;
        }

        // Bước 4: Khóa các hồ sơ onboarding_cases liên quan theo thứ tự id tăng dần
        if (targetMemberId) {
          await tx.$queryRaw`
            SELECT id FROM onboarding_cases
            WHERE primary_member_id = ${targetMemberId}
            ORDER BY id ASC
            FOR UPDATE
          `;
        } else if (caseId) {
          await tx.$queryRaw`
            SELECT id FROM onboarding_cases
            WHERE id = ${caseId}
            FOR UPDATE
          `;
        }

        return await work(tx, {
          shouldBeDefault,
          lockedAt: new Date(),
        });
      });
    } catch (err) {
      const pgCode = err?.meta?.code || err?.code;
      const errMsg = typeof err?.message === 'string' ? err.message : '';
      if (pgCode === '55P03' || errMsg.includes('55P03') || errMsg.includes('lock timeout')) {
        throw new AppError(
          'CONCURRENT_TRANSACTION_LOCKED',
          'Hồ sơ hoặc thành viên này đang được xử lý bởi một giao dịch khác. Vui lòng thử lại sau ít giây.',
          { statusCode: 409, cause: err }
        );
      }
      throw err;
    }
  }

  /**
   * [FUNC-08] Ghi nhận sự kiện vào sổ cái business_process_logs SAU KHI đã khóa case ở bước #4.
   * Lý do: Bảo toàn thứ tự sự kiện nghiệp vụ và tránh lỗi trùng unique (correlation_id, attempt_no).
   *
   * @param {import('@prisma/client').Prisma.TransactionClient} tx
   * @param {object} params
   */
  async writeProcessLogAfterLock(tx, params) {
    const {
      correlationId,
      processType,
      actorId,
      actorType = 'USER',
      tenantId = null,
      processStatus = 'SUCCESS',
      context = {},
      payload = {},
      extraMetadata = {},
    } = params;

    const agg = await tx.business_process_logs.aggregate({
      where: { correlation_id: String(correlationId) },
      _max: { attempt_no: true },
    });
    const nextAttemptNo = (agg?._max?.attempt_no || 0) + 1;

    return writeBpl({
      processType,
      actorContext: {
        actor_id: actorId,
        actor_type: actorType,
        tenant_id: tenantId,
        correlation_id: correlationId,
      },
      processStatus,
      attemptNo: nextAttemptNo,
      context,
      payload,
      extraMetadata,
      tx,
    });
  }
}

module.exports = {
  OnboardingLockService,
  onboardingLockService: new OnboardingLockService(),
};
