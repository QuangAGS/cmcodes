/**
 * PATH       : src/modules/mfo/mfo.service.js
 * DATETIME   : 2026-09-17T09:35:00+07:00
 * VERSION    : 1.5.0-MFO-L7
 * DESCRIPTION: PLAN + CREATE + RESULT + spouse/marriages trong lô.
 *              Không đụng máy Chi.
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

  listPlans: async ({ user, query }) => {
    const tenantId = tenantIdOf(user);
    if (!tenantId) fail('Thiếu tenant.', 400, 'TENANT_REQUIRED');
    const q = query || {};
    const where = {
      tenant_id: tenantId,
      ticket_type: 'BRANCH_REVIEW',
      target_table: 'members',
      deleted_at: null,
    };
    if (!isClanOrSys(user)) {
      where.requester_user_id = actorIdOf(user);
    } else if (q.mine === '1' || q.mine === 'true') {
      where.requester_user_id = actorIdOf(user);
    }
    if (q.origin_id) where.target_id = q.origin_id;
    if (q.status) where.status = q.status;

    const rows = await prisma.proposals.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: Math.min(Number(q.limit) || 50, 100),
      select: {
        id: true,
        status: true,
        requester_user_id: true,
        target_id: true,
        payload: true,
        payload_schema_version: true,
        correlation_id: true,
        created_at: true,
        updated_at: true,
        reviewed_at: true,
        admin_note: true,
      },
    });

    return rows.map((r) => {
      const p = r.payload || {};
      return {
        id: r.id,
        status: r.status,
        plan_ok: !!p.plan_ok,
        kind: p.kind || 'PLAN',
        origin_member_id: p.origin_member_id || r.target_id,
        k: p.k,
        granted_generation: p.granted_generation,
        requester_user_id: r.requester_user_id,
        correlation_id: r.correlation_id,
        created_at: r.created_at,
        reviewed_at: r.reviewed_at,
        note: p.note || r.admin_note || null,
      };
    });
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
    const originId =
      (row.payload && row.payload.origin_member_id) || row.target_id;
    let tree = null;
    if (originId) {
      tree = await mfoService.getOriginTree({ user, originId });
    }
    return { ticket: row, tree };
  },

  assertLot: async ({ user, ticketId, expectKind }) => {
    const got = await mfoService.getPlan({ user, ticketId });
    const row = got.ticket || got;
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
        sibling_seq: true,
        birth_year: true,
      },
    });

    const unions = await prisma.marriages.findMany({
      where: {
        tenant_id: origin.tenant_id,
        deleted_at: null,
        status: { in: ['DANG_KET_HON', 'GOA'] },
      },
      select: {
        id: true,
        husband_id: true,
        wife_id: true,
        husband_marriage_order: true,
        wife_marriage_order: true,
        status: true,
        spouse_name_literal: true,
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
    const pushPartner = (ownerId, partner, meta) => {
      if (!ownerId || !partner) return;
      if (partner.id && partner.id === ownerId) return;
      if (!partnersOf.has(ownerId)) partnersOf.set(ownerId, []);
      const bag = partnersOf.get(ownerId);
      const key = partner.id || 'lit:' + (partner.full_name || '');
      if (bag.some((p) => p._key === key)) return;
      bag.push({ ...partner, _key: key, _ord: meta.ord || 99, _status: meta.status });
    };
    for (const u of unions) {
      const hus = u.husband_id && byId.get(u.husband_id);
      const wif = u.wife_id && byId.get(u.wife_id);
      if (u.husband_id && wif) {
        pushPartner(u.husband_id, wif, {
          ord: u.husband_marriage_order,
          status: u.status,
        });
      } else if (u.husband_id && u.spouse_name_literal) {
        pushPartner(u.husband_id, { id: null, full_name: u.spouse_name_literal }, {
          ord: u.husband_marriage_order,
          status: u.status,
        });
      }
      if (u.wife_id && hus) {
        pushPartner(u.wife_id, hus, {
          ord: u.wife_marriage_order,
          status: u.status,
        });
      } else if (u.wife_id && !hus && u.spouse_name_literal) {
        pushPartner(u.wife_id, { id: null, full_name: u.spouse_name_literal }, {
          ord: u.wife_marriage_order,
          status: u.status,
        });
      }
    }

    const pack = (m, extra) => ({
      id: m.id || null,
      full_name: m.full_name,
      generation: m.generation != null ? m.generation : null,
      gender: m.gender || null,
      father_id: m.father_id || null,
      mother_id: m.mother_id || null,
      branch_id: m.branch_id || null,
      is_clan: m.is_clan !== false,
      child_type: m.child_type || null,
      sibling_seq: m.sibling_seq != null ? m.sibling_seq : null,
      ...extra,
    });

    const sibSort = (ids) =>
      ids
        .map((id) => byId.get(id))
        .filter(Boolean)
        .sort((a, b) => {
          const sa = a.sibling_seq == null ? 9999 : a.sibling_seq;
          const sb = b.sibling_seq == null ? 9999 : b.sibling_seq;
          if (sa !== sb) return sa - sb;
          const ya = a.birth_year == null ? 9999 : a.birth_year;
          const yb = b.birth_year == null ? 9999 : b.birth_year;
          if (ya !== yb) return ya - yb;
          return String(a.full_name || '').localeCompare(String(b.full_name || ''), 'vi');
        })
        .map((m) => m.id);

    const MAX_DEPTH = 4;
    const nodes = [];
    const seen = new Set();
    const queue = [{ id: origin.id, depth: 0 }];
    seen.add(origin.id);
    while (queue.length) {
      const cur = queue.shift();
      const m = byId.get(cur.id);
      if (!m) continue;
      const partners = (partnersOf.get(cur.id) || [])
        .sort((a, b) => (a._ord || 99) - (b._ord || 99))
        .map((p) =>
          pack(p, {
            depth: cur.depth,
            role: 'partner',
            source: p.id ? 'marriage' : 'literal',
            union_status: p._status || null,
          })
        );
      nodes.push(
        pack(m, {
          depth: cur.depth,
          is_origin: cur.depth === 0,
          partners,
        })
      );
      if (cur.depth >= MAX_DEPTH) continue;
      for (const kid of sibSort(noiOf.get(cur.id) || [])) {
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
      rule: 'is_clan+marriages',
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

  createInPlan: async ({ user, ticketId, body }) => {
    const actor = actorIdOf(user);
    if (!actor) fail('Thiếu người thực hiện.', 401, 'UNAUTHENTICATED');
    const row = await mfoService.assertLot({
      user,
      ticketId,
      expectKind: 'PLAN',
    });
    if (!isClanOrSys(user) && String(row.requester_user_id) !== String(actor)) {
      fail('Chỉ người trình hoặc ADMIN tạo trong lô này.', 403, 'FORBIDDEN');
    }
    if (
      (row.status !== 'UNDER_REVIEW' && row.status !== 'NEEDS_REVISION') ||
      !(row.payload && row.payload.plan_ok)
    ) {
      fail(
        'Chỉ CREATE khi PLAN đã tem (UNDER_REVIEW / NEEDS_REVISION + plan_ok).',
        409,
        'MFO_PLAN_STATE',
        { ticket_status: row.status }
      );
    }
    if (row.payload && row.payload.result_submitted) {
      fail(
        'Đã trình RESULT. Rút nghiệm thu rồi mới tạo thêm.',
        409,
        'MFO_RESULT_LOCKED'
      );
    }

    const b = body || {};
    const lineNo = Number(b.line);
    if (!Number.isInteger(lineNo) || lineNo < 1 || lineNo > 4) {
      fail('line phải là 1…4 (không tạo Origin).', 400, 'MFO_LINE_RANGE');
    }
    const lines = (row.payload && row.payload.lines) || [];
    const slot = lines.find((l) => Number(l.line) === lineNo);
    if (!slot) fail('Không có ô dòng ' + lineNo + '.', 422, 'MFO_LINE_MISSING');
    if (slot.op !== 'CREATE') {
      fail(
        'Ô Dòng ' + lineNo + ' trên PLAN không phải CREATE.',
        422,
        'MFO_LINE_NOT_CREATE',
        { op: slot.op }
      );
    }

    const fullName = String(b.full_name || '').trim();
    if (!fullName) fail('Thiếu full_name.', 400, 'MFO_NAME_REQUIRED');
    const gender = String(b.gender || '').toUpperCase();
    if (!['NAM', 'NU', 'KHAC'].includes(gender)) {
      fail('gender phải NAM | NU | KHAC.', 400, 'MFO_GENDER_REQUIRED');
    }

    const childType = String(b.child_type || 'CON_DE').toUpperCase();
    let isClan = b.is_clan;
    if (isClan === undefined || isClan === null) {
      isClan = childType === 'CON_DAU' || childType === 'CON_RE' ? false : true;
    }

    const originId = row.payload.origin_member_id;
    const fatherId = b.father_id || null;
    const motherId = b.mother_id || null;
    if (isClan && !fatherId && !motherId) {
      fail(
        'Con nội phải có father_id hoặc mother_id (nối lên dòng trên).',
        422,
        'MFO_PARENT_REQUIRED'
      );
    }

    const tenantId = row.tenant_id;
    const checkParent = async (id, label) => {
      if (!id) return;
      const p = await prisma.members.findUnique({ where: { id } });
      if (!p || p.deleted_at) fail('Không thấy ' + label + '.', 404, 'MFO_PARENT_NOT_FOUND');
      if (String(p.tenant_id) !== String(tenantId)) {
        fail(label + ' khác tenant.', 403, 'TENANT_MISMATCH');
      }
    };
    await checkParent(fatherId, 'father_id');
    await checkParent(motherId, 'mother_id');

    const grantedGen = row.payload.granted_generation;
    let generation = null;
    if (Number.isFinite(Number(grantedGen))) {
      generation = Number(grantedGen) + lineNo;
    }
    const branchId = row.payload.granted_branch_id || null;
    const founderMemberId = await resolveFounderMemberId(user);

    const member = await prisma.members.create({
      data: {
        tenant_id: tenantId,
        full_name: fullName,
        gender,
        child_type: childType,
        is_clan: !!isClan,
        father_id: fatherId,
        mother_id: motherId,
        generation,
        branch_id: branchId,
        sibling_seq:
          b.sibling_seq == null || b.sibling_seq === ''
            ? null
            : Number(b.sibling_seq),
        note: b.note || null,
        changed_by: actor,
        created_by: actor,
        created_by_member_id: founderMemberId || null,
      },
    });

    const created = Array.isArray(row.payload.created_member_ids)
      ? row.payload.created_member_ids.slice()
      : [];
    created.push(member.id);
    const nextLines = lines.map((l) => {
      if (Number(l.line) !== lineNo) return l;
      const ids = Array.isArray(l.created_ids) ? l.created_ids.slice() : [];
      ids.push(member.id);
      return { ...l, created_ids: ids };
    });
    const nextPayload = {
      ...row.payload,
      lines: nextLines,
      created_member_ids: created,
    };
    const ticket = await prisma.proposals.update({
      where: { id: row.id },
      data: { payload: nextPayload, changed_by: actor },
    });

    return { member, ticket };
  },

  submitResult: async ({ user, ticketId, body }) => {
    const actor = actorIdOf(user);
    const row = await mfoService.assertLot({
      user,
      ticketId,
      expectKind: 'PLAN',
    });
    if (!isClanOrSys(user) && String(row.requester_user_id) !== String(actor)) {
      fail('Chỉ người trình hoặc ADMIN nộp RESULT.', 403, 'FORBIDDEN');
    }
    if (
      (row.status !== 'UNDER_REVIEW' && row.status !== 'NEEDS_REVISION') ||
      !(row.payload && row.payload.plan_ok)
    ) {
      fail(
        'Chỉ nộp RESULT khi PLAN đã tem.',
        409,
        'MFO_PLAN_STATE',
        { ticket_status: row.status }
      );
    }
    if (row.payload.result_ok) {
      fail('RESULT đã nghiệm thu.', 409, 'MFO_RESULT_DONE');
    }

    const b = body || {};
    const ids = Array.isArray(b.created_member_ids)
      ? b.created_member_ids
      : row.payload.created_member_ids || [];

    const nextPayload = {
      ...row.payload,
      kind: 'PLAN',
      result_submitted: true,
      result_ok: false,
      result: {
        note: b.note || null,
        created_member_ids: ids,
        submitted_at: new Date().toISOString(),
        submitted_by: actor,
      },
    };

    const ticket = await prisma.proposals.update({
      where: { id: row.id },
      data: {
        status: 'UNDER_REVIEW',
        payload: nextPayload,
        changed_by: actor,
      },
    });
    return { ticket };
  },

  approveResult: async ({ user, ticketId, body }) => {
    if (!isClanOrSys(user)) {
      fail('Chỉ ADMIN nghiệm thu RESULT.', 403, 'FORBIDDEN');
    }
    const actor = actorIdOf(user);
    const row = await mfoService.assertLot({
      user,
      ticketId,
      expectKind: 'PLAN',
    });
    if (row.status !== 'UNDER_REVIEW' || !(row.payload && row.payload.plan_ok)) {
      fail('Lô chưa PLAN_OK.', 409, 'MFO_PLAN_STATE', {
        ticket_status: row.status,
      });
    }
    if (!row.payload.result_submitted) {
      fail('Chưa nộp RESULT.', 409, 'MFO_RESULT_NOT_SUBMITTED');
    }

    const b = body || {};
    const nextPayload = {
      ...row.payload,
      result_ok: true,
      result_submitted: true,
      result: {
        ...(row.payload.result || {}),
        approved_at: new Date().toISOString(),
        approved_by: actor,
        approver_note: b.note || b.admin_note || null,
      },
    };

    const ticket = await prisma.proposals.update({
      where: { id: row.id },
      data: {
        status: 'APPROVED',
        payload: nextPayload,
        admin_note: b.note || b.admin_note || row.admin_note,
        applied_at: new Date(),
        reviewed_by: actor,
        reviewed_at: new Date(),
        changed_by: actor,
      },
    });
    return { ticket, result_ok: true };
  },

  rejectResult: async ({ user, ticketId, body }) => {
    if (!isClanOrSys(user)) {
      fail('Chỉ ADMIN trả RESULT.', 403, 'FORBIDDEN');
    }
    const actor = actorIdOf(user);
    const row = await mfoService.assertLot({
      user,
      ticketId,
      expectKind: 'PLAN',
    });
    if (row.status === 'APPROVED' && row.payload && row.payload.result_ok) {
      fail('RESULT đã nghiệm thu, không trả lại.', 409, 'MFO_RESULT_DONE');
    }
    const reason = (body && (body.reason || body.note || body.admin_note)) || '';
    if (!String(reason).trim()) {
      fail('Trả RESULT bắt buộc reason.', 400, 'MFO_REASON_REQUIRED');
    }

    const nextPayload = {
      ...row.payload,
      plan_ok: true,
      result_submitted: false,
      result_ok: false,
      result: {
        ...(row.payload.result || {}),
        reject_reason: String(reason).trim(),
        rejected_at: new Date().toISOString(),
        rejected_by: actor,
      },
    };

    const ticket = await prisma.proposals.update({
      where: { id: row.id },
      data: {
        status: 'NEEDS_REVISION',
        payload: nextPayload,
        admin_note: String(reason).trim(),
        reviewed_by: actor,
        reviewed_at: new Date(),
        changed_by: actor,
      },
    });
    return { ticket, result_ok: false };
  },

  createSpouse: async ({ user, ticketId, body }) => {
    const actor = actorIdOf(user);
    const row = await mfoService.assertLot({
      user,
      ticketId,
      expectKind: 'PLAN',
    });
    if (!isClanOrSys(user) && String(row.requester_user_id) !== String(actor)) {
      fail('Chỉ người trình hoặc ADMIN tạo vợ/chồng trong lô.', 403, 'FORBIDDEN');
    }
    if (!(row.payload && row.payload.plan_ok)) {
      fail('Chỉ gắn đôi khi PLAN đã tem.', 409, 'MFO_PLAN_STATE', {
        ticket_status: row.status,
      });
    }
    if (row.status === 'REJECTED' || row.status === 'WITHDRAWN') {
      fail('Lô đã đóng.', 409, 'MFO_PLAN_STATE', {
        ticket_status: row.status,
      });
    }
    if (row.payload.result_submitted && !row.payload.result_ok) {
      fail(
        'Đang chờ nghiệm thu RESULT. Trả sửa rồi mới gắn đôi.',
        409,
        'MFO_RESULT_LOCKED'
      );
    }

    const b = body || {};
    const noiId = b.member_id || row.payload.founder_member_id;
    if (!noiId) fail('Thiếu member_id (người nội).', 400, 'MFO_MEMBER_REQUIRED');

    const tenantId = row.tenant_id;
    const noi = await prisma.members.findUnique({ where: { id: noiId } });
    if (!noi || noi.deleted_at) fail('Không thấy người nội.', 404, 'MFO_MEMBER_NOT_FOUND');
    if (String(noi.tenant_id) !== String(tenantId)) {
      fail('Người nội khác tenant.', 403, 'TENANT_MISMATCH');
    }

    let spouse = null;
    if (b.spouse_member_id) {
      spouse = await prisma.members.findUnique({
        where: { id: b.spouse_member_id },
      });
      if (!spouse || spouse.deleted_at) {
        fail('Không thấy spouse_member_id.', 404, 'MFO_SPOUSE_NOT_FOUND');
      }
      if (String(spouse.tenant_id) !== String(tenantId)) {
        fail('Vợ/chồng khác tenant.', 403, 'TENANT_MISMATCH');
      }
    } else {
      const fullName = String(b.full_name || b.spouse_name_literal || '').trim();
      if (!fullName) fail('Thiếu full_name hoặc spouse_member_id.', 400, 'MFO_NAME_REQUIRED');
      const gender = String(b.gender || 'NU').toUpperCase();
      if (!['NAM', 'NU', 'KHAC'].includes(gender)) {
        fail('gender phải NAM | NU | KHAC.', 400, 'MFO_GENDER_REQUIRED');
      }
      const founderMemberId = await resolveFounderMemberId(user);
      spouse = await prisma.members.create({
        data: {
          tenant_id: tenantId,
          full_name: fullName,
          gender,
          child_type: String(b.child_type || 'CON_DAU').toUpperCase(),
          is_clan: b.is_clan === true,
          father_id: b.father_id || null,
          mother_id: b.mother_id || null,
          branch_id: row.payload.granted_branch_id || null,
          note: b.note || null,
          changed_by: actor,
          created_by: actor,
          created_by_member_id: founderMemberId || null,
        },
      });
    }

    const noiMale = String(noi.gender || '').toUpperCase() === 'NAM';
    const husbandId = noiMale ? noi.id : spouse.id;
    const wifeId = noiMale ? spouse.id : noi.id;

    let union;
    try {
      union = await prisma.marriages.create({
        data: {
          tenant_id: tenantId,
          husband_id: husbandId,
          wife_id: wifeId,
          status: b.status || 'DANG_KET_HON',
          start_date: b.start_date ? new Date(b.start_date) : null,
          note: b.union_note || b.note || null,
          husband_marriage_order: b.husband_marriage_order || 1,
          wife_marriage_order: b.wife_marriage_order || 1,
          changed_by: actor,
        },
      });
    } catch (e) {
      const msg = String(e && e.message);
      if (msg.includes('uq_marriages_active_couple') || msg.includes('Unique constraint')) {
        fail('Đôi này đang kết hôn trên sổ.', 409, 'MFO_UNION_EXISTS');
      }
      throw e;
    }

    const unions = Array.isArray(row.payload.created_union_ids)
      ? row.payload.created_union_ids.slice()
      : [];
    unions.push(union.id);
    const spouses = Array.isArray(row.payload.created_spouse_ids)
      ? row.payload.created_spouse_ids.slice()
      : [];
    if (spouse && spouse.id) spouses.push(spouse.id);

    const ticket = await prisma.proposals.update({
      where: { id: row.id },
      data: {
        payload: {
          ...row.payload,
          created_union_ids: unions,
          created_spouse_ids: spouses,
        },
        changed_by: actor,
      },
    });

    return { spouse, union, ticket };
  },

  patchUnion: async ({ user, ticketId, unionId, body }) => {
    const actor = actorIdOf(user);
    const row = await mfoService.assertLot({
      user,
      ticketId,
      expectKind: 'PLAN',
    });
    if (!isClanOrSys(user) && String(row.requester_user_id) !== String(actor)) {
      fail('Không sửa hôn nhân lô này.', 403, 'FORBIDDEN');
    }
    if (row.status === 'REJECTED' || row.status === 'WITHDRAWN') {
      fail('Lô đã đóng.', 409, 'MFO_PLAN_STATE', {
        ticket_status: row.status,
      });
    }

    const union = await prisma.marriages.findUnique({ where: { id: unionId } });
    if (!union || union.deleted_at) fail('Không thấy hôn nhân.', 404, 'MFO_UNION_NOT_FOUND');
    if (String(union.tenant_id) !== String(row.tenant_id)) {
      fail('Hôn nhân khác tenant.', 403, 'TENANT_MISMATCH');
    }

    const b = body || {};
    const data = { changed_by: actor };
    if (b.status) data.status = b.status;
    if (b.note != null || b.union_note != null) data.note = b.note || b.union_note;
    if (b.start_date !== undefined) {
      data.start_date = b.start_date ? new Date(b.start_date) : null;
    }
    if (b.end_date !== undefined) {
      data.end_date = b.end_date ? new Date(b.end_date) : null;
    }
    if (b.husband_marriage_order != null) {
      data.husband_marriage_order = Number(b.husband_marriage_order);
    }
    if (b.wife_marriage_order != null) {
      data.wife_marriage_order = Number(b.wife_marriage_order);
    }

    const updated = await prisma.marriages.update({
      where: { id: unionId },
      data,
    });
    return { union: updated };
  },
};

module.exports = mfoService;
