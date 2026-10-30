/**
 * PATH       : src/shared/errors/asyncHandler.js
 * DATETIME   : 2026-07-22T07:35:00+07:00
 * VERSION    : 1.0.0-CED-1.1
 * DESCRIPTION: Wrapper bắt buộc cho mọi async route/controller (CED VIII.2).
 *              - Express 4 không tự bắt Promise rejection
 *              - Đảm bảo lỗi đi vào Global Error Handler
 *              - Hỗ trợ plain function / arrow function (lexical this)
 *              - Cấm class method chưa .bind(this)
 *              Pure higher-order function.
 */

'use strict';

/**
 * Bọc async function để lỗi được chuyển vào next(err)
 * @param {Function} fn - async (req, res, next) => {}
 * @returns {Function} Express middleware
 *
 * @example
 * // GOOD
 * router.post('/cases', verifyToken, asyncHandler(ctrl.createCase));
 *
 * // BAD (class method chưa bind)
 * asyncHandler(new Controller().create)  // mất this
 */
function asyncHandler(fn) {
  if (typeof fn !== 'function') {
    throw new TypeError('asyncHandler: fn must be a function');
  }

  return function wrappedAsyncHandler(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;