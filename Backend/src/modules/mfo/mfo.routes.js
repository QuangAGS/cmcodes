/**
 * PATH       : src/modules/mfo/mfo.routes.js
 * DATETIME   : 2026-09-17T16:50:00+07:00
 * VERSION    : 1.2.0-MFO-L4
 * DESCRIPTION: /api/mfo — PLAN + phê PLAN + mảnh cây Origin.
 */

const express = require('express');
const router = express.Router();
const mfoController = require('./mfo.controller');
const { verifyToken, checkRole } = require('../../middlewares/auth.middleware');

const READ = ['USER', 'VIEWER', 'CLAN_ADMIN', 'SYSTEM_ADMIN'];
const WRITE = ['USER', 'CLAN_ADMIN', 'SYSTEM_ADMIN'];
const ADMIN = ['CLAN_ADMIN', 'SYSTEM_ADMIN'];

router.get(
  '/origins/:originId/tree',
  verifyToken,
  checkRole(READ),
  mfoController.getOriginTree
);

router.post('/plans', verifyToken, checkRole(WRITE), mfoController.createPlan);
router.get('/plans/:id', verifyToken, checkRole(READ), mfoController.getPlan);
router.post(
  '/plans/:id/approve',
  verifyToken,
  checkRole(ADMIN),
  mfoController.approvePlan
);
router.post(
  '/plans/:id/reject',
  verifyToken,
  checkRole(ADMIN),
  mfoController.rejectPlan
);

module.exports = router;
