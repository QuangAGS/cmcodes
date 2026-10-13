/**
 * PATH       : src/shared/errors/aliases.js
 * DATETIME   : 2026-07-22T07:25:00+07:00
 * VERSION    : 1.0.0-CED-1.1
 * DESCRIPTION: Dual-contract alias table (CED E7 + SEC điều khoản E).
 *              Primary = mã FE đang dùng.
 *              Legacy alias = mã cũ hoặc mã namespace đầy đủ.
 *              Dùng trong toResponse({ legacy: true }).
 *              Pure map — zero side-effect.
 * Ghi chú:
 * aliases.js: Chỉ chứa các alias thực sự cần dual-contract. Có thể bổ sung thêm
 *  khi FE xác nhận. toResponse({ legacy: true }) sẽ đọc bảng này.
 */

'use strict';

/**
 * primaryCode → legacyAlias (hoặc ngược lại khi cần)
 * Khi legacy: true, response có thể trả thêm field legacy.
 *
 * Quy ước:
 * - Key   = primary code (đang dùng trên FE / canonical)
 * - Value = legacy alias (mã cũ hoặc mã namespaced)
 */
const LEGACY_ALIASES = Object.freeze({
  // Account lifecycle (FE đã ship)
  ACCOUNT_CHO_DUYET: 'AUTH_ACCOUNT_CHO_DUYET',
  ACCOUNT_DISABLED: 'AUTH_ACCOUNT_DISABLED',
  ACCOUNT_LOCKED: 'AUTH_ACCOUNT_LOCKED',
  ACCOUNT_BANNED: 'AUTH_ACCOUNT_BANNED',
  ACCOUNT_REJECTED: 'AUTH_ACCOUNT_REJECTED',

  // Tenant lifecycle (SEC B)
  TENANT_PENDING_ACTIVATION: 'TENANT_CHO_DUYET',
  TENANT_ACTIVATION_REQUIRED: 'TENANT_CHO_KICH_HOAT',
  TENANT_DISABLED: 'TENANT_DISABLED',

  // Common
  UNAUTHORIZED: 'AUTH_UNAUTHORIZED',
  FORBIDDEN: 'AUTH_FORBIDDEN',
  INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',

  // Onboarding (nếu FE đã dùng mã ngắn)
  ONBOARDING_CASE_NOT_EDITABLE: 'CASE_NOT_EDITABLE',
  ONBOARDING_MERGE_FAILED: 'MERGE_FAILED',
});

/**
 * Lấy legacy alias của một primary code.
 * @param {string} primaryCode
 * @returns {string|undefined}
 */
function getLegacyAlias(primaryCode) {
  return LEGACY_ALIASES[primaryCode];
}

/**
 * Kiểm tra một code có phải primary không.
 * @param {string} code
 * @returns {boolean}
 */
function isPrimaryCode(code) {
  return Object.prototype.hasOwnProperty.call(LEGACY_ALIASES, code);
}

module.exports = {
  LEGACY_ALIASES,
  getLegacyAlias,
  isPrimaryCode,
};