/**
 * PATH       : src/modules/auth/core/login.core.js
 * DATETIME   : 2026-07-16T12:15:00+07:00
 * VERSION    : EGAL-25.x-LOGIN.CORE-V1
 * DESCRIPTION:
 * - EGAL Phase 1 Refactor: Tách login logic từ authService sang core layer
 * - Mục tiêu: giữ 100% UAT compatibility (NO BEHAVIOR CHANGE)
 * - Không thay đổi:
 *    + error messages
 *    + HTTP status codes
 *    + JWT payload structure
 * - Chỉ thay đổi:
 *    + architectural boundary (service → core)
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { basePrisma } = require('../../../lib/prisma.js');

const { AuthErrors } = require('./shared/egalAuthErrors');

/**
 * LOGIN CORE - PURE BUSINESS AUTH FLOW
 * (Không phụ thuộc controller / route)
 */
async function loginCore({
  identifier,
  password,
  extraData,
  securityConfig,
}) {
  // =========================================================
  // STEP 1: LOAD USER (IDENTITY RESOLUTION)
  // EGAL-DATA-01: Direct ORM access allowed temporarily (Phase 1)
  // =========================================================
  const user = await basePrisma.users.findFirst({
    where: {
      OR: [
        { email: identifier },
        { phone: identifier }
      ],
      deleted_at: null,
    },
    include: {
      tenants: true,
    },
  });


  // =========================================================
  // ERROR STANDARDIZATION LAYER
  // =========================================================

  // =========================================================
  // STEP 2: USER EXISTENCE CHECK (UAT SAFE ERROR)
  // =========================================================
  if (!user) {
    const error = new Error(
      'Thông tin tài khoản đăng nhập hoặc mật khẩu không chính xác.'
    );
    error.status = 401;
    error.code = 'INVALID_CREDENTIALS';
    throw error;
  }

  // =========================================================
  // STEP 3: PASSWORD VERIFICATION
  // =========================================================
  const isMatch = await bcrypt.compare(password, user.password);

  if (!isMatch) {
    const error = new Error(
      'Thông tin tài khoản đăng nhập hoặc mật khẩu không chính xác.'
    );
    error.status = 401;
    error.code = 'INVALID_CREDENTIALS';
    throw error;
  }

  // =========================================================
  // STEP 4: LIFECYCLE GUARD - USER STATUS
  // (KEEP EXACT SAME UAT BEHAVIOR)
  // =========================================================

  if (user.status === 'CHO_DUYET') {
    const error = new Error(
      'Hồ sơ của bác đang chờ Ban Quản trị phê duyệt. Vui lòng quay lại sau.'
    );
    error.status = 423;
    error.code = 'ACCOUNT_CHO_DUYET';
    throw error;
  }

  if (user.status === 'TAM_NGUNG' || user.status === 'BI_KHOA') {
    const error = new Error(
      'Tài khoản này hiện tại đã bị khóa hoặc tạm ngưng truy cập bởi Hệ thống Trung tâm.'
    );
    error.status = 403;
    error.code = 'ACCOUNT_DISABLED';
    throw error;
  }

    // =========================================================
    // STEP 5: TENANT LIFECYCLE GUARD
    // =========================================================
  if (
    user.tenants &&
    user.tenants.status === 'CHO_DUYET' &&
    user.role !== 'SYSTEM_ADMIN'
  ) {
    const error = new Error(
      'Dòng họ họ của bác hiện đang chờ Hệ thống Trung tâm phê duyệt kích hoạt dịch vụ.'
    );
    error.status = 423;
    error.code = 'TENANT_CHO_DUYET';
    throw error;
  }

  // =========================================================
  // STEP 6: JWT SECRET VALIDATION
  // =========================================================
  const secret = process.env.JWT_SECRET || securityConfig.JWT_SECRET;

  if (!secret) {
    throw new Error('Cấu hình thiếu JWT_SECRET tại tệp môi trường .env.');
  }

  // =========================================================
  // STEP 7: TOKEN GENERATION (UAT COMPATIBLE PAYLOAD)
  // =========================================================
  const token = jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenant_id,
      status: user.status,
    },
    secret,
    { expiresIn: '24h' }
  );

  // =========================================================
  // STEP 8: RESPONSE NORMALIZATION (DO NOT CHANGE CONTRACT)
  // =========================================================
  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      tenant_id: user.tenant_id,
      status: user.status,
    },
  };
}

module.exports = {
  loginCore,
};