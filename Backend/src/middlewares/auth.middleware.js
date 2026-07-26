/**
 * PATH       : src/middlewares/auth.middleware.js
 * DATETIME   : 2026-07-26T15:45:00+07:00
 * VERSION    : 20.5.0-W3
 * DESCRIPTION:
 * - Dual req.user + tenantStatus.
 * - [20.5.0-W3] PR-W3-2: re-export tenantStatus Light/Heavy + requireActiveTenant alias.
 * - Q1 bảo toàn verifyToken.
 *
 * CHANGELOG:
 * - 20.4.0-W2: next(err) CED.
 * - 20.5.0-W3 (2026-07-26): re-export tenantStatus*; bỏ require trùng.
 */

'use strict';

const jwt = require('jsonwebtoken');
const prismaModule = require('../lib/prisma.js');
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

    const userData = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      tenantId: decoded.tenantId,
      status: decoded.status,
      tenantStatus: decoded.tenantStatus || null,
    };

    userData.id = userData.userId;
    userData.tenant_id = userData.tenantId;

    req.user = userData;

    if (userData.role !== 'SYSTEM_ADMIN' && !userData.tenantId) {
      const err = new Error('Lỗi bảo mật: Token không xác định được dòng họ.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      err.isOperational = true;
      err.correlationId = req.correlationId;
      return next(err);
    }

    const tenantContext = prismaModule.tenantContext;

    if (!tenantContext) {
      console.error(
        '[Auth Middleware] tenantContext is undefined! Fallback to next()'
      );
      return next();
    }

    tenantContext.run({ tenantId: userData.tenantId }, next);
  } catch (error) {
    console.error('JWT Verify Error:', error.message);
    const err = new Error('Phiên làm việc hết hạn hoặc Token không hợp lệ.');
    err.statusCode = 403;
    err.code = 'INVALID_TOKEN';
    err.isOperational = true;
    err.correlationId = req.correlationId;
    return next(err);
  }
};

// KHÔNG require lại role.middleware ở đây

module.exports = {
  verifyToken,
  checkRole,
  requireActiveTenant,
  tenantStatus,
  tenantStatusLight,
  tenantStatusHeavy,
};