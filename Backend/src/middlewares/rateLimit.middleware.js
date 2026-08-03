/**
 * PATH: src/middlewares/rateLimit.middleware.js
 * DATETIME   : 2026-07-27T14:50:00+07:00
 * VERSION    : 20.3.0-W4
 * DESCRIPTION:
 * - Rate limit từ securityConfig (reset) + hard policy login/register.
 * - [20.3.0-W4] PR-W4-1: onboardingWrite + onboardingAdmin limiters; 429 gắn correlationId.
 * - Q1: giữ login 10/1p, register 5/1p.
 * - Đọc rate limit policy từ centralized securityConfig.
 * - login/register giữ behavior tương đương bản cũ.
 * - resetRateLimiter dùng Forgot Password policy từ .env:
 *   RESET_IDENTIFIER_NOT_FOUND_MAX_ATTEMPTS
 *   RESET_IDENTIFIER_NOT_FOUND_WINDOW_MINUTES
 *   RESET_IDENTIFIER_NOT_FOUND_BLOCK_MINUTES
 * 
 * CHANGELOG:
 * - 20.2.0: login/register/reset.
 * - 20.3.0-W4 (2026-07-27): onboarding limiters + CED correlation on 429.
 */

'use strict';

const rateLimit = require('express-rate-limit');
const securityConfig = require('../config/securityConfig');

const createRateLimiter = ({
  max,
  windowMinutes,
  message,
  code = 'RATE_LIMITED',
}) =>
  rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false, // v7: tránh ERR_ERL_* / keyGenerator + req.ip
    keyGenerator: (req) => {
      let ip =
        req.headers['cf-connecting-ip'] ||
        req.ip ||
        req.socket?.remoteAddress ||
        'local';

      // Gộp localhost IPv4/IPv6 thành một key
      if (
        ip === '::1' ||
        ip === '::ffff:127.0.0.1' ||
        ip === ':ffff:127.0.0.1'
      ) {
        ip = '127.0.0.1';
      }

      return String(ip);
    },
    handler: (req, res) => {
      const correlationId = req.correlationId || undefined;
      const body = {
        status: 'error',
        code,
        message,
        retryAfterMinutes: windowMinutes,
      };
      if (correlationId) {
        body.correlationId = correlationId;
        res.setHeader('X-Correlation-Id', correlationId);
      }
      res.status(429).json(body);
    },
  });

const loginRateLimiter = createRateLimiter({
  max: 10,
  windowMinutes: 1,
  code: 'LOGIN_RATE_LIMITED',
  message: 'Quá nhiều lần thử đăng nhập. Vui lòng thử lại sau 1 phút.',
});

const registerRateLimiter = createRateLimiter({
  max: 5,
  windowMinutes: 1,
  code: 'REGISTER_RATE_LIMITED',
  message: 'Quá nhiều yêu cầu đăng ký. Vui lòng thử lại sau 1 phút.',
});

const resetRateLimiter = createRateLimiter({
  max: securityConfig.RESET_IDENTIFIER_NOT_FOUND_MAX_ATTEMPTS,
  windowMinutes: securityConfig.RESET_IDENTIFIER_NOT_FOUND_WINDOW_MINUTES,
  code: 'RESET_RATE_LIMITED',
  message: `Quá nhiều yêu cầu reset mật khẩu. Vui lòng thử lại sau ${securityConfig.RESET_IDENTIFIER_NOT_FOUND_BLOCK_MINUTES} phút.`,
});

/** User onboarding writes: cases / profile / submit / branch / activate */
const onboardingWriteRateLimiter = createRateLimiter({
  max: 20,
  windowMinutes: 1,
  code: 'ONBOARDING_RATE_LIMITED',
  message: 'Quá nhiều thao tác onboarding. Vui lòng thử lại sau 1 phút.',
});

/** Admin onboarding: review / approve / reject / merge */
const onboardingAdminRateLimiter = createRateLimiter({
  max: 30,
  windowMinutes: 1,
  code: 'ONBOARDING_ADMIN_RATE_LIMITED',
  message: 'Quá nhiều thao tác duyệt onboarding. Vui lòng thử lại sau 1 phút.',
});

/** check-identity — chống enum identifier */
const checkIdentityRateLimiter = createRateLimiter({
  max: 20,
  windowMinutes: 1,
  code: 'CHECK_IDENTITY_RATE_LIMITED',
  message: 'Quá nhiều lần kiểm tra định danh. Vui lòng thử lại sau 1 phút.',
});

module.exports = {
  loginRateLimiter,
  registerRateLimiter,
  resetRateLimiter,
  onboardingWriteRateLimiter,
  onboardingAdminRateLimiter,
  checkIdentityRateLimiter,
};