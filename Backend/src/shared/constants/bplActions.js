/**
 * PATH       : src/shared/constants/bplActions.js
 * DATETIME   : 2026-07-27T18:15:00+07:00
 * VERSION    : 1.0.0-W5
 * DESCRIPTION:
 * - PR-W5-1: Chuẩn hóa action code trong BPL metadata (tránh synonym lệch module).
 * - process_type vẫn dùng enum business_process_type trên DB.
 */

'use strict';

const BPL_ACTIONS = Object.freeze({
  DELEGATED_ACTION: 'DELEGATED_ACTION',
  ONBOARDING_EXPIRED: 'ONBOARDING_EXPIRED',
  USER_TEMP_UNLOCKED: 'USER_TEMP_UNLOCKED',
});

/** Map action → process_type enum (Prisma/DB) */
const BPL_ACTION_TO_PROCESS_TYPE = Object.freeze({
  [BPL_ACTIONS.DELEGATED_ACTION]: null, // set theo nghiệp vụ cụ thể (USER_APPROVAL, …)
  [BPL_ACTIONS.ONBOARDING_EXPIRED]: 'ONBOARDING_CASE_EXPIRE',
  [BPL_ACTIONS.USER_TEMP_UNLOCKED]: 'USER_UNLOCK',
});

module.exports = {
  BPL_ACTIONS,
  BPL_ACTION_TO_PROCESS_TYPE,
};