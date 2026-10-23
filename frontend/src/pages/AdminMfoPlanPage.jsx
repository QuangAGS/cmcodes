/**
 * PATH       : frontend/src/pages/AdminMfoPlanPage.jsx
 * DATETIME   : 2026-10-23T10:57:00+07:00
 * VERSION    : 2.4.8-GEN-CONFIRM
 * DESCRIPTION:
 * - Vá dứt điểm Bug 3: Card 2 ở Cửa 2 (RESULT) tự động chuyển sang đọc Tóm tắt Tờ khai từ smp_staging_data (hiển thị rõ tên vợ/chồng, con đã kê khai).
 * - Xác nhận Event nút "Duyệt và ghi sổ" thực thi chính xác API Cửa 2 approveResult() qua SRPF Engine mfoResultProcess.
 * - Bộ lọc chỉ còn trạng thái, có Tất cả.
 *
 * CHANGE LOG:
 * - 2026-10-18T15:24:00+07:00 | 2.4.5 | Trả sửa không làm nút Duyệt hiện Đang duyệt.
 * - 2026-10-23T09:31:00+07:00 | 2.4.6 | Thêm vòng quay trên cùng khi bận. Giữ chữ nút. Lý do: đang xử lý không được hiện trên nút Duyệt.
 * - 2026-10-23T10:24:00+07:00 | 2.4.7 | Chuyển vòng quay từ ô trống lên trang. Lý do: gắn nhầm làm trang admin không mở.
 * - 2026-10-23T10:57:00+07:00 | 2.4.8 | Thêm: đời mặc định lấy từ M, ô xác nhận. Bỏ: nhãn Đời gốc trên sổ. Giữ: admin sửa được số. Lý do: duyệt phải chốt đời của M.
 * - 2026-10-18T14:57:00+07:00 | 2.4.4 | Thu hoặc hiện con trực tiếp.
 * - 2026-10-18T07:37:00+07:00 | 2.4.3 | Nhóm nút canvas nằm ngang, ngoài khung.
 * - 2026-10-18T07:31:00+07:00 | 2.4.2 | Nhóm nút canvas lên giữa phía trên.
 * - 2026-10-17T18:05:00+07:00 | 2.4.1 | Nút Làm mới cạnh hàng đợi.
 * - 2026-10-14T16:15:00+07:00 | 3.1.0 | Card 2 cửa 2 đọc tóm tắt từ staging.
 * - 2026-10-16T09:31:00+07:00 | 3.1.1 | Bỏ Loại hồ sơ. Trạng thái có Tất cả.
 * - 2026-10-16T09:52:00+07:00 | 3.1.2 | Nhãn có giờ. Chỉ thẩm định tờ đã trình.
 * RULE COMPLIANCE:
 * - Q1 (Bảo tồn): Bảo toàn 100% logic Canvas ReactFlow, Bút phê từng Đời, History Chain, Filter Queue Cửa 1/2 và API handlers.
 * - Q2 (Code Format): Đầy đủ docstring header và chú thích thời gian <2026-10-14T16:15:00+07:00> từng khối logic.
 */

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactFlow, { Background } from 'reactflow';
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
  getMember,
  adminApprovePlan,
  adminReturnPlanForRevision,
  approveResult,
  rejectResult,
  returnResultForRevision,
} from '../features/mfo/api/mfoApi.js';
import { diffDraftAgainstInit } from '../features/mfo/lib/mfoDiffEngine.js';
import { toMfoUserMessage, MFO_USER_SUCCESS } from '../features/mfo/constants/mfoUserErrors.js';
import MfoAlarmOverlay from '../features/mfo/components/MfoAlarmOverlay.jsx';
import MfoBusyClock from '../features/mfo/components/MfoBusyClock.jsx';
import { adminGate, canAdminReview } from '../features/mfo/lib/mfoAdminActions.js';
import MfoHistoryChain, { stepSummary } from '../features/mfo/components/MfoHistoryChain.jsx';
import MfoReviewForm from '../features/mfo/components/MfoReviewForm.jsx';

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

