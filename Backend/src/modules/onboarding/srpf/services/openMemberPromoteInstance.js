/**
 * PATH       : backend/src/modules/onboarding/srpf/services/openMemberPromoteInstance.js
 * DATETIME   : 2026-08-15T18:30:00+07:00
 * VERSION    : 1.1.0-PR1-process-kind
 * DESCRIPTION: (+ PR-1) process_kind REGISTER khi createCaseFromRegister;
             findOpenCaseByUser chỉ RP (process_kind REGISTER).
             
 *  -Open a new MEMBER_PROMOTE (OP) process instance as DRAFT.
 *              C6 polish: PATH header corrected (moved from shared).
 *              SSOT: Register-to-OP-Handoff-Contract-2026-08-13 v1.0
 *
 * - Does NOT create members (caller / RP / member.service owns that).
 * - Does NOT mutate Register APPROVED cases.
 * - Idempotent: at most one non-terminal OP instance per (tenant, primary_member, MEMBER_PROMOTE).
 * - Temporary storage: onboarding_cases (+ metadata.process_type).
 */

'use strict';

const crypto = require('crypto');
const { prisma } = require('../../../../lib/prisma.js');
const { srpfError, SRPF_ERROR_CODES } = require('../../../../shared/frameworks/srpf/errors/srpfCreateError');
const { normalizeFromOnboardingCase } = require('../../../../shared/frameworks/srpf/storage/ProcessInstanceLoader');

const PROCESS_TYPE = 'MEMBER_PROMOTE';

