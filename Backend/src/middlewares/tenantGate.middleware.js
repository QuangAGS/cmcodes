/**
 * PATH       : src/middlewares/tenantGate.middleware.js
 * DATETIME   : 2026-11-08T18:30:00+07:00
 * VERSION    : 1.0.1 - MULTIHOME - PHASE2-[SEC-01]
 * DESCRIPTION:
 * - [SEC-01] Whitelist bắt buộc khi activeLinkStatus === 'DRAFT' (Onboarding Sandbox)
 * - Sử dụng req.originalUrl chuẩn hóa để tránh lỗi prefix rỗng trong router con
 */

'use strict';

/**
 * [SEC-01] Whitelist bắt buộc khi activeLinkStatus === 'DRAFT' (Onboarding Sandbox)
 * Theo đặc tả RP-OP-DESIGN-SPEC-V3.0
 */
const SANDBOX_WHITELIST_EXACT = new Set([
  '/api/me/profile',
  '/api/auth/me',
  '/api/tenants',
  '/api/auth/switch-context',
]);

const SANDBOX_WHITELIST_PREFIXES = [
  '/api/mfo',
  '/api/me/profile',
  '/api/tenants',
];

const checkIsWhitelisted = (path) => {
  if (SANDBOX_WHITELIST_EXACT.has(path)) return true;
  return SANDBOX_WHITELIST_PREFIXES.some((prefix) => path.startsWith(`${prefix}/`) || path === prefix);
};

const tenantGate = (req, res, next) => {
  const user = req.user;

  console.log('🛑 [DEBUG tenantGate]:', {
    activeLinkStatus: user?.activeLinkStatus,
    role: user?.role,
    originalUrl: req.originalUrl,
    baseUrl: req.baseUrl,
    path: req.path,
  });

  if (!user) {
    return res.status(401).json({
      status: 'error',
      code: 'UNAUTHORIZED',
      message: 'Yêu cầu đăng nhập.',
    });
  }

  // SYSTEM_ADMIN luôn được bypass
  if (user.role === 'SYSTEM_ADMIN') {
    return next();
  }

  const linkStatus = user.activeLinkStatus;
  
  // Chuẩn hóa đường dẫn lấy từ originalUrl (bỏ query string)
  const fullPath = req.originalUrl 
    ? req.originalUrl.split('?')[0] 
    : (req.baseUrl ? `${req.baseUrl}${req.path}` : req.path);

  // 1. Chặn nếu tài khoản chưa chọn dòng họ hoặc không có liên kết
  if (!user.activeTenantId && !user.tenantId) {
    if (!checkIsWhitelisted(fullPath)) {
      return res.status(403).json({
        status: 'error',
        code: 'NO_TENANT_SELECTED',
        message: 'Vui lòng chọn hoặc tham gia một dòng họ để tiếp tục.',
      });
    }
    return next();
  }

  // 2. Chặn nếu liên kết đang ở trạng thái CHO_DUYET (Chờ duyệt Claim)
  if (linkStatus === 'CHO_DUYET') {
    const isAllowedForPending =
      fullPath === '/api/auth/me' ||
      fullPath === '/api/auth/switch-context' ||
      fullPath.startsWith('/api/membership/claims/status');

    if (!isAllowedForPending) {
      return res.status(423).json({
        status: 'error',
        code: 'TENANT_MEMBERSHIP_PENDING',
        message: 'Yêu cầu tham gia dòng họ của bạn đang chờ Hội đồng gia tộc phê duyệt.',
      });
    }
    return next();
  }

  // 3. [SEC-01] Chế độ Onboarding Sandbox (linkStatus === 'DRAFT')
  if (linkStatus === 'DRAFT') {
    if (!checkIsWhitelisted(fullPath)) {
      return res.status(403).json({
        status: 'error',
        code: 'SANDBOX_RESTRICTED',
        message: 'Tài khoản đang trong chế độ khởi tạo phả hệ. Chỉ được sử dụng MFO và cập nhật hồ sơ cá nhân.',
      });
    }
    return next();
  }

  // 4. Nếu linkStatus === 'DA_DUYET': Cho phép đi tiếp
  return next();
};

module.exports = { tenantGate };