function dossierLabel(plan) {
  const payload = plan?.payload || {};
  const planOk = Boolean(plan.plan_ok ?? payload.plan_ok);
  const resultSubmitted = Boolean(plan.result_submitted ?? payload.result_submitted);
  const resultOk = Boolean(plan.result_ok ?? payload.result_ok);
  const st = String(plan.status || '').toUpperCase();
  // <2026-10-23T09:31:00+07:00> Mục đích: Đã ghi sổ chỉ khi đã duyệt. Lý do: result_ok sót.
  if (resultOk && st === 'APPROVED') return 'Đã ghi sổ';
  if (planOk) {
    if (st === 'REJECTED') return 'Tờ khai không được duyệt';
    if (st === 'NEEDS_REVISION') return 'Tờ khai cần sửa';
    if (resultSubmitted) return 'Tờ khai chờ phê duyệt';
    return 'Tờ khai đang soạn';
  }
  if (st === 'REJECTED') return 'Nhánh phả hệ không được duyệt';
  if (st === 'NEEDS_REVISION') return 'Nhánh phả hệ cần sửa';
  if (st === 'PENDING' || st === 'UNDER_REVIEW') return 'Nhánh phả hệ chờ phê duyệt';
  if (st === 'APPROVED') return 'Nhánh phả hệ đã duyệt';
  return 'Nhánh phả hệ đang soạn';
}

function dossierKind(plan) {
  const label = dossierLabel(plan);
  return label.startsWith('Tờ khai') || label === 'Đã ghi sổ' ? 'Tờ khai' : 'Nhánh phả hệ';
}

