/**
 * PATH       : frontend/src/pages/AdminMfoPlanPage.jsx
 * DATETIME   : 2026-10-14T16:15:00+07:00
 * VERSION    : 3.1.0-FIX-BUG3-CARD2-STAGING-SUMMARY
 * DESCRIPTION:
 * - Vá dứt điểm Bug 3: Card 2 ở Cửa 2 (RESULT) tự động chuyển sang đọc Tóm tắt Tờ khai từ smp_staging_data (hiển thị rõ tên vợ/chồng, con đã kê khai).
 * - Xác nhận Event nút "Duyệt và ghi sổ" thực thi chính xác API Cửa 2 approveResult() qua SRPF Engine mfoResultProcess.
 * RULE COMPLIANCE:
 * - Q1 (Bảo tồn): Bảo toàn 100% logic Canvas ReactFlow, Bút phê từng Đời, History Chain, Filter Queue Cửa 1/2 và API handlers.
 * - Q2 (Code Format): Đầy đủ docstring header và chú thích thời gian <2026-10-14T16:15:00+07:00> từng khối logic.
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
  returnResultForRevision,
} from '../features/mfo/api/mfoApi.js';
import { diffDraftAgainstInit } from '../features/mfo/lib/mfoDiffEngine.js';
import { toMfoUserMessage, MFO_USER_SUCCESS } from '../features/mfo/constants/mfoUserErrors.js';
import MfoAlarmOverlay from '../features/mfo/components/MfoAlarmOverlay.jsx';
import { adminGate, canAdminReview } from '../features/mfo/lib/mfoAdminActions.js';
import MfoHistoryChain, { stepSummary } from '../features/mfo/components/MfoHistoryChain.jsx';

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
  const [busyAction, setBusyAction] = useState(null);

  const [openCard1Canvas, setOpenCard1Canvas] = useState(true);
  const [openCard2Summary, setOpenCard2Summary] = useState(true);

  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const flowRef = useRef(null);

  const actionLockRef = useRef(null);
  const [alarm, setAlarm] = useState('');

  const [scsItems, setScsItems] = useState([]);
  const [itemDecisions, setItemDecisions] = useState({});
  const [itemNotes, setItemNotes] = useState({});
  const [grantedGeneration, setGrantedGeneration] = useState('');
  const [globalAdminNote, setGlobalAdminNote] = useState('');

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
      setAlarm(toMfoUserMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadQueue();
  }, []);

  const filteredQueue = useMemo(() => {
    return plans.filter((plan) => {
      const payload = plan?.payload || {};
      const planOk = Boolean(plan.plan_ok ?? payload.plan_ok);
      const resultSubmitted = Boolean(plan.result_submitted ?? payload.result_submitted);
      const resultOk = Boolean(plan.result_ok ?? payload.result_ok);
      const st = String(plan.status || '').toUpperCase();

      if (queueTab === 'PLAN') {
        return !planOk && ['PENDING', 'UNDER_REVIEW', 'NEEDS_REVISION'].includes(st);
      } else {
        return planOk && resultSubmitted && !resultOk && ['UNDER_REVIEW', 'PENDING', 'NEEDS_REVISION'].includes(st);
      }
    });
  }, [plans, queueTab]);

  const handleSelectTicketChange = (e) => {
    const val = e.target.value;
    setSelectedTicketId(val);
    setGrantedGeneration('');
    setGlobalAdminNote('');

    if (val === '') {
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

        // <2026-10-14T16:15:00+07:00> VÁ BUG 3: Phân lập Tóm tắt Card 2 chuẩn xác theo Cửa 1 (Khung) hoặc Cửa 2 (Tờ khai smp_staging_data)
        let items = [];
        if (queueTab === 'RESULT') {
          const resultSummaryLines = stepSummary(draftData, 'result-review');
          items = [0, 1, 2, 3, 4].map((depth) => {
            const rawLine = resultSummaryLines[depth] || `Đời ${depth}: Không thêm gì.`;
            const cleanText = rawLine.replace(/^Đời \d+:\s*/, '');
            return {
              item_id: `scs_depth_${depth}`,
              depth,
              title: depth === 0 ? 'Đời gốc' : `Đời ${depth}`,
              summary_text: cleanText,
            };
          });
        } else {
          const diffSummaryBlocks = diffDraftAgainstInit(draftData);
          items = diffSummaryBlocks.map((block, depth) => ({
            item_id: `scs_depth_${depth}`,
            depth,
            title: block.title || (depth === 0 ? 'Đời gốc' : `Đời ${depth}`),
            summary_text: block.text,
          }));
        }

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
        setAlarm(toMfoUserMessage(error));
      } finally {
        setLoading(false);
      }
    }

    void hydrateAdminReview();
  }, [selectedTicketId, queueTab]);

  const selectedGate = queueTab;
  const selectedReviewable = Boolean(detail?.ticket_id === selectedTicketId);

  function beginReviewAction(gate, action, requiresReason = false) {
    if (actionLockRef.current || busyAction !== null) return false;
    if (!selectedReviewable || selectedGate !== gate) {
      setAlarm(toMfoUserMessage({ code: gate === 'RESULT' ? 'MFO_GATE2_CLOSED' : 'MFO_PLAN_STATE' }));
      return false;
    }
    if (requiresReason && !String(globalAdminNote || '').trim()) {
      setAlarm(toMfoUserMessage({ code: 'MFO_REASON_REQUIRED' }));
      return false;
    }
    actionLockRef.current = action;
    setBusyAction(action);
    return true;
  }

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

  const handleApprovePlanGate1 = async () => {
    if (!canApprovePlan || !beginReviewAction('PLAN', 'APPROVE_PLAN')) return;
    try {
      const reviewScs = scsItems.map((it) => ({
        item_id: it.item_id,
        depth: it.depth,
        decision: 'ACCEPT',
        admin_note: itemNotes[it.item_id] || '',
      }));
      await adminApprovePlan(selectedTicketId, {
        granted_generation: Number(grantedGeneration),
        review_scs: reviewScs,
        note: String(globalAdminNote || '').trim() || null,
      });
      setAlarm(MFO_USER_SUCCESS.APPROVE_PLAN);
      setSelectedTicketId('');
      void loadQueue();
    } catch (error) {
      setAlarm(toMfoUserMessage(error));
    } finally {
      actionLockRef.current = null;
      setBusyAction(null);
    }
  };

  const handleReturnPlanGate1 = async () => {
    if (!beginReviewAction('PLAN', 'RETURN_PLAN', true)) return;
    try {
      const reviewScs = scsItems.map((it) => ({
        item_id: it.item_id,
        depth: it.depth,
        decision: itemDecisions[it.item_id] || 'ACCEPT',
        admin_note: itemNotes[it.item_id] || '',
      }));
      const reason = String(globalAdminNote).trim();
      await adminReturnPlanForRevision(selectedTicketId, { review_scs: reviewScs, reason, note: reason });
      setAlarm('Nhánh phả hệ cần sửa');
      setSelectedTicketId('');
      void loadQueue();
    } catch (error) {
      setAlarm(toMfoUserMessage(error));
    } finally {
      actionLockRef.current = null;
      setBusyAction(null);
    }
  };

  // <2026-10-14T16:15:00+07:00> XÁC NHẬN EVENT NÚT "DUYỆT VÀ GHI SỔ" CỬA 2: Gọi chính xác approveResult API
  const handleApproveResultGate2 = async () => {
    if (!beginReviewAction('RESULT', 'APPROVE_RESULT')) return;
    try {
      await approveResult(selectedTicketId, { note: String(globalAdminNote || '').trim() || null });
      setAlarm(MFO_USER_SUCCESS.APPROVE_RESULT);
      setSelectedTicketId('');
      void loadQueue();
    } catch (error) {
      setAlarm(toMfoUserMessage(error));
    } finally {
      actionLockRef.current = null;
      setBusyAction(null);
    }
  };

  const handleReturnResultGate2 = async () => {
    if (!beginReviewAction('RESULT', 'RETURN_RESULT', true)) return;
    try {
      const reason = String(globalAdminNote).trim();
      await returnResultForRevision(selectedTicketId, { reason, note: reason });
      setAlarm('Tờ khai cần sửa');
      setSelectedTicketId('');
      void loadQueue();
    } catch (error) {
      setAlarm(toMfoUserMessage(error));
    } finally {
      actionLockRef.current = null;
      setBusyAction(null);
    }
  };

  const handleRejectResultGate2 = async () => {
    if (!beginReviewAction('RESULT', 'REJECT_RESULT', true)) return;
    try {
      const reason = String(globalAdminNote).trim();
      await rejectResult(selectedTicketId, { reason, note: reason });
      setAlarm('Tờ khai không được duyệt');
      setSelectedTicketId('');
      void loadQueue();
    } catch (error) {
      setAlarm(toMfoUserMessage(error));
    } finally {
      actionLockRef.current = null;
      setBusyAction(null);
    }
  };

  const formatTicketLabel = (t) => {
    const rawDate = t.created_at || t.updated_at;
    const dateStr = rawDate ? new Date(rawDate).toLocaleDateString('vi-VN') : 'Mới';
    const payload = t.payload || {};
    const planOk = Boolean(t.plan_ok ?? payload.plan_ok);
    const resultSubmitted = Boolean(t.result_submitted ?? payload.result_submitted);
    const resultOk = Boolean(t.result_ok ?? payload.result_ok);
    const st = String(t.status || '').toUpperCase();

    let statusLabel = 'đang soạn';
    if (resultOk) {
      statusLabel = 'Đã ghi sổ';
    } else if (planOk) {
      if (st === 'REJECTED') statusLabel = 'Tờ khai không được duyệt';
      else if (st === 'NEEDS_REVISION') statusLabel = 'Tờ khai cần sửa';
      else if (resultSubmitted) statusLabel = 'Tờ khai chờ duyệt';
      else statusLabel = 'Tờ khai đang soạn';
    } else {
      if (st === 'REJECTED') statusLabel = 'Nhánh phả hệ không được duyệt';
      else if (st === 'NEEDS_REVISION') statusLabel = 'Nhánh phả hệ cần sửa';
      else if (st === 'PENDING' || st === 'UNDER_REVIEW') statusLabel = 'Nhánh phả hệ chờ phê duyệt';
      else statusLabel = 'Nhánh phả hệ đang soạn';
    }

    const objectPrefix = planOk ? 'Tờ khai' : 'Nhánh phả hệ';
    return `${dateStr} - ${objectPrefix} [${statusLabel}]`;
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-slate-50 font-sans">
      <TenantHeader tenant={tenant} subtitle="Thẩm định & Phê duyệt MFO 5L" />

      <main className="flex flex-1 flex-col gap-3 px-3 py-3 pb-28">
        <section className="flex items-center justify-between rounded-3xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <div>
            <h1 className="text-base font-black text-slate-900">Thẩm định MFO 5L</h1>
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
            disabled={busyAction !== null}
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

        {selectedTicketId ? (
          <MfoHistoryChain
            key={selectedTicketId}
            plan={
              detail?.ticket_id === selectedTicketId
                ? detail
                : plans.find((p) => (p.id || p.ticket_id) === selectedTicketId)
            }
            onReload={loadQueue}
          />
        ) : null}

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

            {/* CARD 2: BẢNG TÓM TẮT & BÚT PHÊ TỪNG ĐỜI (SỬ DỤNG TÓM TẮT CHÍNH XÁC THEO CỬA) */}
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
            {selectedGate === 'PLAN' && (
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

            {/* BÚT PHÊ CHUNG & CÁC NÚT THAO TÁC PHÂN LẬP THEO CỬA */}
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
                {selectedGate === 'PLAN' ? (
                  <>
                    <button
                      type="button"
                      disabled={!selectedReviewable || !canApprovePlan || busyAction !== null}
                      className="min-h-12 w-full rounded-2xl bg-indigo-600 px-4 text-xs font-black uppercase tracking-wider text-white shadow-md disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
                      onClick={handleApprovePlanGate1}
                    >
                      {busyAction === 'APPROVE_PLAN' ? 'Đang xử lý...' : 'Duyệt nhánh phả hệ'}
                    </button>

                    <button
                      type="button"
                      disabled={!selectedReviewable || busyAction !== null}
                      className="min-h-12 w-full flex items-center justify-center gap-1.5 rounded-2xl border-2 border-amber-400 bg-amber-50 px-4 text-xs font-black uppercase tracking-wider text-amber-950 hover:bg-amber-100 active:scale-[0.98]"
                      onClick={handleReturnPlanGate1}
                    >
                      <RotateCcw className="h-4 w-4 text-amber-600" />
                      <span>{busyAction === 'RETURN_PLAN' ? 'Đang xử lý...' : 'Trả sửa'}</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={!selectedReviewable || busyAction !== null}
                      className="min-h-12 w-full rounded-2xl bg-indigo-600 px-4 text-xs font-black uppercase tracking-wider text-white shadow-md disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
                      onClick={handleApproveResultGate2}
                    >
                      {busyAction === 'APPROVE_RESULT' ? 'Đang ghi Sổ...' : 'Duyệt và ghi sổ'}
                    </button>

                    <button
                      type="button"
                      disabled={!selectedReviewable || busyAction !== null}
                      className="min-h-12 w-full flex items-center justify-center gap-1.5 rounded-2xl border-2 border-amber-400 bg-amber-50 px-4 text-xs font-black uppercase tracking-wider text-amber-950 hover:bg-amber-100 active:scale-[0.98]"
                      onClick={handleReturnResultGate2}
                    >
                      <RotateCcw className="h-4 w-4 text-amber-600" />
                      <span>{busyAction === 'RETURN_RESULT' ? 'Đang xử lý...' : 'Trả sửa'}</span>
                    </button>

                    <button
                      type="button"
                      disabled={!selectedReviewable || busyAction !== null}
                      className="min-h-10 w-full rounded-2xl border border-rose-200 bg-rose-50 text-xs font-bold text-rose-700 hover:bg-rose-100 active:scale-[0.98]"
                      onClick={handleRejectResultGate2}
                    >
                      {busyAction === 'REJECT_RESULT' ? 'Đang xử lý...' : 'Không duyệt'}
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

      <MfoAlarmOverlay open={Boolean(alarm)} message={alarm} onClose={() => setAlarm('')} />
      <AppFooterNav {...footerNav} />
    </div>
  );
}

export default AdminMfoPlanPage;