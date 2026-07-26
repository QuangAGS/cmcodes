/**
 * PATH       : src/middlewares/tenantStatus.middleware.js
 * DATETIME   : 2026-07-26T15:20:00+07:00
 * VERSION    : 1.0.0-W3
 * DESCRIPTION:
 * - Wave 3 PR-W3-1: L3 Tenant Status Gate (Light / Heavy).
 * - SYSTEM_ADMIN: bypass status check, vẫn resolve/gán tenant context nếu có slug/id.
 * - Heavy: chặn CHO_DUYET / TAM_NGUNG / BI_KHOA cho admin nghiệp vụ.
 * - Light: chặn BI_KHOA (+ optional missing tenant cho non-SYS).
 * - CED: next(err) dual-contract; correlationId từ req.correlationId (W1.0).
 * - Q1: export tenantStatus / Light / Heavy; requireActiveTenant alias ở role.middleware (PR-W3-2).
 *
 * CHANGELOG:
 * - 1.0.0-W3 (2026-07-26): Initial Light/Heavy + SYS_ADMIN context preserve.
 */

'use strict';

const HEAVY_BLOCKED = ['CHO_DUYET', 'TAM_NGUNG', 'BI_KHOA'];
const LIGHT_BLOCKED = ['BI_KHOA'];

/**
 * Map tenantStatus → { code, statusCode, message }
 */
function mapTenantError(tenantStatus, mode) {
  if (tenantStatus === 'BI_KHOA') {
    return {
      code: 'TENANT_DISABLED',
      statusCode: 403,
      message:
        'Dòng họ đã bị khóa. Vui lòng liên hệ Hệ thống Trung tâm để được hỗ trợ.',
    };
  }

  if (tenantStatus === 'CHO_DUYET') {
    return {
      code: 'TENANT_PENDING_ACTIVATION',
      statusCode: 423,
      message:
        'Dòng họ đang chờ kích hoạt. Vui lòng hoàn thiện hồ sơ trước khi sử dụng chức năng này.',
    };
  }

  // TAM_NGUNG và các status heavy còn lại
  return {
    code: 'TENANT_NOT_ACTIVATED',
    statusCode: 403,
    message:
      mode === 'heavy'
        ? 'Dòng họ đang ở trạng thái tạm ngưng hoặc chưa kích hoạt. Vui lòng hoàn thiện thông tin dòng họ trước khi duyệt thành viên / dùng chức năng quản trị.'
        : 'Dòng họ chưa ở trạng thái hoạt động. Vui lòng thử lại sau.',
  };
}

/**
 * Resolve tenant id context (không bypass việc gán context cho SYSTEM_ADMIN).
 * Ưu tiên: header x-tenant-slug đã được app.js/tenantContext xử lý;
 * fallback req.user.tenantId / tenant_id; params/body nếu có.
 */
function resolveTenantContextHint(req) {
  return {
    tenantId:
      req.user?.tenantId ||
      req.user?.tenant_id ||
      req.params?.tenantId ||
      req.body?.tenantId ||
      null,
    tenantStatus: req.user?.tenantStatus || req.user?.tenant_status || null,
    slug: req.headers['x-tenant-slug'] || req.query?.slug || null,
  };
}

/**
 * Factory middleware.
 * @param {Object} [options]
 * @param {'light'|'heavy'} [options.mode='light']
 * @param {string[]} [options.blocked] override danh sách status bị chặn
 */
const tenantStatus = (options = {}) => {
  const mode = options.mode === 'heavy' ? 'heavy' : 'light';
  const blocked =
    Array.isArray(options.blocked) && options.blocked.length > 0
      ? options.blocked
      : mode === 'heavy'
        ? HEAVY_BLOCKED
        : LIGHT_BLOCKED;

  return (req, res, next) => {
    const role = req.user?.role;
    const hint = resolveTenantContextHint(req);

    // Gán hint lên req để handler/downstream dùng (kể cả SYSTEM_ADMIN)
    req.tenantGate = {
      mode,
      tenantId: hint.tenantId,
      tenantStatus: hint.tenantStatus,
      slug: hint.slug,
      bypassedStatusCheck: false,
    };

    // Thiếu auth → 401 (không đoán tenant)
    if (!req.user) {
      const err = new Error('Không tìm thấy thông tin xác thực.');
      err.statusCode = 401;
      err.code = 'UNAUTHORIZED';
      err.isOperational = true;
      err.correlationId = req.correlationId;
      return next(err);
    }

    // SYSTEM_ADMIN: bypass status check — vẫn giữ context hint ở req.tenantGate
    if (role === 'SYSTEM_ADMIN') {
      req.tenantGate.bypassedStatusCheck = true;
      return next();
    }

    const currentStatus = hint.tenantStatus;

    // Heavy: thiếu tenantStatus coi như chưa active
    if (mode === 'heavy' && (currentStatus == null || currentStatus === '')) {
      const mapped = mapTenantError('TAM_NGUNG', mode);
      const err = new Error(mapped.message);
      err.statusCode = mapped.statusCode;
      err.code = mapped.code;
      err.isOperational = true;
      err.tenantStatus = null;
      err.correlationId = req.correlationId;
      return next(err);
    }

    if (currentStatus && blocked.includes(currentStatus)) {
      const mapped = mapTenantError(currentStatus, mode);
      const err = new Error(mapped.message);
      err.statusCode = mapped.statusCode;
      err.code = mapped.code;
      err.isOperational = true;
      err.tenantStatus = currentStatus;
      err.correlationId = req.correlationId;
      return next(err);
    }

    return next();
  };
};

const tenantStatusLight = tenantStatus({ mode: 'light' });
const tenantStatusHeavy = tenantStatus({ mode: 'heavy' });

module.exports = {
  tenantStatus,
  tenantStatusLight,
  tenantStatusHeavy,
  HEAVY_BLOCKED,
  LIGHT_BLOCKED,
};