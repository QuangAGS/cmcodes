/**
 * PATH       : src/shared/errors/codes/index.js
 * DATETIME   : 2026-07-21T19:05:00+07:00
 * VERSION    : 1.0.0-CED-1.1
 * DESCRIPTION: Aggregate tất cả domain codes + Object.freeze.
 *              Chỉ re-export — không chứa logic nghiệp vụ.
 */

'use strict';

const AUTH = require('./auth.codes');
const COMMON = require('./common.codes');
const ONBOARDING = require('./onboarding.codes');
const SECURITY = require('./security.codes');
const TENANT = require('./tenant.codes');
const SRPF = require('./srpf.codes');

const ERROR_CODES = Object.freeze({
  AUTH,
  COMMON,
  ONBOARDING,
  SECURITY,
  TENANT,
  SRPF,
});

module.exports = {
  ERROR_CODES,
  AUTH,
  COMMON,
  ONBOARDING,
  SECURITY,
  TENANT,
  SRPF,
};