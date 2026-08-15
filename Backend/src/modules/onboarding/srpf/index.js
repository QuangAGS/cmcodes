/**
 * PATH       : backend/src/modules/onboarding/srpf/index.js
 * DATETIME   : 2026-08-14T18:50:00+07:00
 * VERSION    : 1.0.0-C6
 * DESCRIPTION: Barrel — OP realization (MEMBER_PROMOTE) on SRPF engine.
 *              Engine remains: shared/frameworks/srpf
 *              This package: definition + open instance + register bootstrap.
 *
 * Contract: Register-to-OP-Handoff-Contract-2026-08-13 v1.0
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
 * Usage (execute after register):
 *   const srpf = require('../../shared/frameworks/srpf');
 *   await srpf.executeAction({ processType: 'MEMBER_PROMOTE', instanceId, action, actorContext });
 */

'use strict';

const { registerMemberPromote } = require('./registerMemberPromote');
const { openMemberPromoteInstance } = require('./services/openMemberPromoteInstance');
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

  // Definition helpers (advanced / tests)
  PROCESS_TYPE,
  MemberPromoteDefinition,
  registerMemberPromoteDefinition,
  BP_HARD_REQUIRED,
};
