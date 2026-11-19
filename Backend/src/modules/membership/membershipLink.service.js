/**
 * ============================================================================
 * PATH       : src/modules/membership/membershipLink.service.js
 * DATETIME   : 2026-11-19T09:43:00+07:00
 * VERSION    : 1.0.0-AMEND-RP-OP-2026-03-SPRINT2
 * DESCRIPTION:
 * - [AMEND-RP-OP-2026-03-BASELINE v7.0 - Sprint 2 / Task 2.3]
 *   Quản lý ghi nhận & thu hồi liên kết thành viên (user_member_links) và quyền sửa hồ sơ:
 *   + [FUNC-06] upsertLink sử dụng Raw SQL ($queryRaw / $executeRaw) theo cặp (user_id, tenant_id)
 *     để bypass middleware soft-delete của Prisma, tái sử dụng bản ghi đã xóa mềm (tránh P2002).
 *   + [FUNC-07] revokeGuardianOnEuClaim thu hồi đồng bộ toàn bộ quyền sửa hồ sơ
 *     (profile_edit_grants -> THU_HOI) và soft-delete CHỈ các liên kết GUARDIAN gắn với
 *     target_member_id khi chính chủ (EU) claim lại node.
 * ============================================================================
 * CHANGELOGS:
 * - 2026-11-19T09:43:00+07:00 (v1.0.0-AMEND-RP-OP-2026-03-SPRINT2):
 *   + Khởi tạo MembershipLinkService với upsertLink (Raw SQL ép kiểu enum Postgres)
 *     và revokeGuardianOnEuClaim chạy đồng bộ trong transaction.
 * ============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

'use strict';

const { AppError } = require('../../shared/errors');

class MembershipLinkService {
  /**
   * [FUNC-06] Raw SQL UPSERT trên user_member_links theo (user_id, tenant_id).
   * Lý do: Prisma middleware tự động lọc deleted_at IS NULL khi gọi findUnique/findFirst,
   * nên nếu từng tồn tại bản ghi bị soft-delete thì lệnh create() sẽ văng lỗi P2002.
   * Raw SQL cho phép tìm và khôi phục (deleted_at = NULL) đúng dòng cũ.
   *
   * @param {import('@prisma/client').Prisma.TransactionClient} tx
   * @param {object} params
   * @returns {Promise<{ id: string, reactivated: boolean }>}
   */
  async upsertLink(tx, params) {
    if (!tx) {
      throw new AppError('INTERNAL_ERROR', 'MembershipLinkService.upsertLink requires tx.', {
        statusCode: 500,
      });
    }

    const {
      userId,
      tenantId,
      memberId,
      linkType = 'PRIMARY_PATERNAL',
      roleInTenant = 'USER',
      isDefault = false,
      claimReason = null,
      proposalId = null,
      approvedBy = null,
    } = params;

    // Truy vấn trực tiếp không qua soft-delete filter để phát hiện cả bản ghi đã xóa mềm
    const rows = await tx.$queryRaw`
      SELECT id FROM user_member_links
      WHERE user_id = ${userId} AND tenant_id = ${tenantId}
      LIMIT 1
    `;

    if (rows.length > 0) {
      const existingId = rows[0].id;
      await tx.$executeRaw`
        UPDATE user_member_links
        SET member_id = ${memberId},
            link_type = ${linkType}::member_link_type,
            role_in_tenant = ${roleInTenant},
            status = 'DA_DUYET'::user_member_link_status,
            is_default = ${Boolean(isDefault)},
            claim_reason = ${claimReason},
            proposal_id = ${proposalId},
            approved_by = ${approvedBy},
            approved_at = NOW(),
            changed_by = ${approvedBy},
            deleted_at = NULL,
            updated_at = NOW()
        WHERE id = ${existingId}
      `;
      return { id: existingId, reactivated: true };
    }

    const created = await tx.user_member_links.create({
      data: {
        user_id: userId,
        tenant_id: tenantId,
        member_id: memberId,
        link_type: linkType,
        role_in_tenant: roleInTenant,
        status: 'DA_DUYET',
        is_default: Boolean(isDefault),
        claim_reason: claimReason,
        proposal_id: proposalId,
        approved_by: approvedBy,
        approved_at: new Date(),
        changed_by: approvedBy,
      },
      select: { id: true },
    });

    return { id: created.id, reactivated: false };
  }

  /**
   * [FUNC-07] Thu hồi quyền Giám hộ / Khai hộ đồng bộ khi chính chủ (EU) Claim lại node.
   * Lý do: Khi chính chủ quay lại tiếp quản hồ sơ, người khai hộ trước đó phải mất quyền
   * chỉnh sửa hồ sơ (profile_edit_grants -> THU_HOI) và liên kết GUARDIAN bị hủy đồng bộ
   * trong cùng transaction, nhưng không ảnh hưởng tới liên kết cá nhân của người khai hộ.
   *
   * @param {import('@prisma/client').Prisma.TransactionClient} tx
   * @param {object} params
   * @param {string} params.tenantId
   * @param {string} params.targetMemberId
   * @param {string|null} [params.actorId=null]
   */
  async revokeGuardianOnEuClaim(tx, { tenantId, targetMemberId, actorId = null }) {
    if (!tx) {
      throw new AppError(
        'INTERNAL_ERROR',
        'MembershipLinkService.revokeGuardianOnEuClaim requires tx.',
        { statusCode: 500 }
      );
    }

    const now = new Date();

    // 1. Thu hồi toàn bộ quyền sửa profile đang hiệu lực trên node mục tiêu
    const revokedGrants = await tx.profile_edit_grants.updateMany({
      where: {
        tenant_id: tenantId,
        target_member_id: targetMemberId,
        status: 'HIEU_LUC',
        deleted_at: null,
      },
      data: {
        status: 'THU_HOI',
        decided_at: now,
        changed_by: actorId,
      },
    });

    // 2. Xóa mềm CHỈ các liên kết loại GUARDIAN gắn với node mục tiêu
    const revokedLinks = await tx.user_member_links.updateMany({
      where: {
        tenant_id: tenantId,
        member_id: targetMemberId,
        link_type: 'GUARDIAN',
        deleted_at: null,
      },
      data: {
        status: 'HUY_LIEN_KET',
        deleted_at: now,
        changed_by: actorId,
      },
    });

    return {
      revokedGrantsCount: revokedGrants.count,
      revokedGuardianLinksCount: revokedLinks.count,
    };
  }
}

module.exports = {
  MembershipLinkService,
  membershipLinkService: new MembershipLinkService(),
};
