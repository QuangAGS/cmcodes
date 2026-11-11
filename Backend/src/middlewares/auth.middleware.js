/**
 * ============================================================================
 * PATH       : src/middlewares/auth.middleware.js
 * DATETIME   : 2026-11-11T10:05:00+07:00
 * VERSION    : 20.6.0-MULTIHOME-AMEND02-V12
 * DESCRIPTION:
 * - [AMEND-RP-OP-2026-02 V1.2] Lát 1/7 Multi-Home Authentication Middleware:
 *   + Trích xuất toàn vẹn claims: activeTenantId, activeMemberId, roleInTenant.
 *   + Bind ALS context với allowUnscoped = false (không bypass ngầm định).
 *   + Cung cấp Heavy-write Guard: assertActiveLink (tái kiểm tra link DA_DUYET từ DB).
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
      role: roleInTenant, // Vai trò hiệu lực tại tenant active
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

    // AMEND-02 V1.2: allowUnscoped luôn là false cho mọi HTTP request thông thường
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
 * Heavy-write Guard: Tái kiểm tra tính hợp lệ của link trực tiếp từ database
 * Dùng cho duyệt hồ sơ, sửa đồ thị cây phả hệ, quản lý quỹ, đổi vai trò
 */
const assertActiveLink = async (req) => {
  const userId = req.user?.userId;
  const activeTenantId = req.user?.activeTenantId;

  if (!userId || !activeTenantId) {
    const err = new Error('Thiếu thông tin nhận diện dòng họ.');
    err.statusCode = 401;
    err.code = 'UNAUTHORIZED';
    throw err;
  }

  const link = await basePrisma.user_member_links.findFirst({
    where: {
      user_id: userId,
      tenant_id: activeTenantId,
      deleted_at: null,
      status: 'DA_DUYET',
    },
  });

  if (!link) {
    const err = new Error('Tư cách tại dòng họ này không còn hiệu lực.');
    err.statusCode = 403;
    err.code = 'LINK_REVOKED';
    throw err;
  }

  return link;
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
