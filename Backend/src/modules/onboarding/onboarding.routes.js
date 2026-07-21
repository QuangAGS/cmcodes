/**
 * PATH       : src/modules/onboarding/onboarding.routes.js
 * DATETIME   : 2026-07-20T21:05:00+07:00
 * VERSION    : 1.0.0-ONBOARDING-ROUTES
 * DESCRIPTION:
 * - Express Router cho phân hệ Onboarding (OPD v1.1.0).
 * - Gắn auth middleware + role guard cho các route Admin.
 * - Mount tại: app.use('/api/v1/onboarding', onboardingRoutes)
 *
 * QUY ƯỚC:
 * - Mọi route đều yêu cầu authenticate (req.user).
 * - Route Admin: thêm authorize(['CLAN_ADMIN', 'SYSTEM_ADMIN', 'TRUONG_HO', ...]).
 * - correlationId: client nên gửi header X-Correlation-Id; nếu không server tự sinh.
 *
 * PHỤ THUỘC MIDDLEWARE (giả định project đã có):
 * - authenticate  : verify JWT → req.user
 * - authorize(roles): check req.user.role ∈ roles
 * - optional: rateLimiter, turnstile (anti-bot) cho submit
 */

'use strict';

const express = require('express');
const router = express.Router();

const ctrl = require('./onboarding.controller.js');

// ─────────────────────────────────────────────────────────────
// MIDDLEWARE PLACEHOLDERS
// Thay bằng middleware thật của project (auth.js / rbac.js).
// Giữ signature (req, res, next) để drop-in.
// ─────────────────────────────────────────────────────────────

/**
 * Authenticate — bắt buộc đăng nhập.
 * TODO: thay bằng middleware JWT thật của project.
 */
function authenticate(req, res, next) {
  // Placeholder: project sẽ inject middleware thật khi mount.
  // Ví dụ: const { authenticate } = require('../../middleware/auth');
  if (typeof req.authenticate === 'function') {
    return req.authenticate(req, res, next);
  }
  // Dev fallback: nếu đã có req.user thì cho qua
  if (req.user && req.user.id) return next();
  return res.status(401).json({
    success: false,
    error: { code: 'UNAUTHORIZED', message: 'Vui lòng đăng nhập.' },
  });
}

/**
 * Authorize theo role.
 * @param {string[]} roles
 */
function authorize(roles = []) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Vui lòng đăng nhập.' },
      });
    }
    if (!roles.length) return next();
    const userRole = req.user.role;
    if (roles.includes(userRole) || userRole === 'SYSTEM_ADMIN') {
      return next();
    }
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: `Yêu cầu quyền: ${roles.join(' | ')}. Role hiện tại: ${userRole}`,
      },
    });
  };
}

// Role groups
const ADMIN_ROLES = ['CLAN_ADMIN', 'SYSTEM_ADMIN', 'TRUONG_HO', 'TRUONG_TOC', 'TRUONG_NGANH', 'TRUONG_CHI'];
const USER_ROLES = ['VIEWER', 'USER', 'EDITOR', 'CLAN_ADMIN', 'SYSTEM_ADMIN', 'GUEST', 'KHAC'];

// ─────────────────────────────────────────────────────────────
// ROUTES — PHASE 1 (User tự thao tác)
// ─────────────────────────────────────────────────────────────

/**
 * @route   POST /api/v1/onboarding/cases
 * @desc    Tạo hồ sơ onboarding mới (DRAFT)
 * @access  Private (authenticated user)
 */
router.post('/cases', authenticate, ctrl.createCase);

/**
 * @route   POST /api/v1/onboarding/profile
 * @desc    Hoàn thiện hồ sơ cá nhân + tạo Member DU_BI
 * @access  Private
 */
router.post('/profile', authenticate, ctrl.completeProfile);

/**
 * @route   POST /api/v1/onboarding/clan/activate
 * @desc    Kích hoạt không gian dòng họ (Clan Admin)
 * @access  Private (CLAN_ADMIN hoặc user đang setup clan)
 */
