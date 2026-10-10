/**
 * PATH       : frontend/src/features/mfo/components/MyMfoPlans.jsx
 * DATETIME   : 2026-10-09T19:50:00+07:00
 * VERSION    : 5.2.0-LAT4-SINGLE-OPEN
 * DESCRIPTION: Lát 4. Không hiện tạo mới khi đang có hồ sơ mở.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { mfoToast } from '../lib/mfoToastVoice.js';
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

  if (st === 'DRAFT') return `${prefix}Khung đang soạn`;
  if (st === 'PENDING' || st === 'UNDER_REVIEW') {
    if (payload.plan_ok && isResultSubmitted) return `${prefix}Tờ khai chờ duyệt`;
    return `${prefix}Khung chờ duyệt`;
  }
  if (st === 'REJECTED') return `${prefix}Tờ khai bị Bác bỏ / Từ chối`;
  if (st === 'NEEDS_REVISION') return `${prefix}Khung yêu cầu sửa lại`;

  if (isApproved && !isResultSubmitted) return `${prefix}Khung đã được duyệt (Khai tờ khai)`;
  if (isApproved && isResultSubmitted) return `${prefix}Tờ khai đã được duyệt (Đã chốt Sổ)`;

  return `${prefix}Khung dự kiến`;
}

export function MyMfoPlans({ onSelectPlan, onPlanDeleted }) {
  const navigate = useNavigate();

  const [plans, setPlans] = useState([]);
  const [selectedTicketId, setSelectedTicketId] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [memberNames, setMemberNames] = useState({});
  const [draftDetail, setDraftDetail] = useState(null);

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
      mfoToast.error('Lỗi khi nạp danh sách tờ trình: ' + toMfoUserMessage(error));
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
        mfoToast.success('Đã xóa tờ trình thành công!');
        setSelectedTicketId('');
        if (onPlanDeleted) onPlanDeleted();
        await loadPlansList();
      } else {
        mfoToast.error(response?.message || 'Không thể xóa tờ trình.');
      }
    } catch (error) {
      const serverMessage = error.response?.data?.message || error.message;
      mfoToast.error('Lỗi khi xóa tờ trình: ' + serverMessage);
    } finally {
      setLoading(false);
    }
  };

  // Xử lý Nút "Lưu nháp" trực tiếp
  const handleSaveDraftDirect = async () => {
    if (!selectedTicketId || !draftDetail) return;
    if (isPending || isRejected || isApproved) {
      mfoToast.warning('Tờ trình ở trạng thái này không thể lưu nháp!');
      return;
    }

    try {
      setBusy(true);
      await savePlanDraft({
        ticket_id: selectedTicketId,
        ...draftDetail,
      });
      mfoToast.success('Đã lưu bản nháp Tờ trình 5L thành công!');
      void loadPlansList();
    } catch (error) {
      mfoToast.error('Không thể lưu nháp: ' + toMfoUserMessage(error));
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
              <span>+ Khởi tạo Tờ trình MFO mới</span>
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
          <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-slate-100 bg-slate-50/50 p-3.5 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
              <span className="font-extrabold text-slate-500 uppercase tracking-wider">TRẠNG THÁI:</span>
              <span className={`rounded-full px-3 py-1 font-black uppercase text-[10px] ${opMfoStatusBadgeClass(currentPlan)}`}>
                {getSingleThreadOptionLabel(currentPlan).split(' - ')[1] || 'Khung dự kiến'}
              </span>
            </div>

            {/* BÚT PHÊ ADMIN (KHI TRẢ VỀ HOẶC REJECTED) */}
            {(isNeedsRevision || isRejected || currentPlan.admin_note) && (
              <div className={`rounded-xl border p-3 space-y-1 ${isRejected ? 'border-rose-200 bg-rose-50 text-rose-950' : 'border-indigo-200 bg-indigo-50/60 text-indigo-950'}`}>
                <div className="flex items-center gap-1.5 font-black uppercase text-[10px]">
                  <MessageSquare className="h-3.5 w-3.5" />
                  <span>Bút phê từ Ban Quản trị:</span>
                </div>
                <p className="font-medium leading-relaxed italic">
                  "{currentPlan.admin_note || currentPlan.note || 'Không có ghi chú thêm.'}"
                </p>
              </div>
            )}

            {/* TÓM TẮT NỘI DUNG 5 ĐỜI */}
            <div className="space-y-2 pt-1">
              <p className="font-black text-slate-800 uppercase text-[10px] tracking-wider">TÓM TẮT NỘI DUNG 5 ĐỜI:</p>
              {lineSummaryBlocks.map((block, idx) => (
                <div key={idx} className="flex items-start justify-between border-b border-slate-100 pb-1.5 text-slate-800">
                  <span className="font-extrabold shrink-0 w-16">{block.title || `Đời ${idx}`}:</span>
                  <span className="font-semibold text-right leading-tight text-slate-700">
                    {block.text}
                  </span>
                </div>
              ))}
            </div>

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

              {!isRejected && (
                <button
                  type="button"
                  disabled={isPending || busy}
                  className="min-h-[48px] flex items-center justify-center gap-1.5 rounded-2xl bg-indigo-600 px-3 text-xs font-black text-white shadow-sm hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
                  onClick={() => navigate(`/op/mfo/plans/new?draft=${selectedTicketId}`)}
                >
                  <FileEdit className="h-4 w-4" />
                  <span>{isNeedsRevision ? 'Sửa theo BP' : 'Sửa khung'}</span>
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
    </div>
  );
}

export default MyMfoPlans;