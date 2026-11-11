/**
 * ============================================================================
 * PATH       : src/modules/auth/auth.routes.js
 * DATETIME   : 2026-11-11T12:20:00+07:00
 * VERSION    : 21.12.0-MULTIHOME-HEAVY-WRITE-GUARD
 * DESCRIPTION:
 * - [AMEND-RP-OP-2026-02 V1.2] Lát 2/7:
 *   + Gắn assertActiveLink bảo vệ các thao tác duyệt tài khoản:
 *     /process-approval, /return-for-revision, /reopen-rejected-user.
 *   + Ngăn chặn hành vi dùng token cũ đã bị thu hồi quyền gửi request phê duyệt.
 * ============================================================================
 */

'use strict';

const express = require('express');
const router = express.Router();
const { asyncHandler, createError } = require('../../shared/errors');
const { basePrisma } = require('../../lib/prisma.js');

const authController = require('./auth.controller');
const {
  verifyToken,
  checkRole,
  requireActiveTenant,
  assertActiveLink,
} = require('../../middlewares/auth.middleware');
const correlationMiddleware = require('../../middlewares/correlation.middleware');
const { restrictSuspiciousActivity } = require('../../middlewares/securityGuard.middleware');
const {
  loginRateLimiter,
  registerRateLimiter,
  resetRateLimiter,
  checkIdentityRateLimiter,
} = require('../../middlewares/rateLimit.middleware');
const { tenantGate } = require('../../middlewares/tenantGate.middleware');

// ==================== PUBLIC ROUTES ====================
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

// ==================== MULTIHOME SWITCH CONTEXT ====================
router.post('/switch-context', verifyToken, authController.switchContext);
router.get('/available-clans', verifyToken, authController.getAvailableClans);

// ==================== DEBUG ====================
if (process.env.NODE_ENV !== 'production') {
  console.log('🧪 [DEBUG] Route /api/auth/debug/unblock-all đã được kích hoạt');
  router.post('/debug/unblock-all', authController.debugUnblockAll);
}

// ==================== PROTECTED /me ====================
router.get('/me', verifyToken, asyncHandler(async (req, res) => {
  const userId = req.user.userId || req.user.id || req.user.sub;
  if (!userId) {
    throw createError('UNAUTHORIZED', 'Thiếu thông tin xác thực.', 401);
  }

  const row = await basePrisma.users.findFirst({
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
    throw createError('UNAUTHORIZED', 'Không tìm thấy tài khoản.', 401);
  }

  const activeTenantId = req.user.activeTenantId || req.user.tenantId || row.tenant_id;
  const activeMemberId = req.user.activeMemberId || row.member_id;
  const activeLinkStatus = req.user.activeLinkStatus || null;
  const linkType = req.user.linkType || null;
  const roleInTenant = req.user.roleInTenant || req.user.role || row.role;

  let tenant = null;
  let tenantStatus = null;
  if (activeTenantId) {
    const t = await basePrisma.tenants.findFirst({
      where: { id: activeTenantId, deleted_at: null },
      select: { id: true, name: true, logo_url: true, slogan: true, status: true, social_configs: true },
    });
    if (t) {
      tenantStatus = t.status ?? null;
      const cfg = t.social_configs && typeof t.social_configs === 'object' ? t.social_configs : {};
      tenant = {
        id: t.id,
        name: t.name || null,
        logo_url: t.logo_url || null,
        slogan: t.slogan || null,
        logo_icon: cfg.logo_icon || null,
        status: t.status || null,
      };
    }
  }

  const userPayload = {
    ...row,
    userId: row.id,
    tenantId: activeTenantId,
    activeTenantId,
    activeMemberId,
    activeLinkStatus,
    linkType,
    roleInTenant,
    tenantStatus,
    tenant,
    clanName: tenant?.name || null,
  };

  res.status(200).json({
    status: 'success',
    data: { user: userPayload },
    user: userPayload,
  });
}));

router.get('/test-sandbox', verifyToken, tenantGate, (req, res) => {
  res.status(200).json({ status: 'success', message: 'Vượt qua Sandbox thành công' });
});

router.get(
  '/pending-users',
  verifyToken,
  tenantGate,
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

// ==================== HEAVY-WRITE APPROVAL ROUTES (GẮN assertActiveLink) ====================
router.post(
  '/process-approval',
  verifyToken,
  checkRole('CLAN_ADMIN', 'SYSTEM_ADMIN'),
  requireActiveTenant,
  assertActiveLink, // <-- Chốt chặn Heavy-write Guard
  restrictSuspiciousActivity({
    maxThreshold: 50,
    windowMinutes: 5,
    reasonCode: 'ADMIN_PRIVILEGE_ABUSE_OR_BOT_SPAM',
  }),
  correlationMiddleware,
  authController.processApproval
);

router.post(
  '/return-for-revision',
  verifyToken,
  checkRole('CLAN_ADMIN', 'SYSTEM_ADMIN'),
  requireActiveTenant,
  assertActiveLink, // <-- Chốt chặn Heavy-write Guard
  restrictSuspiciousActivity({
    maxThreshold: 50,
    windowMinutes: 5,
    reasonCode: 'ADMIN_RETURN_FOR_REVISION_SPAM',
  }),
  correlationMiddleware,
  authController.returnForRevision
);

router.post(
  '/reopen-rejected-user',
  verifyToken,
  checkRole('CLAN_ADMIN', 'SYSTEM_ADMIN'),
  requireActiveTenant,
  assertActiveLink, // <-- Chốt chặn Heavy-write Guard
  restrictSuspiciousActivity({
    maxThreshold: 50,
    windowMinutes: 5,
    reasonCode: 'ADMIN_REOPEN_REJECTED_SPAM',
  }),
  correlationMiddleware,
  authController.reopenRejectedUser
);

module.exports = router;
