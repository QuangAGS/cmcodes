/**
 * PATH       : src/shared/errors/createError.js
 * DATETIME   : 2026-07-22T07:15:00+07:00
 * VERSION    : 1.0.0-CED-1.1
 * DESCRIPTION: Factory tạo AppError / BusinessError từ mã lỗi + httpMap.
 *              - Tự map statusCode từ httpMap
 *              - Hỗ trợ details, cause, correlationId
 *              - Không side-effect, pure function
 */
/** 
 * Điểm,Giải thích
 * BusinessError: Giữ nguyên để Q1 — onboarding.controller.js đang check err.name === 'BusinessError'.
 * cause: Native/Prisma error được gắn vào đây → toLogPayload sẽ serialize stack + cause (CED E9).
 * isOperational: "Mặc định true. Chỉ set false khi là bug lập trình (TypeError, …) → alert channel."
 * getStatusCode: Sẽ nằm trong httpMap.js (file tiếp theo).
 */

'use strict';

const { AppError, BusinessError } = require('./AppError');
const { getStatusCode } = require('./httpMap');

/**
 * Tạo AppError chuẩn
 * @param {string} code
 * @param {string} [message]
 * @param {object} [options]
 * @param {object} [options.details]
 * @param {Error}  [options.cause]
 * @param {string} [options.correlationId]
 * @param {number} [options.statusCode] - override httpMap nếu cần
 * @param {boolean}[options.isOperational=true]
 * @param {boolean}[options.asBusinessError=false] - trả về BusinessError (Q1)
 * @returns {AppError|BusinessError}
 */
function createError(code, message, options = {}) {
  if (!code || typeof code !== 'string') {
    throw new TypeError('createError: code is required and must be a string');
  }

  const statusCode = options.statusCode || getStatusCode(code);
  const finalMessage = message || code;

  const opts = {
    statusCode,
    details: options.details,
    cause: options.cause,
    correlationId: options.correlationId,
    isOperational: options.isOperational !== false,
  };

  if (options.asBusinessError) {
    return new BusinessError(code, finalMessage, opts);
  }

  return new AppError(code, finalMessage, opts);
}

/**
 * Shortcut tạo BusinessError (dùng nhiều trong onboarding service)
 */
function createBusinessError(code, message, options = {}) {
  return createError(code, message, { ...options, asBusinessError: true });
}

module.exports = {
  createError,
  createBusinessError,
};