/**
 * PATH       : src/modules/mfo/mfo.routes.js
 * DATETIME   : 2026-09-16T15:10:00+07:00
 * VERSION    : 1.0.0-MFO-L1
 * DESCRIPTION: /api/mfo — PLAN ticket. Mount trong app.js.
 */

const express = require('express');
const router = express.Router();
const mfoController = require('./mfo.controller');
const { verifyToken, checkRole } = require('../../middlewares/auth.middleware');

router.post(
  '/plans',
  verifyToken,
  checkRole(['USER', 'CLAN_ADMIN', 'SYSTEM_ADMIN']),
  mfoController.createPlan
);

router.get(
  '/plans/:id',
  verifyToken,
  checkRole(['USER', 'CLAN_ADMIN', 'SYSTEM_ADMIN']),
  mfoController.getPlan
);

module.exports = router;
