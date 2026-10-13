/**
 * PATH       : src/features/mfo/components/history/MfoReadOnlyPreviewModal.jsx
 * DATETIME   : 2026-10-12T16:05:00+07:00
 * VERSION    : 2.1.1-DOCTRINE211-PREVIEWMODAL
 * DESCRIPTION:
 * - Lớp phủ xem riêng biệt (Read-Only Overlay) để soi lại bản vẽ Sơ đồ/Tờ khai cũ.
 * - Tuyệt đối không nạp đè lên Cây/Form đang soạn của EU.
 * - Bấm nút "Đóng lớp xem" lập tức trả về nguyên trạng công việc hiện tại.
 * REFERENCE  : MFO-FE-DOCTRINE-2.1 Section 12; Patch Plan 2.1.1 Section 7
 */

import React from 'react';
import { Eye, X, Shield, Network } from 'lucide-react';

export function MfoReadOnlyPreviewModal({
  isOpen,
  previewAttempt = null,
  onClose,
}) {
  if (!isOpen || !previewAttempt) return null;

  const attemptNo = previewAttempt.attempt_no || 'Cũ';
  const snapshotData = previewAttempt.snapshot_payload || {};

  return (
    <div className="fixed inset-0 z-[999] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 animate-in fade-in duration-200">
      <div className="w-full max-w-[480px] max-h-[85vh] bg-white rounded-3xl p-4 shadow-2xl border-2 border-amber-400 flex flex-col justify-between space-y-3">
        
        {/* Header Lớp Xem Riêng */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-amber-100 text-amber-800 rounded-xl">
              <Eye className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase text-amber-800 tracking-wider block">
                Đang soi bản ghi lịch sử (Read-Only)
              </span>
              <h3 className="text-xs font-black text-slate-900">
                Sơ đồ Khung Lần trình {attemptNo}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center transition-all"
            title="Đóng lớp xem"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cảnh báo Chế độ Chỉ xem không nạp đè */}
        <div className="bg-amber-50 border border-amber-200 p-2.5 rounded-xl text-[11px] font-extrabold text-amber-950 flex items-center gap-1.5">
          <Shield className="w-4 h-4 text-amber-600 shrink-0" />
          <span>Đây là bản vẽ snapshot cũ ở chế độ CHỈ XEM. Cây 5L đang soạn thảo của bác vẫn được bảo toàn nguyên vẹn bên dưới.</span>
        </div>

        {/* Khung Canvas Preview Snapshot Cũ */}
        <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-4 flex-1 overflow-y-auto space-y-2 min-h-[240px] flex flex-col items-center justify-center">
          <div className="flex items-center gap-1.5 text-xs font-black text-slate-700 mb-2">
            <Network className="w-4 h-4 text-indigo-600" />
            <span>Sơ đồ Snapshot Lần trình {attemptNo}</span>
          </div>

          <div className="p-3 bg-white border border-slate-300 rounded-xl shadow-sm text-center text-xs font-bold text-slate-800 min-w-[200px]">
            {snapshotData.origin_node_name || 'Nguyễn Văn A (Mốc M)'}
            <span className="block text-[10px] font-normal text-slate-400 mt-0.5">
              Đợt nộp: {previewAttempt.created_at || '10/10/2026'}
            </span>
          </div>
        </div>

        {/* Nút Đóng lớp xem (Quay về cây hiện tại) */}
        <div className="pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[52px] bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-md active:scale-98 transition-all flex items-center justify-center"
          >
            Đóng lớp xem (Quay về Cây 5L hiện tại)
          </button>
        </div>

      </div>
    </div>
  );
}

export default MfoReadOnlyPreviewModal;