/**
 * PATH       : frontend/src/features/mfo/lib/sanitizeLines.js
 * DATETIME   : 2026-09-24T10:50:00+07:00
 * VERSION    : 1.0.0-W0
 * DESCRIPTION: Ép đúng 5 dòng PLAN. Không nhét spouse vào line.
 */

const OPS = new Set(['ASSIGN', 'CREATE', 'EMPTY']);

export function sanitizeLines(rows, { originId, k, founderId } = {}) {
  const byLine = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const n = Number(row?.line);
    if (Number.isInteger(n) && n >= 0 && n <= 4) byLine.set(n, row);
  });

  const out = [];
  for (let i = 0; i < 5; i += 1) {
    const src = byLine.get(i) || {};
    let op = String(src.op || 'EMPTY').toUpperCase();
    if (!OPS.has(op)) op = 'EMPTY';
    let memberId = src.member_id || null;
    let hint = src.hint ? String(src.hint) : null;

    if (i === 0) {
      op = 'ASSIGN';
      memberId = originId || memberId || null;
      hint = hint || 'Origin';
    }

    if (
      founderId &&
      k !== '' &&
      k != null &&
      Number.isInteger(Number(k)) &&
      Number(k) === i
    ) {
      op = 'ASSIGN';
      memberId = founderId;
      hint = hint || 'MWL';
    }

    if (op === 'ASSIGN') {
      memberId = memberId || null;
    } else {
      memberId = null;
    }
    if (op === 'EMPTY') hint = hint || null;

    const siblings = Array.isArray(src.siblings)
      ? src.siblings.map((s, idx) => ({
          index: Number.isInteger(s.index) ? s.index : idx,
          op: String(s.op || (s.member_id ? 'ASSIGN' : 'CREATE')).toUpperCase(),
          member_id: s.member_id || null,
          hint: s.hint || null,
          spouse_id: s.spouse_id || null,
          spouse_hint: s.hint ? null : s.spouse_hint || null,
        }))
      : [];

    out.push({
      line: i,
      op,
      member_id: memberId,
      hint,
      spouse_id: src.spouse_id || null,
      spouse_hint: src.spouse_hint || null,
      siblings,
    });
  }
  return out;
}

export function ticketIdFromCreate(res) {
  const d = res?.data?.data ?? res?.data ?? res ?? {};
  return d.ticket?.id || d.id || d.ticket_id || '';
}
