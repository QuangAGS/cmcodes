/**
 * PATH       : src/modules/members/member.routes.js
 * DATETIME   : 2026-11-19T14:00:00+07:00
 * VERSION    : 1.10.0-AMEND-RP-OP-2026-03-SPRINT3
 * CHANGELOGS:
 * - 2026-11-19T14:00:00+07:00 (v1.10.0-AMEND-RP-OP-2026-03-SPRINT3):
 *   + Gắn createInAppSearchGuard (Redis Lua + Graceful Degradation sang BoundedLRUCache)
 *     cho các endpoint tìm kiếm thành viên nội bộ (/names và / có query tìm kiếm) [NFR-02].
 * DESCRIPTION:
 * - [AMEND-RP-OP-2026-02 V1.2] Lát 2/7:
 *   + Đồng bộ checkRole trên PATCH /:id/vital với vital.service:
 *     Bổ sung TRUONG_HO, TRUONG_TOC, TRUONG_NGANH, TRUONG_CHI (tránh 403 oan tại route).
 *   + Gắn assertActiveLink vào các thao tác mutate phả đồ thành viên: POST, PUT, PATCH, DELETE.
 *   + Giữ nguyên các API đọc dữ liệu phả hệ không bắt buộc assertActiveLink.
 */

'use strict';

const express = require('express');
const router = express.Router();
const memberController = require('./member.controller');
const {
  verifyToken,
  checkRole,
  assertActiveLink,
} = require('../../middlewares/auth.middleware');
const { createInAppSearchGuard } = require('../../services/logicRateLimiter.service');

const ADMIN_AND_STEWARD_ROLES = [
  'SYSTEM_ADMIN',
  'CLAN_ADMIN',
  'TRUONG_HO',
  'TRUONG_TOC',
  'TRUONG_NGANH',
  'TRUONG_CHI',
];

// ==================== READ ROUTES (KHÔNG BẮT BUỘC assertActiveLink) ====================
router.get('/stats/summary', verifyToken, memberController.getStats);
router.get('/tree/:branchId', verifyToken, memberController.getMemberTree);
router.get('/focal-tree/:id', verifyToken, memberController.getFocalTree);
router.get(
  '/names',
  verifyToken,
  createInAppSearchGuard({ bucket: 'member_names', maxRequests: 60, windowSeconds: 60 }),
  memberController.getNames
);
router.get(
  '/',
  verifyToken,
  createInAppSearchGuard({
    bucket: 'member_list_search',
    maxRequests: 60,
    windowSeconds: 60,
    onlyWhenQueryPresent: true,
  }),
  memberController.getAll
);
router.get('/:id/profile', verifyToken, memberController.getProfile);
router.get('/:id', verifyToken, memberController.getById);

// ==================== HEAVY-WRITE ROUTES (BẮT BUỘC assertActiveLink) ====================
router.patch(
  '/:id/profile',
  verifyToken,
  assertActiveLink,
  memberController.patchProfile
);

router.patch(
  '/:id/vital',
  verifyToken,
  checkRole(ADMIN_AND_STEWARD_ROLES),
  assertActiveLink,
  memberController.patchVital
);

router.post(
  '/',
  verifyToken,
  checkRole(['CLAN_ADMIN', 'SYSTEM_ADMIN']),
  assertActiveLink,
  memberController.create
);

router.put(
  '/:id',
  verifyToken,
  checkRole(['USER', 'CLAN_ADMIN', 'VIEWER']),
  assertActiveLink,
  memberController.update
);

router.delete(
  '/:id',
  verifyToken,
  checkRole(['CLAN_ADMIN']),
  assertActiveLink,
  memberController.delete
);

module.exports = router;
