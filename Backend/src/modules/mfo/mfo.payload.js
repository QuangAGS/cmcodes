/**
 * PATH       : src/modules/mfo/mfo.payload.js
 * DATETIME   : 2026-10-04T20:04:00+07:00
 * VERSION    : 1.3.1-LAT2-SNAPSHOT-PATCHED
 * DESCRIPTION: Lát 2. Sanitize Payload & Cắt lọc tinh gọn graph_snapshot / canvas_delta.
 *              Đã vá bảo tồn isAnonymous, originSource, fallback stroke, và viewport null.
 */

const OPS = new Set(['ASSIGN', 'CREATE', 'EMPTY']);
const MODES = new Set(['DEPTH', 'WIDTH']);
const UNASSIGNED_LINK = 'owner:unassigned';

function fail(message, statusCode, code, extra) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  err.isOperational = true;
  if (extra) Object.assign(err, extra);
  throw err;
}

function asSibling(raw, index) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const op = String(s.op || (s.member_id ? 'ASSIGN' : s.hint ? 'CREATE' : 'EMPTY')).toUpperCase();
  if (!OPS.has(op)) return null;
  return {
    index: Number.isInteger(s.index) ? s.index : index,
    op,
    member_id: s.member_id || null,
    hint: s.hint || null,
    spouse_id: s.spouse_id || null,
    spouse_hint: s.spouse_hint || null,
  };
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
  const siblings = Array.isArray(line.siblings)
    ? line.siblings.map(asSibling).filter(Boolean)
    : [];
  return {
    line: n,
    op,
    member_id: memberId,
    hint: line.hint || null,
    spouse_id: line.spouse_id || null,
    spouse_hint: line.spouse_hint || null,
    siblings,
  };
}

function depthOf(value, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 4) {
    fail(label + ' phải là đời 0 đến 4.', 400, 'MFO_DEPTH_INVALID', { depth: value });
  }
  return n;
}

function linkOf(value) {
  const link = String(value || '');
  if (link === UNASSIGNED_LINK) return link;
  if (/^union:[^:\s]+:children$/.test(link)) return link;
  fail('link con nháp phải là owner:unassigned hoặc union:<id>:children.', 400, 'MFO_DRAFT_LINK');
}

function finite(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sanitizeViewport(rawView) {
  if (!rawView || typeof rawView !== 'object') return null;
  const x = Number(rawView.x);
  const y = Number(rawView.y);
  const zoom = Number(rawView.zoom);

  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(zoom) || zoom <= 0) {
    return null;
  }
  return { x, y, zoom };
}

function sanitizeGraphSnapshot(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const nodes = Array.isArray(raw.nodes) ? raw.nodes : [];
  const edges = Array.isArray(raw.edges) ? raw.edges : [];

  return {
    full_set_revision: String(raw.full_set_revision || ''),
    viewport: sanitizeViewport(raw.viewport),
    nodes: nodes
      .map((node) => {
        const data = node && node.data && typeof node.data === 'object' ? node.data : {};
        const tabs = Array.isArray(data.tabs) ? data.tabs : [];
        return {
          id: String((node && node.id) || ''),
          type: String((node && node.type) || 'familyCouple'),
          position: {
            x: finite(node && node.position && node.position.x, 0),
            y: finite(node && node.position && node.position.y, 0),
          },
          data: {
            depth: Number(data.depth),
            clanName: data.clanName || null,
            partnerName: data.partnerName || null,
            activeUnionId: data.activeUnionId || null,
            unassignedCount: Number(data.unassignedCount || 0),
            isTarget: data.isTarget === true,
            isAnonymous: data.isAnonymous === true,
            originSource: data.originSource || null,
            tabs: tabs.map((tab) => ({
              unionId: (tab && tab.unionId) || null,
              order: tab && tab.order != null ? Number(tab.order) : null,
              partnerName: (tab && tab.partnerName) || null,
              childCount: Number((tab && tab.childCount) || 0),
            })),
          },
        };
      })
      .filter((node) => node.id),
    edges: edges
      .map((edge) => ({
        id: String((edge && edge.id) || ''),
        source: String((edge && edge.source) || ''),
        target: String((edge && edge.target) || ''),
        sourceHandle: (edge && edge.sourceHandle) || null,
        type: (edge && edge.type) || 'smoothstep',
        style: {
          stroke: (edge && edge.style && edge.style.stroke) || '#6366f1',
          strokeWidth: finite(edge && edge.style && edge.style.strokeWidth, 2),
          strokeDasharray: (edge && edge.style && edge.style.strokeDasharray) || null,
        },
      }))
      .filter((edge) => edge.id && edge.source && edge.target),
  };
}

