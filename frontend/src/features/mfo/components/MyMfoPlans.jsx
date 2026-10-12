/**
 * PATH       : src/features/mfo/components/MyMfoPlans.jsx
 * DATETIME   : 2026-10-12T15:30:00+07:00
 * VERSION    : 2.1.1-DOCTRINE211-DROPDOWN
 * DESCRIPTION:
 * - Dropdown danh sách Tờ trình cho EU. Có mục mặc định "-- Bấm để chọn --" tự động tải lại danh sách[cite: 7, 18, 20].
 * - Tự động chọn Tờ trình ACTIVE khi mở.
 * - Thực thi Ma trận Quyền xóa EU[cite: 8, 20].
 * REFERENCE  : MFO-FE-DOCTRINE-2.1 Section 6 & 10; Patch Plan 2.1.1 Section 4
 */

import React, { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Plus, Trash2, Calendar } from 'lucide-react';
import { resolveMfoLifecycle } from '../lib/mfoLifecycleMapper';

export function MyMfoPlans({
  plans = [],
  activeTicketId = null,
  loading = false,
  onSelectPlan,
  onReloadPlans,
  onCreateNewPlan,
  onDeletePlan,
}) {
  const [selectedId, setSelectedId] = useState(activeTicketId || '');

  // Cập nhật selectedId khi prop activeTicketId đổi
  useEffect(() => {
    if (activeTicketId) {
      setSelectedId(activeTicketId);
    }
  }, [activeTicketId]);

  // Kiểm tra xem có Tờ trình Active nào chưa xong không
  const hasActivePipeline = plans.some((p) => {
    const lifecycle = resolveMfoLifecycle(p);
    return lifecycle.stage !== 'CLOSED' && lifecycle.viewMode !== 'TERMINAL_REJECT';
  });

  const handleSelectChange = useCallback(
    (e) => {
      const val = e.target.value;
      setSelectedId(val);

      if (val === '') {
        // CHỌN MỤC MẶC ĐỊNH -> TẢI LAI DANH SÁCH KHÔNG ĐIỀU HƯỚNG SANG TỜ NÀO[cite: 7, 18, 20]
        if (onReloadPlans) onReloadPlans();
      } else if (onSelectPlan) {
        const found = plans.find((p) => String(p.id) === String(val));
        onSelectPlan(found || val);
      }
    },
    [plans, onReloadPlans, onSelectPlan]
  );

  const selectedPlan = plans.find((p) => String(p.id) === String(selectedId));
  const selectedLifecycle = selectedPlan ? resolveMfoLifecycle(selectedPlan) : null;

  return (
    <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
          <Calendar className="w-4 h-4 text-indigo-600" />
          <span>Chọn công việc trong danh sách:</span>
        </label>
        
        <button
          type="button"
          onClick={() => onReloadPlans && onReloadPlans()}
          disabled={loading}
          className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 transition-all min-h-[44px] min-w-[44px] flex items-center justify-center"
          title="Tải lại danh sách"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
        </button>
      </div>

      {/* DROPDOWN DANH SÁCH MỤC MẶC ĐỊNH "BẤM ĐỂ CHỌN"[cite: 7, 18, 20] */}
      <div className="relative">
        <select
          value={selectedId}
          onChange={handleSelectChange}
          disabled={loading}
          className="w-full min-h-[48px] bg-indigo-50/80 border-2 border-indigo-200 focus:border-indigo-600 rounded-xl px-3 py-2 text-xs font-black text-indigo-950 outline-none transition-all shadow-inner"
        >
          <option value="">-- Bấm để chọn --</option>
          {plans.map((plan) => {
            const lifecycle = resolveMfoLifecycle(plan);
            const dateStr = plan.updated_at
              ? new Date(plan.updated_at).toLocaleDateString('vi-VN')
              : '';
            return (
              <option key={plan.id} value={plan.id}>
                {dateStr ? `${dateStr} - ` : ''}{lifecycle.dropdownLabel}
              </option>
            );
          })}
        </select>
      </div>

      {/* NÚT TẠO MỚI (ẨN KHI CÒN TỜ CHƯA XONG)[cite: 7, 18, 20] */}
      {!hasActivePipeline && (
        <button
          type="button"
          onClick={() => onCreateNewPlan && onCreateNewPlan()}
          className="w-full min-h-[48px] bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-md active:scale-98 transition-all flex items-center justify-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>+ Khởi tạo Khung Ý định mới</span>
        </button>
      )}

      {/* THÔNG TIN TÓM TẮT & NÚT XÓA TỜ TRÌNH DỰA TRÊN MA TRẬN XÓA[cite: 8, 20] */}
      {selectedPlan && selectedLifecycle && (
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-500">
            Mã tờ: #{selectedPlan.id}
          </span>

          {selectedLifecycle.canDelete && onDeletePlan && (
            <button
              type="button"
              onClick={() => onDeletePlan(selectedPlan.id)}
              className="min-h-[44px] px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl font-bold text-xs flex items-center gap-1 active:scale-95 transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Xóa Tờ trình</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default MyMfoPlans;