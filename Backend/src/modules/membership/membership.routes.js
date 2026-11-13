/**
 * ============================================================================
 * PATH       : src/modules/membership/membership.routes.js
 * DATETIME   : 2026-11-13T10:30:00+07:00
 * VERSION    : 1.1.0-MULTIHOME-AMEND02-V15-LAT3
 * DESCRIPTION:
 * - Routes cho luồng C1 & C1-S theo AMEND-RP-OP-2026-02-FE-V1.5.0:
 *   + GET  /api/membership/status
 *   + POST /api/membership/cases
 *   + POST /api/membership/clan-setup
 *   + POST /api/membership/cases/:caseId/revision
 *   + POST /api/membership/cases/:caseId/reopen
 *   + POST /api/membership/cases/:caseId/approve
 *   + POST /api/membership/cases/:caseId/return-revision
 * ============================================================================
 * CHANGELOGS:
 * - 2026-11-13T09:45:00+07:00 (v1.0.0-MULTIHOME-AMEND02-V15-LAT3): Khởi tạo routes C1 & C1-S.
 * - 2026-11-13T10:30:00+07:00 (v1.1.0-MULTIHOME-AMEND02-V15-LAT3): Thêm route approve & return-revision.
 * ============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

'use strict';

const express = require('express');
const router = express.Router();

const membershipController = require('./membership.controller');
const { verifyToken, checkRole } = require('../../middlewares/auth.middleware');
const { asyncHandler } = require('../../shared/errors');
const {
  onboardingWriteRateLimiter,
  onboardingAdminRateLimiter,
} = require('../../middlewares/rateLimit.middleware');

const ADMIN_ROLES = [
  'SYSTEM_ADMIN',
  'CLAN_ADMIN',
  'TRUONG_HO',
  'TRUONG_TOC',
  'TRUONG_NGANH',
  'TRUONG_CHI',
];

router.get('/status', verifyToken, asyncHandler(membershipController.getStatus));

router.post(
  '/cases',
  onboardingWriteRateLimiter,
  verifyToken,
  asyncHandler(membershipController.createCase)
);

router.post(
  '/clan-setup',
  onboardingWriteRateLimiter,
  verifyToken,
  asyncHandler(membershipController.clanSetup)
);

router.post(
  '/cases/:caseId/revision',
  onboardingWriteRateLimiter,
  verifyToken,
  asyncHandler(membershipController.submitRevision)
);

router.post(
  '/cases/:caseId/reopen',
  onboardingWriteRateLimiter,
  verifyToken,
  asyncHandler(membershipController.reopenCase)
);

router.post(
  '/cases/:caseId/approve',
  onboardingAdminRateLimiter,
  verifyToken,
  checkRole(...ADMIN_ROLES),
  asyncHandler(membershipController.approveCase)
);

router.post(
  '/cases/:caseId/return-revision',
  onboardingAdminRateLimiter,
  verifyToken,
  checkRole(...ADMIN_ROLES),
  asyncHandler(membershipController.returnForRevision)
);

module.exports = router;