function sanitizeCanvasDelta(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const children = Array.isArray(src.draft_children) ? src.draft_children : [];
  const spouses = Array.isArray(src.draft_spouses) ? src.draft_spouses : [];
  const positions = src.node_positions_x && typeof src.node_positions_x === 'object' ? src.node_positions_x : {};

  return {
    draft_children: children
      .map((row) => ({
        id: String((row && row.id) || ''),
        parent_node_id: String((row && row.parent_node_id) || ''),
        depth: depthOf(row && row.depth, 'Đời con nháp'),
        label: String((row && row.label) || ''),
        link: linkOf(row && row.link),
      }))
      .filter((row) => row.id && row.parent_node_id),
    draft_spouses: spouses
      .map((row) => {
        const order = Number(row && row.owner_marriage_order);
        if (!Number.isInteger(order) || order < 1) {
          fail('owner_marriage_order phải là số nguyên từ 1.', 400, 'MFO_DRAFT_ORDER');
        }
        return {
          union_id: String(row.union_id || ''),
          owner_node_id: String(row.owner_node_id || ''),
          partner_name: String(row.partner_name || ''),
          owner_marriage_order: order,
        };
      })
      .filter((row) => row.union_id && row.owner_node_id),
    node_positions_x: Object.fromEntries(
      Object.entries(positions)
        .filter(([id, x]) => id && Number.isFinite(Number(x)))
        .map(([id, x]) => [String(id), Number(x)])
    ),
  };
}

function normalizePlanBody(body) {
  const b = body || {};
  const targetId = b.target_member_id || null;
  if (!targetId) fail('Chưa chọn thành viên mốc M.', 400, 'MFO_TARGET_REQUIRED');

  const selectedCanvasDepth = depthOf(
    b.selected_canvas_depth != null ? b.selected_canvas_depth : b.k,
    'Đời của M'
  );

  let lines = Array.isArray(b.lines) ? b.lines.map(asLine) : [];
  if (lines.length === 0) {
    lines = [0, 1, 2, 3, 4].map((line) => ({
      line,
      op: 'EMPTY',
      member_id: null,
      hint: null,
      spouse_id: null,
      spouse_hint: null,
      siblings: [],
    }));
  }
  if (lines.length !== 5) {
    fail('5L phải đủ đúng 5 ô (Dòng 0…4).', 400, 'MFO_LINES_COUNT');
  }
  lines = lines
    .slice()
    .sort((a, c) => a.line - c.line)
    .map((row, i) => ({ ...row, line: i }));

  const mode = String(b.mode || 'DEPTH').toUpperCase();
  if (!MODES.has(mode)) fail('mode phải là DEPTH | WIDTH.', 400, 'MFO_MODE');

  const reuse = Array.isArray(b.reuse_member_ids) ? b.reuse_member_ids.filter(Boolean) : [];
  if (!reuse.includes(targetId)) reuse.unshift(targetId);

  return {
    kind: 'PLAN',
    target_member_id: targetId,
    selected_canvas_depth: selectedCanvasDepth,
    requester_user_id: b.requester_user_id || null,
    origin_member_id: b.origin_member_id || null,
    k: selectedCanvasDepth,
    k_on_tree: true,
    proposed_generation:
      b.proposed_generation == null || b.proposed_generation === '' ? null : Number(b.proposed_generation),
    proposed_branch_id: b.proposed_branch_id || null,
    granted_generation: null,
    granted_branch_id: null,
    mode,
    anchor_member_id: b.anchor_member_id || null,
    reuse_member_ids: reuse,
    lines,
    canvas_delta: sanitizeCanvasDelta(b.canvas_delta),
    graph_snapshot: sanitizeGraphSnapshot(b.graph_snapshot),
    note: b.note || null,
  };
}

module.exports = { normalizePlanBody, sanitizeCanvasDelta, sanitizeGraphSnapshot, fail, OPS };