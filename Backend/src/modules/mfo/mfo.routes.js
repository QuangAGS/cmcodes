/**
 * PATH       : src/modules/mfo/mfo.routes.js
 * DATETIME   : 2026-09-17T16:50:00+07:00
 * VERSION    : 1.3.0-MFO-L5
 * DESCRIPTION: /api/mfo — PLAN + phê + cây + CREATE trong PLAN_OK.
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

router.get('/plans', verifyToken, checkRole(READ), mfoController.listPlans);
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
router.post(
  '/plans/:id/members',
  verifyToken,
  checkRole(WRITE),
  mfoController.createInPlan
);
router.post(
  '/plans/:id/spouses',
  verifyToken,
  checkRole(WRITE),
  mfoController.createSpouse
);
router.patch(
  '/plans/:id/unions/:unionId',
  verifyToken,
  checkRole(WRITE),
  mfoController.patchUnion
);
router.post(
  '/plans/:id/result',
  verifyToken,
  checkRole(WRITE),
  mfoController.submitResult
);
router.post(
  '/plans/:id/result/approve',
  verifyToken,
  checkRole(ADMIN),
  mfoController.approveResult
);
router.post(
  '/plans/:id/result/reject',
  verifyToken,
  checkRole(ADMIN),
  mfoController.rejectResult
);

module.exports = router;
