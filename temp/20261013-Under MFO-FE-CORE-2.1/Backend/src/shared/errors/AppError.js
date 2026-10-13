/**
 * PATH       : src/shared/errors/AppError.js
 * DATETIME   : 2026-07-22T07:15:00+07:00
 * VERSION    : 1.0.0-CED-1.1
 * DESCRIPTION: Core Error class của CED v1.1.
 *              - Hỗ trợ operational vs programmer error (E2)
 *              - Giữ cause gốc để toLogPayload serialize (E9)
 *              - BusinessError là alias tương thích Q1 onboarding
 *              Pure class — zero side-effect.
 */

'use strict';

class AppError extends Error {
  /**
   * @param {string} code          - Mã lỗi ổn định (từ ERROR_CODES)
   * @param {string} message       - Message tiếng Việt (fallback UAT)
   * @param {object} [options]
   * @param {number} [options.statusCode=500]
   * @param {object} [options.details] - metadata an toàn (không PII)
   * @param {string} [options.correlationId]
   * @param {Error}  [options.cause]   - native/DB error gốc
   * @param {boolean}[options.isOperational=true]
   * @param {string} [options.name='AppError'] - 'AppError' | 'BusinessError'
   */
  constructor(code, message, options = {}) {
    super(message);

    this.name = options.name || 'AppError';
    this.code = code;
    this.statusCode = options.statusCode || 500;
    this.details = options.details || undefined;
    this.correlationId = options.correlationId || undefined;
    this.isOperational = options.isOperational !== false; // default true
    this.cause = options.cause || undefined;

    // Giữ stack trace đúng (V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Alias tương thích Q1 — onboarding.controller đang check err.name === 'BusinessError'
 */
class BusinessError extends AppError {
  constructor(code, message, options = {}) {
    super(code, message, {
      ...options,
      name: 'BusinessError',
      isOperational: true,
    });
  }
}

module.exports = {
  AppError,
  BusinessError,
};