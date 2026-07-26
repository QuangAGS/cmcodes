/**
 * PATH       : src/modules/onboarding/onboarding.routes.js
 * DATETIME   : 2026-07-26T15:30:00+07:00
 * VERSION    : 1.2.0-W3
 * DESCRIPTION:
 * - [1.2.0-W3] PR-W3-2: tenantStatusHeavy trên admin review/approve/merge.
 * - Whitelist: /clan/activate KHÔNG gắn Heavy (CLAN_ADMIN + TAM_NGUNG được kích hoạt).
 *
 * CHANGELOG:
 * - 1.1.0-W1: verifyToken + asyncHandler.
 * - 1.2.0-W3 (2026-07-26): tenant gate heavy trên admin OPD; activate exempt.
 */

'use strict';

const express = require('express');
const router = express.Router();

const ctrl = require('./onboarding.controller.js');
const {
  verifyToken,
  checkRole,
  tenantStatusHeavy,
} = require('../../middlewares/auth.middleware');
const { asyncHandler } = require('../../shared/errors');

const ADMIN_ROLES = [
  'CLAN_ADMIN',
  'SYSTEM_ADMIN',
  'TRUONG_HO',
  'TRUONG_TOC',
  'TRUONG_NGANH',
  'TRUONG_CHI',
];

// ── PHASE 1 (User) — không Heavy ─────────────────────────────
router.post('/cases', verifyToken, asyncHandler(ctrl.createCase));
router.post('/profile', verifyToken, asyncHandler(ctrl.completeProfile));

// WHITELIST: activate khi tenant TAM_NGUNG — chỉ verifyToken (+ optional checkRole sau)
router.post('/clan/activate', verifyToken, asyncHandler(ctrl.activateClan));

// ── PHASE 2 ──────────────────────────────────────────────────
router.post(
  '/cases/:caseId/submit',
  verifyToken,
  asyncHandler(ctrl.submitCase)
);
router.post(
  '/cases/:caseId/cancel',
  verifyToken,
  asyncHandler(ctrl.cancelCase)
);

router.post(
  '/cases/:caseId/review/start',
  verifyToken,
  checkRole(...ADMIN_ROLES),
  tenantStatusHeavy,
  asyncHandler(ctrl.startReview)
);
router.post(
  '/cases/:caseId/revision',
  verifyToken,
  checkRole(...ADMIN_ROLES),
  tenantStatusHeavy,
  asyncHandler(ctrl.requestRevision)
);
router.post(
  '/cases/:caseId/approve',
  verifyToken,
  checkRole(...ADMIN_ROLES),
  tenantStatusHeavy,
  asyncHandler(ctrl.approveCase)
);
router.post(
  '/cases/:caseId/reject',
  verifyToken,
  checkRole(...ADMIN_ROLES),
  tenantStatusHeavy,
  asyncHandler(ctrl.rejectCase)
);

// ── PHASE 3 ──────────────────────────────────────────────────
router.post(
  '/cases/:caseId/branch',
  verifyToken,
  asyncHandler(ctrl.createBranch)
);
router.patch(
  '/cases/:caseId/branch',
  verifyToken,
  asyncHandler(ctrl.updateBranch)
);
router.post(
  '/cases/:caseId/merge',
  verifyToken,
  checkRole(...ADMIN_ROLES),
  tenantStatusHeavy,
  asyncHandler(ctrl.mergeBranch)
);

module.exports = router;