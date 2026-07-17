/**
 * PATH       : src/services/auth/core/shared/egalAuthErrors.js
 * DATETIME   : 2026-06-27T12:30:00+07:00
 * VERSION    : EGAL-25.x-AUTH.ERRORS.V1
 * DESCRIPTION:
 * - Chuẩn hoá toàn bộ error domain cho Auth System
 * - Giữ nguyên message UAT 100%
 * - Thêm code chuẩn hoá để phục vụ tracing & observability
 *
 * EGAL NOTE:
 * - H-V3-ERR-01: Error phải có stable code
 * - H-V3-ERR-02: Message không được thay đổi (UAT contract)
 */

function createError({ message, status, code }) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

const AuthErrors = {
  INVALID_CREDENTIALS: () =>
    createError({
      message:
        'Thông tin tài khoản đăng nhập hoặc mật khẩu không chính xác.',
      status: 401,
      code: 'AUTH_INVALID_CREDENTIALS',
    }),

  ACCOUNT_PENDING: () =>
    createError({
      message:
        'Hồ sơ của bác đang chờ Ban Quản trị phê duyệt. Vui lòng quay lại sau.',
      status: 423,
      code: 'AUTH_ACCOUNT_CHO_DUYET',
    }),

  ACCOUNT_DISABLED: () =>
    createError({
      message:
        'Tài khoản này hiện tại đã bị khóa hoặc tạm ngưng truy cập bởi Hệ thống Trung tâm.',
      status: 403,
      code: 'AUTH_ACCOUNT_DISABLED',
    }),

  TENANT_PENDING: () =>
    createError({
      message:
        'Dòng họ họ của bác hiện đang chờ Hệ thống Trung tâm phê duyệt kích hoạt dịch vụ.',
      status: 423,
      code: 'AUTH_TENANT_CHO_DUYET',
    }),

  MISSING_JWT_SECRET: () =>
    createError({
      message:
        'Cấu hình thiếu JWT_SECRET tại tệp môi trường .env.',
      status: 500,
      code: 'AUTH_MISSING_JWT_SECRET',
    }),
};

module.exports = {
  AuthErrors,
};