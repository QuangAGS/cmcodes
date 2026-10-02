/**
 * PATH : frontend/src/features/mfo/lib/mfoGraphAdapter.js
 * DATETIME : 2026-10-01T23:23:00+07:00
 * VERSION : 1.2.0-FIX-ST-EDGE-IDENTITY-AND-FIXED-LANES
 *
 * DESCRIPTION:
 * - Chuyển `lines[].clusters` thành React Flow nodes/edges.
 * - Chỉ nối Standard Tree parent sang Standard Tree child thật sự tồn tại.
 * - Không tạo target ID ảo `mem-<memberId>`.
 * - Khóa tuyệt đối Y theo depth backend 0..4.
 * - Dagre chỉ hỗ trợ tính X/spacing, không được đổi đời node.
 * - Không flatten children của nhiều ST thành siblings chung.
 */

import dagre from 'dagre';

export const MFO_LANE_HEIGHT = 250;
export const MFO_NODE_WIDTH = 280;
export const MFO_NODE_HEIGHT = 120;

const NODE_GAP = 56;
const RANK_GAP = 72;
const EMPTY_NODE_X = 36;

function isDepth(value) {
  return Number.isInteger(value) && value >= 0 && value <= 4;
}

function getClusters(row) {
  return Array.isArray(row?.clusters)
    ? row.clusters.filter(Boolean)
    : [];
}

function getOwnerMemberId(st) {
  return st?.parent?.member?.member_id || null;
}

function getStandardTreeNodeId(st, depth, stIndex) {
  return (
    st?.st_key ||
    `st:${depth}:${getOwnerMemberId(st) || stIndex}`
  );
}

function makeEmptyNode(depth) {
  return {
    id: `empty:${depth}`,
    type: 'emptyNode',
    data: {
      depth,
      label: `Đời ${depth}`,
    },
    className:
      '!bg-slate-50 !border-2 !border-dashed !border-slate-400 !rounded-2xl !shadow-sm',
    style: {
      width: MFO_NODE_WIDTH,
      opacity: 1,
    },
    position: {
      x: EMPTY_NODE_X,
      y: depth * MFO_LANE_HEIGHT,
    },
  };
}

/**
 * Input:
 * lines = adapter output của fulfillViewFocus5L.
 *
 * Canonical source:
 * lines[depth].clusters[].parent.member
 * lines[depth].clusters[].children[]
 *
 * Output:
 * nodes/edges phù hợp React Flow.
 */
export function buildMfoGraph(lines = []) {
  const nodes = [];
  const edges = [];

  /*
   * member_id của owner ST -> React Flow node ID thực tế.
   *
   * Ví dụ:
   * "f8912bfd-..." -> "st:3:f8912bfd-..."
   */
  const stNodeIdByOwnerMemberId = new Map();

  /*
   * Pha 1:
   * Tạo toàn bộ node trước để mọi edge sau đó có target tồn tại.
   */
  for (const row of Array.isArray(lines) ? lines : []) {
    const depth = Number(row?.line);

    if (!isDepth(depth)) {
      continue;
    }

    const clusters = getClusters(row);

    if (clusters.length === 0) {
      nodes.push(makeEmptyNode(depth));
      continue;
    }

    clusters.forEach((st, stIndex) => {
      const ownerMemberId = getOwnerMemberId(st);
      const nodeId = getStandardTreeNodeId(
        st,
        depth,
        stIndex
      );

      nodes.push({
        id: nodeId,
        type: 'coupleNode',
        data: {
          depth,
          stIndex,
          st,
          parent: st?.parent || null,
          ownerMemberId,
          isAssign: row?.op === 'ASSIGN',
          isTarget:
            st?.parent?.member?.is_target === true,
          isOrigin:
            st?.parent?.member?.is_origin === true,
        },
        className:
          '!bg-white !border-2 !border-slate-500 !rounded-2xl !shadow-md',
        style: {
          width: MFO_NODE_WIDTH,
          opacity: 1,
        },
        position: {
          x: stIndex * (MFO_NODE_WIDTH + NODE_GAP),
          y: depth * MFO_LANE_HEIGHT,
        },
      });

      if (ownerMemberId) {
        stNodeIdByOwnerMemberId.set(
          ownerMemberId,
          nodeId
        );
      }
    });
  }

  /*
   * Pha 2:
   * Tạo cạnh chỉ khi child là owner của một ST/node thật trong graph.
   *
   * Không tạo edge đến:
   * `mem-${childMemberId}`
   * vì loại ID đó không tồn tại trong nodes[].
   */
  for (const sourceNode of nodes) {
    const st = sourceNode?.data?.st;

    if (!st || !Array.isArray(st.children)) {
      continue;
    }

    st.children.forEach((child) => {
      const childMemberId =
        child?.member?.member_id || null;

      if (!childMemberId) {
        return;
      }

      const targetNodeId =
        stNodeIdByOwnerMemberId.get(childMemberId);

      /*
       * Nếu child không có Standard Tree node tương ứng trong
       * window, không tạo dangling edge.
       */
      if (!targetNodeId) {
        return;
      }

      edges.push({
        id: `edge:${sourceNode.id}->${targetNodeId}`,
        source: sourceNode.id,
        target: targetNodeId,
        type: 'smoothstep',
        animated: false,
        selectable: false,
        focusable: false,
        style: {
          stroke: '#4338ca',
          strokeWidth: 2.5,
        },
      });
    });
  }

  /*
   * Pha 3:
   * Dagre chỉ tính horizontal distribution.
   * Trục Y luôn giữ theo depth backend.
   */
  const graph = new dagre.graphlib.Graph();

  graph.setDefaultEdgeLabel(() => ({}));

  graph.setGraph({
    rankdir: 'TB',
    nodesep: NODE_GAP,
    ranksep: RANK_GAP,
    marginx: 24,
    marginy: 24,
  });

  nodes.forEach((node) => {
    graph.setNode(node.id, {
      width: MFO_NODE_WIDTH,
      height: MFO_NODE_HEIGHT,
    });
  });

  edges.forEach((edge) => {
    graph.setEdge(edge.source, edge.target);
  });

  dagre.layout(graph);

  const layoutedNodes = nodes.map((node) => {
    const depth = Number(node?.data?.depth);

    /*
     * Placeholder không tham gia topology:
     * giữ thẳng theo cột X cố định.
     */
    if (node.type === 'emptyNode') {
      return {
        ...node,
        position: {
          x: EMPTY_NODE_X,
          y: depth * MFO_LANE_HEIGHT,
        },
      };
    }

    const dagreNode = graph.node(node.id);

    return {
      ...node,
      position: {
        x: dagreNode
          ? dagreNode.x - MFO_NODE_WIDTH / 2
          : node.position.x,
        y: depth * MFO_LANE_HEIGHT,
      },
    };
  });

  return {
    nodes: layoutedNodes,
    edges,
  };
}