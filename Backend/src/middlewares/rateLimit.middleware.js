/**
 * PATH: src/middlewares/rateLimitMiddleware.js
 * DATETIME: 2026-05-13T00:00:00+07:00
 * VERSION: 20.2.0
 * DESCRIPTION:
 * - Đọc rate limit policy từ centralized securityConfig.
 * - login/register giữ behavior tương đương bản cũ.
 * - resetRateLimiter dùng Forgot Password policy từ .env:
 *   RESET_IDENTIFIER_NOT_FOUND_MAX_ATTEMPTS
 *   RESET_IDENTIFIER_NOT_FOUND_WINDOW_MINUTES
 *   RESET_IDENTIFIER_NOT_FOUND_BLOCK_MINUTES
 * - Bảo tồn Q1/Q2.
 */

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
    keyGenerator: (req) =>
      req.headers['cf-connecting-ip'] || req.ip || 'unknown',
    handler: (req, res) => {
      res.status(429).json({
        status: 'error',
        code,
        message,
        retryAfterMinutes: windowMinutes,
      });
    },
  });

// Rate limit cho Login
const loginRateLimiter = createRateLimiter({
  max: 10,
  windowMinutes: 1,
  code: 'LOGIN_RATE_LIMITED',
  message: 'Quá nhiều lần thử đăng nhập. Vui lòng thử lại sau 1 phút.',
});

// Rate limit cho Register (JoinClan + CreateClan)
const registerRateLimiter = createRateLimiter({
  max: 5,
  windowMinutes: 1,
  code: 'REGISTER_RATE_LIMITED',
  message: 'Quá nhiều yêu cầu đăng ký. Vui lòng thử lại sau 1 phút.',
});

// Rate limit cho Forgot/Reset Password
const resetRateLimiter = createRateLimiter({
  max: securityConfig.RESET_IDENTIFIER_NOT_FOUND_MAX_ATTEMPTS,
  windowMinutes: securityConfig.RESET_IDENTIFIER_NOT_FOUND_WINDOW_MINUTES,
  code: 'RESET_RATE_LIMITED',
  message: `Quá nhiều yêu cầu reset mật khẩu. Vui lòng thử lại sau ${securityConfig.RESET_IDENTIFIER_NOT_FOUND_BLOCK_MINUTES} phút.`,
});

module.exports = {
  loginRateLimiter,
  registerRateLimiter,
  resetRateLimiter,
};