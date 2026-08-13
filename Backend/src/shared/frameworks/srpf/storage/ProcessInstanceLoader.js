/**
 * PATH       : backend/src/shared/frameworks/srpf/storage/ProcessInstanceLoader.js
 * DATETIME   : 2026-08-13T11:40:00+07:00
 * VERSION    : 0.6.0-phase3.3
 * DESCRIPTION: Load Process Instance — CED throws (Phase 3.3).
 *              Temporary storage: onboarding_cases.
 */

'use strict';

const { prisma } = require('../../../../lib/prisma.js');
const { srpfError, SRPF_ERROR_CODES } = require('../errors/srpfCreateError');

function normalizeFromOnboardingCase(row) {
  return {
    id: row.id,
    currentState: row.status,
    status: row.status,
    case_type: row.case_type,
    correlation_id: row.correlation_id,
    user_id: row.user_id,
    tenant_id: row.tenant_id,
    primary_member_id: row.primary_member_id,
    primary_branch_id: row.primary_branch_id,
    reviewed_by: row.reviewed_by,
    metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
    submitted_at: row.submitted_at,
    reviewed_at: row.reviewed_at,
    approved_at: row.approved_at,
    rejected_at: row.rejected_at,
    cancelled_at: row.cancelled_at,
    expired_at: row.expired_at,
    review_note: row.review_note,
    rejection_reason: row.rejection_reason,
    revision_request: row.revision_request,
    changed_by: row.changed_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    _raw: row,
    _storage: 'onboarding_cases',
  };
}

/**
 * @param {string} instanceId
 * @param {object} [options]
 * @param {import('@prisma/client').Prisma.TransactionClient} [options.tx]
 */
async function load(instanceId, options = {}) {
  if (!instanceId || typeof instanceId !== 'string') {
    throw srpfError(
      SRPF_ERROR_CODES.INSTANCE_NOT_FOUND,
      'Invalid instanceId',
      { details: { instanceId } }
    );
  }

  const client = options.tx || prisma;

  const row = await client.onboarding_cases.findFirst({
    where: {
      id: instanceId,
      deleted_at: null,
    },
  });

  if (!row) {
    throw srpfError(
      SRPF_ERROR_CODES.INSTANCE_NOT_FOUND,
      `Instance not found: ${instanceId}`,
      { details: { instanceId } }
    );
  }

  return normalizeFromOnboardingCase(row);
}

module.exports = {
  load,
  normalizeFromOnboardingCase,
};
