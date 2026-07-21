/**
 * ============================================================================
 * PATH        : src/modules/auth/core/common/error.codes.js
 * DATETIME    : 2026-07-16T12:15:00+07:00
 * VERSION     : EGAL-25.x.x-R1
 *
 * DESCRIPTION
 * ----------------------------------------------------------------------------
 * EGAL Error Code Doctrine
 *
 * Đây là "Single Source of Truth" cho toàn bộ mã lỗi (Business Error Code)
 * được sử dụng trong hệ thống EGAL.
 *
 * ----------------------------------------------------------------------------
 * MỤC TIÊU
 * ----------------------------------------------------------------------------
 *
 * Không cho phép hard-code:
 *
 *      err.code = 'ACCOUNT_DISABLED'
 *
 * hoặc
 *
 *      err.code = 'INVALID_IDENTIFIER'
 *
 * ở bất kỳ service nào.
 *
 * Tất cả phải tham chiếu thông qua:
 *
 *      ERROR_CODES.ACCOUNT_DISABLED
 *
 * ----------------------------------------------------------------------------
 * VAI TRÒ
 * ----------------------------------------------------------------------------
 *
 * ✔ Chuẩn hóa Error Code
 * ✔ Giữ tương thích 100% với UAT hiện tại
 * ✔ Không thay đổi Message
 * ✔ Không thay đổi HTTP Status
 * ✔ Chỉ gom toàn bộ Business Code về một nơi
 *
 * ----------------------------------------------------------------------------
 * EGAL Handbook V3
 * ----------------------------------------------------------------------------
 *
 * Chapter 5
 *      Shared Components
 *
 * Chapter 6
 *      Business Policy Isolation
 *
 * Chapter 8
 *      Error Doctrine
 *
 * Chapter 11
 *      Single Source Of Truth
 *
 * ============================================================================
 */

'use strict';

/**
 * ============================================================================
 * AUTHENTICATION
 * ============================================================================
 */
const AUTH = Object.freeze({

  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',

  ACCOUNT_CHO_DUYET: 'ACCOUNT_CHO_DUYET',

  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',

  ACCOUNT_BANNED: 'ACCOUNT_BANNED',

  INVALID_LOCK_STATE: 'INVALID_LOCK_STATE',

  TOO_MANY_ATTEMPTS: 'TOO_MANY_ATTEMPTS',

  TENANT_CHO_DUYET: 'TENANT_CHO_DUYET',

});


/**
 * ============================================================================
 * USER / IDENTITY
 * ============================================================================
 */
const IDENTITY = Object.freeze({

  INVALID_IDENTIFIER: 'INVALID_IDENTIFIER',

  IDENTIFIER_NOT_FOUND: 'IDENTIFIER_NOT_FOUND',

  NO_EMAIL_CHANNEL: 'NO_EMAIL_CHANNEL',

  INVALID_TYPE: 'INVALID_TYPE',

});


/**
 * ============================================================================
 * PASSWORD RESET
 * ============================================================================
 */
const RESET = Object.freeze({

  RESET_SESSION_NOT_FOUND: 'RESET_SESSION_NOT_FOUND',

  INVALID_RESET_CODE: 'INVALID_RESET_CODE',

  RESET_OTP_EXPIRED: 'RESET_OTP_EXPIRED',

  RESET_OTP_LOCKED: 'RESET_OTP_LOCKED',

  RESET_OTP_COOLDOWN: 'RESET_OTP_COOLDOWN',

  RESET_OTP_REQUEST_LIMITED: 'RESET_OTP_REQUEST_LIMITED',

  INVALID_CHANGE_PASSWORD_REQUEST:
    'INVALID_CHANGE_PASSWORD_REQUEST',

  INVALID_RESET_SESSION:
    'INVALID_RESET_SESSION',

  RESET_SESSION_LOCKED:
    'RESET_SESSION_LOCKED',

  RESET_TOKEN_EXPIRED:
    'RESET_TOKEN_EXPIRED',

  RESET_USER_NOT_FOUND:
    'RESET_USER_NOT_FOUND',

  WEAK_PASSWORD:
    'WEAK_PASSWORD',

});


/**
 * ============================================================================
 * REGISTRATION
 * ============================================================================
 */
const REGISTER = Object.freeze({

  REGISTER_FAILED:
    'REGISTER_FAILED',

});


/**
 * ============================================================================
 * APPROVAL
 * ============================================================================
 */
const APPROVAL = Object.freeze({

  APPROVAL_DENIED:
    'APPROVAL_DENIED',

  USER_NOT_FOUND:
    'USER_NOT_FOUND',

  EMPTY_ADMIN_NOTE:
    'EMPTY_ADMIN_NOTE',

});


/**
 * ============================================================================
 * COMMON
 * ============================================================================
 */
const COMMON = Object.freeze({

  INTERNAL_ERROR:
    'INTERNAL_ERROR',

  VALIDATION_ERROR:
    'VALIDATION_ERROR',

  FORBIDDEN:
    'FORBIDDEN',

  NOT_FOUND:
    'NOT_FOUND',

  BAD_REQUEST:
    'BAD_REQUEST',

});


/**
 * ============================================================================
 * EXPORT
 * ============================================================================
 *
 * Có 2 cách sử dụng.
 *
 * ------------------------------------------------------------------
 * Cách 1 (Khuyến nghị)
 *
 * ERROR_CODES.AUTH.ACCOUNT_DISABLED
 *
 * ------------------------------------------------------------------
 * Cách 2
 *
 * const { AUTH } = ERROR_CODES;
 *
 * AUTH.ACCOUNT_DISABLED
 *
 * ============================================================================
 */

const ERROR_CODES = Object.freeze({

  AUTH,

  IDENTITY,

  RESET,

  REGISTER,

  APPROVAL,

  COMMON,

});

module.exports = ERROR_CODES;