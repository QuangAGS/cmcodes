/**  
 * PATH       : modules/onboarding/srpf/registerMemberPromote.js
 * DATETIME   : 2026-08-14T18:10:00+07:00
 * VERSION    : 1.0.0
 * DESCRIPTION: Gọi registerMemberPromote() một lần khi server start (cùng chỗ load routes onboarding)
 *  
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