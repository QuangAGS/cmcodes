/**
 * PATH       : src/modules/mfo/mfo.hold.js
 * DATETIME   : 2026-10-27T09:38:00+07:00
 * 2026-10-10T21:25:00+07:00
 * VERSION    : 1.0.2-LOC-XOA
 * DESCRIPTION: Rút member_id thật để ghi hold_member_ids. Không kiểm giao nhau.
 * CHANGE LOG:
 * - 2026-10-27T09:38:00+07:00 | 1.0.1 | Thêm: bỏ hồ sơ đã xoá khỏi kiểm xung đột. Bỏ: không bỏ. Giữ: kiểm giao nhau. Lý do: hồ sơ đã xoá vẫn bị tính.
 */
'use strict';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function add(set, value) {
  if (typeof value !== 'string') return;
  const id = value.trim();
  if (!UUID_RE.test(id)) return;
  set.add(id);
}

function collectHoldMemberIds(payload = {}) {
  const set = new Set();
  const given = Array.isArray(payload.hold_member_ids) ? payload.hold_member_ids : [];
  given.forEach((id) => add(set, id));

  add(set, payload.target_member_id);
  add(set, payload.origin_member_id);
  add(set, payload.anchor_member_id);

  const lines = Array.isArray(payload.lines) ? payload.lines : [];
  lines.forEach((line) => {
    add(set, line && line.member_id);
    const siblings = Array.isArray(line && line.siblings) ? line.siblings : [];
    siblings.forEach((sibling) => add(set, sibling && (sibling.member_id || sibling.id)));
  });

  const reuse = Array.isArray(payload.reuse_member_ids) ? payload.reuse_member_ids : [];
  reuse.forEach((id) => add(set, id));

  const fullNodes = Array.isArray(payload.nodes) ? payload.nodes : [];
  fullNodes.forEach((node) => add(set, node && node.id));

  const levels = Array.isArray(payload.levels) ? payload.levels : [];
  levels.forEach((level) => {
    const trees = Array.isArray(level && level.standard_trees) ? level.standard_trees : [];
    trees.forEach((tree) => {
      add(set, tree && tree.parent && tree.parent.member && tree.parent.member.id);
      const partners = Array.isArray(tree && tree.parent && tree.parent.partners) ? tree.parent.partners : [];
      partners.forEach((partner) => add(set, partner && partner.id));
    });
  });

  const nodes = payload.graph_snapshot && Array.isArray(payload.graph_snapshot.nodes)
    ? payload.graph_snapshot.nodes
    : [];
  nodes.forEach((node) => {
    const data = node && node.data ? node.data : {};
    add(set, data.memberId);
    add(set, data.member_id);
    add(set, data.clan && data.clan.id);
    add(set, data.clanMember && data.clanMember.id);
    add(set, data.partner && data.partner.id);
    add(set, data.partnerMember && data.partnerMember.id);
    const treeId = String(data.treeId || '');
    const tail = treeId.split(':').pop();
    add(set, tail);
  });

  return Array.from(set);
}

const HOLDING_STATUSES = ['DRAFT', 'PENDING', 'UNDER_REVIEW', 'NEEDS_REVISION', 'APPROVED'];
const RELEASABLE = new Set(['DRAFT', 'NEEDS_REVISION', 'APPROVED']);

function stillHolding(row, now) {
  if (!row || row.deleted_at) return false;
  if (!HOLDING_STATUSES.includes(row.status)) return false;
  if (row.result_ok === true) return false;
  if (RELEASABLE.has(row.status) && row.expires_at && new Date(row.expires_at).getTime() <= now.getTime()) {
    return false;
  }
  return Array.isArray(row.hold_member_ids) && row.hold_member_ids.length > 0;
}

async function findHoldConflict(prisma, { tenantId, memberIds, excludeProposalId, excludeRequesterId }) {
  const ids = Array.from(new Set((memberIds || []).filter((id) => UUID_RE.test(String(id || '')))));
  if (!tenantId || !ids.length) return null;
  // <2026-10-27T09:55:00+07:00> Mục đích: Câu thô loại hồ sơ đã xoá. Lý do: câu cũ vẫn tính hồ sơ đã xoá.
  const rows = await prisma.$queryRaw`
    SELECT id, status, requester_user_id, expires_at, hold_member_ids, deleted_at,
           COALESCE((payload->>'result_ok')::boolean, false) AS result_ok
    FROM proposals
    WHERE tenant_id = ${tenantId}
      AND deleted_at IS NULL
      AND status::text IN ('DRAFT', 'PENDING', 'UNDER_REVIEW', 'NEEDS_REVISION', 'APPROVED')
      AND cardinality(hold_member_ids) > 0
      AND hold_member_ids && ${ids}::text[]
      AND COALESCE((payload->>'result_ok')::boolean, false) = false
      AND (${excludeProposalId}::text IS NULL OR id <> ${excludeProposalId})
      AND (${excludeRequesterId}::text IS NULL OR requester_user_id <> ${excludeRequesterId})
      AND NOT (
        status::text IN ('DRAFT', 'NEEDS_REVISION', 'APPROVED')
        AND expires_at IS NOT NULL AND expires_at <= NOW()
      )
    LIMIT 5
  `;
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

module.exports = {
  collectHoldMemberIds,
  findHoldConflict,
};
