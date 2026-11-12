/**
 * ============================================================================
 * PATH       : src/modules/public/publicSearch.routes.js
 * DATETIME   : 2026-11-12T12:15:00+07:00
 * VERSION    : 1.0.0-MULTIHOME-AMEND02-V15-LAT1
 * DESCRIPTION:
 * - [AMEND-RP-OP-2026-02 V1.5.0 Mục 5] API công khai có kiểm soát cho Guest Claim (C2):
 *   1) GET /api/public/tenants/search?q=
 *      - Rate limit theo IP; q tối thiểu 2 ký tự.
 *      - Chỉ trả { id, name, slug } của các dòng họ HOAT_DONG, không lộ dữ liệu thành viên.
 *   2) GET /api/public/tenants/:tenantId/members/claim-search?q=
 *      - Rate limit tối đa 15 request/phút/IP; q tối thiểu 2 ký tự.
 *      - Chỉ truy vấn status = 'CHINH_THUC', deleted_at = null (lọc is_clan an toàn).
 *      - Chỉ trả payload nhận diện phả hệ tối thiểu:
 *        { id, full_name, alias, generation, branch_name, father_name, mother_name, birth_year }.
 *      - Tuyệt đối không trả SĐT, email, địa chỉ, ngày/tháng sinh.
 * ============================================================================
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

    // Chỉ lấy thành viên CHINH_THUC, chưa xóa mềm, thuộc nội tộc (is_clan = true hoặc null legacy)
    const members = await basePrisma.members.findMany({
      where: {
        tenant_id: tenantId,
        status: 'CHINH_THUC',
        deleted_at: null,
        OR: [{ is_clan: true }, { is_clan: null }],
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
      },
      take: 15,
      orderBy: [{ generation: 'asc' }, { full_name: 'asc' }],
    });

    // Payload tối thiểu — tuyệt đối không trả SĐT, email, địa chỉ, ngày/tháng sinh
    const sanitized = members.map((m) => ({
      id: m.id,
      full_name: m.full_name,
      alias: m.alias || null,
      generation: m.generation ?? null,
      branch_name: m.branch?.name || null,
      father_name: m.father?.full_name || null,
      mother_name: m.mother?.full_name || null,
      birth_year: m.birth_year ?? null,
    }));

    return res.status(200).json({
      status: 'success',
      data: sanitized,
    });
  })
);

module.exports = router;