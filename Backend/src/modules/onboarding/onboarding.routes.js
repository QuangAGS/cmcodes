/**
 * PATH       : src/modules/onboarding/onboarding.routes.js
 * DATETIME   : 2026-08-22T14:10:00+07:00
 * VERSION    : 1.5.2-FE-OP-D1
 * DESCRIPTION: ... + GET /my-op (FE OP hub).
 * - [1.3.0-W4] PR-W4-1: rate limit write/admin + restrictSuspiciousActivity admin.
 * - Whitelist activate: write limiter only, no abuse guard nặng.
 *
 * CHANGELOG:
 * - 1.2.0-W3: tenantStatusHeavy admin; activate exempt Heavy.
 * - 1.3.0-W4 (2026-07-27): onboarding rate + guard.
 * - 1.4.0-FE-OP-B1 (2026-08-16): GET /my-op — verifyToken only, no write limiter.
 * - 1.5.0-FE-OP-B2 (2026-08-18): GET /cases/reviewable
 * - 1.5.2-FE-OP-D1 (2026-08-22): GET /cases/:caseId/timeline
 */

'use strict';

require('./srpf').registerMemberPromote();

const express = require('express');
const router = express.Router();

const ctrl = require('./onboarding.controller');
const {
  verifyToken,
  checkRole,
  tenantStatusHeavy,
} = require('../../middlewares/auth.middleware');
const { asyncHandler } = require('../../shared/errors');
const {
  onboardingWriteRateLimiter,
  onboardingAdminRateLimiter,
} = require('../../middlewares/rateLimit.middleware');
const {
  restrictSuspiciousActivity,
} = require('../../middlewares/securityGuard.middleware');

const ADMIN_ROLES = [
  'CLAN_ADMIN',
  'SYSTEM_ADMIN',
  'TRUONG_HO',
  'TRUONG_TOC',
  'TRUONG_NGANH',
  'TRUONG_CHI',
];

const onboardingAdminGuard = restrictSuspiciousActivity({
  maxThreshold: 60,
  windowMinutes: 5,
  reasonCode: 'ONBOARDING_ADMIN_ABUSE',
});

// ── PHASE 1 (User) ───────────────────────────────────────────
// FE-OP-B1: read-only my OP status (hub / guard)
router.get(
  '/my-op',
  verifyToken,
  asyncHandler(ctrl.getMyOp)
);

router.post(
  '/cases',
  onboardingWriteRateLimiter,
  verifyToken,
  asyncHandler(ctrl.createCase)
);
router.post(
  '/profile',
  onboardingWriteRateLimiter,
  verifyToken,
  asyncHandler(ctrl.completeProfile)
);

// Whitelist Heavy: chỉ write limiter
router.post(
  '/clan/activate',
  onboardingWriteRateLimiter,
  verifyToken,
  asyncHandler(ctrl.activateClan)
);

// ── PHASE 2 ──────────────────────────────────────────────────
//FE-OP-B2
router.get(
  '/cases/reviewable',
  onboardingAdminRateLimiter,
  verifyToken,
  checkRole(...ADMIN_ROLES),
  tenantStatusHeavy,
  onboardingAdminGuard,
  asyncHandler(ctrl.listReviewableOpCases)
);
//FE-OP-D1
router.get(
  '/cases/:caseId/timeline',
  onboardingAdminRateLimiter,
  verifyToken,
  checkRole(...ADMIN_ROLES),
  tenantStatusHeavy,
  onboardingAdminGuard,
  asyncHandler(ctrl.getCaseTimeline)
);

router.post(
  '/cases/:caseId/submit',
  onboardingWriteRateLimiter,
  verifyToken,
  asyncHandler(ctrl.submitCase)
);
router.post(
  '/cases/:caseId/cancel',
  onboardingWriteRateLimiter,
  verifyToken,
  asyncHandler(ctrl.cancelCase)
);

router.post(
  '/cases/:caseId/review/start',
  onboardingAdminRateLimiter,
  verifyToken,
  checkRole(...ADMIN_ROLES),
  tenantStatusHeavy,
  onboardingAdminGuard,
  asyncHandler(ctrl.startReview)
);
router.post(
  '/cases/:caseId/revision',
  onboardingAdminRateLimiter,
  verifyToken,
  checkRole(...ADMIN_ROLES),
  tenantStatusHeavy,
  onboardingAdminGuard,
  asyncHandler(ctrl.requestRevision)
);
router.post(
  '/cases/:caseId/approve',
  onboardingAdminRateLimiter,
  verifyToken,
  checkRole(...ADMIN_ROLES),
  tenantStatusHeavy,
  onboardingAdminGuard,
  asyncHandler(ctrl.approveCase)
);
router.post(
  '/cases/:caseId/reject',
  onboardingAdminRateLimiter,
  verifyToken,
  checkRole(...ADMIN_ROLES),
  tenantStatusHeavy,
  onboardingAdminGuard,
  asyncHandler(ctrl.rejectCase)
);

// ── PHASE 3 ──────────────────────────────────────────────────
router.post(
  '/cases/:caseId/branch',
  onboardingWriteRateLimiter,
  verifyToken,
  asyncHandler(ctrl.createBranch)
);
router.patch(
  '/cases/:caseId/branch',
  onboardingWriteRateLimiter,
  verifyToken,
  asyncHandler(ctrl.updateBranch)
);
router.post(
  '/cases/:caseId/merge',
  onboardingAdminRateLimiter,
  verifyToken,
  checkRole(...ADMIN_ROLES),
  tenantStatusHeavy,
  onboardingAdminGuard,
  asyncHandler(ctrl.mergeBranch)
);

module.exports = router;