/**
 * PATH       : backend/src/shared/frameworks/srpf/communication/CommunicationHook.js
 * DATETIME   : 2026-08-11T14:40:00+07:00
 * VERSION    : 0.1.0-skeleton
 * DESCRIPTION: After-commit hook that emits communication events via
 *              the existing Notification Orchestrator.
 *
 * Policy: Communication runs AFTER transaction commit (avoid notify on rollback).
 *
 * NOTE: Skeleton only. Wire to notificationOrchestrator.js in Phase 3.
 */

'use strict';

/**
 * Emit a communication event after successful action.
 *
 * @param {object} params
 * @param {string} params.event - e.g. "MEMBER_PROMOTE_APPROVE"
 * @param {string|null} params.correlationId
 * @param {object} params.instance
 * @param {object} params.actorContext
 * @returns {Promise<void>}
 */
async function emit({ event, correlationId, instance, actorContext }) {
  if (!correlationId) {
    // No correlation → no communication (e.g. SAVE_DRAFT)
    return;
  }

  // TODO (Phase 3):
  // Call notificationOrchestrator with correlationId, event, recipients, etc.
  // Prefer existing UAT'ed Register orchestrator path.

  // Placeholder — do not throw in skeleton consumers yet
  return;
}

module.exports = {
  emit,
};
