/**
 * PATH       : src/modules/onboarding/onboarding.routes.js
 * DATETIME   : 2026-07-22T10:15:00+07:00
 * VERSION    : 1.1.0-W1
 * DESCRIPTION:
 * - Express Router cho phân hệ Onboarding (OPD v1.2.0).
 * - [1.1.0-W1] Wave 1 PR-5: Inject middleware thật + asyncHandler.
 * - Mount tại: app.use('/api/onboarding', onboardingRoutes)
 *
 * QUY ƯỚC:
 * - Mọi route đều yêu cầu verifyToken (req.user).
 * - Route Admin: thêm checkRole(...ADMIN_ROLES).
 * - Mọi handler bọc asyncHandler (CED VIII.2).
 *
 * CHANGELOG:
 * - 1.0.0-ONBOARDING-ROUTES: Skeleton + placeholder middleware.
 * - 1.1.0-W1 (2026-07-22): Thay placeholder bằng verifyToken/checkRole + asyncHandler.
 */

'use strict';

const express = require('express');
const router = express.Router();

const ctrl = require('./onboarding.controller.js');
const { verifyToken, checkRole } = require('../../middlewares/auth.middleware');
const { asyncHandler } = require('../../shared/errors');

// Role groups
const ADMIN_ROLES = ['CLAN_ADMIN', 'SYSTEM_ADMIN', 'TRUONG_HO', 'TRUONG_TOC', 'TRUONG_NGANH', 'TRUONG_CHI'];

// ─────────────────────────────────────────────────────────────
// ROUTES — PHASE 1 (User tự thao tác)
// ─────────────────────────────────────────────────────────────

/**
 * @route   POST /api/onboarding/cases
 * @desc    Tạo hồ sơ onboarding mới (DRAFT)
 * @access  Private (authenticated user)
 */
router.post('/cases', verifyToken, asyncHandler(ctrl.createCase));

/**
 * @route   POST /api/onboarding/profile
 * @desc    Hoàn thiện hồ sơ cá nhân + tạo Member DU_BI
 * @access  Private
 */
router.post('/profile', verifyToken, asyncHandler(ctrl.completeProfile));

/**
 * @route   POST /api/onboarding/clan/activate
 * @desc    Kích hoạt không gian dòng họ (Clan Admin)
 * @access  Private (CLAN_ADMIN hoặc user đang setup clan)
 */
router.post('/clan/activate', verifyToken, asyncHandler(ctrl.activateClan));

// ─────────────────────────────────────────────────────────────
// ROUTES — PHASE 2 (Submit / Review / Approve / Reject / Cancel)
// ─────────────────────────────────────────────────────────────

/**
 * @route   POST /api/onboarding/cases/:caseId/submit
 * @desc    User gửi hồ sơ (→ SUBMITTED)
 * @access  Private (chủ hồ sơ)
 */
router.post('/cases/:caseId/submit', verifyToken, asyncHandler(ctrl.submitCase));

/**
 * @route   POST /api/onboarding/cases/:caseId/cancel
 * @desc    User hủy hồ sơ (→ CANCELLED)
 * @access  Private (chủ hồ sơ)
 */
router.post('/cases/:caseId/cancel', verifyToken, asyncHandler(ctrl.cancelCase));

/**
 * @route   POST /api/onboarding/cases/:caseId/review/start
 * @desc    Admin bắt đầu review (→ UNDER_REVIEW)
 * @access  Private (Admin roles)
 */
router.post(
  '/cases/:caseId/review/start',
  verifyToken,
  checkRole(...ADMIN_ROLES),
  asyncHandler(ctrl.startReview)
);

/**
 * @route   POST /api/onboarding/cases/:caseId/revision
 * @desc    Admin yêu cầu bổ sung (→ NEEDS_REVISION)
 * @access  Private (Admin roles)
 */
router.post(
  '/cases/:caseId/revision',
  verifyToken,
  checkRole(...ADMIN_ROLES),
  asyncHandler(ctrl.requestRevision)
);

/**
 * @route   POST /api/onboarding/cases/:caseId/approve
 * @desc    Admin phê duyệt (→ APPROVED)
 * @access  Private (Admin roles)
 */
router.post(
  '/cases/:caseId/approve',
  verifyToken,
  checkRole(...ADMIN_ROLES),
  asyncHandler(ctrl.approveCase)
);

/**
 * @route   POST /api/onboarding/cases/:caseId/reject
 * @desc    Admin từ chối (→ REJECTED)
 * @access  Private (Admin roles)
 */
router.post(
  '/cases/:caseId/reject',
  verifyToken,
  checkRole(...ADMIN_ROLES),
  asyncHandler(ctrl.rejectCase)
);

// ─────────────────────────────────────────────────────────────
// ROUTES — PHASE 3 (Branch + Merge)
// ─────────────────────────────────────────────────────────────

/**
 * @route   POST /api/onboarding/cases/:caseId/branch
 * @desc    Tạo Provisional Branch + members dự bị
 * @access  Private (chủ hồ sơ, case editable)
 */
router.post('/cases/:caseId/branch', verifyToken, asyncHandler(ctrl.createBranch));

/**
 * @route   PATCH /api/onboarding/cases/:caseId/branch
 * @desc    Cập nhật Provisional Branch (add/update/remove members)
 * @access  Private (chủ hồ sơ, case editable)
 */
router.patch('/cases/:caseId/branch', verifyToken, asyncHandler(ctrl.updateBranch));

/**
 * @route   POST /api/onboarding/cases/:caseId/merge
 * @desc    Admin ghép nhánh vào cây chính (→ MERGING → MERGED)
 * @access  Private (Admin roles)
 */
router.post(
  '/cases/:caseId/merge',
  verifyToken,
  checkRole(...ADMIN_ROLES),
  asyncHandler(ctrl.mergeBranch)
);

// ─────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────

module.exports = router;