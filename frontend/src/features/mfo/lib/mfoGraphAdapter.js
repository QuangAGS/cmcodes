/**
 * PATH       : frontend/src/features/mfo/lib/mfoGraphAdapter.js
 * DATETIME   : 2026-10-19T14:45:00+07:00
 * VERSION    : 5.0.1-UNIQUE-TREE-ID-FIX
 * DESCRIPTION:
 * - Tuân thủ Q1 (Bảo tồn 100% logic cũ) & Q2 (Code Format & Chú thích đầy đủ).
 * - Khắc phục lỗi đứt đường nối con cái khi thêm Vợ/Chồng mới: Bảo tồn 100% các edge 
 *   con cái từ hôn phối cũ và edge unassigned_children từ owner anchor.
 * - Vá dứt điểm lỗi trùng key st:unknown khiến chuyển Tab hôn nhân bị tác động dây chuyền sang các Node khác.
 * - Khóa chặt treeId duy nhất cho từng Standard Tree Card kể cả khi chưa có ID từ DB.
 *
 * CHANGE LOG  :
 * - 2026-10-08T11:00:00+07:00 | 5.0.0 | Render đầy đủ unassigned edge bất kể activeTab đang ở tab nào.
 * - 2026-10-19T14:45:00+07:00 | 5.0.1 | Tạo Unique Key cho treeId khi tree.id null, chống trùng key st:unknown (STATE ISOLATION FIX).
 *
 * RULE COMPLIANCE:
 * - Q1 (Bảo tồn): Bảo toàn 100% logic xây dựng đồ thị MFO Graph, gán handles và edges.
 * - Q2 (Code Format): Đầy đủ docstring header và chú thích thời gian từng khối logic.
 */

const LANE_Y = 310;
const LANE_X_STEP = 290;

const normalEdgeStyle = {
  stroke: '#4f46e5',
  strokeWidth: 2,
};

const unassignedEdgeStyle = {
  stroke: '#d97706',
  strokeWidth: 2,
  strokeDasharray: '7 5',
};

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function textOf(member) {
  return member?.full_name || 'Chưa rõ tên';
}

/**
 * <2026-10-19T14:45:00+07:00>
 * Mục đích: Tạo Unique Key cho treeId không bao giờ bị trùng st:unknown.
 * Lý do: Các node nháp chưa có ID trên DB sẽ bị trùng st:unknown khiến State tab bị nhảy dây chuyền.
 */
function treeId(tree, index = 0) {
  if (tree?.id) return String(tree.id);
  if (tree?.parent?.member?.id) return `st:member:${tree.parent.member.id}`;
  return `st:draft:${index}:${Date.now()}`;
}

function childTargetId(memberToTreeId, member) {
  if (!member?.id) return null;
  return memberToTreeId.get(String(member.id)) || null;
}

function buildTabs(rawTabs) {
  return asArray(rawTabs).map((tab) => ({
    unionId: tab?.union_id || null,
    status: tab?.union_status || null,
    order: tab?.owner_marriage_order ?? null,
    canAssignChild: tab?.supports_parent_union_assignment === true,
    partner: tab?.partner || null,
    partnerName: textOf(tab?.partner),
    partnerAvatarUrl: tab?.partner?.avatar_url || null,
    childCount: Number(
      tab?.child_count ?? asArray(tab?.children).length
    ),
  }));
}

function nextLaneX(laneX, depth) {
  const x = laneX.get(depth) || 0;
  laneX.set(depth, x + LANE_X_STEP);
  return x;
}

