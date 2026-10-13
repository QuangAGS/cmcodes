/**
 * PATH       : frontend/src/features/mfo/components/MyMfoPlans.jsx
 * DATETIME   : 2026-10-09T19:50:00+07:00
 * VERSION    : 5.2.0-LAT4-SINGLE-OPEN
 * DESCRIPTION: Lát 4. Không hiện tạo mới khi đang có hồ sơ mở.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MfoAlarmOverlay from './MfoAlarmOverlay.jsx';
import {
  FileEdit,
  Trash2,
  Eye,
  Save,
  PlusCircle,
  AlertTriangle,
  MessageSquare,
  XOctagon,
  Plus,
} from 'lucide-react';

import {
  listPlans,
  deleteDraft,
  getMember,
  getDraftPayload,
  savePlanDraft,
} from '../api/mfoApi.js';
import {
  unwrapPlanList,
  opMfoStatusBadgeClass,
} from '../lib/normalizePlanRow.js';
import { diffDraftAgainstInit } from '../lib/mfoDiffEngine.js';
import MfoHistoryChain, { stageName, historySteps, stepSummary, currentSummary } from './MfoHistoryChain.jsx';
import { toMfoUserMessage } from '../constants/mfoUserErrors.js';

/**
 * <2026-10-09T19:50:00+07:00> - Map nhãn Dropdown chuẩn xác theo Single Thread Pipeline (Mục IV)
 */
function getSingleThreadOptionLabel(plan) {
  if (!plan) return '';
  const rawDate = plan.created_at || plan.updated_at;
  const dateStr = rawDate ? new Date(rawDate).toLocaleDateString('vi-VN') : '';
  const timeStr = rawDate ? new Date(rawDate).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '';
  const prefix = dateStr ? `${timeStr} ${dateStr} - ` : '';

  const st = String(plan.status || 'DRAFT').toUpperCase();
  const payload = plan.payload || {};
  const isResultSubmitted = Boolean(plan.result_submitted || payload.result_submitted);
  const isApproved = st === 'APPROVED';

  if (st === 'DRAFT') return `${prefix}Nhánh phả hệ đang soạn`;
  if (st === 'PENDING' || st === 'UNDER_REVIEW') {
    if (payload.plan_ok && isResultSubmitted) return `${prefix}Tờ khai chờ duyệt`;
    if (payload.plan_ok) return `${prefix}Tờ khai đang soạn`;
    return `${prefix}Nhánh phả hệ chờ phê duyệt`;
  }
  if (st === 'REJECTED') return `${prefix}${payload.plan_ok ? 'Tờ khai không được duyệt' : 'Nhánh phả hệ không được duyệt'}`;
  if (st === 'NEEDS_REVISION') return `${prefix}${payload.plan_ok ? 'Tờ khai cần sửa' : 'Nhánh phả hệ cần sửa'}`;
  if (isApproved && payload.result_ok) return `${prefix}Đã ghi sổ`;
  if (isApproved && payload.plan_ok) return `${prefix}Tờ khai đang soạn`;
  if (isApproved) return `${prefix}Nhánh phả hệ đã duyệt`;

  return `${prefix}Nhánh phả hệ đang soạn`;
}

