/**
 * PATH       : frontend/src/features/mfo/components/MyMfoPlans.jsx
 * DATETIME   : 2026-10-14T15:35:00+07:00
 * VERSION    : 5.7.3-FIX-GATE2-NOTE-FALLBACK
 * DESCRIPTION:
 * - Vá dứt điểm lỗi hiển thị nhầm "Bút phê tờ khai: Duyệt" khi Tờ khai Cửa 2 đang ở trạng thái chờ duyệt.
 * - Loại bỏ fallback || currentPlan.admin_note của Cửa 1, phân lập chính xác bút phê theo trạng thái Tờ khai Cửa 2.
 * RULE COMPLIANCE:
 * - Q1 (Bảo tồn): Bảo toàn 100% logic Single Thread Pipeline, hydration draft, CRUD handlers và MfoHistoryChain integration.
 * - Q2 (Code Format): Đầy đủ docstring header và chú thích thời gian <2026-10-14T15:35:00+07:00> từng khối logic.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MfoAlarmOverlay from './MfoAlarmOverlay.jsx';
import MfoHistoryPreview from './MfoHistoryPreview.jsx';
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
import AudioHelpButton from '../../elder-doctrine/components/AudioHelpButton.jsx';

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
  
  const [openMainCard, setOpenMainCard] = useState(true);
  const [openNow, setOpenNow] = useState(true);
  const [openHistory, setOpenHistory] = useState(false);
  const [alarm, setAlarm] = useState('');

  const [historyPreview, setHistoryPreview] = useState(null);
  
  const hydratedTicketRef = useRef(null);

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
      setSelectedTicketId('');
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

  const handleSelectChange = (e) => {
    const val = e.target.value;

    if (val === '__NEW_PLAN__') {
      navigate('/op/mfo/plans/new');
      return;
    }

    setSelectedTicketId(val);
    setOpenHistory(false);
    setHistoryStep('');
    setHistoryPreview(null);
    if (val === '') {
      void loadPlansList();
    }
  };

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
  }, [currentPlan, draftDetail, memberNames]);

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

  const canDelete = useMemo(() => {
    if (!currentPlan) return false;
    if (isPending) return false;
    if (isRejected) return false;
    
    if (isApproved && payloadData?.result_ok) return false;

    if (currentStatus === 'DRAFT' || isNeedsRevision) return true;
    if (isApproved && payloadData?.plan_ok && !payloadData?.result_submitted) return true;

    return false;
  }, [currentPlan, isPending, isRejected, isApproved, isNeedsRevision, payloadData]);

  useEffect(() => {
    if (!selectedTicketId || selectedTicketId === '__NEW_PLAN__') {
      setDraftDetail(null);
      hydratedTicketRef.current = null;
      return;
    }

    if (hydratedTicketRef.current === selectedTicketId) return;
    hydratedTicketRef.current = selectedTicketId;

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

        const missingIds = Array.from(idsToFetch).filter((mid) => mid && !memberNames[mid]);
        if (missingIds.length > 0) {
          const nameResults = await Promise.allSettled(
            missingIds.map((mid) => getMember(mid))
          );

          const newNames = {};
          nameResults.forEach((result, idx) => {
            if (result.status === 'fulfilled') {
              const mRes = result.value;
              const mData = mRes?.data?.member || mRes?.data || mRes;
              if (mData?.full_name || mData?.name) {
                newNames[missingIds[idx]] = mData.full_name || mData.name;
              }
            }
          });

          if (Object.keys(newNames).length > 0) {
            setMemberNames((prev) => ({ ...prev, ...newNames }));
          }
        }
      } catch (error) {
        console.error('[HYDRATE_SELECTED_PLAN_ERROR]', error);
      }
    }

    void hydrateSelectedPlan();
  }, [selectedTicketId, memberNames]);

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
        hydratedTicketRef.current = null;
        if (onPlanDeleted) onPlanDeleted();
        await loadPlansList();
      } else {
        setAlarm(toMfoUserMessage({ message: response?.message }) || 'Không xóa được.');
      }
    } catch (error) {
      setAlarm(toMfoUserMessage(error));
    } finally {
      setLoading(false);
    }
  };

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

  return (
    <div className="flex flex-col gap-3 font-sans">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-black text-slate-800">Hồ sơ của tôi</h2>
        <AudioHelpButton text="Đây là Hồ sơ của bác cần giải quyết theo 2 lần trình. Lần trình 1 thể hiện ý định như: thêm con, quan hệ vợ chồng, khai khuyết danh vào sơ đồ Nhánh phả hệ 5 đời hiện có. Lần trình thứ hai đòi hỏi điền thông tin cụ thể vào Tờ khai theo ý định đã được duyệt. Bác không thể mở hồ sơ mới khi còn hồ sơ chưa hoàn tất." label="Nghe" />
      </div>

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

      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <label className="block text-xs font-black text-slate-800">
            Hồ sơ của tôi
          </label>
          <button
            type="button"
            onClick={() => setOpenMainCard((v) => !v)}
            className="text-xs font-bold text-slate-700 hover:text-indigo-600 transition-colors px-1 py-0.5"
          >
            {openMainCard ? 'Thu lại' : 'Mở ra'}
          </button>
        </div>

        {openMainCard && (
          <div className="space-y-3 pt-1">
            <select
              className="w-full rounded-2xl border-2 border-indigo-200 bg-indigo-50/50 p-3.5 text-sm font-black text-indigo-950 outline-none focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100 cursor-pointer"
              value={selectedTicketId}
              onChange={handleSelectChange}
            >
              <option value="">Bấm để chọn</option>

              {!hasOpenProfile && (
                <option value="__NEW_PLAN__" className="font-bold text-indigo-700">
                  + Tạo nhánh phả hệ mới
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
                  <span>Bấm để tạo nhánh mới ngay</span>
                </button>
              </div>
            )}

            {currentPlan && (
              <div className="mt-3 flex flex-col gap-3 text-xs">
                <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                  <div className="flex min-h-11 items-center justify-between gap-2 bg-slate-50 px-3.5">
                    <button type="button" className="font-black uppercase text-[10px] text-slate-700" onClick={() => setOpenNow((v) => !v)}>Nội dung hiện tại</button>
                    <div className="flex items-center gap-2">
                      <AudioHelpButton text={[`Trạng thái: ${stageName(viewPlan)}`, ...currentSummary(viewPlan)].join('. ')} label="Nghe" />
                      <button type="button" className="text-xs font-bold text-slate-700" onClick={() => setOpenNow((v) => !v)}>{openNow ? 'Thu lại' : 'Mở ra'}</button>
                    </div>
                  </div>

                  {openNow ? (
                    <div className="space-y-2 border-t border-slate-100 px-3.5 py-3 bg-white">
                      <p><span className="font-bold text-slate-900">Trạng thái: </span>{stageName(viewPlan)}</p>
                      {currentSummary(viewPlan).map((line, idx) => (
                        <p key={idx} className="text-slate-800 font-medium">{line}</p>
                      ))}

                      {/* <2026-10-14T15:35:00+07:00> PHÂN LẬP BÚT PHÊ TỜ KHAI CỬA 2: CHỈ HIỂN THỊ KHI CÓ REJECT_REASON HOẶC ĐÃ DUYỆT XONG, LOẠI BỎ FALLBACK LẤY NHẦM BÚT PHÊ CỬA 1 */}
                      {payloadData.result_submitted && (payloadData.reject_reason || payloadData.result_ok) ? (
                        <p className="font-bold text-indigo-900 pt-1 border-t border-slate-100">
                          Bút phê tờ khai: {payloadData.reject_reason || 'Đã duyệt ghi sổ'}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </section>

                <div className="mt-2 grid grid-cols-2 sm:flex sm:items-center gap-2 pt-2 border-t border-slate-200">
                  <button
                    type="button"
                    className="min-h-[48px] flex items-center justify-center gap-1.5 rounded-2xl border border-indigo-200 bg-indigo-50 px-3 text-xs font-black text-indigo-900 hover:bg-indigo-100 active:scale-[0.98]"
                    disabled={draftDetail?.ticket_id !== selectedTicketId || !draftDetail?.graph_snapshot}
                    onClick={() => {
                      const snapshot = draftDetail?.ticket_id === selectedTicketId ? viewPlan?.payload?.graph_snapshot : null;
                      if (snapshot) setHistoryPreview({ ...JSON.parse(JSON.stringify(snapshot)), smp_staging_data: viewPlan?.payload?.smp_staging_data || {} });
                    }}
                  >
                    <Eye className="h-4 w-4 text-indigo-600" />
                    <span>Xem lại</span>
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
                      className="min-h-[48px] flex items-center justify-center gap-1.5 rounded-2xl bg-indigo-700 px-3 text-xs font-black text-white shadow-sm hover:bg-indigo-800"
                      onClick={() => navigate(`/op/mfo/plans/new?draft=${selectedTicketId}&gate=2`)}
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

            {currentPlan ? (
              <MfoHistoryChain
                key={selectedTicketId}
                plan={draftDetail?.ticket_id === selectedTicketId ? viewPlan : currentPlan}
                open={openHistory}
                onToggle={() => setOpenHistory((value) => !value)}
                onReload={loadPlansList}
              />
            ) : null}
          </div>
        )}

      </div>

      {historyPreview ? (
        <MfoHistoryPreview
          snapshot={historyPreview}
          title="Xem lại — Nội dung hiện tại"
          onClose={() => setHistoryPreview(null)}
        />
      ) : null}

      <MfoAlarmOverlay open={Boolean(alarm)} message={alarm} onClose={() => setAlarm('')} />
    </div>
  );
}

export default MyMfoPlans;