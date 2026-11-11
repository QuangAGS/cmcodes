/**
 * PATH       : src/modules/members/branch.routes.js
 * DATETIME   : 2026-11-11T12:50:00+07:00
 * VERSION    : 1.11.0-MULTIHOME-HEAVY-WRITE-GUARD
 * DESCRIPTION:
 * - [AMEND-RP-OP-2026-02 V1.2] Lát 2/7:
 *   + Gắn assertActiveLink vào các thao tác mutate chi họ: POST, PUT, PATCH, DELETE
 *     và các luồng duyệt chi (submit, approve, reject).
 *   + Đảm bảo an toàn ghi nhận phân lập chi họ không bị đè ngữ cảnh cũ.
 */

'use strict';

const express = require('express');
const router = express.Router();
const baseController = require('../../shared/controllers/base.controller');
const branchController = require('./branch.controller');
const { verifyToken, checkRole, assertActiveLink } = require('../../middlewares/auth.middleware');

const { tenantGate } = require('../../middlewares/tenantGate.middleware');

const branchCtrl = baseController('branches');

// ==================== READ ROUTES (KHÔNG BẮT BUỘC assertActiveLink) ====================
router.get('/tree', verifyToken, branchController.getBranchTree);
router.get('/search', verifyToken, branchCtrl.search);
router.get('/', verifyToken, tenantGate, branchCtrl.getAll);
router.get('/:id', verifyToken, branchCtrl.getById);

// ==================== HEAVY-WRITE ROUTES (BẮT BUỘC assertActiveLink) ====================
router.patch(
  '/:id/founder',
  verifyToken,
  checkRole(['USER', 'CLAN_ADMIN', 'SYSTEM_ADMIN']),
  assertActiveLink,
  branchController.setFounder
);

router.patch(
  '/:id/origin',
  verifyToken,
  checkRole(['USER', 'CLAN_ADMIN', 'SYSTEM_ADMIN']),
  assertActiveLink,
  branchController.setOrigin
);

router.patch(
  '/:id/members',
  verifyToken,
  checkRole(['USER', 'CLAN_ADMIN', 'SYSTEM_ADMIN']),
  assertActiveLink,
  branchController.patchMember
);

router.post(
  '/:id/submit',
  verifyToken,
  checkRole(['USER', 'CLAN_ADMIN', 'SYSTEM_ADMIN']),
  assertActiveLink,
  branchController.submit
);

router.post(
  '/:id/approve',
  verifyToken,
  checkRole(['CLAN_ADMIN', 'SYSTEM_ADMIN']),
  assertActiveLink,
  branchController.approve
);

router.post(
  '/:id/reject',
  verifyToken,
  checkRole(['CLAN_ADMIN', 'SYSTEM_ADMIN']),
  assertActiveLink,
  branchController.reject
);

router.post(
  '/',
  verifyToken,
  checkRole(['CLAN_ADMIN', 'SYSTEM_ADMIN']),
  assertActiveLink,
  branchController.create
);

router.put(
  '/:id',
  verifyToken,
  checkRole(['USER', 'CLAN_ADMIN']),
  assertActiveLink,
  branchController.update
);

router.delete(
  '/:id',
  verifyToken,
  checkRole(['CLAN_ADMIN']),
  assertActiveLink,
  branchCtrl.delete
);

module.exports = router;