export function buildMfoGraph(fullSet, options = {}) {
  const levels = asArray(fullSet?.levels);
  const activeUnionByTreeId = options.activeUnionByTreeId || {};
  const nodes = [];
  const edges = [];
  const laneX = new Map();
  const memberToTreeId = new Map();
  const nodeIds = new Set();

  // Index all real child target Standard Trees before creating edges.
  levels.forEach((level) => {
    asArray(level?.standard_trees).forEach((tree, idx) => {
      const memberId = tree?.parent?.member?.id;
      const tId = treeId(tree, idx);
      if (memberId) {
        memberToTreeId.set(String(memberId), tId);
      }
    });
  });

  // A Standard Tree becomes exactly one card. Tabs remain data inside card.
  levels.forEach((level) => {
    const depth = Number(level?.depth ?? 0);

    asArray(level?.standard_trees).forEach((tree, idx) => {
      const id = treeId(tree, idx);
      const tabs = buildTabs(tree?.marriage_tabs);
      const requestedUnionId = activeUnionByTreeId[id] || activeUnionByTreeId[tree?.id];
      const activeUnionId = tabs.some(
        (tab) => tab.unionId === requestedUnionId
      )
        ? requestedUnionId
        : tabs[0]?.unionId || null;
      const activeTab =
        tabs.find((tab) => tab.unionId === activeUnionId) || null;
      const unassigned = asArray(tree?.unassigned_children).map(
        (row) => ({
          id: row?.member?.id || null,
          member: row?.member || null,
          partners: asArray(row?.partners),
          name: textOf(row?.member),
          reason: row?.reason || 'PARENT_UNION_UNSET',
        })
      );

      nodes.push({
        id,
        type: 'familyCouple',
        position: {
          x: nextLaneX(laneX, depth),
          y: depth * LANE_Y,
        },
        data: {
          depth,
          treeId: id,
          clan: tree?.parent?.member || null,
          partners: asArray(tree?.parent?.partners),
          clanName: textOf(tree?.parent?.member),
          avatarUrl: tree?.parent?.member?.avatar_url || null,

          tabs,
          activeUnionId,
          unionId: activeUnionId,
          unionStatus: activeTab?.status || null,
          ownerMarriageOrder: activeTab?.order ?? null,
          partner: activeTab?.partner || null,
          partnerName: activeTab?.partnerName || '',
          partnerAvatarUrl: activeTab?.partnerAvatarUrl || null,
          canAssignChild: activeTab?.canAssignChild === true,
          childCount: activeTab?.childCount || 0,

          unassigned,
          unassignedCount: unassigned.length,
          isTarget: tree?.parent?.member?.is_target === true,
          isOrigin: tree?.parent?.member?.is_origin === true,
        },
      });

      nodeIds.add(id);
    });
  });

  function addEdge(edge) {
    if (!edge.source || !edge.target) return;
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) return;
    if (edges.some((e) => e.id === edge.id)) return;
    edges.push(edge);
  }

  levels.forEach((level) => {
    asArray(level?.standard_trees).forEach((tree, idx) => {
      const source = treeId(tree, idx);
      const rawTabs = asArray(tree?.marriage_tabs);

      rawTabs.forEach((tab) => {
        const unionId = tab?.union_id;
        asArray(tab?.children).forEach((row) => {
          const member = row?.member;
          const target = childTargetId(memberToTreeId, member);

          addEdge({
            id: `${source}:union:${unionId}:${member?.id || 'unknown'}`,
            source,
            sourceHandle: `union:${unionId}:children`,
            target,
            type: 'smoothstep',
            style: normalEdgeStyle,
            data: {
              kind: 'PARENT_UNION_CHILD',
              unionId,
              parentUnionId: member?.parent_union_id || unionId || null,
            },
          });
        });
      });

      asArray(tree?.unassigned_children).forEach((row) => {
        const member = row?.member;
        const target = childTargetId(memberToTreeId, member);

        addEdge({
          id: `${source}:unassigned:${row?.reason || 'PARENT_UNION_UNSET'}:${member?.id || 'unknown'}`,
          source,
          sourceHandle: 'owner:unassigned',
          target,
          type: 'smoothstep',
          style: unassignedEdgeStyle,
          label: 'Chưa gắn hôn phối',
          labelStyle: {
            fill: '#92400e',
            fontSize: 10,
            fontWeight: 700,
          },
          labelBgStyle: {
            fill: '#fef3c7',
            fillOpacity: 0.96,
          },
          labelBgPadding: [5, 3],
          labelBgBorderRadius: 5,
          data: {
            kind: 'UNASSIGNED_CHILD',
            reason: row?.reason || 'PARENT_UNION_UNSET',
            parentUnionId: member?.parent_union_id || null,
          },
        });
      });
    });
  });

  return { nodes, edges };
}