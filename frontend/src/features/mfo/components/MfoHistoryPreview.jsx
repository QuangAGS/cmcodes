/**
 * PATH       : frontend/src/features/mfo/components/MfoHistoryPreview.jsx
 * DATETIME   : 2026-10-22T09:25:00+07:00
 * VERSION    : 1.0.4-DOT-BY-NODE
 * DESCRIPTION: Lớp xem snapshot readonly, state riêng, không điều hướng hoặc đè cây đang soạn.
 * RULE       : Q1 bảo tồn ngoài lịch sử; Q2 metadata và chú thích thời gian.
 *
 * CHANGE LOG:
 * - 2026-10-22T09:25:00+07:00 | 1.0.4 | Chấm đổi lần theo mã ô. Ảnh không có mã cây.
 * - 2026-10-18T14:57:00+07:00 | 1.0.4 | Thu hoặc hiện con trực tiếp.
 * - 2026-10-18T14:35:00+07:00 | 1.0.3 | Xem lại cho chuyển lần hôn nhân. Lần mở nét liền, lần khác nét đứt.
 * - 2026-10-18T07:37:00+07:00 | 1.0.2 | Nhóm nút canvas nằm ngang, ngoài khung.
 * - 2026-10-18T07:31:00+07:00 | 1.0.1 | Nhóm nút canvas lên giữa phía trên.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ReactFlow, { Background } from 'reactflow';
import 'reactflow/dist/style.css';
import FamilyCoupleNode from '../../genealogy/components/FamilyCoupleNode.jsx';
/**
 * <2026-10-13T15:24:00+07:00>
 * Mục đích: Node xem lại giữ renderer cũ nhưng không mở AF hoặc thao tác dữ liệu.
 */
function ReadonlyCouple({
  id,
  data
}) {
  return <FamilyCoupleNode id={id} data={data} />;
}
/**
 * <2026-10-13T15:24:00+07:00>
 * Mục đích: Placeholder readonly cho empty lane của snapshot.
 */
function ReadonlyEmpty({
  data
}) {
  return <div className="w-[180px] rounded-2xl border-2 border-dashed bg-slate-50 p-3 text-center">{data?.label || `Đời ${data?.depth}`}</div>;
}
const nodeTypes = {
  familyCouple: ReadonlyCouple,
  emptyNode: ReadonlyEmpty
};
/**
 * <2026-10-13T15:24:00+07:00>
 * Mục đích: Chỉ preview có state tabs riêng; Escape/Đóng không động tới state parent.
 */
