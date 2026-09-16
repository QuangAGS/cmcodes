/**
 * PATH       : src/modules/mfo/mfo.payload.js
 * DATETIME   : 2026-09-16T15:10:00+07:00
 * VERSION    : 1.0.0-MFO-L1
 * DESCRIPTION: Chuẩn hoá + kiểm payload ticket PLAN 5L.
 *              Không thêm enum. ticket_type = BRANCH_REVIEW, kind = PLAN|RESULT.
 */

const OPS = new Set(['ASSIGN', 'CREATE', 'EMPTY']);
const MODES = new Set(['DEPTH', 'WIDTH']);

function fail(message, statusCode, code, extra) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  err.isOperational = true;
  if (extra) Object.assign(err, extra);
  throw err;
}

function asLine(raw, index) {
  const line = raw && typeof raw === 'object' ? raw : {};
  const n = Number(line.line != null ? line.line : index);
  const op = String(line.op || 'EMPTY').toUpperCase();
  if (!OPS.has(op)) {
    fail('Ô ' + n + ': op phải là ASSIGN | CREATE | EMPTY.', 400, 'MFO_LINE_OP');
  }
  const memberId = line.member_id || null;
  if (op === 'ASSIGN' && !memberId) {
    fail('Ô ' + n + ': ASSIGN bắt buộc member_id.', 400, 'MFO_LINE_ASSIGN');
  }
  if (op === 'EMPTY' && memberId) {
    fail('Ô ' + n + ': EMPTY không kèm member_id.', 400, 'MFO_LINE_EMPTY');
  }
  return {
    line: n,
    op,
    member_id: memberId,
    hint: line.hint || null,
  };
}

function normalizePlanBody(body) {
  const b = body || {};
  const originId = b.origin_member_id || null;
  if (!originId) fail('Thiếu origin_member_id.', 400, 'MFO_ORIGIN_REQUIRED');

  let k = b.k;
  if (k === '' || k === undefined) k = null;
  if (k !== null) {
    k = Number(k);
    if (!Number.isFinite(k) || k < 0) {
      fail('k phải là số ≥ 0 hoặc null (chưa trên cây).', 400, 'MFO_K_INVALID');
    }
    if (k > 4) {
      fail(
        'k > 4: không dùng Origin này làm Dòng 0 của lô. Chọn tổ gần hơn.',
        422,
        'MFO_K_TOO_FAR',
        { k }
      );
    }
  }

  let lines = Array.isArray(b.lines) ? b.lines.map(asLine) : [];
  if (lines.length === 0) {
    lines = [
      { line: 0, op: 'ASSIGN', member_id: originId, hint: 'Origin' },
      { line: 1, op: 'EMPTY', member_id: null, hint: null },
      { line: 2, op: 'EMPTY', member_id: null, hint: null },
      { line: 3, op: 'EMPTY', member_id: null, hint: null },
      { line: 4, op: 'EMPTY', member_id: null, hint: null },
    ];
  }
  if (lines.length !== 5) {
    fail('5L phải đủ đúng 5 ô (Dòng 0…4).', 400, 'MFO_LINES_COUNT');
  }
  lines = lines
    .slice()
    .sort((a, c) => a.line - c.line)
    .map((row, i) => ({ ...row, line: i }));

  if (lines[0].op !== 'ASSIGN' || lines[0].member_id !== originId) {
    fail('Dòng 0 phải ASSIGN đúng origin_member_id.', 400, 'MFO_LINE0_ORIGIN');
  }

  const mode = String(b.mode || 'DEPTH').toUpperCase();
  if (!MODES.has(mode)) fail('mode phải là DEPTH | WIDTH.', 400, 'MFO_MODE');

  const reuse = Array.isArray(b.reuse_member_ids)
    ? b.reuse_member_ids.filter(Boolean)
    : [];
  if (!reuse.includes(originId)) reuse.unshift(originId);

  return {
    kind: 'PLAN',
    origin_member_id: originId,
    k,
    k_on_tree: k !== null,
    proposed_generation:
      b.proposed_generation == null || b.proposed_generation === ''
        ? null
        : Number(b.proposed_generation),
    proposed_branch_id: b.proposed_branch_id || null,
    granted_generation: null,
    granted_branch_id: null,
    mode,
    anchor_member_id: b.anchor_member_id || null,
    reuse_member_ids: reuse,
    lines,
    note: b.note || null,
  };
}

module.exports = { normalizePlanBody, fail, OPS };
