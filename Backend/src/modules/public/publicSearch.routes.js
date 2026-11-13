/**
 * ============================================================================
 * PATH       : src/modules/public/publicSearch.routes.js
 * DATETIME   : 2026-11-13T17:15:00+07:00
 * VERSION    : 1.3.0-MULTIHOME-UAT-BUG2-ISCLAN-MARRIAGE-RESOLVE
 * DESCRIPTION:
 * - [AMEND-RP-OP-2026-02 V1.5.0 & AMEND-RP-OP-2026-03 G2] API công khai cho Guest Claim (C2) & Multi-Home (C1):
 *   1) GET /api/public/tenants/search?q=
 *      - Rate limit theo IP; q tối thiểu 2 ký tự.
 *      - Trả { id, name, slug } của các dòng họ HOAT_DONG, không lộ dữ liệu thành viên.
 *   2) GET /api/public/tenants/:tenantId/members/claim-search?q=
 *      - Rate limit tối đa 15 request/phút/IP; q tối thiểu 2 ký tự.
 *      - Chỉ truy vấn status = 'CHINH_THUC', deleted_at = null.
 *      - KHÔNG lọc is_clan = true để cho phép cả con rể / con dâu (is_clan = false) tìm và nhận hồ sơ (EM).
 *      - Trả payload nhận diện phả hệ tối thiểu kèm is_clan & child_type (suy diễn từ marriages nếu
 *        is_clan = false nhưng DB đang dính @default(CON_DE)).
 *      - Tuyệt đối không trả SĐT, email, địa chỉ, ngày/tháng sinh.
 * ============================================================================
 * CHANGELOGS:
 * - 2026-11-12T20:55:00+07:00 (v1.2.0-MULTIHOME-AMEND03-G2-NO-ISCLAN-FILTER): Bỏ lọc is_clan = true.
 * - 2026-11-13T17:15:00+07:00 (v1.3.0-MULTIHOME-UAT-BUG2-ISCLAN-MARRIAGE-RESOLVE):
 *   + Select is_clan, child_type, marriages_as_husband, marriages_as_wife và trả về is_clan + child_type
 *     đã suy diễn chuẩn (CON_RE / CON_DAU cho ngoại tộc) trong claim-search.
 * ============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

'use strict';

const express = require('express');
const router = express.Router();

const { basePrisma } = require('../../lib/prisma.js');
const { asyncHandler } = require('../../shared/errors');
const {
  publicSearchRateLimiter,
  publicClaimSearchRateLimiter,
} = require('../../middlewares/rateLimit.middleware');
const { UUID_REGEX } = require('../auth/registrationValidator');

/**
 * Suy diễn tư cách Nội tộc / Ngoại tộc (is_clan) và vai vế (child_type) từ members + marriages.
 * Khắc phục trường hợp schema.prisma đặt @default(CON_DE) cho thành viên ngoại tộc (is_clan = false).
 */
function resolveMemberClanRelation(member) {
  if (!member) {
    return { isClan: true, childType: 'CON_DE' };
  }
  const isClan = member.is_clan !== false;
  const hasClanWife = (member.marriages_as_husband || []).some(
    (m) =>
      m.members_marriages_wife_idTomembers &&
      m.members_marriages_wife_idTomembers.is_clan !== false
  );
  const hasClanHusband = (member.marriages_as_wife || []).some(
    (m) =>
      m.members_marriages_husband_idTomembers &&
      m.members_marriages_husband_idTomembers.is_clan !== false
  );
  const isMarriedToClanMember = hasClanWife || hasClanHusband;

  if (!isClan) {
    if (
      member.child_type === 'CON_RE' ||
      member.child_type === 'CON_DAU' ||
      member.child_type === 'KHAC'
    ) {
      return { isClan: false, childType: member.child_type };
    }
    if (isMarriedToClanMember || member.child_type === 'CON_DE' || !member.child_type) {
      const inferred =
        member.gender === 'NAM'
          ? 'CON_RE'
          : member.gender === 'NU'
            ? 'CON_DAU'
            : 'KHAC';
      return { isClan: false, childType: inferred };
    }
    return { isClan: false, childType: member.child_type };
  }

  return {
    isClan: true,
    childType: member.child_type || 'CON_DE',
  };
}

/**
 * 5.1 Tìm dòng họ công khai cho Guest
 * GET /api/public/tenants/search?q=
 */
