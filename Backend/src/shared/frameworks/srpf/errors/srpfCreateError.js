/**
 * PATH       : backend/src/shared/frameworks/srpf/errors/srpfCreateError.js
 * DATETIME   : 2026-08-13T11:40:00+07:00
 * VERSION    : 0.6.0-phase3.3
 * DESCRIPTION: Thin wrapper — createBusinessError for SRPF with code + message + details.
 */

'use strict';

const { createBusinessError } = require('../../../errors/createError');
const { SRPF_ERROR_CODES } = require('./srpf.codes');

/**
 * @param {string} code - SRPF_ERROR_CODES.* value
 * @param {string} message
 * @param {object} [options] - details, cause, correlationId, statusCode
 */
function srpfError(code, message, options = {}) {
  return createBusinessError(code, message, {
    ...options,
    details: {
      ...(options.details || {}),
      framework: 'SRPF',
    },
  });
}

module.exports = {
  srpfError,
  SRPF_ERROR_CODES,
};
