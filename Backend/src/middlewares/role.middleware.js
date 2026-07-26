/**
 * PATH       : src/middlewares/role.middleware.js
 * DATETIME   : 2026-07-26T11:30:00+07:00
 * VERSION    : 20.4.0-W2
 * MỤC ĐÍCH   : RBAC + status check + tenant activation gate.
 * DESCRIPTION:
 * - [20.4.0-W2] PR-W2-2: res.status().json → next(err) dual-contract CED.
 * - SYSTEM_ADMIN bypass, checkRole dual call-style, requireActiveTenant.
 * - Q1: Giữ tên hàm, mã lỗi, message cũ.
 *
 * CHANGELOG:
 * - 20.3.0-W2: requireActiveTenant + dual call-style checkRole.
 * - 20.4.0-W2 (2026-07-26): next(err) CED shape (PR-W2-2).
 */

'use strict';

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
      return next(err);
    }

    next();
  };
};

/**
 * Chặn CLAN_ADMIN khi tenant chưa kích hoạt đầy đủ.
 * SYSTEM_ADMIN bypass.
 */
const requireActiveTenant = (req, res, next) => {
  if (!req.user) {
    const err = new Error('Không tìm thấy thông tin xác thực.');
    err.statusCode = 401;
    err.code = 'UNAUTHORIZED';
    err.isOperational = true;
    return next(err);
  }

  const { role, tenantStatus } = req.user;

  if (role === 'SYSTEM_ADMIN') {
    return next();
  }

  const blocked = ['CHO_DUYET', 'TAM_NGUNG', 'BI_KHOA'];
  if (blocked.includes(tenantStatus)) {
    const err = new Error(
      'Dòng họ đang ở trạng thái tạm ngưng hoặc chưa kích hoạt. Vui lòng hoàn thiện thông tin dòng họ trước khi duyệt thành viên.'
    );
    err.statusCode = 403;
    err.code = 'TENANT_NOT_ACTIVATED';
    err.isOperational = true;
    err.tenantStatus = tenantStatus || null;
    return next(err);
  }

  next();
};

module.exports = { checkRole, requireActiveTenant };