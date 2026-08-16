/**
 * PATH       : backend/src/modules/onboarding/srpf/registerMemberPromote.js
 * DATETIME   : 2026-08-15T11:50:00+07:00
 * VERSION    : 1.0.1-C6-polish
 * DESCRIPTION: Idempotent bootstrap — register MEMBER_PROMOTE definition into SRPF registry.
 *              Gọi một lần khi server start (onboarding.routes.js hoặc app bootstrap).
 *              C6 polish: PATH header chuẩn hoá.
 */

'use strict';

const registry = require('../../../shared/frameworks/srpf/registry/ProcessDefinitionRegistry');
const { registerMemberPromoteDefinition } = require('./definitions/MemberPromote.definition');

let done = false;
function registerMemberPromote() {
  if (done) return;
  registerMemberPromoteDefinition(registry);
  done = true;
}

module.exports = { registerMemberPromote };