export default function MfoHistoryPreview({
  snapshot,
  title = 'Xem lại',
  onClose
}) {
  const [tabs, setTabs] = useState({});
  const [collapsedIds, setCollapsedIds] = useState({});
  const flowRef = useRef(null);
  useEffect(() => {
    setTabs({});
  }, [snapshot]);
  useEffect(() => {
    /** <2026-10-13T15:24:00+07:00> Mục đích: Giữ xử lý key; phần thay đổi giới hạn lịch sử lát 4. */
    const key = event => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  const nodes = useMemo(() => {
    const staging = snapshot?.smp_staging_data || {};
    return (snapshot?.nodes || []).map(node => ({
      ...node,
      draggable: false,
      data: {
        ...node.data,
        ...(staging[node.id]?.full_name ? {
          clanName: staging[node.id].full_name
        } : {}),
        tabs: (node.data?.tabs || []).map(tab => ({
          ...tab,
          ...(staging[tab.unionId]?.full_name ? {
            partnerName: staging[tab.unionId].full_name
          } : {})
        })),
        // <2026-10-22T09:25:00+07:00> Mục đích: Đọc lần theo mã ô. Lý do: ảnh không lưu mã cây, chấm không đổi.
        activeUnionId: tabs[node.id] || tabs[node.data?.treeId] || node.data?.activeUnionId,
        hasChildren: (snapshot?.edges || []).some((edge) => edge.source === node.id),
        collapsed: Boolean(collapsedIds[node.id]),
        onToggleChildren: (nodeId) => setCollapsedIds((old) => ({ ...old, [nodeId]: !old[nodeId] })),
        onOpenActionForm: () => {},
        onTabChange: (key, union) => setTabs(old => ({ ...old, [key]: union, [node.id]: union }))
      }
    }));
  }, [snapshot, tabs, collapsedIds]);
  // <2026-10-18T14:35:00+07:00> Mục đích: Lần đang mở nét liền. Lý do: xem lại trước không đổi nét khi bấm chấm.
  const previewEdges = useMemo(() => {
    const list = snapshot?.edges || [];
    const byPair = new Map();
    list.forEach((edge) => {
      const parent = nodes.find((node) => node.id === edge.source);
      const active = parent?.data?.activeUnionId;
      const belongsToOpen = Boolean(active) && (edge.sourceHandle === `union:${active}:children` || edge.data?.unionId === active);
      const drawn = belongsToOpen
        ? { ...edge, sourceHandle: `union:${active}:children`, style: { stroke: '#6366f1', strokeWidth: 2 } }
        : { ...edge, sourceHandle: 'owner:unassigned', style: { stroke: '#f59e0b', strokeWidth: 2, strokeDasharray: '4 4' } };
      const key = `${edge.source}:${edge.target}`;
      if (!byPair.has(key) || belongsToOpen) byPair.set(key, drawn);
    });
    return [...byPair.values()];
  }, [snapshot, nodes]);
  if (!snapshot) return null;
  return createPortal(<div className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-900/60 p-3" role="dialog" aria-modal="true" aria-labelledby="mfo-history-title">
    <section className="flex h-[85dvh] w-full max-w-[640px] flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
      <div className="flex items-center justify-between gap-3 border-b p-3"><h2 id="mfo-history-title" className="font-bold">{title}</h2><button type="button" className="min-h-12 rounded-xl border px-4 font-bold" onClick={onClose}>Đóng</button></div>
      {/* 2026-10-18T07:37:00+07:00 Muc dich: Nhom nut nam ngang, ngoai khung canvas. Ly do: nam trong khung va dung doc. */}
      <div className="flex justify-center border-b py-2">
        <div className="flex items-center gap-1 rounded-xl border border-slate-300 bg-white p-1">
          <button type="button" className="min-h-10 min-w-10 rounded-lg text-lg font-bold" onClick={() => flowRef.current?.zoomIn?.()}>+</button>
          <button type="button" className="min-h-10 min-w-10 rounded-lg text-sm font-bold" onClick={() => flowRef.current?.fitView?.({ padding: 0.08 })}>[ ]</button>
          <button type="button" className="min-h-10 min-w-10 rounded-lg text-lg font-bold" onClick={() => flowRef.current?.zoomOut?.()}>−</button>
        </div>
      </div>
      <div className="min-h-0 flex-1"><ReactFlow onInit={(instance) => { flowRef.current = instance; }} nodes={nodes.filter((node) => { const hidden = new Set(); const walk = (id) => (snapshot?.edges || []).filter((item) => item.source === id).forEach((item) => { if (!hidden.has(item.target)) { hidden.add(item.target); walk(item.target); } }); Object.keys(collapsedIds).filter((id) => collapsedIds[id]).forEach(walk); return !hidden.has(node.id); })} edges={previewEdges.filter((edge) => { const hidden = new Set(); const walk = (id) => (snapshot?.edges || []).filter((item) => item.source === id).forEach((item) => { if (!hidden.has(item.target)) { hidden.add(item.target); walk(item.target); } }); Object.keys(collapsedIds).filter((id) => collapsedIds[id]).forEach(walk); return !hidden.has(edge.source) && !hidden.has(edge.target); })} nodeTypes={nodeTypes} nodesDraggable={false} nodesConnectable={false} elementsSelectable={true} panOnDrag={true} fitView={!snapshot.viewport} defaultViewport={snapshot.viewport || {
          x: 0,
          y: 0,
          zoom: 0.82
        }} minZoom={0.1} maxZoom={2.5} zoomOnDoubleClick={false}>
        <Background color="#cbd5e1" gap={20} size={1} />      </ReactFlow></div>
    </section></div>, document.body);
}
