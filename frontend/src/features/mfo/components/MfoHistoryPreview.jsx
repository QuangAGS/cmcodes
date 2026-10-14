/**
 * PATH       : frontend/src/features/mfo/components/MfoHistoryPreview.jsx
 * DATETIME   : 2026-10-13T15:24:00+07:00
 * VERSION    : 1.0.0-LAT4
 * DESCRIPTION: Lớp xem snapshot readonly, state riêng, không điều hướng hoặc đè cây đang soạn.
 * RULE       : Q1 bảo tồn ngoài lịch sử; Q2 metadata và chú thích thời gian.
 */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import ReactFlow, { Background, Controls } from 'reactflow';
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
        activeUnionId: tabs[node.data?.treeId] || node.data?.activeUnionId,
        onOpenActionForm: () => {},
        onTabChange: (id, union) => setTabs(old => ({
          ...old,
          [id]: union
        }))
      }
    }));
  }, [snapshot, tabs]);
  if (!snapshot) return null;
  return createPortal(<div className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-900/60 p-3" role="dialog" aria-modal="true" aria-labelledby="mfo-history-title">
    <section className="flex h-[85dvh] w-full max-w-[640px] flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
      <div className="flex items-center justify-between gap-3 border-b p-3"><h2 id="mfo-history-title" className="font-bold">{title}</h2><button type="button" className="min-h-12 rounded-xl border px-4 font-bold" onClick={onClose}>Đóng</button></div>
      <div className="min-h-0 flex-1"><ReactFlow nodes={nodes} edges={snapshot.edges || []} nodeTypes={nodeTypes} nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} panOnDrag={true} fitView={!snapshot.viewport} defaultViewport={snapshot.viewport || {
          x: 0,
          y: 0,
          zoom: 0.82
        }} minZoom={0.1} maxZoom={2.5} zoomOnDoubleClick={false}>
        <Background color="#cbd5e1" gap={20} size={1} /><Controls showInteractive={false} position="bottom-left" />
      </ReactFlow></div>
    </section></div>, document.body);
}