router.post('/clan/activate', authenticate, ctrl.activateClan);

// ─────────────────────────────────────────────────────────────
// ROUTES — PHASE 2 (Submit / Review / Approve / Reject / Cancel)
// ─────────────────────────────────────────────────────────────

/**
 * @route   POST /api/v1/onboarding/cases/:caseId/submit
 * @desc    User gửi hồ sơ (→ SUBMITTED)
 * @access  Private (chủ hồ sơ)
 */
router.post('/cases/:caseId/submit', authenticate, ctrl.submitCase);

/**
 * @route   POST /api/v1/onboarding/cases/:caseId/cancel
 * @desc    User hủy hồ sơ (→ CANCELLED)
 * @access  Private (chủ hồ sơ)
 */
router.post('/cases/:caseId/cancel', authenticate, ctrl.cancelCase);

/**
 * @route   POST /api/v1/onboarding/cases/:caseId/review/start
 * @desc    Admin bắt đầu review (→ UNDER_REVIEW)
 * @access  Private (Admin roles)
 */
router.post(
  '/cases/:caseId/review/start',
  authenticate,
  authorize(ADMIN_ROLES),
  ctrl.startReview
);

/**
 * @route   POST /api/v1/onboarding/cases/:caseId/revision
 * @desc    Admin yêu cầu bổ sung (→ NEEDS_REVISION)
 * @access  Private (Admin roles)
 */
router.post(
  '/cases/:caseId/revision',
  authenticate,
  authorize(ADMIN_ROLES),
  ctrl.requestRevision
);

/**
 * @route   POST /api/v1/onboarding/cases/:caseId/approve
 * @desc    Admin phê duyệt (→ APPROVED)
 * @access  Private (Admin roles)
 */
router.post(
  '/cases/:caseId/approve',
  authenticate,
  authorize(ADMIN_ROLES),
  ctrl.approveCase
);

/**
 * @route   POST /api/v1/onboarding/cases/:caseId/reject
 * @desc    Admin từ chối (→ REJECTED)
 * @access  Private (Admin roles)
 */
router.post(
  '/cases/:caseId/reject',
  authenticate,
  authorize(ADMIN_ROLES),
  ctrl.rejectCase
);

// ─────────────────────────────────────────────────────────────
// ROUTES — PHASE 3 (Branch + Merge)
// ─────────────────────────────────────────────────────────────

/**
 * @route   POST /api/v1/onboarding/cases/:caseId/branch
 * @desc    Tạo Provisional Branch + members dự bị
 * @access  Private (chủ hồ sơ, case editable)
 */
router.post('/cases/:caseId/branch', authenticate, ctrl.createBranch);

/**
 * @route   PATCH /api/v1/onboarding/cases/:caseId/branch
 * @desc    Cập nhật Provisional Branch (add/update/remove members)
 * @access  Private (chủ hồ sơ, case editable)
 */
router.patch('/cases/:caseId/branch', authenticate, ctrl.updateBranch);

/**
 * @route   POST /api/v1/onboarding/cases/:caseId/merge
 * @desc    Admin ghép nhánh vào cây chính (→ MERGING → MERGED)
 * @access  Private (Admin roles)
 */
router.post(
  '/cases/:caseId/merge',
  authenticate,
  authorize(ADMIN_ROLES),
  ctrl.mergeBranch
);

// ─────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────

module.exports = router;

/**
 * CÁCH MOUNT VÀO APP (ví dụ):
 *
 * // src/app.js hoặc src/routes/index.js
 * const onboardingRoutes = require('./modules/onboarding/onboarding.routes');
 *
 * // Thay authenticate/authorize placeholder bằng middleware thật:
 * // Cách 1: Patch trước khi mount
 * // Cách 2: Sửa require middleware trong file này
 *
 * app.use('/api/v1/onboarding', onboardingRoutes);
 *
 * // Hoặc nếu muốn inject middleware:
 * // const auth = require('../middleware/auth');
 * // router.use(auth.authenticate);  // global cho mọi onboarding route
 */
