/**
 * PATH       : src/shared/errors/codes/common.codes.js
 * DATETIME   : 2026-07-21T19:05:00+07:00
 * VERSION    : 1.0.0-CED-1.1
 * DESCRIPTION: Mã lỗi dùng chung toàn hệ thống (không thuộc domain cụ thể).
 *              Pure constants only — zero business import.
 */

'use strict';

const COMMON = Object.freeze({
  // Generic
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  BAD_REQUEST: 'BAD_REQUEST',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  FORBIDDEN: 'FORBIDDEN',
  UNAUTHORIZED: 'UNAUTHORIZED',

  // Operational
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  TIMEOUT: 'TIMEOUT',
});

module.exports = COMMON;