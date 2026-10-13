/**
 * PATH       : src/shared/errors/index.js
 * DATETIME   : 2026-07-22T07:35:00+07:00
 * VERSION    : 1.0.0-CED-1.1
 * DESCRIPTION: Public API của shared/errors (CED kernel).
 *              Export tất cả thành phần cần thiết cho toàn backend.
 *              Không chứa logic nghiệp vụ.
 */

'use strict';

const { AppError, BusinessError } = require('./AppError');
const { createError, createBusinessError } = require('./createError');
const { toResponse } = require('./toResponse');
const { toLogPayload } = require('./toLogPayload');
const asyncHandler = require('./asyncHandler');
const { getStatusCode, hasStatusMapping, STATUS_MAP } = require('./httpMap');
const { getLegacyAlias, isPrimaryCode, LEGACY_ALIASES } = require('./aliases');
const {
  ERROR_CODES,
  AUTH,
  COMMON,
  ONBOARDING,
  SECURITY,
  TENANT,
} = require('./codes');

/**
 * Global Error Handler factory (dùng trong app.js)
 * @param {object} [options]
 * @param {boolean} [options.legacy=true] - dual-contract mode
 * @returns {function} Express error middleware (err, req, res, next)
 */
function createGlobalErrorHandler(options = {}) {
  const legacy = options.legacy !== false; // default true (Q1)

  return function globalErrorHandler(err, req, res, next) {
    // Đảm bảo correlationId luôn có (CED E5)
    const correlationId =
      (err && err.correlationId) ||
      req.correlationId ||
      req.headers['x-correlation-id'] ||
      require('crypto').randomUUID();

    // Gắn lại vào err để toResponse/toLogPayload dùng
    if (err && typeof err === 'object') {
      err.correlationId = correlationId;
    }

    // Internal log (E9)
    try {
      const logPayload = toLogPayload(err, req);
      // Có thể thay bằng logger chuẩn của project (winston/pino)
      if (logPayload.level === 'error') {
        console.error('[CED]', JSON.stringify(logPayload));
      } else {
        console.warn('[CED]', JSON.stringify(logPayload));
      }
    } catch (logErr) {
      console.error('[CED] toLogPayload failed:', logErr.message);
    }

    // External response
    const statusCode = (err && err.statusCode) || 500;
    const body = toResponse(err, { legacy, correlationId });

    // Header correlation cho client
    res.setHeader('X-Correlation-Id', correlationId);

    // Không gọi next(err) nữa — đã xử lý xong
    if (res.headersSent) {
      return next(err);
    }
    return res.status(statusCode).json(body);
  };
}

/**
 * Helper sendError cho controller (thay handleError local)
 * @param {import('express').Response} res
 * @param {Error} err
 * @param {object} [options]
 * @param {boolean} [options.legacy=true]
 * @param {string}  [options.correlationId]
 */
function sendError(res, err, options = {}) {
  const legacy = options.legacy !== false;
  const correlationId =
    options.correlationId ||
    (err && err.correlationId) ||
    (res.req && res.req.correlationId) ||
    require('crypto').randomUUID();

  if (err && typeof err === 'object') {
    err.correlationId = correlationId;
  }

  const statusCode = (err && err.statusCode) || 500;
  const body = toResponse(err, { legacy, correlationId });

  res.setHeader('X-Correlation-Id', correlationId);
  return res.status(statusCode).json(body);
}

module.exports = {
  // Core
  AppError,
  BusinessError,
  createError,
  createBusinessError,
  toResponse,
  toLogPayload,
  asyncHandler,
  createGlobalErrorHandler,
  sendError,

  // Maps & aliases
  getStatusCode,
  hasStatusMapping,
  STATUS_MAP,
  getLegacyAlias,
  isPrimaryCode,
  LEGACY_ALIASES,

  // Codes
  ERROR_CODES,
  AUTH,
  COMMON,
  ONBOARDING,
  SECURITY,
  TENANT,
};