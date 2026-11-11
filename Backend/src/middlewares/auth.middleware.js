/**
 * ============================================================================
 * PATH       : src/middlewares/auth.middleware.js
 * DATETIME   : 2026-11-11T13:05:00+07:00
 * VERSION    : 20.7.1-MULTIHOME-STRICT-HEAVY-WRITE
 * DESCRIPTION:
 * - [AMEND-RP-OP-2026-02 V1.2] Lát 2/7:
 *   + Siết chặt assertActiveLink: Bỏ hoàn toàn bypass ngầm định của SYSTEM_ADMIN
 *     khi thao tác trong một dòng họ (bắt buộc phải có link DA_DUYET tại họ đó).
 *   + Hỗ trợ cả 2 dạng: Express Middleware và helper gọi trực tiếp.
 *   + Ném 403 LINK_REVOKED ngay khi link không tồn tại hoặc mất hiệu lực.
 * ============================================================================
 */

'use strict';

const jwt = require('jsonwebtoken');
const { basePrisma, tenantContext } = require('../lib/prisma.js');
const {
  checkRole,
  requireActiveTenant,
  tenantStatus,
  tenantStatusLight,
  tenantStatusHeavy,
} = require('./role.middleware');

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    const err = new Error('Thiếu token xác thực. Vui lòng đăng nhập.');
    err.statusCode = 401;
    err.code = 'UNAUTHORIZED';
    err.isOperational = true;
    err.correlationId = req.correlationId;
    return next(err);
  }

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET is not defined in environment variables.');
    }

    const decoded = jwt.verify(token, secret);

    const activeTenantId = decoded.activeTenantId || decoded.tenantId || null;
    const activeMemberId = decoded.activeMemberId || null;
    const roleInTenant = decoded.roleInTenant || decoded.role || 'USER';
    const activeLinkStatus = decoded.activeLinkStatus || null;
    const linkType = decoded.linkType || null;

    const userData = {
      userId: decoded.userId || decoded.id || decoded.sub,
      email: decoded.email,
      role: roleInTenant,
      roleInTenant,
      tenantId: activeTenantId,
      status: decoded.status,
      tenantStatus: decoded.tenantStatus || null,
      activeTenantId,
      activeMemberId,
      activeLinkStatus,
      linkType,
    };

    userData.id = userData.userId;
    userData.tenant_id = userData.activeTenantId;

    req.user = userData;

    if (decoded.role !== 'SYSTEM_ADMIN' && !activeTenantId) {
      const err = new Error('Lỗi bảo mật: Token không xác định được dòng họ.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      err.isOperational = true;
      err.correlationId = req.correlationId;
      return next(err);
    }

    if (!tenantContext) {
      console.error('[Auth Middleware] tenantContext is undefined! Fallback to next()');
      return next();
    }

    tenantContext.run(
      {
        tenantId: userData.activeTenantId,
        activeTenantId: userData.activeTenantId,
        activeMemberId: userData.activeMemberId,
        activeLinkStatus: userData.activeLinkStatus,
        roleInTenant: userData.roleInTenant,
        allowUnscoped: false,
        allowSystemBypass: false,
        userId: userData.userId,
        actorRole: userData.role,
      },
      next
    );
  } catch (error) {
    console.error('JWT Verify Error:', error.message);
    const err = new Error('Phiên làm việc hết hạn hoặc Token không hợp lệ.');
    err.statusCode = 401;
    err.code = 'UNAUTHORIZED';
    err.isOperational = true;
    err.correlationId = req.correlationId;
    return next(err);
  }
};

/**
 * Heavy-write Guard: Tái kiểm tra link DA_DUYET trực tiếp trong Database
 * Bỏ hoàn toàn bypass ngầm của SYSTEM_ADMIN khi thao tác trong một dòng họ cụ thể.
 */
const assertActiveLink = async (req, res, next) => {
  const isMiddleware = typeof next === 'function';

  const userId = req.user?.userId || req.user?.id;
  const activeTenantId = req.user?.activeTenantId || req.user?.tenantId;

  if (!userId || !activeTenantId) {
    const err = new Error('Thiếu thông tin nhận diện dòng họ.');
    err.statusCode = 401;
    err.code = 'UNAUTHORIZED';
    if (isMiddleware) return next(err);
    throw err;
  }

  // Chỉ cho phép bypass nếu là SYSTEM_ADMIN chạy tác vụ nền toàn cục (không gắn tenant cụ thể)
  if (req.user?.role === 'SYSTEM_ADMIN' && !activeTenantId) {
    if (isMiddleware) return next();
    return null;
  }

  try {
    const link = await basePrisma.user_member_links.findFirst({
      where: {
        user_id: userId,
        tenant_id: activeTenantId,
        deleted_at: null,
        status: 'DA_DUYET',
      },
    });

    if (!link) {
      const err = new Error('Tư cách thành viên tại dòng họ này không còn hiệu lực.');
      err.statusCode = 403;
      err.code = 'LINK_REVOKED';
      if (isMiddleware) return next(err);
      throw err;
    }

    if (isMiddleware) return next();
    return link;
  } catch (err) {
    if (isMiddleware) return next(err);
    throw err;
  }
};

module.exports = {
  verifyToken,
  checkRole,
  requireActiveTenant,
  assertActiveLink,
  tenantStatus,
  tenantStatusLight,
  tenantStatusHeavy,
};
