/**
 * PATH       : src/modules/members/member.routes.js
 * DATETIME   : 2026-09-17T16:20:00+07:00
 * VERSION    : 1.7.0-MFO-L3
 * DESCRIPTION: Siết POST /members — chỉ CLAN_ADMIN / SYSTEM_ADMIN.
 *              USER/VIEWER không tạo member tự do (doctrine v1.3.1 §2.5).
 *              PUT / PATCH profile / GET giữ nguyên (Q1).
 */
const express = require('express');
const router = express.Router();
const memberController = require('./member.controller');
const { verifyToken, checkRole } = require('../../middlewares/auth.middleware');

router.get('/stats/summary', verifyToken, memberController.getStats);
router.get('/tree/:branchId', verifyToken, memberController.getMemberTree);
router.get('/focal-tree/:id', verifyToken, memberController.getFocalTree);

router.get('/', verifyToken, memberController.getAll);
router.get('/:id/profile', verifyToken, memberController.getProfile);
router.patch('/:id/profile', verifyToken, memberController.patchProfile);
router.get('/:id', verifyToken, memberController.getById);
router.patch('/:id/vital', verifyToken, checkRole(['SYSTEM_ADMIN', 'CLAN_ADMIN']), memberController.patchVital);

router.post(
  '/',
  verifyToken,
  checkRole(['CLAN_ADMIN', 'SYSTEM_ADMIN']),
  memberController.create
);
router.put('/:id', verifyToken, checkRole(['USER', 'CLAN_ADMIN', 'VIEWER']), memberController.update);

router.delete('/:id', verifyToken, checkRole(['CLAN_ADMIN']), memberController.delete);

module.exports = router;
