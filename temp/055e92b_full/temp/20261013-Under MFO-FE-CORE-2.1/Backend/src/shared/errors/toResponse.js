/**
 * PATH       : src/shared/errors/toResponse.js
 * DATETIME   : 2026-07-22T07:30:00+07:00
 * VERSION    : 1.0.0-CED-1.1
 * DESCRIPTION: Serialize AppError → External Response (CED E3 + E7 + E9).
 *              - Canonical shape: { success: false, error: { code, message, details?, correlationId } }
 *              - legacy: true → thêm top-level code/message để tương thích FE cũ
 *              - Production: không lộ stack / cause / PII
 *              Pure function — zero side-effect.
 * Ghchú:
 * 1) toResponse: Luôn trả canonical shape. Khi legacy: true thêm code + message top-level + optional legacyCode. 
 * Không bao giờ đưa stack / cause ra client.
 * 2) toLogPayloadLuôn giữ stack + cause (kể cả Prisma code). Redact password/otp/token. 
 * Level warn cho operational, error cho non-operational → dễ routing alert.
 */

'use strict';

const { getLegacyAlias } = require('./aliases');

/**
 * @param {import('./AppError').AppError|Error} err
 * @param {object} [options]
 * @param {boolean} [options.legacy=false] - dual-contract mode
 * @param {string}  [options.correlationId] - fallback nếu err chưa có
 * @returns {object} response body
 */
function toResponse(err, options = {}) {
  const legacy = options.legacy === true;
  const correlationId =
    (err && err.correlationId) ||
    options.correlationId ||
    undefined;

  // Non-AppError fallback (programmer error / unknown)
  if (!err || typeof err !== 'object' || !err.code) {
    const body = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Đã xảy ra lỗi hệ thống.',
        correlationId,
      },
    };
    if (legacy) {
      body.code = 'INTERNAL_ERROR';
      body.message = body.error.message;
    }
    return body;
  }

  const code = err.code;
  const message = err.message || code;
  const details = err.details && typeof err.details === 'object'
    ? { ...err.details }
    : undefined;

  // Canonical shape (CED V.1)
  const body = {
    success: false,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
      ...(correlationId ? { correlationId } : {}),
    },
  };

  // Dual-contract (CED E7 + SEC E)
  if (legacy) {
    body.code = code;
    body.message = message;

    // Optional: expose legacy alias nếu có
    const alias = getLegacyAlias(code);
    if (alias) {
      body.legacyCode = alias;
    }
  }

  return body;
}

module.exports = {
  toResponse,
};