export function MyMfoPlans({ onSelectPlan, onPlanDeleted }) {
  const navigate = useNavigate();

  const [plans, setPlans] = useState([]);
  const [selectedTicketId, setSelectedTicketId] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [memberNames, setMemberNames] = useState({});
  const [draftDetail, setDraftDetail] = useState(null);
  const [historyStep, setHistoryStep] = useState('');
  const [openNow, setOpenNow] = useState(true);
  const [openHistory, setOpenHistory] = useState(false);
  const [alarm, setAlarm] = useState('');

  /**
   * <2026-10-09T19:50:00+07:00> - Nạp danh sách Tờ trình (Backend Query: WHERE deleted_at IS NULL)
   */
  const loadPlansList = useCallback(async () => {
    try {
      setLoading(true);
      let res = await listPlans({ mine: '1' });
      let list = unwrapPlanList(res);

      if (list.length === 0) {
        res = await listPlans({});
        list = unwrapPlanList(res);
      }

      setPlans(list);

      // Tự động chọn hồ sơ active duy nhất trong Single Thread
      if (list.length > 0) {
        setSelectedTicketId(list[0].id || list[0].ticket_id);
      } else {
        setSelectedTicketId('');
      }
    } catch (error) {
      console.error('[MY_MFO_PLANS_LOAD_ERROR]', error);
      setAlarm(toMfoUserMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPlansList();
  }, [loadPlansList]);

  // Xử lý sự kiện khi chọn Dropdown List
  const handleSelectChange = (e) => {
    const val = e.target.value;

    if (val === '__NEW_PLAN__') {
      navigate('/op/mfo/plans/new');
      return;
    }

    setSelectedTicketId(val);
    if (val === '') {
      void loadPlansList();
    }
  };

  // Hồ sơ đang chọn hiện tại
  const currentPlan = useMemo(() => {
    return plans.find((p) => (p.id || p.ticket_id) === selectedTicketId) || null;
  }, [plans, selectedTicketId]);

  const viewPlan = useMemo(() => {
    if (!currentPlan) return null;
    return {
      ...currentPlan,
      payload: {
        ...(currentPlan.payload || {}),
        ...(draftDetail || {}),
        init_scs: draftDetail?.init_scs || currentPlan.init_scs || currentPlan.payload?.init_scs,
        diff_summary: draftDetail?.diff_summary || currentPlan.diff_summary || currentPlan.payload?.diff_summary,
        canvas_delta: draftDetail?.canvas_delta || currentPlan.payload?.canvas_delta,
        graph_snapshot: draftDetail?.graph_snapshot || currentPlan.payload?.graph_snapshot,
        lines: (draftDetail?.lines || currentPlan.payload?.lines || []).map((line) => ({
          ...line,
          full_name: memberNames[line.member_id] || line.full_name || line.hint || null,
        })),
        smp_staging_data: draftDetail?.smp_staging_data || currentPlan.payload?.smp_staging_data,
      },
    };
  }, [currentPlan, draftDetail]);

  // Phân lập trạng thái
  const currentStatus = String(currentPlan?.status || 'DRAFT').toUpperCase();
  const payloadData = currentPlan?.payload || draftDetail || {};
  const isPending = currentStatus === 'PENDING' || currentStatus === 'UNDER_REVIEW';
  const isNeedsRevision = currentStatus === 'NEEDS_REVISION';
  const isRejected = currentStatus === 'REJECTED';
  const isApproved = currentStatus === 'APPROVED';
  const hasOpenProfile = plans.some((p) => {
    const st = String(p.status || '').toUpperCase();
    if (st === 'REJECTED' || st === 'WITHDRAWN') return false;
    if (st === 'APPROVED' && (p.result_ok || p.payload?.result_ok)) return false;
    return true;
  });

  /**
   * <2026-10-09T19:50:00+07:00> - Ma trận Kiểm tra Quyền Xóa Tờ trình (EU Delete Matrix - AMENDMENT 20261009)
   */
  const canDelete = useMemo(() => {
    if (!currentPlan) return false;
    if (isPending) return false; // Đang thẩm định: CẤM XÓA
    if (isRejected) return false; // Bị bác bỏ: CẤM XÓA (Giữ deleted_at = NULL để bảo lưu Bút phê)
    
    // Gate 2 đã chốt Sổ thật: CẤM XÓA
    if (isApproved && payloadData?.result_ok) return false;

    // 🟢 CHO PHẾP XÓA:
    // 1. DRAFT
    // 2. NEEDS_REVISION
    // 3. APPROVED ở Gate 1 nhưng chưa nộp Gate 2 (plan_ok = true & result_submitted = false)
    if (currentStatus === 'DRAFT' || isNeedsRevision) return true;
    if (isApproved && payloadData?.plan_ok && !payloadData?.result_submitted) return true;

    return false;
  }, [currentPlan, isPending, isRejected, isApproved, isNeedsRevision, payloadData]);

  // Nạp chi tiết Tờ trình & Tra cứu danh sách Tên thành viên
  useEffect(() => {
    if (!selectedTicketId || selectedTicketId === '__NEW_PLAN__') {
      setDraftDetail(null);
      return;
    }

    async function hydrateSelectedPlan() {
      try {
        const res = await getDraftPayload(selectedTicketId);
        const data = res?.data || res;
        setDraftDetail(data);

        const idsToFetch = new Set();
        const targetId = data?.target_member_id || data?.origin_member_id;
        if (targetId) idsToFetch.add(targetId);

        (data?.lines || []).forEach((l) => {
          if (l.member_id) idsToFetch.add(l.member_id);
          if (l.spouse_id) idsToFetch.add(l.spouse_id);
          (l.siblings || []).forEach((s) => {
            if (s.member_id) idsToFetch.add(s.member_id);
          });
        });

        for (const mid of idsToFetch) {
          if (mid && !memberNames[mid]) {
            try {
              const mRes = await getMember(mid);
              const mData = mRes?.data?.member || mRes?.data || mRes;
              if (mData?.full_name || mData?.name) {
                setMemberNames((prev) => ({
                  ...prev,
                  [mid]: mData.full_name || mData.name,
                }));
              }
            } catch {}
          }
        }
      } catch (error) {
        console.error('[HYDRATE_SELECTED_PLAN_ERROR]', error);
      }
    }

    void hydrateSelectedPlan();
  }, [selectedTicketId]);

  /**
   * <2026-10-09T19:50:00+07:00> - Xử lý Xóa bản nháp / Tờ trình
   */
  const handleDeletePlan = async () => {
    if (!selectedTicketId || !canDelete) return;

    if (!window.confirm('Bạn có chắc chắn muốn xóa tờ trình này?')) return;

    try {
      setLoading(true);
      const response = await deleteDraft(selectedTicketId);

      const isSuccess = 
        response?.status === 'success' || 
        response?.data?.status === 'success' || 
        response?.data?.deleted === true ||
        response?.deleted === true;

      if (isSuccess) {
        setAlarm('Đã xóa tờ.');
        setSelectedTicketId('');
        if (onPlanDeleted) onPlanDeleted();
        await loadPlansList();
      } else {
        setAlarm(toMfoUserMessage({ message: response?.message }) || 'Không xóa được.');
      }
    } catch (error) {
      const serverMessage = error.response?.data?.message || error.message;
      setAlarm(toMfoUserMessage(error));
    } finally {
      setLoading(false);
    }
  };

  // Xử lý Nút "Lưu nháp" trực tiếp
  const handleSaveDraftDirect = async () => {
    if (!selectedTicketId || !draftDetail) return;
    if (isPending || isRejected || isApproved) {
      setAlarm('Tờ này không lưu được ở bước hiện tại.');
      return;
    }

    try {
      setBusy(true);
      await savePlanDraft({
        ticket_id: selectedTicketId,
        ...draftDetail,
      });
      setAlarm('Đã lưu nhánh phả hệ.');
      void loadPlansList();
    } catch (error) {
      setAlarm(toMfoUserMessage(error));
    } finally {
      setBusy(false);
    }
  };

  // Gọi mfoDiffEngine tái tạo mảng Tóm tắt 5 Đời
  const lineSummaryBlocks = useMemo(() => {
    if (!draftDetail) return [];

    const payloadWithNames = {
      ...draftDetail,
      lines: (draftDetail.lines || []).map((l) => ({
        ...l,
        full_name: memberNames[l.member_id] || l.hint || null,
      })),
    };

    return diffDraftAgainstInit(payloadWithNames);
  }, [draftDetail, memberNames]);

  return (
    <div className="flex flex-col gap-3 font-sans">
      {/* BANNER CẢNH BÁO CHỜ DUYỆT (PENDING / UNDER_REVIEW) */}
      {isPending && (
        <div className="flex items-start gap-2.5 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold text-amber-950 shadow-sm">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
          <div className="leading-relaxed">
            <p className="font-extrabold text-amber-900">
              Thông báo: Hồ sơ MFO 5L đang nằm trong Hàng đợi Thẩm định.
            </p>
            <p className="mt-1 font-medium text-amber-800">
              Giao diện tạm thời đóng băng Read-Only 100%. Vui lòng chờ phản hồi bút phê từ Ban Quản trị.
            </p>
          </div>
        </div>
      )}

      {/* 🛑 BANNER CẢNH BÁO ĐỎ KHI HỒ SƠ BỊ REJECTED (AMENDMENT 20261009 MỤC 4) */}
      {isRejected && (
        <div className="flex items-start gap-3 rounded-3xl border-2 border-rose-300 bg-rose-50/90 p-4 text-xs text-rose-950 shadow-md">
          <XOctagon className="h-5 w-5 shrink-0 text-rose-600 mt-0.5" />
          <div className="flex-1 leading-relaxed">
            <p className="font-black uppercase tracking-wider text-rose-900 text-[11px]">
              🛑 TỜ KHAI ĐÃ BỊ BAN QUẢN TRỊ BÁC BỎ VĨNH VIỄN
            </p>
            <p className="mt-1.5 font-bold text-slate-800 bg-white/80 p-2.5 rounded-2xl border border-rose-200">
              Lý do bác bỏ: <span className="text-rose-900 italic">"{currentPlan.admin_note || currentPlan.note || 'Hồ sơ không hợp lệ theo quy định gia tộc.'}"</span>
            </p>
            <p className="mt-2 text-[11px] font-semibold text-slate-600">
              Hồ sơ này bị đóng băng vĩnh viễn để bảo lưu vết bút phê của Admin. Bạn không thể chỉnh sửa hoặc xóa tờ trình này.
            </p>
            <button
              type="button"
              className="mt-3 flex items-center gap-1.5 rounded-2xl bg-indigo-600 px-4 py-2.5 text-xs font-black text-white shadow-md hover:bg-indigo-700 active:scale-95"
              onClick={() => navigate('/op/mfo/plans/new')}
            >
              <Plus className="h-4 w-4" />
              <span>+ Tạo nhánh phả hệ mới</span>
            </button>
          </div>
        </div>
      )}

      {/* DROPDOWN CHỌN TỜ TRÌNH (SINGLE THREAD PIPELINE) */}
      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <label className="block text-xs font-extrabold uppercase text-slate-700">
          Khung dự kiến và tờ khai:
        </label>

        <select
          className="w-full rounded-2xl border-2 border-indigo-200 bg-indigo-50/50 p-3.5 text-sm font-black text-indigo-950 outline-none focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100"
          value={selectedTicketId}
          onChange={handleSelectChange}
        >
          <option value="">Bấm để chọn</option>

          {!hasOpenProfile && (
            <option value="__NEW_PLAN__" className="font-bold text-indigo-700">
              + Tạo khung 5L mới
            </option>
          )}

          {plans.map((p) => (
            <option key={p.id || p.ticket_id} value={p.id || p.ticket_id}>
              {getSingleThreadOptionLabel(p)}
            </option>
          ))}
        </select>

        {plans.length === 0 && !loading && (
          <div className="flex flex-col items-center gap-2 py-3 text-center">
            <p className="text-xs font-semibold text-slate-500">
              Chưa có tờ trình nào được tạo.
            </p>
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-2xl bg-indigo-600 px-4 py-2.5 text-xs font-black text-white shadow-sm hover:bg-indigo-700 active:scale-95"
              onClick={() => navigate('/op/mfo/plans/new')}
            >
              <PlusCircle className="h-4 w-4" />
              <span>Bấm để tạo khung mới ngay</span>
            </button>
          </div>
        )}

        {/* CHI TIẾT TÓM TẮT VÀ BÚT PHÊ */}
        {currentPlan && (
          <div className="mt-3 flex flex-col gap-3 text-xs">
            <section className="rounded-2xl border border-slate-200 bg-white">
              <button type="button" className="flex min-h-11 w-full items-center justify-between px-3 text-left" onClick={() => setOpenNow((v) => !v)}>
                <span className="font-black uppercase text-[10px] text-slate-700">Nội dung hiện tại</span>
                <span>{openNow ? 'Thu' : 'Mở'}</span>
              </button>
              {openNow ? (
                <div className="space-y-2 border-t border-slate-100 px-3 py-3">
                  <p><span className="font-bold">Trạng thái: </span>{stageName(viewPlan)}</p>
                  {currentSummary(viewPlan).map((line, idx) => <p key={idx}>{line}</p>)}
                  {payloadData.result_submitted && (payloadData.reject_reason || currentPlan.admin_note) ? (
                    <p>Bút phê tờ khai: {payloadData.reject_reason || currentPlan.admin_note}</p>
                  ) : null}
                </div>
              ) : null}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white">
              <button type="button" className="flex min-h-11 w-full items-center justify-between px-3 text-left" onClick={() => setOpenHistory((v) => !v)}>
                <span className="font-black uppercase text-[10px] text-slate-700">Lịch sử công việc</span>
                <span>{openHistory ? 'Thu' : 'Mở'}</span>
              </button>
              {openHistory ? (
                <div className="space-y-2 border-t border-slate-100 px-3 py-3">
                  <select className="w-full rounded-2xl border px-3 py-2" value={historyStep} onChange={(e) => setHistoryStep(e.target.value)}>
                    <option value="">Bấm để chọn</option>
                    {historySteps(viewPlan).map((step) => (
                      <option key={step.id} value={step.id}>{step.title}</option>
                    ))}
                  </select>
                  {historyStep ? stepSummary(viewPlan, historyStep).map((line, idx) => <p key={idx}>{line}</p>) : null}
                </div>
              ) : null}
            </section>

            {/* MA TRẬN NÚT THAO TÁC (TỰ ĐỘNG KHÓA VÀ ẨN THEO TRẠNG THÁI) */}
            <div className="mt-2 grid grid-cols-2 sm:flex sm:items-center gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                className="min-h-[48px] flex items-center justify-center gap-1.5 rounded-2xl border border-indigo-200 bg-indigo-50 px-3 text-xs font-black text-indigo-900 hover:bg-indigo-100 active:scale-[0.98]"
                onClick={() => navigate(`/op/mfo/plans/new?draft=${selectedTicketId}`)}
              >
                <Eye className="h-4 w-4 text-indigo-600" />
                <span>{isRejected ? 'Xem lại (Đóng băng)' : 'Xem lại'}</span>
              </button>

              {!isRejected && (
                <button
                  type="button"
                  disabled={isPending || isApproved || busy}
                  className="min-h-[48px] flex items-center justify-center gap-1.5 rounded-2xl border border-slate-300 bg-white px-3 text-xs font-extrabold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
                  onClick={handleSaveDraftDirect}
                >
                  <Save className="h-4 w-4 text-slate-600" />
                  <span>Lưu nháp</span>
                </button>
              )}

              {isApproved && payloadData?.plan_ok && !payloadData?.result_ok ? (
                <button
                  type="button"
                  className="min-h-[48px] flex items-center justify-center gap-1.5 rounded-2xl bg-indigo-700 px-3 text-xs font-black text-white"
                  onClick={() => navigate(`/op/mfo/plans/${selectedTicketId}`)}
                >
                  <span>Khai báo</span>
                </button>
              ) : null}

              {!isRejected && !payloadData?.plan_ok && (
                <button
                  type="button"
                  disabled={isPending || busy}
                  className="min-h-[48px] flex items-center justify-center gap-1.5 rounded-2xl bg-indigo-600 px-3 text-xs font-black text-white shadow-sm hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
                  onClick={() => navigate(`/op/mfo/plans/new?draft=${selectedTicketId}`)}
                >
                  <FileEdit className="h-4 w-4" />
                  <span>{isNeedsRevision ? 'Sửa theo ý kiến' : 'Sửa nhánh'}</span>
                </button>
              )}

              {/* NÚT XÓA: CHỈ KÍCH HOẠT KHI CAN_DELETE = TRUE */}
              <button
                type="button"
                disabled={!canDelete || busy}
                className="min-h-[48px] flex items-center justify-center gap-1.5 rounded-2xl border border-rose-200 bg-rose-50 px-3 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.98]"
                onClick={handleDeletePlan}
              >
                <Trash2 className="h-4 w-4 text-rose-600" />
                <span>Xóa</span>
              </button>
            </div>
          </div>
        )}
      </div>
      <MfoAlarmOverlay open={Boolean(alarm)} message={alarm} onClose={() => setAlarm('')} />
    </div>
  );
}

export default MyMfoPlans;