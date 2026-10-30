/**
 * PATH       : src/shared/errors/codes/auth.codes.js
 * DATETIME   : 2026-07-21T19:05:00+07:00
 * VERSION    : 1.0.0-CED-1.1
 * DESCRIPTION: Mã lỗi Identity / Account / Login / Register / JWT.
 *              Primary codes ưu tiên giữ tương thích FE đã ship (SEC E + dual-contract).
 *              Pure constants only — zero business import.
 */

'use strict';

const AUTH = Object.freeze({
  // Credentials & Session
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  TOKEN_MISSING: 'TOKEN_MISSING',
  SESSION_EXPIRED: 'SESSION_EXPIRED',

  // Account lifecycle (SEC S3 + ma trận login)
  ACCOUNT_CHO_DUYET: 'ACCOUNT_CHO_DUYET',           // 423 — primary FE
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',             // 403
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',                 // 403/423
  ACCOUNT_BANNED: 'ACCOUNT_BANNED',                 // BI_CAM
  ACCOUNT_REJECTED: 'ACCOUNT_REJECTED',             // TU_CHOI

  // Password / OTP
  PASSWORD_INVALID: 'PASSWORD_INVALID',
  PASSWORD_TOO_WEAK: 'PASSWORD_TOO_WEAK',
  OTP_INVALID: 'OTP_INVALID',
  OTP_EXPIRED: 'OTP_EXPIRED',
  OTP_TOO_MANY_ATTEMPTS: 'OTP_TOO_MANY_ATTEMPTS',

  // Register
  EMAIL_ALREADY_EXISTS: 'EMAIL_ALREADY_EXISTS',
  PHONE_ALREADY_EXISTS: 'PHONE_ALREADY_EXISTS',
  REGISTER_FAILED: 'REGISTER_FAILED',
});

module.exports = AUTH;