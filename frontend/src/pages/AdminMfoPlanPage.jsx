/**
 * PATH       : frontend/src/pages/AdminMfoPlanPage.jsx
 * DATETIME   : 2026-10-09T23:30:00+07:00
 * VERSION    : 2.8.0-LAT4-GATE2-BUTTONS
 * DESCRIPTION:
 * - Lát 4. Nút chốt sổ gọi approveResult. Nút trả sửa gọi rejectResult.
 * - Bác bỏ vĩnh viễn cửa 2 chưa có route riêng, không gọi rejectPlan.
 */

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactFlow, { Background, Controls } from 'reactflow';
import 'reactflow/dist/style.css';
import {
  ChevronDown,
  ChevronUp,
  CheckCircle,
  XCircle,
  RotateCcw,
  Eye,
  FileText,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { mfoToast } from '../features/mfo/lib/mfoToastVoice.js';

import { useAuth } from '../context/AuthContext.jsx';
import TenantHeader from '../components/shell/TenantHeader.jsx';
import AppFooterNav from '../components/shell/AppFooterNav.jsx';
import AudioHelpButton from '../features/elder-doctrine/components/AudioHelpButton.jsx';
import FamilyCoupleNode from '../features/genealogy/components/FamilyCoupleNode.jsx';
import { resolveTenant } from '../lib/resolveTenant.js';
import { resolveFooterNav } from '../lib/resolveFooterNav.js';
import {
  adminGetReviewQueue,
  getDraftPayload,
  adminApprovePlan,
  adminReturnPlanForRevision,
  approveResult,
  rejectResult,
} from '../features/mfo/api/mfoApi.js';
import { diffDraftAgainstInit } from '../features/mfo/lib/mfoDiffEngine.js';
import { toMfoUserMessage } from '../features/mfo/constants/mfoUserErrors.js';

function EmptyCoupleNodeReadonly({ data }) {
  const depth = Number.isInteger(Number(data?.depth)) ? Number(data.depth) : 0;
  return (
    <div className="flex min-h-[72px] w-[180px] select-none items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-center text-slate-500 shadow-sm">
      <span>
        <span className="block text-xs font-black">{data?.label || `Đời ${depth}`}</span>
        <span className="mt-1 block text-[10px] font-bold text-slate-400">(Trống)</span>
      </span>
    </div>
  );
}

function FamilyCoupleFlowNodeReadonly({ id, data }) {
  return (
    <div style={{ width: 240 }} className="pointer-events-auto">
      <FamilyCoupleNode id={id} data={data} />
    </div>
  );
}

const nodeTypes = {
  familyCouple: FamilyCoupleFlowNodeReadonly,
  emptyNode: EmptyCoupleNodeReadonly,
};

export function AdminMfoPlanPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const tenant = resolveTenant(user);
  const footerNav = resolveFooterNav(user, {
    pageKey: 'admin-mfo-plan',
    backTo: '/admin',
    showBack: true,
  });

  const [queueTab, setQueueTab] = useState('PLAN');
  const [plans, setPlans] = useState([]);
  const [selectedTicketId, setSelectedTicketId] = useState('');
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState(null); // 👈 TÁCH BIỆT TRẠNG THÁI BUSY THEO HÀNH ĐỘNG

  const [openCard1Canvas, setOpenCard1Canvas] = useState(true);
  const [openCard2Summary, setOpenCard2Summary] = useState(true);

  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const flowRef = useRef(null);

  const [scsItems, setScsItems] = useState([]);
  const [itemDecisions, setItemDecisions] = useState({});
  const [itemNotes, setItemNotes] = useState({});
  const [grantedGeneration, setGrantedGeneration] = useState('');
  const [globalAdminNote, setGlobalAdminNote] = useState('');

  /**
   * <2026-10-09T23:30:00+07:00> - Nạp Hàng đợi Thẩm định
   */
  const loadQueue = async () => {
    try {
      setLoading(true);
      const res = await adminGetReviewQueue();
      const rawList = res?.data || res || [];
      const list = Array.isArray(rawList) ? rawList : [];

      const queueList = list.filter((item) => {
        const st = String(item.status || '').toUpperCase();
        return st !== 'DRAFT' && st !== 'WITHDRAWN';
      });

      setPlans(queueList);
    } catch (error) {
      console.error('[ADMIN_LOAD_QUEUE_ERROR]', error);
      mfoToast.error('Lỗi khi nạp hàng đợi: ' + toMfoUserMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadQueue();
  }, []);

  const filteredQueue = useMemo(() => {
    return plans.filter((p) => {
      const st = String(p.status || '').toUpperCase();
      if (queueTab === 'PLAN') {
        return st === 'PENDING' || st === 'UNDER_REVIEW' || st === 'NEEDS_REVISION';
      }
      return p.result_submitted === true;
    });
  }, [plans, queueTab]);

  /**
   * <2026-10-09T23:30:00+07:00> - Xử lý Chọn Dropdown (Bấm "Bấm để chọn" -> Refresh List)
   */
  const handleSelectTicketChange = (e) => {
    const val = e.target.value;
    setSelectedTicketId(val);

    // KHI BẤM "BẤM ĐỂ CHỌN" (val === '') -> REFRESH HÀNG ĐỢI TỪ MÁY CHỦ
    if (val === '') {
      mfoToast.info('Đang làm mới danh sách hàng đợi...');
      void loadQueue();
    }
  };

  useEffect(() => {
    if (!selectedTicketId) {
      setDetail(null);
      setNodes([]);
      setEdges([]);
      setScsItems([]);
      setItemDecisions({});
      setItemNotes({});
      return;
    }

    async function hydrateAdminReview() {
      try {
        setLoading(true);

        const res = await getDraftPayload(selectedTicketId);
        const draftData = res?.data || res;

        if (!draftData) return;
        setDetail(draftData);

        const snapshot =
          draftData.graph_snapshot ||
          draftData.ui_render_snapshot_layer?.graph_snapshot ||
          draftData.payload?.graph_snapshot ||
          draftData.payload?.ui_render_snapshot_layer?.graph_snapshot;
        if (snapshot && Array.isArray(snapshot.nodes) && snapshot.nodes.length > 0) {
          setNodes(
            snapshot.nodes.map((n) => ({
              ...n,
              style: { width: 240 },
              data: { ...n.data, onOpenActionForm: () => {} },
            }))
          );
          if (Array.isArray(snapshot.edges)) {
            setEdges(snapshot.edges);
          }
        } else {
          setNodes([]);
          setEdges([]);
        }

        const diffSummaryBlocks = diffDraftAgainstInit(draftData);

        const items = diffSummaryBlocks.map((block, depth) => ({
          item_id: `scs_depth_${depth}`,
          depth,
          title: block.title || `Đời ${depth}`,
          summary_text: block.text,
        }));

        setScsItems(items);

        const initialDecisions = {};
        const initialNotes = {};
        items.forEach((it) => {
          initialDecisions[it.item_id] = 'ACCEPT';
          initialNotes[it.item_id] = '';
        });

        setItemDecisions(initialDecisions);
        setItemNotes(initialNotes);
        if (draftData.granted_generation != null) {
          setGrantedGeneration(String(draftData.granted_generation));
        }
      } catch (error) {
        console.error('===> [ADMIN_HYDRATE_ERROR]', error);
        mfoToast.error('Lỗi khi khôi phục dữ liệu tờ trình: ' + toMfoUserMessage(error));
      } finally {
        setLoading(false);
      }
    }

    void hydrateAdminReview();
  }, [selectedTicketId]);

  const isAllAccepted = useMemo(() => {
    if (!scsItems.length) return true;
    return scsItems.every((it) => itemDecisions[it.item_id] === 'ACCEPT');
  }, [scsItems, itemDecisions]);

  const canApprovePlan = useMemo(() => {
    const gen = Number(grantedGeneration);
    return isAllAccepted && Number.isInteger(gen) && gen >= 1;
  }, [isAllAccepted, grantedGeneration]);

  const handleDecisionToggle = (itemId, decision) => {
    setItemDecisions((prev) => ({ ...prev, [itemId]: decision }));
  };

  const handleNoteChange = (itemId, note) => {
    setItemNotes((prev) => ({ ...prev, [itemId]: note }));
  };

  /**
   * <2026-10-09T23:30:00+07:00> - CỬA 1 (GATE 1): PHÊ DUYỆT KHUNG 5L
   */
  const handleApprovePlanGate1 = async () => {
    if (!canApprovePlan) return;
    try {
      setBusyAction('APPROVE_PLAN');
      const reviewScs = scsItems.map((it) => ({
        item_id: it.item_id,
        decision: 'ACCEPT',
        admin_note: itemNotes[it.item_id] || '',
      }));

      await adminApprovePlan(selectedTicketId, {
        granted_generation: Number(grantedGeneration),
        review_scs: reviewScs,
        note: globalAdminNote || 'Đã phê duyệt Khung 5L.',
      });

      mfoToast.success('Đã phê duyệt Khung 5L và cấp tem plan_ok thành công!');
      setSelectedTicketId('');
      void loadQueue();
    } catch (error) {
      mfoToast.error('Lỗi khi duyệt Khung: ' + toMfoUserMessage(error));
    } finally {
      setBusyAction(null);
    }
  };

  /**
   * <2026-10-09T23:30:00+07:00> - CỬA 1 (GATE 1): KHÔNG DUYỆT / YÊU CẦU SỬA KHUNG
   */
  const handleReturnPlanGate1 = async () => {
    const reasonText = String(globalAdminNote || '').trim();
    if (!reasonText) {
      mfoToast.error('Vui lòng nhập Bút phê lý do không duyệt vào ô Bút phê tổng thể Admin!');
      return;
    }

    try {
      setBusyAction('RETURN_PLAN');
      const reviewScs = scsItems.map((it) => ({
        item_id: it.item_id,
        decision: itemDecisions[it.item_id] || 'ACCEPT',
        admin_note: itemNotes[it.item_id] || '',
      }));

      await adminReturnPlanForRevision(selectedTicketId, {
        review_scs: reviewScs,
        reason: reasonText,
        note: reasonText,
      });

      mfoToast.warning('Đã trả hồ sơ Khung về trạng thái NEEDS_REVISION kèm bút phê.');
      setSelectedTicketId('');
      void loadQueue();
    } catch (error) {
      mfoToast.error('Lỗi khi không duyệt Khung: ' + toMfoUserMessage(error));
    } finally {
      setBusyAction(null);
    }
  };

  /**
   * <2026-10-09T23:30:00+07:00> - CỬA 2 (GATE 2): PHÊ DUYỆT NGHIỆM THU TỜ KHAI
   */
  const handleApproveResultGate2 = async () => {
    try {
      setBusyAction('APPROVE_RESULT');
      await approveResult(selectedTicketId, {
        note: globalAdminNote || 'Đã phê duyệt Nghiệm thu Tờ khai và chính thức ghi Sổ họ.',
      });

      mfoToast.success('Đã phê duyệt Nghiệm thu Tờ khai và chính thức ghi Sổ họ thành công!');
      setSelectedTicketId('');
      void loadQueue();
    } catch (error) {
      mfoToast.error('Lỗi khi phê duyệt Nghiệm thu: ' + toMfoUserMessage(error));
    } finally {
      setBusyAction(null);
    }
  };

  /**
   * <2026-10-09T23:30:00+07:00> - CỬA 2 (GATE 2): TRẢ VỀ YÊU CẦU SỬA TỜ KHAI
   */
  const handleReturnResultGate2 = async () => {
    const reasonText = String(globalAdminNote || '').trim();
    if (!reasonText) {
      mfoToast.error('Vui lòng nhập lý do yêu cầu sửa Tờ khai vào ô Bút phê tổng thể Admin!');
      return;
    }

    try {
      setBusyAction('RETURN_RESULT');
      await rejectResult(selectedTicketId, {
        reason: reasonText,
        note: reasonText,
      });

      mfoToast.warning('Đã trả Tờ khai Nghiệm thu về trạng thái sửa đổi (NEEDS_REVISION).');
      setSelectedTicketId('');
      void loadQueue();
    } catch (error) {
      mfoToast.error('Lỗi khi trả Tờ khai: ' + toMfoUserMessage(error));
    } finally {
      setBusyAction(null);
    }
  };

  /**
   * <2026-10-09T23:30:00+07:00> - CỬA 2 (GATE 2): BÁC BỎ VĨNH VIỄN TỜ KHAI
   */
  const handleRejectResultGate2 = async () => {
    const reasonText = String(globalAdminNote || '').trim();
    if (!reasonText) {
      mfoToast.error('Vui lòng nhập lý do bác bỏ vĩnh viễn vào ô Bút phê tổng thể Admin!');
      return;
    }

    try {
      setBusyAction('REJECT_RESULT');
      mfoToast.error('Cửa 2 chưa có route bác bỏ vĩnh viễn. result/reject hiện là trả sửa, không gọi rejectPlan.');
      return;
    } catch (error) {
      const errMsg = error.response?.data?.message || error.message || 'Lỗi hệ thống';
      mfoToast.error('Lỗi khi bác bỏ: ' + errMsg);
    } finally {
      setBusyAction(null);
    }
  };

  const formatTicketLabel = (t) => {
    const rawDate = t.created_at || t.updated_at;
    const dateStr = rawDate ? new Date(rawDate).toLocaleDateString('vi-VN') : 'Mới';
    const st = String(t.status || '').toUpperCase();
    return `${dateStr} - Khung [${st}]`;
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-slate-50 font-sans">
      <TenantHeader tenant={tenant} subtitle="Thẩm định & Phê duyệt Khung 5L" />

      <main className="flex flex-1 flex-col gap-3 px-3 py-3 pb-28">
        <section className="flex items-center justify-between rounded-3xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <div>
            <h1 className="text-base font-black text-slate-900">Thẩm định Khung 5L</h1>
            <p className="text-xs text-slate-500">Soi từng biến đổi &amp; bút phê chính thức</p>
          </div>
          <AudioHelpButton text="Giao diện thẩm định khung 5L dành cho Quản trị viên." label="Hướng dẫn" />
        </section>

        {/* TAB LOẠI HÀNG ĐỢI */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className={`min-h-12 rounded-2xl text-xs font-black uppercase tracking-wider transition-all ${
              queueTab === 'PLAN'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'border border-slate-200 bg-white text-slate-600'
            }`}
            onClick={() => {
              setQueueTab('PLAN');
              setSelectedTicketId('');
            }}
          >
            Khung đề xuất (PLAN - Gate 1)
          </button>
          <button
            type="button"
            className={`min-h-12 rounded-2xl text-xs font-black uppercase tracking-wider transition-all ${
              queueTab === 'RESULT'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'border border-slate-200 bg-white text-slate-600'
            }`}
            onClick={() => {
              setQueueTab('RESULT');
              setSelectedTicketId('');
            }}
          >
            Nghiệm thu (RESULT - Gate 2)
          </button>
        </div>

        {/* DROPDOWN DANH SÁCH CHỜ DUYỆT */}
        <section className="rounded-3xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <label className="block text-xs font-extrabold uppercase text-slate-700 mb-2">
            Chọn tờ trình trong hàng đợi:
          </label>
          <select
            className="w-full rounded-2xl border-2 border-indigo-200 bg-indigo-50/50 p-3 text-sm font-bold text-indigo-950 outline-none focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100"
            value={selectedTicketId}
            onChange={handleSelectTicketChange}
          >
            <option value="">-- Bấm để chọn hồ sơ --</option>
            {filteredQueue.map((t) => (
              <option key={t.id || t.ticket_id} value={t.id || t.ticket_id}>
                {formatTicketLabel(t)}
              </option>
            ))}
          </select>

          {filteredQueue.length === 0 && (
            <p className="mt-2 text-center text-xs font-semibold text-slate-400">
              Không có hồ sơ nào đang chờ duyệt trong hàng đợi này.
            </p>
          )}
        </section>

        {loading && (
          <div className="flex items-center justify-center gap-2 p-6 text-xs font-bold text-indigo-600">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>Đang tải lại sơ đồ Canvas từ Hệ thống...</span>
          </div>
        )}

        {/* CHI TIẾT TỜ TRÌNH HIỂN THỊ TRÊN 2 CARD */}
        {detail && !loading && (
          <div className="flex flex-col gap-3">
            {/* CARD 1: ĐỒ HOẠ CÂY 5L */}
            <section className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <button
                type="button"
                className="flex w-full items-center justify-between p-3.5 bg-slate-50 border-b border-slate-200 hover:bg-slate-100/80 transition-all"
                onClick={() => setOpenCard1Canvas((prev) => !prev)}
              >
                <div className="flex items-center gap-2 text-indigo-900">
                  <Eye className="h-4 w-4 text-indigo-600" />
                  <span className="text-xs font-black uppercase tracking-wider">
                    Card 1: Sơ đồ Đồ họa Canvas 5L
                  </span>
                </div>
                {openCard1Canvas ? (
                  <ChevronUp className="h-4 w-4 text-slate-500" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-slate-500" />
                )}
              </button>

              {openCard1Canvas && (
                <div className="relative h-[380px] w-full border-b border-slate-100 bg-white">
                  {nodes.length > 0 ? (
                    <ReactFlow
                      nodes={nodes}
                      edges={edges}
                      nodeTypes={nodeTypes}
                      onInit={(instance) => {
                        flowRef.current = instance;
                        setTimeout(() => instance.fitView({ padding: 0.08 }), 120);
                      }}
                      fitView={true}
                      fitViewOptions={{ padding: 0.08 }}
                      minZoom={0.1}
                      maxZoom={2.5}
                      nodesDraggable={false}
                      nodesConnectable={false}
                      elementsSelectable={false}
                      panOnDrag={true}
                      zoomOnScroll={true}
                    >
                      <Background color="#cbd5e1" gap={20} size={1} />
                      <Controls showInteractive={false} position="bottom-left" />
                    </ReactFlow>
                  ) : (
                    <div className="flex h-full items-center justify-center p-6 text-center text-xs font-bold text-slate-400">
                      Bản nháp này chưa có dữ liệu đồ họa snapshot.
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* CARD 2: BẢNG TÓM TẮT & BÚT PHÊ TỪNG ĐỜI */}
            <section className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <button
                type="button"
                className="flex w-full items-center justify-between p-3.5 bg-slate-50 border-b border-slate-200 hover:bg-slate-100/80 transition-all"
                onClick={() => setOpenCard2Summary((prev) => !prev)}
              >
                <div className="flex items-center gap-2 text-indigo-900">
                  <FileText className="h-4 w-4 text-indigo-600" />
                  <span className="text-xs font-black uppercase tracking-wider">
                    Card 2: Tóm tắt &amp; Bút phê từng Đời ({scsItems.length} Đời)
                  </span>
                </div>
                {openCard2Summary ? (
                  <ChevronUp className="h-4 w-4 text-slate-500" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-slate-500" />
                )}
              </button>

              {openCard2Summary && (
                <div className="p-3.5 flex flex-col gap-3">
                  {scsItems.map((it, idx) => {
                    const decision = itemDecisions[it.item_id] || 'ACCEPT';
                    return (
                      <div
                        key={it.item_id || idx}
                        className={`rounded-2xl border p-3 text-xs transition-all ${
                          decision === 'ACCEPT'
                            ? 'border-emerald-200 bg-emerald-50/40'
                            : 'border-rose-200 bg-rose-50/40'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex-1">
                            <span className="inline-block rounded-md bg-slate-900 px-2 py-0.5 text-[10px] font-black text-white mr-1.5">
                              {it.title || `Đời ${it.depth ?? idx}`}
                            </span>
                            <span className="font-extrabold text-slate-900 leading-relaxed">
                              {it.summary_text}
                            </span>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              className={`flex items-center gap-1 rounded-xl px-2.5 py-1 text-[10px] font-black transition-all ${
                                decision === 'ACCEPT'
                                  ? 'bg-emerald-600 text-white shadow-sm'
                                  : 'bg-white text-slate-500 border border-slate-200'
                              }`}
                              onClick={() => handleDecisionToggle(it.item_id, 'ACCEPT')}
                            >
                              <CheckCircle className="h-3 w-3" />
                              Duyệt
                            </button>
                            <button
                              type="button"
                              className={`flex items-center gap-1 rounded-xl px-2.5 py-1 text-[10px] font-black transition-all ${
                                decision === 'REJECT'
                                  ? 'bg-rose-600 text-white shadow-sm'
                                  : 'bg-white text-slate-500 border border-slate-200'
                              }`}
                              onClick={() => handleDecisionToggle(it.item_id, 'REJECT')}
                            >
                              <XCircle className="h-3 w-3" />
                              Không
                            </button>
                          </div>
                        </div>

                        <input
                          type="text"
                          placeholder="Bút phê riêng cho đời này (nếu có yêu cầu chỉnh sửa)..."
                          className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs font-medium outline-none focus:border-indigo-500"
                          value={itemNotes[it.item_id] || ''}
                          onChange={(e) => handleNoteChange(it.item_id, e.target.value)}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* CẤU HÌNH ĐỜI TUYỆT ĐỐI (CHỈ BẮT BUỘC Ở GATE 1) */}
            {queueTab === 'PLAN' && (
              <section className="rounded-3xl border border-amber-200 bg-amber-50/50 p-3.5 shadow-sm">
                <h2 className="text-xs font-black uppercase tracking-wider text-amber-950 mb-2 flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-amber-600" />
                  <span>Đời tuyệt đối gia tộc (bắt buộc để tem plan_ok)</span>
                </h2>
                <input
                  type="number"
                  min="1"
                  placeholder="Nhập đời tuyệt đối cho Origin (ví dụ: 12)..."
                  className="w-full rounded-2xl border border-amber-300 bg-white p-3 text-sm font-black text-amber-950 outline-none focus:ring-4 focus:ring-amber-200"
                  value={grantedGeneration}
                  onChange={(e) => setGrantedGeneration(e.target.value)}
                />
              </section>
            )}

            {/* BÚT PHÊ CHUNG & CÁC NÚT THAO TÁC PHÂN LẬP THEO CỬA (AMENDMENT 20261009) */}
            <section className="rounded-3xl border border-slate-200 bg-white p-3.5 shadow-sm space-y-3">
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-800">
                Bút phê tổng thể Admin
              </h2>
              <textarea
                rows={2}
                placeholder="Bút phê tổng thể gửi tới Founder..."
                className="w-full rounded-2xl border border-slate-200 p-3 text-xs font-medium outline-none focus:border-indigo-500"
                value={globalAdminNote}
                onChange={(e) => setGlobalAdminNote(e.target.value)}
              />

              <div className="flex flex-col gap-2 pt-1">
                {/* 🟢 MA TRẬN NÚT BẤM CỬA 1 (GATE 1 - PLAN): CHỈ CÓ 2 NÚT */}
                {queueTab === 'PLAN' ? (
                  <>
                    <button
                      type="button"
                      disabled={!canApprovePlan || busyAction !== null}
                      className="min-h-12 w-full rounded-2xl bg-indigo-600 px-4 text-xs font-black uppercase tracking-wider text-white shadow-md disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
                      onClick={handleApprovePlanGate1}
                    >
                      {busyAction === 'APPROVE_PLAN' ? 'Đang xử lý...' : 'Phê Duyệt Khung 5L (Tem plan_ok)'}
                    </button>

                    <button
                      type="button"
                      disabled={busyAction !== null}
                      className="min-h-12 w-full flex items-center justify-center gap-1.5 rounded-2xl border-2 border-amber-400 bg-amber-50 px-4 text-xs font-black uppercase tracking-wider text-amber-950 hover:bg-amber-100 active:scale-[0.98]"
                      onClick={handleReturnPlanGate1}
                    >
                      <RotateCcw className="h-4 w-4 text-amber-600" />
                      <span>{busyAction === 'RETURN_PLAN' ? 'Đang xử lý...' : 'Không duyệt Khung / Yêu cầu sửa (NEEDS_REVISION)'}</span>
                    </button>
                  </>
                ) : (
                  /* 🔵 MA TRẬN NÚT BẤM CỬA 2 (GATE 2 - RESULT): ĐỦ 3 NÚT */
                  <>
                    <button
                      type="button"
                      disabled={busyAction !== null}
                      className="min-h-12 w-full rounded-2xl bg-indigo-600 px-4 text-xs font-black uppercase tracking-wider text-white shadow-md disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
                      onClick={handleApproveResultGate2}
                    >
                      {busyAction === 'APPROVE_RESULT' ? 'Đang ghi Sổ...' : 'Duyệt Tờ khai Nghiệm thu (Chốt Sổ CSDL)'}
                    </button>

                    <button
                      type="button"
                      disabled={busyAction !== null}
                      className="min-h-12 w-full flex items-center justify-center gap-1.5 rounded-2xl border-2 border-amber-400 bg-amber-50 px-4 text-xs font-black uppercase tracking-wider text-amber-950 hover:bg-amber-100 active:scale-[0.98]"
                      onClick={handleReturnResultGate2}
                    >
                      <RotateCcw className="h-4 w-4 text-amber-600" />
                      <span>{busyAction === 'RETURN_RESULT' ? 'Đang xử lý...' : 'Trả về yêu cầu sửa Tờ khai (NEEDS_REVISION)'}</span>
                    </button>

                    <button
                      type="button"
                      disabled={busyAction !== null}
                      className="min-h-10 w-full rounded-2xl border border-rose-200 bg-rose-50 text-xs font-bold text-rose-700 hover:bg-rose-100 active:scale-[0.98]"
                      onClick={handleRejectResultGate2}
                    >
                      {busyAction === 'REJECT_RESULT' ? 'Đang xử lý...' : 'Bác bỏ / Từ chối vĩnh viễn (REJECTED)'}
                    </button>
                  </>
                )}
              </div>
            </section>
          </div>
        )}

        <button
          type="button"
          className="mt-2 min-h-12 w-full rounded-2xl border border-slate-300 bg-white text-xs font-extrabold text-slate-700 active:bg-slate-100"
          onClick={() => navigate('/admin')}
        >
          Về trang việc quản trị
        </button>
      </main>

      <AppFooterNav {...footerNav} />
    </div>
  );
}

export default AdminMfoPlanPage;