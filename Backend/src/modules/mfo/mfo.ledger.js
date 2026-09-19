/**
 * PATH       : src/modules/mfo/mfo.ledger.js
 * DATETIME   : 2026-09-18T14:10:00+07:00
 * VERSION    : 1.0.2-MFO-LEDGER
 * DESCRIPTION: BPL + silentEmit. attempt_no bằng SQL sống (BPL không có deleted_at).
 */

const { writeBpl } = require('../../services/bpl.service');
const {
  silentEmit,
} = require('../notifications/services/silentNotificationEmit.service');

function branchNeo(ticket) {
  const p = (ticket && ticket.payload) || {};
  return (
    p.granted_branch_id ||
    p.proposed_branch_id ||
    p.origin_member_id ||
    ticket.target_id
  );
}

function actorContext(user, ticket, corr) {
  return {
    actor_id: user && (user.id || user.userId),
    actor_type: 'USER',
    tenant_id: (ticket && ticket.tenant_id) || (user && user.tenant_id),
    correlation_id:
      corr ||
      (ticket && ticket.correlation_id) ||
      (user && user.correlationId),
  };
}

async function nextAttempt(tx, correlationId) {
  if (!correlationId) return 1;
  const rows = await tx.$queryRaw`
    SELECT attempt_no
    FROM business_process_logs
    WHERE correlation_id = ${String(correlationId)}
    ORDER BY attempt_no DESC
    LIMIT 1`;
  const n = rows && rows[0] && rows[0].attempt_no;
  return (n ? Number(n) : 0) + 1;
}

async function mfoWriteBpl(tx, { processType, user, ticket, payload, action }) {
  const branch_id = branchNeo(ticket);
  if (!branch_id) return null;
  const corr = ticket && ticket.correlation_id;
  const attemptNo = await nextAttempt(tx, corr);
  return writeBpl({
    tx,
    processType,
    action: action || processType,
    attemptNo,
    actorContext: actorContext(user, ticket),
    context: {
      target_id: ticket.id,
      target_name: 'mfo:' + ((ticket.payload && ticket.payload.note) || ''),
    },
    payload: {
      ticket_id: ticket.id,
      origin_member_id:
        (ticket.payload && ticket.payload.origin_member_id) ||
        ticket.target_id,
      branch_id,
      branch_name: (ticket.payload && ticket.payload.note) || null,
      ...payload,
    },
  });
}

function mfoSilentEmit(eventName, ticket, extra) {
  extra = extra || {};
  const branch_id = branchNeo(ticket);
  if (!branch_id) return Promise.resolve(null);
  const userId =
    extra.userId || extra.user_id || (ticket && ticket.requester_user_id);
  return silentEmit(
    eventName,
    {
      tenant_id: ticket.tenant_id,
      userId,
      user_id: userId,
      branch_id,
      branch_name: (ticket.payload && ticket.payload.note) || null,
      ticket_id: ticket.id,
      origin_member_id:
        (ticket.payload && ticket.payload.origin_member_id) ||
        ticket.target_id,
      executeImmediately: false,
      ...extra,
      userId,
    },
    { source: 'mfo' }
  );
}

module.exports = { mfoWriteBpl, mfoSilentEmit, branchNeo };
