/**
 * PATH       : src/modules/mfo/mfo.service.js
 * DATETIME   : 2026-09-17T09:35:00+07:00
 * VERSION    : 1.2.2-MFO-L4.2
 * DESCRIPTION: PLAN + phê PLAN + mảnh cây Origin.
 *              L4.2: partner = đồng cha/mẹ với người nội; CON_DAU ≠ vợ bố.
 *              Không RESULT. Không đụng máy Chi.
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

async function resolveFounderMemberId(user) {
  const fromJwt = memberIdOf(user);
  if (fromJwt) return fromJwt;
  const uid = actorIdOf(user);
  if (!uid) return null;
  const row = await prisma.users.findUnique({
    where: { id: uid },
    select: { member_id: true },
  });
  return (row && row.member_id) || null;
}

const mfoService = {
  createPlan: async ({ user, body, correlationId }) => {
    const actor = actorIdOf(user);
    if (!actor) fail('Thiếu người thực hiện.', 401, 'UNAUTHENTICATED');
    const tenantId = tenantIdOf(user);
    if (!tenantId) fail('Thiếu tenant.', 400, 'TENANT_REQUIRED');

    const founderMemberId = await resolveFounderMemberId(user);
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

  assertLot: async ({ user, ticketId, expectKind }) => {
    const row = await mfoService.getPlan({ user, ticketId });
    const kind = row.payload && row.payload.kind;
    if (expectKind && kind !== expectKind) {
      fail('Ticket không phải ' + expectKind + '.', 409, 'MFO_WRONG_KIND');
    }
    return row;
  },

  approvePlan: async ({ user, ticketId, body }) => {
    if (!isClanOrSys(user)) {
      fail('Chỉ CLAN_ADMIN / SYSTEM_ADMIN phê PLAN.', 403, 'FORBIDDEN');
    }
    const actor = actorIdOf(user);
    const row = await mfoService.assertLot({
      user,
      ticketId,
      expectKind: 'PLAN',
    });
    if (row.status !== 'PENDING' && row.status !== 'NEEDS_REVISION') {
      fail(
        'Chỉ phê lô PENDING / NEEDS_REVISION.',
        409,
        'MFO_PLAN_STATE',
        { ticket_status: row.status }
      );
    }

    const b = body || {};
    const genRaw =
      b.granted_generation != null ? b.granted_generation : b.generation;
    const grantedGeneration = Number(genRaw);
    if (!Number.isFinite(grantedGeneration)) {
      fail(
        'Phê PLAN bắt buộc granted_generation (đời tuyệt đối Origin).',
        422,
        'MFO_GENERATION_REQUIRED'
      );
    }

    const grantedBranchId =
      b.granted_branch_id === undefined
        ? row.payload.proposed_branch_id || null
        : b.granted_branch_id || null;

    const nextPayload = {
      ...row.payload,
      kind: 'PLAN',
      plan_ok: true,
      granted_generation: grantedGeneration,
      granted_branch_id: grantedBranchId,
      granted_at: new Date().toISOString(),
      granted_by: actor,
      approver_note: b.note || b.admin_note || null,
    };

    const ticket = await prisma.proposals.update({
      where: { id: row.id },
      data: {
        status: 'UNDER_REVIEW',
        payload: nextPayload,
        admin_note: b.note || b.admin_note || row.admin_note,
        reviewed_by: actor,
        reviewed_at: new Date(),
        changed_by: actor,
      },
    });

    return { ticket, plan_ok: true };
  },

  rejectPlan: async ({ user, ticketId, body }) => {
    if (!isClanOrSys(user)) {
      fail('Chỉ CLAN_ADMIN / SYSTEM_ADMIN từ chối PLAN.', 403, 'FORBIDDEN');
    }
    const actor = actorIdOf(user);
    const row = await mfoService.assertLot({
      user,
      ticketId,
      expectKind: 'PLAN',
    });
    if (row.status !== 'PENDING' && row.status !== 'NEEDS_REVISION' && row.status !== 'UNDER_REVIEW') {
      fail('Không từ chối được trạng thái này.', 409, 'MFO_PLAN_STATE', {
        ticket_status: row.status,
      });
    }
    const reason = (body && (body.reason || body.note || body.admin_note)) || '';
    if (!String(reason).trim()) {
      fail('Từ chối PLAN bắt buộc reason.', 400, 'MFO_REASON_REQUIRED');
    }

    const nextPayload = {
      ...row.payload,
      plan_ok: false,
      reject_reason: String(reason).trim(),
    };

    const ticket = await prisma.proposals.update({
      where: { id: row.id },
      data: {
        status: 'REJECTED',
        payload: nextPayload,
        admin_note: String(reason).trim(),
        reviewed_by: actor,
        reviewed_at: new Date(),
        changed_by: actor,
      },
    });

    return { ticket, plan_ok: false };
  },

  getOriginTree: async ({ user, originId }) => {
    const tenantId = tenantIdOf(user);
    if (!originId) fail('Thiếu origin id.', 400, 'MFO_ORIGIN_REQUIRED');

    const origin = await prisma.members.findUnique({
      where: { id: originId },
      select: {
        id: true,
        full_name: true,
        generation: true,
        gender: true,
        father_id: true,
        mother_id: true,
        tenant_id: true,
        deleted_at: true,
        branch_id: true,
        is_clan: true,
        child_type: true,
      },
    });
    if (!origin || origin.deleted_at) {
      fail('Không tìm thấy Origin trên sổ.', 404, 'MFO_ORIGIN_NOT_FOUND');
    }
    if (tenantId && String(origin.tenant_id) !== String(tenantId)) {
      fail('Origin không thuộc dòng họ này.', 403, 'TENANT_MISMATCH');
    }

    const all = await prisma.members.findMany({
      where: { tenant_id: origin.tenant_id, deleted_at: null },
      select: {
        id: true,
        full_name: true,
        generation: true,
        gender: true,
        father_id: true,
        mother_id: true,
        branch_id: true,
        is_clan: true,
        child_type: true,
      },
    });

    const isNoi = (m) => !m || m.is_clan !== false;

    const byId = new Map(all.map((m) => [m.id, m]));
    const noiOf = new Map();
    for (const m of all) {
      if (!isNoi(m)) continue;
      for (const pid of [m.father_id, m.mother_id]) {
        if (!pid) continue;
        if (!noiOf.has(pid)) noiOf.set(pid, []);
        if (!noiOf.get(pid).includes(m.id)) noiOf.get(pid).push(m.id);
      }
    }

    const partnersOf = new Map();
    const addPartner = (noiId, ngoai) => {
      if (!noiId || !ngoai || noiId === ngoai.id) return;
      if (isNoi(ngoai)) return;
      if (!partnersOf.has(noiId)) partnersOf.set(noiId, []);
      const bag = partnersOf.get(noiId);
      if (!bag.some((p) => p.id === ngoai.id)) bag.push(ngoai);
    };
    for (const child of all) {
      const f = child.father_id && byId.get(child.father_id);
      const mo = child.mother_id && byId.get(child.mother_id);
      if (f && mo) {
        if (isNoi(f) && !isNoi(mo)) addPartner(f.id, mo);
        if (isNoi(mo) && !isNoi(f)) addPartner(mo.id, f);
      }
    }

    const pack = (m, extra) => ({
      id: m.id,
      full_name: m.full_name,
      generation: m.generation,
      gender: m.gender,
      father_id: m.father_id,
      mother_id: m.mother_id,
      branch_id: m.branch_id,
      is_clan: m.is_clan !== false,
      child_type: m.child_type || null,
      ...extra,
    });

    const MAX_DEPTH = 4;
    const nodes = [];
    const seen = new Set();
    const queue = [{ id: origin.id, depth: 0 }];
    seen.add(origin.id);
    while (queue.length) {
      const cur = queue.shift();
      const m = byId.get(cur.id);
      if (!m) continue;
      const partners = (partnersOf.get(cur.id) || []).map((p) =>
        pack(p, { depth: cur.depth, role: 'partner' })
      );
      nodes.push(
        pack(m, {
          depth: cur.depth,
          is_origin: cur.depth === 0,
          partners,
        })
      );
      if (cur.depth >= MAX_DEPTH) continue;
      for (const kid of noiOf.get(cur.id) || []) {
        if (seen.has(kid)) continue;
        seen.add(kid);
        queue.push({ id: kid, depth: cur.depth + 1 });
      }
    }

    const mwlId = await resolveFounderMemberId(user);
    let k = null;
    let k_reason = 'no_mwl';
    const path = [];
    if (mwlId) {
      const mwl = byId.get(mwlId);
      if (mwl && mwl.is_clan === false) {
        k_reason = 'ngoai_toc';
      } else if (mwlId === origin.id) {
        k = 0;
        k_reason = 'self';
        path.push(origin.id);
      } else {
        const vis = new Set();
        const q = [{ id: mwlId, steps: 0, trail: [mwlId] }];
        vis.add(mwlId);
        let hit = null;
        while (q.length && !hit) {
          const cur = q.shift();
          if (cur.steps > 32) continue;
          if (cur.id === origin.id) {
            hit = cur;
            break;
          }
          const row = byId.get(cur.id);
          if (!row) continue;
          for (const pid of [row.father_id, row.mother_id]) {
            if (!pid || vis.has(pid)) continue;
            const parent = byId.get(pid);
            if (parent && parent.is_clan === false) continue;
            vis.add(pid);
            q.push({
              id: pid,
              steps: cur.steps + 1,
              trail: [pid, ...cur.trail],
            });
          }
        }
        if (hit) {
          k = hit.steps;
          k_reason = k > 4 ? 'too_far' : 'on_tree';
          path.push(...hit.trail);
        } else {
          k = null;
          k_reason = 'not_on_tree';
        }
      }
    }

    return {
      origin: {
        id: origin.id,
        full_name: origin.full_name,
        generation: origin.generation,
        branch_id: origin.branch_id,
        is_clan: origin.is_clan !== false,
      },
      window_depth: MAX_DEPTH,
      rule: 'is_clan',
      nodes,
      mwl: {
        member_id: mwlId,
        k,
        k_reason,
        in_window: k !== null && k <= 4,
        path_to_origin: path,
      },
    };
  },
};

module.exports = mfoService;
