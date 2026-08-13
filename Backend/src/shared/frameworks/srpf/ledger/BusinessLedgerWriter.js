/**
 * PATH       : backend/src/shared/frameworks/srpf/ledger/BusinessLedgerWriter.js
 * DATETIME   : 2026-08-13T11:15:00+07:00
 * VERSION    : 0.4.2-phase3.2
 * DESCRIPTION: Writes Business Process Log (BPL) AND audit_logs for SRPF actions.
 *
 * Reuses:
 * - services/bpl.service.js → writeBpl
 * - prisma.audit.create (createAuditLog) when tenant_id is present
 *
 * audit_logs.action MUST be audit_logs_action enum: THEM_MOI | CAP_NHAT | XOA
 *
 * IMPORTANT (v0.4.2):
 * - changed_by references users.id (FK). Never pass synthetic ids like "test-submit-once".
 * - A failed audit query INSIDE prisma.$transaction aborts the whole TX on Postgres
 *   even if the error is caught — so invalid FK must be avoided, not merely caught.
 *
 * SAVE_DRAFT / null correlationId → no-op.
 */

'use strict';

const { writeBpl } = require('../../../../services/bpl.service.js');
const { prisma } = require('../../../../lib/prisma.js');
const { SRPF_ACTIONS } = require('../constants/actions');

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Fallback map SRPF action → existing business_process_type enum.
 */
const DEFAULT_ACTION_TO_BPL_TYPE = Object.freeze({
  [SRPF_ACTIONS.SUBMIT]: 'ONBOARDING_SUBMIT',
  [SRPF_ACTIONS.START_REVIEW]: 'ONBOARDING_REVIEW_START',
  [SRPF_ACTIONS.RETURN_FOR_REVISION]: 'ONBOARDING_REVISION_REQUEST',
  [SRPF_ACTIONS.APPROVE]: 'ONBOARDING_APPROVE',
  [SRPF_ACTIONS.REJECT]: 'ONBOARDING_REJECT',
  [SRPF_ACTIONS.CANCEL]: 'ONBOARDING_CANCEL',
  [SRPF_ACTIONS.WITHDRAW]: 'ONBOARDING_CANCEL',
  [SRPF_ACTIONS.SAVE_DRAFT]: 'ONBOARDING_PROFILE_SAVE',
  [SRPF_ACTIONS.CREATE]: 'ONBOARDING_CASE_CREATE',
  [SRPF_ACTIONS.START]: 'ONBOARDING_CASE_CREATE',
});

/**
 * Map SRPF action → audit_logs_action enum (THEM_MOI | CAP_NHAT | XOA).
 */
function toAuditAction(srpfAction) {
  switch (srpfAction) {
    case SRPF_ACTIONS.CREATE:
    case SRPF_ACTIONS.START:
      return 'THEM_MOI';
    default:
      return 'CAP_NHAT';
  }
}

/**
 * Only real user UUIDs may be written to audit.changed_by (FK → users.id).
 * @param {string|null|undefined} actorId
 * @returns {string|null}
 */
function safeChangedBy(actorId) {
  if (!actorId || typeof actorId !== 'string') return null;
  if (!UUID_RE.test(actorId)) return null;
  return actorId;
}

/**
 * @param {string} processType
 * @param {string} action
 * @returns {string}
 */
function resolveBplProcessType(processType, action) {
  if (
    processType &&
    typeof processType === 'string' &&
    !processType.startsWith('MEMBER_PROMOTE') &&
    processType !== 'MEMBER_PROMOTE'
  ) {
    return processType;
  }
  return DEFAULT_ACTION_TO_BPL_TYPE[action] || 'ONBOARDING_SUBMIT';
}

/**
 * Write BPL + audit_logs for a completed action (same transaction).
 */
async function write({
  tx,
  correlationId,
  processType,
  action,
  actorContext = {},
  instance,
  metadata = {},
}) {
  if (!correlationId) {
    return { bpl: null, audit: null };
  }

  const client = tx || prisma;
  const bplProcessType = resolveBplProcessType(processType, action);

  const rawActorId = actorContext.actor_id || actorContext.user_id || null;
  const changedBy = safeChangedBy(rawActorId);

  const actorForBpl = {
    ...actorContext,
    correlation_id: correlationId,
    actor_id: rawActorId || 'system',
    actor_type: actorContext.actor_type || 'USER',
    tenant_id: actorContext.tenant_id || instance?.tenant_id || null,
  };

  const bpl = await writeBpl({
    processType: bplProcessType,
    actorContext: actorForBpl,
    action: action,
    processStatus: 'SUCCESS',
    attemptNo: 1,
    extraMetadata: {
      srpf_process_type: processType,
      srpf_action: action,
      instance_id: instance?.id || null,
      from_state: metadata.from || null,
      to_state: metadata.to || null,
      storage: instance?._storage || 'onboarding_cases',
      ...(metadata.payload && typeof metadata.payload === 'object'
        ? { payload_keys: Object.keys(metadata.payload) }
        : {}),
    },
    tx: client,
  });

  let audit = null;
  const tenantId = actorForBpl.tenant_id || instance?.tenant_id || null;

  if (tenantId && instance?.id) {
    try {
      audit = await prisma.audit.create(client, {
        tableName: 'onboarding_cases',
        recordId: instance.id,
        action: toAuditAction(action),
        tenantId: tenantId,
        changedBy: changedBy,
        correlationId: correlationId,
        oldData: metadata.from ? { status: metadata.from } : null,
        newData: {
          status: metadata.to || instance.currentState || instance.status,
        },
        changeReason: `SRPF ${processType || 'PROCESS'}:${action}`,
      });
    } catch (err) {
      if (process.env.SRPF_STRICT_AUDIT === '1') {
        throw err;
      }
      console.warn('[SRPF] audit_logs skipped/failed:', err.message);
    }
  }

  return { bpl, audit };
}

module.exports = {
  write,
  resolveBplProcessType,
  toAuditAction,
  safeChangedBy,
  DEFAULT_ACTION_TO_BPL_TYPE,
};
