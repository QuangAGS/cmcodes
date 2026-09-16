/**
 * PATH       : src/modules/mfo/mfo.service.js
 * DATETIME   : 2026-09-16T15:10:00+07:00
 * VERSION    : 1.0.0-MFO-L1
 * DESCRIPTION: Tạo / đọc ticket PLAN 5L. Không phê PLAN (lát 2).
 *              Không đụng submit/approve/reject chi.
 */

const crypto = require('crypto');
const { prisma } = require('../../lib/prisma.js');
const { normalizePlanBody, fail } = require('./mfo.payload.js');

const OPEN = ['DRAFT', 'PENDING', 'UNDER_REVIEW', 'NEEDS_REVISION'];

function actorIdOf(user) {
  return user && (user.id || user.userId);
}
function tenantIdOf(user) {
  return user && (user.tenant_id || user.tenantId || null);
}
function memberIdOf(user) {
  return user && (user.member_id || user.memberId || null);
}
function isClanOrSys(user) {
  const r = (user && user.role) || '';
  return r === 'CLAN_ADMIN' || r === 'SYSTEM_ADMIN';
}

const mfoService = {
  createPlan: async ({ user, body, correlationId }) => {
    const actor = actorIdOf(user);
    if (!actor) fail('Thiếu người thực hiện.', 401, 'UNAUTHENTICATED');
    const tenantId = tenantIdOf(user);
    if (!tenantId) fail('Thiếu tenant.', 400, 'TENANT_REQUIRED');

    const founderMemberId = memberIdOf(user);
    if (!founderMemberId && !isClanOrSys(user)) {
      fail(
        'Founder phải là MWL (users.member_id). ADMIN IT được kê hộ.',
        422,
        'MFO_FOUNDER_NOT_MWL'
      );
    }

    const payload = normalizePlanBody(body);
    const corr = correlationId || crypto.randomUUID();

    const origin = await prisma.members.findUnique({
      where: { id: payload.origin_member_id },
    });
    if (!origin || origin.deleted_at) {
      fail('Không tìm thấy Origin trên sổ.', 404, 'MFO_ORIGIN_NOT_FOUND');
    }
    if (String(origin.tenant_id) !== String(tenantId)) {
      fail('Origin không thuộc dòng họ này.', 403, 'TENANT_MISMATCH');
    }

    const open = await prisma.proposals.findFirst({
      where: {
        tenant_id: tenantId,
        ticket_type: 'BRANCH_REVIEW',
        requester_user_id: actor,
        target_table: 'members',
        target_id: payload.origin_member_id,
        deleted_at: null,
        status: { in: OPEN },
      },
      select: { id: true, status: true },
    });
    if (open) {
      fail(
        'Còn lô chưa nghiệm thu với Origin này. Xong hoặc rút rồi hãy trình lô mới.',
        409,
        'MFO_LOT_OPEN',
        { ticket_id: open.id, ticket_status: open.status }
      );
    }

    payload.founder_user_id = actor;
    payload.founder_member_id = founderMemberId || null;

    const ticket = await prisma.proposals.create({
      data: {
        tenant_id: tenantId,
        ticket_type: 'BRANCH_REVIEW',
        status: 'PENDING',
        requester_user_id: actor,
        target_table: 'members',
        target_id: payload.origin_member_id,
        payload,
        payload_schema_version: 2,
        correlation_id: corr,
        changed_by: actor,
      },
    });

    return { ticket, payload };
  },

  getPlan: async ({ user, ticketId }) => {
    const tenantId = tenantIdOf(user);
    const row = await prisma.proposals.findUnique({
      where: { id: ticketId },
    });
    if (!row || row.deleted_at) fail('Không tìm thấy lô.', 404, 'MFO_LOT_NOT_FOUND');
    if (tenantId && String(row.tenant_id) !== String(tenantId)) {
      fail('Lô không thuộc dòng họ này.', 403, 'TENANT_MISMATCH');
    }
    const kind = row.payload && row.payload.kind;
    if (row.ticket_type !== 'BRANCH_REVIEW' || (kind && kind !== 'PLAN' && kind !== 'RESULT')) {
      fail('Ticket này không phải lô MFO.', 409, 'MFO_NOT_LOT');
    }
    return row;
  },
};

module.exports = mfoService;