router.get(
  '/tenants/search',
  publicSearchRateLimiter,
  asyncHandler(async (req, res) => {
    const rawQ = req.query.q ?? req.query.keyword ?? '';
    const keyword = String(rawQ).trim();

    if (keyword.length < 2) {
      return res.status(400).json({
        status: 'error',
        code: 'QUERY_TOO_SHORT',
        message: 'Từ khóa tìm kiếm dòng họ cần tối thiểu 2 ký tự.',
      });
    }

    const tenants = await basePrisma.tenants.findMany({
      where: {
        deleted_at: null,
        status: 'HOAT_DONG',
        OR: [
          { name: { contains: keyword, mode: 'insensitive' } },
          { slug: { contains: keyword, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        name: true,
        slug: true,
      },
      take: 20,
      orderBy: { name: 'asc' },
    });

    return res.status(200).json({
      status: 'success',
      data: tenants,
    });
  })
);

/**
 * 5.2 Tìm thành viên chính thức trên cây để Claim (EM) cho Guest
 * GET /api/public/tenants/:tenantId/members/claim-search?q=
 */
router.get(
  '/tenants/:tenantId/members/claim-search',
  publicClaimSearchRateLimiter,
  asyncHandler(async (req, res) => {
    const { tenantId } = req.params;
    const rawQ = req.query.q ?? req.query.keyword ?? '';
    const keyword = String(rawQ).trim();

    if (!tenantId || !UUID_REGEX.test(String(tenantId).trim())) {
      return res.status(400).json({
        status: 'error',
        code: 'INVALID_TENANT_ID',
        message: 'Mã định danh dòng họ không hợp lệ.',
      });
    }

    if (keyword.length < 2) {
      return res.status(400).json({
        status: 'error',
        code: 'QUERY_TOO_SHORT',
        message: 'Từ khóa tìm kiếm thành viên cần tối thiểu 2 ký tự.',
      });
    }

    const tenant = await basePrisma.tenants.findFirst({
      where: {
        id: tenantId,
        deleted_at: null,
        status: 'HOAT_DONG',
      },
      select: { id: true },
    });

    if (!tenant) {
      return res.status(404).json({
        status: 'error',
        code: 'TENANT_NOT_FOUND',
        message: 'Không tìm thấy dòng họ hoặc dòng họ chưa kích hoạt.',
      });
    }

    // Chỉ lấy thành viên CHINH_THUC, chưa xóa mềm
    const members = await basePrisma.members.findMany({
      where: {
        tenant_id: tenantId,
        status: 'CHINH_THUC',
        deleted_at: null,
        // KHÔNG lọc is_clan để cho phép cả con rể / con dâu (is_clan = false) tìm và nhận hồ sơ (EM)
        AND: [
          {
            OR: [
              { full_name: { contains: keyword, mode: 'insensitive' } },
              { alias: { contains: keyword, mode: 'insensitive' } },
            ],
          },
        ],
      },
      select: {
        id: true,
        full_name: true,
        alias: true,
        gender: true,
        is_clan: true,
        child_type: true,
        generation: true,
        birth_year: true,
        branch: {
          select: { name: true },
        },
        father: {
          select: { full_name: true },
        },
        mother: {
          select: { full_name: true },
        },
        marriages_as_husband: {
          where: { deleted_at: null },
          select: {
            id: true,
            members_marriages_wife_idTomembers: {
              select: { id: true, is_clan: true },
            },
          },
          take: 5,
        },
        marriages_as_wife: {
          where: { deleted_at: null },
          select: {
            id: true,
            members_marriages_husband_idTomembers: {
              select: { id: true, is_clan: true },
            },
          },
          take: 5,
        },
      },
      take: 15,
      orderBy: [{ generation: 'asc' }, { full_name: 'asc' }],
    });

    // Payload tối thiểu — tuyệt đối không trả SĐT, email, địa chỉ, ngày/tháng sinh
    const sanitized = members.map((m) => {
      const rel = resolveMemberClanRelation(m);
      return {
        id: m.id,
        full_name: m.full_name,
        alias: m.alias || null,
        generation: m.generation ?? null,
        branch_name: m.branch?.name || null,
        father_name: m.father?.full_name || null,
        mother_name: m.mother?.full_name || null,
        birth_year: m.birth_year ?? null,
        is_clan: rel.isClan,
        child_type: rel.childType,
      };
    });

    return res.status(200).json({
      status: 'success',
      data: sanitized,
    });
  })
);

module.exports = router;
