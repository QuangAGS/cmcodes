/**
 * PATH       : src/middlewares/auth.middleware.js
 * DATETIME   : 2026-07-26T11:30:00+07:00
 * VERSION    : 20.4.0-W2
 * DESCRIPTION:
 * - Dual req.user fields + tenantStatus.
 * - [20.4.0-W2] PR-W2-2: res.status().json → next(err) dual-contract CED.
 * - Re-export checkRole, requireActiveTenant.
 * - Q1 bảo toàn logic.
 *
 * CHANGELOG:
 * - 20.3.0-W2: tenantStatus + requireActiveTenant.
 * - 20.4.0-W2 (2026-07-26): next(err) CED shape (PR-W2-2).
 */

'use strict';

const jwt = require('jsonwebtoken');
const prismaModule = require('../lib/prisma.js');

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    const err = new Error('Thiếu token xác thực. Vui lòng đăng nhập.');
    err.statusCode = 401;
    err.code = 'UNAUTHORIZED';
    err.isOperational = true;
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
      return next(err);
    }

    const tenantContext = prismaModule.tenantContext;

    if (!tenantContext) {
      console.error('[Auth Middleware] tenantContext is undefined! Fallback to next()');
      return next();
    }

    tenantContext.run({ tenantId: userData.tenantId }, next);
  } catch (error) {
    console.error('JWT Verify Error:', error.message);
    const err = new Error('Phiên làm việc hết hạn hoặc Token không hợp lệ.');
    err.statusCode = 403;
    err.code = 'INVALID_TOKEN';
    err.isOperational = true;
    return next(err);
  }
};

const { checkRole, requireActiveTenant } = require('./role.middleware');

module.exports = {
  verifyToken,
  checkRole,
  requireActiveTenant,
};