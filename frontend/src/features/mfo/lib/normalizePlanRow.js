/**
 * PATH       : frontend/src/features/mfo/lib/normalizePlanRow.js
 * DATETIME   : 2026-09-24T22:30:00+07:00
 * DESCRIPTION: List BE để plan_ok ngoài payload, không có result_submitted.
 */

export function unwrapPlanList(res) {
  const root = res?.data?.data ?? res?.data ?? {};
  const raw = Array.isArray(root)
    ? root
    : Array.isArray(root.items)
      ? root.items
      : Array.isArray(root.tickets)
        ? root.tickets
        : Array.isArray(root.plans)
          ? root.plans
          : Array.isArray(root.rows)
            ? root.rows
            : root.ticket
              ? [root.ticket]
              : [];
  return raw.map(normalizePlanRow);
}

export function unwrapPlanTicket(res) {
  const d = res?.data?.data ?? res?.data ?? {};
  const ticket = d.ticket || d;
  return normalizePlanRow(ticket);
}

export function normalizePlanRow(t) {
  if (!t || typeof t !== 'object') return t;
  let p = t.payload;
  if (typeof p === 'string') {
    try {
      p = JSON.parse(p);
    } catch {
      p = {};
    }
  }
  p = p && typeof p === 'object' ? p : {};
  const plan_ok = t.plan_ok === true || p.plan_ok === true;
  const result_ok = t.result_ok === true || p.result_ok === true;
  const result_submitted =
    t.result_submitted === true ||
    p.result_submitted === true ||
    p.result_ok === true;
  return {
    ...t,
    plan_ok,
    result_ok,
    result_submitted,
    payload: {
      ...p,
      plan_ok,
      result_ok,
      result_submitted,
      k: t.k ?? p.k,
      origin_member_id: t.origin_member_id || p.origin_member_id,
      note: t.note || p.note,
    },
  };
}

/** khung | result | done */
export function mfoQueueOf(t) {
  const n = normalizePlanRow(t);
  const st = String(n.status || '').toUpperCase();
  if (n.result_ok || st === 'APPROVED') return 'done';
  if (st === 'NEEDS_REVISION') return 'result';
  if (n.plan_ok && n.result_submitted) return 'result';
  if (n.plan_ok && !n.result_submitted) return 'work';
  return 'plan';
}

export function resultLineBlocks(payload, names = {}) {
  const raw = Array.isArray(payload?.lines) ? payload.lines : [];
  const blocks = [0, 1, 2, 3, 4].map((i) => {
    const row = raw.find((r) => Number(r.line) === i) || {};
    const ids = [];
    if (row.member_id) ids.push(row.member_id);
    (row.created_ids || []).forEach((id) => {
      if (!ids.includes(id)) ids.push(id);
    });
    const people = ids.map((id) => names[id] || 'Đã ghi trên sổ');
    const op = String(row.op || 'EMPTY').toUpperCase();
    let text = 'Không khai';
    if (people.length) text = people.join(', ');
    else if (op === 'CREATE') text = 'Chưa ghi người';
    else if (op === 'ASSIGN') text = names[row.member_id] || 'Đã chọn trên sổ';
    return {
      title: i === 0 ? 'Đời gốc' : `Đời ${i}`,
      text,
      tag: Number(payload?.k) === i ? 'Người khai' : '',
    };
  });
  const spouses = payload?.created_spouse_ids || [];
  if (spouses.length) {
    blocks.push({
      title: 'Vợ/chồng mới',
      text: spouses.map((id) => names[id] || 'Đã ghi trên sổ').join(', '),
      tag: '',
    });
  }
  return blocks;
}
