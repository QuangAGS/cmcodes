/**
 * PATH       : src/middlewares/role.middleware.js
 * DATETIME   : 2026-07-26T15:30:00+07:00
 * VERSION    : 20.5.0-W3
 * MỤC ĐÍCH   : RBAC + status check + tenant activation gate.
 * DESCRIPTION:
 * - [20.5.0-W3] PR-W3-2: requireActiveTenant = alias tenantStatusHeavy (Q1).
 * - Re-export tenantStatus helpers.
 * - correlationId trên mọi next(err).
 *
 * CHANGELOG:
 * - 20.4.0-W2: next(err) CED.
 * - 20.5.0-W3 (2026-07-26): alias tenantStatusHeavy.
 */

'use strict';

const {
  tenantStatus,
  tenantStatusLight,
  tenantStatusHeavy,
} = require('./tenantStatus.middleware');

/**
 * @param {...string|string[]} allowedRoles
 */
const checkRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      const err = new Error('Không tìm thấy thông tin xác thực.');
      err.statusCode = 401;
      err.code = 'UNAUTHORIZED';
      err.isOperational = true;
      err.correlationId = req.correlationId;
      return next(err);
    }

    const { role, status } = req.user;

    if (role === 'SYSTEM_ADMIN') {
      return next();
    }

    if (status !== 'DA_DUYET') {
      const err = new Error(
        `Tài khoản quản trị của bác hiện tại đang ở trạng thái chờ duyệt [${status || 'CHO_DUYET'}]. Vui lòng chờ Ban quản trị cấp cao phê duyệt kích hoạt tài khoản trước khi truy cập.`
      );
      err.statusCode = 403;
      err.code = 'ADMIN_ACCOUNT_NOT_ACTIVATED';
      err.isOperational = true;
      err.correlationId = req.correlationId;
      return next(err);
    }

    const roles =
      allowedRoles.length === 1 && Array.isArray(allowedRoles[0])
        ? allowedRoles[0]
        : allowedRoles;

    if (!roles.includes(role)) {
      const err = new Error('Bạn không có quyền truy cập vào chức năng này.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      err.isOperational = true;
      err.correlationId = req.correlationId;
      return next(err);
    }

    next();
  };
};

/**
 * Q1 alias — equivalent to tenantStatus({ mode: 'heavy' }).
 * Auth admin routes (pending/query/process-approval) giữ nguyên requireActiveTenant.
 */
const requireActiveTenant = tenantStatusHeavy;

module.exports = {
  checkRole,
  requireActiveTenant,
  tenantStatus,
  tenantStatusLight,
  tenantStatusHeavy,
};