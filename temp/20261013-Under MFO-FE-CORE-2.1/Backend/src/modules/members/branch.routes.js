/**
 * PATH       : src/modules/members/branch.routes.js
 * DATETIME   : 2026-09-17T16:20:00+07:00
 * VERSION    : 1.10.0-MFO-L3
 * DESCRIPTION: Siết POST /branches — chỉ CLAN_ADMIN / SYSTEM_ADMIN.
 *              Submit / Lát 1 gắn / REVIEW / PUT / tree giữ nguyên (Q1).
 */

const express = require('express');
const router = express.Router();
const baseController = require('../../shared/controllers/base.controller');
const branchController = require('./branch.controller');
const { verifyToken, checkRole } = require('../../middlewares/auth.middleware');

const branchCtrl = baseController('branches');

router.get('/tree', verifyToken, branchController.getBranchTree);

router.get('/search', verifyToken, branchCtrl.search);
router.get('/', verifyToken, branchCtrl.getAll);

router.patch(
  '/:id/founder',
  verifyToken,
  checkRole(['USER', 'CLAN_ADMIN', 'SYSTEM_ADMIN']),
  branchController.setFounder
);
router.patch(
  '/:id/origin',
  verifyToken,
  checkRole(['USER', 'CLAN_ADMIN', 'SYSTEM_ADMIN']),
  branchController.setOrigin
);
router.patch(
  '/:id/members',
  verifyToken,
  checkRole(['USER', 'CLAN_ADMIN', 'SYSTEM_ADMIN']),
  branchController.patchMember
);

router.post(
  '/:id/submit',
  verifyToken,
  checkRole(['USER', 'CLAN_ADMIN', 'SYSTEM_ADMIN']),
  branchController.submit
);
router.post(
  '/:id/approve',
  verifyToken,
  checkRole(['CLAN_ADMIN', 'SYSTEM_ADMIN']),
  branchController.approve
);
router.post(
  '/:id/reject',
  verifyToken,
  checkRole(['CLAN_ADMIN', 'SYSTEM_ADMIN']),
  branchController.reject
);

router.get('/:id', verifyToken, branchCtrl.getById);

router.post(
  '/',
  verifyToken,
  checkRole(['CLAN_ADMIN', 'SYSTEM_ADMIN']),
  branchController.create
);
router.put('/:id', verifyToken, checkRole(['USER', 'CLAN_ADMIN']), branchController.update);
router.delete('/:id', verifyToken, checkRole(['CLAN_ADMIN']), branchCtrl.delete);

module.exports = router;
