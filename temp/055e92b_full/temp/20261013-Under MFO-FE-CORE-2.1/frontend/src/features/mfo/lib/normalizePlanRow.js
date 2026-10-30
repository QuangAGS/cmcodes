/**
 * PATH       : frontend/src/features/mfo/lib/normalizePlanRow.js
 * DATETIME   : 2026-10-08T09:15:00+07:00
 * VERSION    : 5.0.0-COMPLETE-5L-CANVAS-FULL
 * DESCRIPTION:
 * - Tuân thủ Q1 (Bảo toàn 100% logic/hàm cũ) & Q2 (Code Format & Chú thích đầy đủ).
 * - Bổ sung opMfoStatusLabel & opMfoStatusBadgeClass để định dạng nhãn và màu sắc badge trạng thái.
 * CHANGELOG  :
 * - 2026-10-08: Export opMfoStatusLabel & opMfoStatusBadgeClass.
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
    (row.siblings || []).forEach((s) => {
      if (s.member_id && !ids.includes(s.member_id)) ids.push(s.member_id);
    });
    if (row.spouse_id && !ids.includes(row.spouse_id)) ids.push(row.spouse_id);
    const fid = payload?.founder_member_id;
    const labelOf = (id, fallback) => {
      const nm = names[id] || fallback || 'Đã ghi trên sổ';
      if (fid && id && String(id) === String(fid)) return `${nm} (Người khai)`;
      if (id && row.member_id && String(id) !== String(fid) && String(id) !== String(row.member_id)) {
        return `${nm} (Anh/chị/em)`;
      }
      return nm;
    };
    const people = ids.map((id) => labelOf(id));
    (row.siblings || []).forEach((s) => {
      if (!s.member_id) people.push(`${s.hint || 'Anh/chị/em'} (Anh/chị/em)`);
    });
    if (row.spouse_hint && !row.spouse_id) people.push(`Vợ/chồng: ${row.spouse_hint}`);
    const op = String(row.op || 'EMPTY').toUpperCase();
    let text = 'Không khai';
    if (people.length) text = people.join('\n');
    else if (op === 'CREATE') text = 'Chưa ghi người';
    else if (op === 'ASSIGN') text = labelOf(row.member_id, row.hint);
    return {
      title: i === 0 ? 'Đời gốc' : `Đời ${i}`,
      text,
      tag: '',
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

/**
 * Lấy nhãn tiếng Việt hiển thị cho trạng thái Tờ trình MFO
 */
export function opMfoStatusLabel(t) {
  if (!t) return 'Khung dự kiến';
  const st = String(t.status || '').toUpperCase();
  if (st === 'DRAFT') return 'Đang soạn nháp';
  if (st === 'PENDING' || st === 'UNDER_REVIEW') return 'Khung chờ duyệt';
  if (st === 'NEEDS_REVISION') return 'Yêu cầu sửa lại';
  if (st === 'APPROVED') return 'Đã phê duyệt';
  if (st === 'REJECTED') return 'Đã từ chối';
  if (st === 'WITHDRAWN') return 'Đã rút hồ sơ';
  return 'Khung dự kiến';
}

/**
 * Lấy class Tailwind CSS định dạng màu sắc cho Badge Trạng thái
 */
export function opMfoStatusBadgeClass(t) {
  if (!t) return 'bg-slate-100 text-slate-700 border border-slate-200';
  const st = String(t.status || '').toUpperCase();
  if (st === 'DRAFT') return 'bg-slate-100 text-slate-700 border border-slate-200';
  if (st === 'PENDING' || st === 'UNDER_REVIEW') return 'bg-amber-50 text-amber-800 border border-amber-300';
  if (st === 'NEEDS_REVISION') return 'bg-indigo-50 text-indigo-900 border border-indigo-300';
  if (st === 'APPROVED') return 'bg-emerald-50 text-emerald-800 border border-emerald-300';
  if (st === 'REJECTED') return 'bg-rose-50 text-rose-800 border border-rose-300';
  return 'bg-slate-100 text-slate-700 border border-slate-200';
}