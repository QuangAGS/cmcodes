/**
 * PATH       : backend/src/modules/onboarding/srpf/index.js
 * DATETIME   : 2026-08-16T22:40:00+07:00
 * VERSION    : 1.1.0-FE-OP-B1
 * DESCRIPTION: Barrel — OP realization (MEMBER_PROMOTE) on SRPF engine.
 *              Engine remains: shared/frameworks/srpf
 *              This package: definition + open instance + getMyOp + register bootstrap.
 *
 * Contract: Register-to-OP-Handoff-Contract-2026-08-13 v1.0
 * FE-OP: FE-OP-MEMBER_PROMOTE-2026-08-16 (GET /onboarding/my-op)
 * C6: Moved from shared/frameworks/srpf/{definitions,services}
 *
 * Usage (bootstrap — once):
 *   require('./modules/onboarding/srpf').registerMemberPromote();
 *   // or from onboarding.routes.js:
 *   require('./srpf').registerMemberPromote();
 *
 * Usage (handoff):
 *   const { openMemberPromoteInstance } = require('../onboarding/srpf');
 *   await openMemberPromoteInstance({ userId, memberId, tenantId, caseType, tx });
 *
 * Usage (FE hub / guard — my-op):
 *   const { getMyOpInstance } = require('./srpf');
 *   const data = await getMyOpInstance({ userId });
 *
 * Usage (execute after register):
 *   const srpf = require('../../shared/frameworks/srpf');
 *   await srpf.executeAction({ processType: 'MEMBER_PROMOTE', instanceId, action, actorContext });
 *
 * CHANGELOG:
 * - 1.0.0-C6 (2026-08-14): Initial barrel — register + openMemberPromoteInstance + definition.
 * - 1.1.0-FE-OP-B1 (2026-08-16): Export getMyOpInstance for GET /onboarding/my-op.
 */

'use strict';

const { registerMemberPromote } = require('./registerMemberPromote');
const { openMemberPromoteInstance } = require('./services/openMemberPromoteInstance');
const { getMyOpInstance } = require('./services/getMyOpInstance');
const {
  PROCESS_TYPE,
  MemberPromoteDefinition,
  registerMemberPromoteDefinition,
  BP_HARD_REQUIRED,
} = require('./definitions/MemberPromote.definition');

module.exports = {
  // Bootstrap (idempotent)
  registerMemberPromote,

  // Handoff API
  openMemberPromoteInstance,

  // FE OP hub / guard (read-only)
  getMyOpInstance,

  // Definition helpers (advanced / tests)
  PROCESS_TYPE,
  MemberPromoteDefinition,
  registerMemberPromoteDefinition,
  BP_HARD_REQUIRED,
};