/** Statuses that end an OP instance (no longer "open") */
const TERMINAL_STATUSES = Object.freeze([
  'APPROVED',
  'MERGED',
  'MERGE_FAILED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

/**
 * Prisma JSON filter: metadata.process_type = MEMBER_PROMOTE
 * Works for Json object column on Postgres via path filter when supported;
 * fallback: fetch candidates by member+tenant and filter in JS.
 *
 * @param {object} params
 * @param {string} params.memberId
 * @param {string} params.tenantId
 * @param {import('@prisma/client').Prisma.TransactionClient|object} params.client
 */
async function findOpenOpCase({ memberId, tenantId, client }) {
  const rows = await client.onboarding_cases.findMany({
    where: {
      primary_member_id: memberId,
      tenant_id: tenantId,
      deleted_at: null,
      process_kind: 'MEMBER_PROMOTE', // PR-1
      status: { notIn: [...TERMINAL_STATUSES] },
    },
    orderBy: { created_at: 'desc' },
    take: 20,
  });

  // Sau backfill + write path: đủ tin process_kind.
  // Giữ metadata check nếu muốn dual-read an toàn:
  return (
    rows.find((row) => {
      const meta =
        row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
      return meta.process_type === PROCESS_TYPE || row.process_kind === 'MEMBER_PROMOTE';
    }) || null
  );
}

/**
 * Open (or return existing) MEMBER_PROMOTE instance.
 *
 * @param {object} input
 * @param {string} input.memberId - required, must be DU_BI
 * @param {string} input.tenantId - required
 * @param {string} input.userId - required for create (schema: onboarding_cases.user_id NOT NULL)
 * @param {string} [input.caseType='MEMBER_JOIN'] - MEMBER_JOIN | CLAN_SETUP
 * @param {string} [input.sourceRegisterCaseId]
 * @param {string} [input.sourceRegisterCorrelationId]
 * @param {string} [input.actorId] - optional users.id for changed_by
 * @param {import('@prisma/client').Prisma.TransactionClient} [input.tx]
 * @returns {Promise<{ instance: object, created: boolean, correlationId: string, caseId: string }>}
 */
async function openMemberPromoteInstance(input = {}) {
  const {
    memberId,
    tenantId,
    userId,
    caseType = 'MEMBER_JOIN',
    sourceRegisterCaseId = null,
    sourceRegisterCorrelationId = null,
    actorId = null,
    tx = null,
  } = input;

  if (!memberId || typeof memberId !== 'string') {
    throw srpfError(
      SRPF_ERROR_CODES.PROFILE_INCOMPLETE,
      'openMemberPromoteInstance: memberId is required',
      { details: { field: 'memberId' } }
    );
  }
  if (!tenantId || typeof tenantId !== 'string') {
    throw srpfError(
      SRPF_ERROR_CODES.PROFILE_INCOMPLETE,
      'openMemberPromoteInstance: tenantId is required',
      { details: { field: 'tenantId' } }
    );
  }

  const client = tx || prisma;

  // --- Load & validate member ---
  const member = await client.members.findFirst({
    where: { id: memberId, deleted_at: null },
  });

  if (!member) {
    throw srpfError(
      SRPF_ERROR_CODES.INSTANCE_NOT_FOUND,
      `openMemberPromoteInstance: member not found: ${memberId}`,
      { details: { memberId } }
    );
  }

  if (member.status !== 'DU_BI') {
    throw srpfError(
      SRPF_ERROR_CODES.ENTRY_CONDITION_FAILED,
      `openMemberPromoteInstance: member.status must be DU_BI (got ${member.status})`,
      { details: { memberId, memberStatus: member.status } }
    );
  }

  if (member.tenant_id && member.tenant_id !== tenantId) {
    throw srpfError(
      SRPF_ERROR_CODES.FORBIDDEN,
      'openMemberPromoteInstance: member.tenant_id does not match tenantId',
      { details: { memberId, memberTenantId: member.tenant_id, tenantId } }
    );
  }

  // --- Idempotent: existing open OP ---
  const existing = await findOpenOpCase({ memberId, tenantId, client });
  if (existing) {
    const instance = normalizeFromOnboardingCase(existing);
    return {
      instance,
      created: false,
      correlationId: existing.correlation_id,
      caseId: existing.id,
    };
  }

  // --- Create requires userId (schema constraint) ---
  if (!userId || typeof userId !== 'string') {
    throw srpfError(
      SRPF_ERROR_CODES.PROFILE_INCOMPLETE,
      'openMemberPromoteInstance: userId is required to create OP case (onboarding_cases.user_id)',
      { details: { field: 'userId' } }
    );
  }

  const user = await client.users.findFirst({
    where: { id: userId, deleted_at: null },
    select: { id: true, status: true },
  });

  if (!user) {
    throw srpfError(
      SRPF_ERROR_CODES.INSTANCE_NOT_FOUND,
      `openMemberPromoteInstance: user not found: ${userId}`,
      { details: { userId } }
    );
  }

  // Soft policy: prefer DA_DUYET; still allow create so Admin can drive rare cases —
  // hard gate remains on executeAction entryCondition when submitting/approving.
  if (user.status !== 'DA_DUYET') {
    // eslint-disable-next-line no-console
    console.warn(
      `[SRPF] openMemberPromoteInstance: user.status is ${user.status} (expected DA_DUYET) userId=${userId}`
    );
  }

  const validCaseType =
    caseType === 'CLAN_SETUP' || caseType === 'MEMBER_JOIN' ? caseType : 'MEMBER_JOIN';

  const correlationId = crypto.randomUUID();
  const changedBy = isUuid(actorId) ? actorId : isUuid(userId) ? userId : null;

  const metadata = {
    process_type: PROCESS_TYPE,
    source: 'OP',
    source_register_case_id: sourceRegisterCaseId || null,
    source_register_correlation_id: sourceRegisterCorrelationId || null,
  };

  const created = await client.onboarding_cases.create({
    data: {
      correlation_id: correlationId,
      case_type: validCaseType,
      process_kind: 'MEMBER_PROMOTE', // PR-1: OP case
      status: 'DRAFT',
      user_id: userId,
      tenant_id: tenantId,
      primary_member_id: memberId,
      metadata,
      changed_by: changedBy,
    },
  });

  const instance = normalizeFromOnboardingCase(created);

  return {
    instance,
    created: true,
    correlationId: created.correlation_id,
    caseId: created.id,
  };
}

module.exports = {
  openMemberPromoteInstance,
  findOpenOpCase,
  PROCESS_TYPE,
  TERMINAL_STATUSES,
};