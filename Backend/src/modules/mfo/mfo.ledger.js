/**
 * PATH       : src/modules/mfo/mfo.ledger.js
 * DATETIME   : 2026-10-05T10:10:00+07:00
 * VERSION    : 1.4.0-LAT3-PROCESS-TYPE
 * DESCRIPTION: BPL dùng processType được truyền. Không ép MFO_PLAN_SUBMIT.
 */

const crypto = require('crypto');
const { basePrisma } = require('../../lib/prisma.js');
const { writeBpl } = require('../../services/bpl.service.js');

function actorIdOf(user) {
  return user && (user.id || user.userId);
}

function tenantIdOf(user) {
  return user && (user.tenant_id || user.tenantId || null);
}

function resolveBranchNeo({ targetMemberId, resolvedRootId, ticketId }) {
  if (targetMemberId) return String(targetMemberId);
  if (resolvedRootId) return String(resolvedRootId);
  if (ticketId) return String(ticketId);
  return 'GLOBAL';
}

async function mfoWriteBpl(txClient, { processType, user, ticket, payload }) {
  if (!txClient) {
    throw new Error('[MFO_BPL_ERROR] mfoWriteBpl bắt buộc phải nhận tx client từ withTransaction.');
  }

  const actor = actorIdOf(user) || (ticket && ticket.requester_user_id);
  const tenantId = tenantIdOf(user) || (ticket && ticket.tenant_id) || null;

  const targetMemberId =
    (payload && payload.target_member_id) || (ticket && ticket.target_id) || null;
  const originMemberId =
    (payload && payload.origin_member_id) || targetMemberId || null;
  const resolvedRootId = (payload && payload.resolved_root_id) || null;
  const ticketId = (ticket && ticket.id) || (payload && payload.ticket_id) || null;

  const branchNeo = resolveBranchNeo({ targetMemberId, resolvedRootId, ticketId });

  const correlationId =
    (ticket && ticket.correlation_id) ||
    (payload && payload.correlation_id) ||
    crypto.randomUUID();

  // DÙNG basePrisma ĐỂ ĐỌC BPL (TRÁNH BỊ INJECT DELETED_AT BỞI PRISMA EXTENSION)
  const lastLog = await basePrisma.business_process_logs.findFirst({
    where: { correlation_id: String(correlationId) },
    orderBy: { attempt_no: 'desc' },
    select: { attempt_no: true },
  });
  const nextAttemptNo = lastLog ? lastLog.attempt_no + 1 : 1;

  const actionName = (payload && payload.action) || processType || 'MFO_PLAN_SUBMIT';

  // SỬ DỤNG DỊCH VỤ writeBpl CHUẨN DÙNG CHUNG
  return writeBpl({
    processType: processType || 'MFO_PLAN_SUBMIT',
    actorContext: {
      actor_id: actor,
      actor_type: 'USER',
      tenant_id: tenantId,
      correlation_id: correlationId,
    },
    action: actionName,
    processStatus: 'SUCCESS',
    attemptNo: nextAttemptNo,
    context: {
      target_id: targetMemberId,
      target_name: branchNeo,
      action_detail: actionName,
    },
    payload: {
      ...(payload || {}),
      ticket_id: ticketId,
      origin_member_id: originMemberId,
      target_member_id: targetMemberId,
      branch_neo: branchNeo,
      from_status: (payload && payload.from_status) || null,
      to_status: (payload && payload.to_status) || (ticket ? ticket.status : 'DRAFT'),
      requester_user_id: actor,
      ticket_status: ticket ? ticket.status : 'DRAFT',
      saved_at: new Date().toISOString(),
    },
    tx: txClient,
  });
}

async function mfoSilentEmit(eventType, { ticket, user, tenantId }) {
  if (!ticket || ticket.status === 'DRAFT') {
    return null;
  }

  const actor = actorIdOf(user);
  const effectiveTenantId = tenantId || tenantIdOf(user) || ticket.tenant_id;

  try {
    const eventPayload = {
      event_type: eventType,
      tenant_id: effectiveTenantId,
      ticket_id: ticket.id,
      target_member_id: ticket.target_id,
      requester_user_id: actor || ticket.requester_user_id,
      status: ticket.status,
      timestamp: new Date().toISOString(),
    };

    console.log(`[MFO_SILENT_EMIT] Event: ${eventType} fired for Ticket: ${ticket.id}`);
    return eventPayload;
  } catch (error) {
    console.error(`[MFO_SILENT_EMIT_ERROR] Failed to emit event ${eventType}:`, error);
  }
}

module.exports = {
  mfoWriteBpl,
  mfoSilentEmit,
  resolveBranchNeo,
};