export function AdminMfoPlanPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const tenant = resolveTenant(user);
  const footerNav = resolveFooterNav(user, {
    pageKey: 'admin-mfo-plan',
    backTo: '/admin',
    showBack: true,
  });

  const [kind, setKind] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
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
  const [collapsedIds, setCollapsedIds] = useState({});

  const actionLockRef = useRef(null);
  const [alarm, setAlarm] = useState('');

  const [scsItems, setScsItems] = useState([]);
  const [itemDecisions, setItemDecisions] = useState({});
  const [itemNotes, setItemNotes] = useState({});
  const [grantedGeneration, setGrantedGeneration] = useState('');
  const [generationConfirmed, setGenerationConfirmed] = useState(null);
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

  // <2026-10-16T09:30:00+07:00> Mục đích: Lọc theo một trạng thái. Lý do: loại hồ sơ đã nằm trong tên trạng thái, lọc chéo bị rỗng.
  const filteredQueue = useMemo(() => {
    if (!statusFilter) return [];
    return plans.filter((plan) => {
      const statusName = dossierLabel(plan);
      if (statusFilter !== 'Tất cả' && statusFilter !== statusName) return false;
      return String(plan.status || '').toUpperCase() !== 'DRAFT';
    });
  }, [plans, statusFilter]);

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
        if (Boolean(draftData.plan_ok) && Boolean(draftData.result_submitted)) {
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
          initialDecisions[it.item_id] = 'REJECT';
          initialNotes[it.item_id] = '';
        });

        setItemDecisions(initialDecisions);
        setItemNotes(initialNotes);
        // <2026-10-23T10:57:00+07:00> Mục đích: Đời mặc định là đời của M trên sổ. Lý do: admin phải thấy đời đã có trước khi chốt.
        setGenerationConfirmed(null);
        const targetId = draftData.target_member_id || draftData.payload?.target_member_id;
        if (targetId) {
          try {
            const memberRes = await getMember(targetId);
            const member = memberRes?.data?.member || memberRes?.data || memberRes;
            const gen = member?.generation;
            setGrantedGeneration(gen == null || gen === '' ? '?' : String(gen));
          } catch {
            setGrantedGeneration('?');
          }
        } else if (draftData.granted_generation != null) {
          setGrantedGeneration(String(draftData.granted_generation));
        } else {
          setGrantedGeneration('?');
        }
      } catch (error) {
        console.error('===> [ADMIN_HYDRATE_ERROR]', error);
        setAlarm(toMfoUserMessage(error));
      } finally {
        setLoading(false);
      }
    }

    void hydrateAdminReview();
  }, [selectedTicketId, kind]);

  const selectedGate = Boolean(detail?.plan_ok) && Boolean(detail?.result_submitted) ? 'RESULT' : 'PLAN';
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
    return isAllAccepted && String(globalAdminNote || '').trim().length > 0 && generationConfirmed === true && Number.isFinite(gen) && gen > 0;
  }, [isAllAccepted, globalAdminNote, generationConfirmed, grantedGeneration]);

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

  // <2026-10-16T09:52:00+07:00> Mục đích: Nhãn có giờ và ngày. Lý do: bản cũ chỉ có ngày, thành 16/10/2026.
  const formatTicketLabel = (t) => {
    const rawDate = t.created_at || t.updated_at;
    const when = rawDate ? new Date(rawDate) : null;
    const timeStr = when ? when.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '';
    const dateStr = when ? when.toLocaleDateString('vi-VN') : 'Mới';
    const prefix = timeStr ? `${timeStr} ${dateStr} - ` : '';
    return `${prefix}${dossierLabel(t)}`;
  };

  return (
    <>
    {/* <2026-10-23T10:24:00+07:00> Mục đích: Vòng quay ở trang, không ở ô trống. Lý do: gắn nhầm làm trang admin không mở. */}
    <MfoBusyClock show={busyAction !== null || loading} />
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
        {/* <2026-10-16T09:30:00+07:00> Mục đích: Chỉ một danh sách trạng thái. Lý do: loại hồ sơ trùng với tên trạng thái. */}
        <label className="text-sm font-bold text-slate-700">Trạng thái
          <select className="mt-1 min-h-12 w-full rounded-2xl border px-3" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setSelectedTicketId(''); }}>
            <option value="">Bấm để chọn</option>
            <option>Tất cả</option>
            <option>Nhánh phả hệ đang soạn</option>
            <option>Nhánh phả hệ chờ phê duyệt</option>
            <option>Nhánh phả hệ cần sửa</option>
            <option>Nhánh phả hệ đã duyệt</option>
            <option>Nhánh phả hệ không được duyệt</option>
            <option>Tờ khai đang soạn</option>
            <option>Tờ khai chờ phê duyệt</option>
            <option>Tờ khai cần sửa</option>
            <option>Tờ khai không được duyệt</option>
            <option>Đã ghi sổ</option>
          </select>
        </label>

        {/* DROPDOWN DANH SÁCH CHỜ DUYỆT */}
        <section className="rounded-3xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <label className="block text-xs font-extrabold uppercase text-slate-700 mb-2">
            Chọn tờ trình trong hàng đợi:
          </label>
          {/* 2026-10-17T18:05:00+07:00 Muc dich: Lam moi chi hang doi. Ly do: F5 tai lai ca trang. */}
          <div className="flex items-center gap-2">
          <select
            className="min-w-0 flex-1 rounded-2xl border-2 border-indigo-200 bg-indigo-50/50 p-3 text-sm font-bold text-indigo-950 outline-none focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100"
            disabled={busyAction !== null}
            value={selectedTicketId}
            onChange={handleSelectTicketChange}
          >
            <option value="">Bấm để chọn</option>
            {filteredQueue.map((t) => (
              <option key={t.id || t.ticket_id} value={t.id || t.ticket_id}>
                {formatTicketLabel(t)}
              </option>
            ))}
          </select>
          <button type="button" className="min-h-12 shrink-0 rounded-2xl border border-slate-300 bg-white px-3 text-sm font-bold" onClick={() => void loadQueue()}>Làm mới</button>
          </div>

          {filteredQueue.length === 0 && (
            <p className="mt-2 text-center text-xs font-semibold text-slate-400">
              Không có hồ sơ nào ở trạng thái này.
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
                    Sơ đồ nhánh phả hệ
                  </span>
                </div>
                <span className="text-xs font-bold text-slate-700">{openCard1Canvas ? 'Thu lại' : 'Mở ra'}</span>
              </button>

              {openCard1Canvas && (
              <div>
              {/* 2026-10-18T07:37:00+07:00 Muc dich: Nhom nut nam ngang, ngoai khung canvas. Ly do: nam trong khung va dung doc. */}
              <div className="mb-2 flex justify-center">
          <div className="flex items-center gap-1 rounded-xl border border-slate-300 bg-white p-1 shadow-sm">
            <button type="button" className="min-h-10 min-w-10 rounded-lg text-lg font-bold" onClick={() => flowRef.current?.zoomIn?.()}>+</button>
            <button type="button" className="min-h-10 min-w-10 rounded-lg text-sm font-bold" onClick={() => flowRef.current?.fitView?.({ padding: 0.08 })}>[ ]</button>
            <button type="button" className="min-h-10 min-w-10 rounded-lg text-lg font-bold" onClick={() => flowRef.current?.zoomOut?.()}>−</button>
          </div>
        </div>
                <div className="relative h-[380px] w-full border-b border-slate-100 bg-white">
                  {nodes.length > 0 ? (
                    <ReactFlow
                      nodes={nodes.filter((node) => {
                        const hidden = new Set();
                        const walk = (id) => edges.filter((edge) => edge.source === id).forEach((edge) => { if (!hidden.has(edge.target)) { hidden.add(edge.target); walk(edge.target); } });
                        Object.keys(collapsedIds).filter((id) => collapsedIds[id]).forEach(walk);
                        return !hidden.has(node.id);
                      }).map((node) => ({ ...node, data: { ...node.data, hasChildren: edges.some((edge) => edge.source === node.id), collapsed: Boolean(collapsedIds[node.id]), onToggleChildren: (nodeId) => setCollapsedIds((old) => ({ ...old, [nodeId]: !old[nodeId] })) } }))}
                      edges={edges.filter((edge) => { const hidden = new Set(); const walk = (id) => edges.filter((item) => item.source === id).forEach((item) => { if (!hidden.has(item.target)) { hidden.add(item.target); walk(item.target); } }); Object.keys(collapsedIds).filter((id) => collapsedIds[id]).forEach(walk); return !hidden.has(edge.source) && !hidden.has(edge.target); })}
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
                    </ReactFlow>
                  ) : (
                    <div className="flex h-full items-center justify-center p-6 text-center text-xs font-bold text-slate-400">
                      Bản nháp này chưa có dữ liệu đồ họa snapshot.
                    </div>
                  )}
                </div>
              </div>
              )}
            </section>

            {/* <2026-10-16T09:52:00+07:00> Mục đích: Chỉ thẩm định tờ đã trình. Lý do: tờ đang soạn chưa được trình, không được duyệt. */}
            {['Nhánh phả hệ chờ phê duyệt', 'Tờ khai chờ phê duyệt'].includes(dossierLabel(detail)) && (
            <MfoReviewForm
              items={scsItems}
              delta={detail?.canvas_delta || detail?.payload?.canvas_delta || {}}
              nodes={nodes}
              staging={detail?.smp_staging_data || detail?.payload?.smp_staging_data || {}}
              decisions={itemDecisions}
              notes={itemNotes}
              overall={globalAdminNote}
              onDecision={handleDecisionToggle}
              onNote={handleNoteChange}
              onOverall={setGlobalAdminNote}
              canApprove={canApprovePlan}
              busy={busyAction !== null}
              busyAction={busyAction}
              onApprove={selectedGate === 'RESULT' ? handleApproveResultGate2 : handleApprovePlanGate1}
              onReturn={selectedGate === 'RESULT' ? handleReturnResultGate2 : handleReturnPlanGate1}
              onReject={handleRejectResultGate2}
              showReject={selectedGate === 'RESULT'}
              generation={selectedGate === 'PLAN' ? grantedGeneration : ''}
              onGeneration={selectedGate === 'PLAN' ? setGrantedGeneration : null}
              generationConfirmed={generationConfirmed}
              onGenerationConfirm={setGenerationConfirmed}
            />
            )}

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
    </>
  );
}

export default AdminMfoPlanPage;