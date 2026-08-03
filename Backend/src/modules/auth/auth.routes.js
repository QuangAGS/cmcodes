/**
 * PATH       : src/modules/auth/auth.routes.js
 * DATETIME   : 2026-07-25T15:45:00+07:00
 * VERSION    : 21.9.0-W4
 * DESCRIPTION:
 * - [21.9.0-W4] PR-W4-1: rate limit login/register/reset + securityGuard.
 * - Lưới lọc bảo an chủ động (restrictSuspiciousActivity).
 * - [21.8.0-W2] Gắn requireActiveTenant cho admin routes (TENANT_NOT_ACTIVATED).
 * - Q1 bảo tồn rate limiter / cấu trúc route cũ.
 *
 * CHANGELOG:
 * - 21.7.0: restrictSuspiciousActivity + correlation.
 * - 21.8.0-W2 (2026-07-25): requireActiveTenant trên pending/query/process-approval.
 */

'use strict';

const express = require('express');
const router = express.Router();
const { asyncHandler, createError } = require('../../shared/errors');
const { prisma } = require('../../lib/prisma.js');

const authController = require('./auth.controller');
const {
  verifyToken,
  checkRole,
  requireActiveTenant,
} = require('../../middlewares/auth.middleware');
const correlationMiddleware = require('../../middlewares/correlation.middleware');
const { restrictSuspiciousActivity } = require('../../middlewares/securityGuard.middleware');
//21.9.0-W4
const {
  loginRateLimiter,
  registerRateLimiter,
  resetRateLimiter,
  checkIdentityRateLimiter,
} = require('../../middlewares/rateLimit.middleware');

// ==================== PUBLIC ROUTES ====================
//router.get('/check-identity', authController.checkIdentity);
//21.9.0-W4
router.get('/check-identity', checkIdentityRateLimiter, authController.checkIdentity);

router.post('/register', registerRateLimiter, authController.register);
router.post('/login', loginRateLimiter, authController.login);
router.post('/forgot-password', resetRateLimiter, authController.forgotPassword);
router.post('/reset-password', resetRateLimiter, authController.resetPassword);
router.post('/verify-reset-code', resetRateLimiter, authController.verifyResetCode);

router.post(
  '/change-password-after-reset',
  resetRateLimiter,
  restrictSuspiciousActivity({
    maxThreshold: 5,
    windowMinutes: 15,
    reasonCode: 'SPAM_CHANGE_PASSWORD_DETECTION',
  }),
  authController.changePasswordAfterReset
);

// ==================== DEBUG ====================
if (process.env.NODE_ENV !== 'production') {
  console.log('🧪 [DEBUG] Route /api/auth/debug/unblock-all đã được kích hoạt');
  router.post('/debug/unblock-all', authController.debugUnblockAll);
}

// ==================== PROTECTED ROUTES ====================
router.get(
  '/me',
  verifyToken,
  asyncHandler(async (req, res) => {
    const userId = req.user.userId || req.user.id || req.user.sub;
    if (!userId) {
      throw createError('UNAUTHORIZED', 'Thiếu thông tin xác thực.');
    }

    const row = await prisma.users.findFirst({
      where: { id: userId, deleted_at: null },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        tenant_id: true,
        member_id: true,
      },
    });

    if (!row) {
      throw createError('UNAUTHORIZED', 'Không tìm thấy tài khoản.');
    }

    // tenantStatus: lấy kèm nếu FE cần (optional)
    let tenantStatus = null;
    if (row.tenant_id) {
      const t = await prisma.tenants.findFirst({
        where: { id: row.tenant_id },
        select: { status: true },
      });
      tenantStatus = t?.status ?? null;
    }

    res.status(200).json({
      status: 'success',
      user: {
        ...row,
        userId: row.id,
        tenantId: row.tenant_id,
        tenantStatus,
      },
    });
  })
);

router.get(
  '/pending-users',
  verifyToken,
  checkRole('CLAN_ADMIN', 'SYSTEM_ADMIN'),
  requireActiveTenant,
  authController.getPendingUsers
);

router.post(
  '/query-reviewable-users',
  verifyToken,
  checkRole('CLAN_ADMIN', 'SYSTEM_ADMIN'),
  requireActiveTenant,
  correlationMiddleware,
  restrictSuspiciousActivity({
    maxThreshold: 100,
    windowMinutes: 5,
    reasonCode: 'SPAM_QUERY_REVIEWABLE_USERS',
  }),
  authController.queryReviewableUsers
);

router.post(
  '/process-approval',
  verifyToken,
  checkRole('CLAN_ADMIN', 'SYSTEM_ADMIN'),
  requireActiveTenant,
  restrictSuspiciousActivity({
    maxThreshold: 50,
    windowMinutes: 5,
    reasonCode: 'ADMIN_PRIVILEGE_ABUSE_OR_BOT_SPAM',
  }),
  correlationMiddleware,
  authController.processApproval
);

router.post(
  '/reopen-rejected-user',
  verifyToken,
  checkRole('CLAN_ADMIN', 'SYSTEM_ADMIN'),
  requireActiveTenant,
  restrictSuspiciousActivity({
    maxThreshold: 50,
    windowMinutes: 5,
    reasonCode: 'ADMIN_REOPEN_REJECTED_SPAM',
  }),
  correlationMiddleware,
  authController.reopenRejectedUser
);
module.exports = router;