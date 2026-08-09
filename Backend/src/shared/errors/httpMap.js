/**
 * PATH       : src/shared/errors/httpMap.js
 * DATETIME   : 2026-07-22T07:25:00+07:00
 * VERSION    : 1.0.0-CED-1.1
 * DESCRIPTION: Ánh xạ mã lỗi → HTTP status code (CED E4 Status Honesty).
 *              423 dùng cho lifecycle/workflow state (CHO_DUYET, tenant pending, onboarding wrong state).
 *              Pure map — zero side-effect.
 * Ghi chú:
 * httpMap.js: 423 dùng cho trạng thái chờ / chưa sẵn sàng (lifecycle/workflow state) — SEC E4 + CED E4. 
 * ACCOUNT_LOCKED map 423 (có thể điều chỉnh sau nếu muốn phân biệt temporary/permanent).
 */

'use strict';

/**
 * Default status khi không tìm thấy trong map
 */
const DEFAULT_STATUS = 500;

/**
 * Map chính (code → statusCode)
 * Ưu tiên các mã primary đang dùng trên FE + SEC/OPD.
 */
const STATUS_MAP = Object.freeze({
  // ─── 401 Unauthorized ───────────────────────────────────────
  UNAUTHORIZED: 401,
  TOKEN_MISSING: 401,
  TOKEN_INVALID: 401,
  TOKEN_EXPIRED: 401,
  SESSION_EXPIRED: 401,
  INVALID_CREDENTIALS: 401,

  // ─── 403 Forbidden ──────────────────────────────────────────
  FORBIDDEN: 403,
  ACCESS_DENIED: 403,
  ACCOUNT_DISABLED: 403,
  ACCOUNT_BANNED: 403,
  ACCOUNT_LOCKED: 403,
  TENANT_DISABLED: 403,
  CROSS_TENANT_DENIED: 403,
  INSUFFICIENT_ROLE: 403,
  INSUFFICIENT_SCOPE: 403,
  POLICY_VIOLATION: 403,
  SECURITY_ACCESS_DENIED: 403,
  SECURITY_POLICY_VIOLATION: 403,
  SECURITY_INSUFFICIENT_ROLE: 403,
  SECURITY_INSUFFICIENT_SCOPE: 403,
  ONBOARDING_ADMIN_REQUIRED: 403,
  ONBOARDING_NOT_CASE_OWNER: 403,

  // ─── 404 Not Found ──────────────────────────────────────────
  NOT_FOUND: 404,
  TENANT_NOT_FOUND: 404,
  ONBOARDING_CASE_NOT_FOUND: 404,
  ONBOARDING_BRANCH_NOT_FOUND: 404,
  SECURITY_DELEGATION_NOT_FOUND: 404,

  // ─── 409 Conflict ───────────────────────────────────────────
  CONFLICT: 409,
  EMAIL_ALREADY_EXISTS: 409,
  PHONE_ALREADY_EXISTS: 409,
  TENANT_ALREADY_EXISTS: 409,
  TENANT_SLUG_TAKEN: 409,
  TENANT_ALREADY_ACTIVE: 409,          // ← thêm
  TENANT_NOT_ACTIVATABLE: 409,         // ← thêm
  ONBOARDING_MEMBER_ALREADY_EXISTS: 409,
  ONBOARDING_CASE_ALREADY_SUBMITTED: 409,
  ONBOARDING_CASE_ALREADY_APPROVED: 409,
  ONBOARDING_CASE_ALREADY_REJECTED: 409,

  // ─── 422 Unprocessable Entity ───────────────────────────────
  VALIDATION_ERROR: 422,
  BAD_REQUEST: 422,
  PASSWORD_TOO_WEAK: 422,
  PASSWORD_INVALID: 422,
  OTP_INVALID: 422,
  ONBOARDING_PROFILE_INCOMPLETE: 422,
  ONBOARDING_INVALID_CASE_TYPE: 422,
  ONBOARDING_REJECT_REASON_REQUIRED: 422,
  ONBOARDING_REVISION_REQUIRED: 422,

  // ─── 423 Locked (lifecycle / workflow state) ────────────────
  // SEC E4 + CED E4 — dùng cho trạng thái chờ / chưa sẵn sàng
  ACCOUNT_CHO_DUYET: 423,
  ACCOUNT_LOCKED: 423,                    // temporary lock cũng có thể 423
  TENANT_PENDING_ACTIVATION: 423,
  TENANT_ACTIVATION_REQUIRED: 423,
  ONBOARDING_CASE_NOT_EDITABLE: 423,
  ONBOARDING_CASE_INVALID_STATUS: 423,
  ONBOARDING_NOT_UNDER_REVIEW: 423,
  ONBOARDING_CASE_CANCELLED: 423,
  ONBOARDING_CASE_EXPIRED: 423,
  SECURITY_ACCOUNT_TEMP_LOCKED: 423,
  SECURITY_ACCOUNT_PERM_LOCKED: 423,

  // ─── 429 Too Many Requests ──────────────────────────────────
  RATE_LIMITED: 429,
  OTP_TOO_MANY_ATTEMPTS: 429,

  // ─── 500 Internal / Operational ─────────────────────────────
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
  TIMEOUT: 504,
  REGISTER_FAILED: 500,
  ONBOARDING_MERGE_FAILED: 500,
  ONBOARDING_MERGE_PRECONDITION: 500,
});

/**
 * Lấy HTTP status code từ mã lỗi.
 * @param {string} code
 * @returns {number}
 */
function getStatusCode(code) {
  if (!code || typeof code !== 'string') return DEFAULT_STATUS;
  return STATUS_MAP[code] || DEFAULT_STATUS;
}

/**
 * Kiểm tra mã lỗi có được map rõ ràng không (dùng cho test/CI).
 * @param {string} code
 * @returns {boolean}
 */
function hasStatusMapping(code) {
  return Object.prototype.hasOwnProperty.call(STATUS_MAP, code);
}

module.exports = {
  STATUS_MAP,
  DEFAULT_STATUS,
  getStatusCode,
  hasStatusMapping,
};