/**
 * PATH       : src/shared/errors/toLogPayload.js
 * DATETIME   : 2026-07-22T07:30:00+07:00
 * VERSION    : 1.0.0-CED-1.1
 * DESCRIPTION: Serialize AppError → Internal Log Payload (CED E9 + VIII.1).
 *              - Luôn có correlationId, stack, cause chain
 *              - Redact PII / sensitive headers
 *              - Phân level: operational → warn, non-operational → error
 *              Pure function — zero side-effect.
 * Ghi chú:
 * toLogPayload.js: serialize AppError → log payload (CED VIII.1 normative)
 * - Luôn có correlationId, stack, cause chain.
 * toLogPayload: Luôn giữ stack + cause (kể cả Prisma code). Redact password/otp/token. 
 * Level warn cho operational, error cho non-operational → dễ routing alert.
 * - correlationId: Ưu tiên lấy từ err.correlationId → req.correlationId → header.
 */

'use strict';

/**
 * Danh sách key nhạy cảm cần redact
 */
const SENSITIVE_KEYS = new Set([
  'password',
  'otp',
  'token',
  'authorization',
  'accessToken',
  'refreshToken',
  'secret',
  'jwt',
  'creditCard',
  'ssn',
]);

/**
 * Redact object (shallow + 1 level nested)
 * @param {object} obj
 * @returns {object}
 */
function redact(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) {
      out[k] = '[REDACTED]';
    } else if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Error)) {
      out[k] = redact(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Serialize cause chain an toàn
 * @param {Error} cause
 * @returns {object|undefined}
 */
function serializeCause(cause) {
  if (!cause) return undefined;
  return {
    name: cause.name || 'Error',
    message: cause.message || String(cause),
    stack: cause.stack || undefined,
    code: cause.code || undefined, // Prisma / pg code
  };
}

/**
 * @param {import('./AppError').AppError|Error} err
 * @param {import('express').Request} [req]
 * @returns {object} log payload (CED VIII.1 normative)
 */
function toLogPayload(err, req) {
  const isOperational = err && err.isOperational !== false;
  const level = isOperational ? 'warn' : 'error';

  const correlationId =
    (err && err.correlationId) ||
    (req && (req.correlationId || req.headers['x-correlation-id'])) ||
    undefined;

  const payload = {
    level,
    correlationId,
    code: (err && err.code) || 'INTERNAL_ERROR',
    statusCode: (err && err.statusCode) || 500,
    message: (err && err.message) || 'Unknown error',
    isOperational,
    details: err && err.details ? redact(err.details) : undefined,
    stack: err && err.stack ? String(err.stack) : undefined,
    cause: err && err.cause ? serializeCause(err.cause) : undefined,
  };

  // Request context (không lấy body để tránh password/OTP)
  if (req) {
    payload.request = {
      method: req.method,
      path: req.originalUrl || req.url,
      userId: req.user && (req.user.id || req.user.userId) || undefined,
      tenantId: req.user && (req.user.tenantId || req.user.tenant_id) || undefined,
      ip: req.ip || (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || undefined,
    };
  }

  return payload;
}

module.exports = {
  toLogPayload,
  redact, // export để test
};