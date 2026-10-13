/**
 * PATH       : src/features/mfo/components/history/MfoHistoryChain.jsx
 * DATETIME   : 2026-10-12T16:00:00+07:00
 * VERSION    : 2.1.1-DOCTRINE211-HISTORY
 * DESCRIPTION:
 * - Lịch sử các lần nộp dạng Card gập di động, mặc định thu gọn vòng cũ.
 * - Chuẩn hóa ngôn ngữ: Gọi "Lần trình", không gọi "lần xem".
 * - Nút "Soi lại Sơ đồ bản cũ" mở Lớp xem riêng biệt (Modal Read-Only), đóng lại giữ nguyên cây đang soạn.
 * REFERENCE  : MFO-FE-DOCTRINE-2.1 Section 12; Patch Plan 2.1.1 Section 7
 */

import React, { useState } from 'react';
import { History, ChevronDown, ChevronUp, Eye, ShieldAlert, CheckCircle2, XCircle } from 'lucide-react';

export function MfoHistoryChain({
  attempts = [],
  onOpenPreviewModal, // Callback mở Lớp xem riêng biệt Read-Only
}) {
  // Quản lý trạng thái mở/thu gập của từng đợt trình (mặc định thu vòng cũ)
  const [expandedIndex, setExpandedIndex] = useState(0); // Vòng mới nhất (index 0) mở, các vòng cũ thu

  if (!attempts || attempts.length === 0) {
    return (
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 text-center text-xs font-bold text-slate-400">
        Chưa có lịch sử các lần trình trước đó.
      </div>
    );
  }

  const toggleCard = (idx) => {
    setExpandedIndex((prev) => (prev === idx ? -1 : idx));
  };

  return (
    <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
      
      {/* Header Lịch sử */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
        <div className="flex items-center gap-1.5">
          <div className="p-1.5 bg-indigo-100 text-indigo-700 rounded-lg">
            <History className="w-4 h-4" />
          </div>
          <span className="text-xs font-black uppercase tracking-wider text-slate-900">
            Lịch sử Lần trình & Bút phê
          </span>
        </div>
        <span className="text-[10px] font-extrabold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
          {attempts.length} Lần trình
        </span>
      </div>

      {/* Danh sách các Card Lần trình gập/mở */}
      <div className="space-y-2">
        {attempts.map((item, index) => {
          const isLatest = index === 0;
          const isExpanded = expandedIndex === index;
          const attemptNo = attempts.length - index;
          const dateStr = item.created_at
            ? new Date(item.created_at).toLocaleString('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              })
            : '';

          return (
            <div
              key={item.id || index}
              className={`border rounded-2xl transition-all ${
                isLatest
                  ? 'bg-indigo-50/70 border-indigo-300'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              {/* Header Card (Bấm để gập/mở) */}
              <button
                type="button"
                onClick={() => toggleCard(index)}
                className="w-full p-3 flex items-center justify-between text-left min-h-[48px] outline-none"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-black px-2 py-0.5 rounded-md ${
                      isLatest ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-white'
                    }`}
                  >
                    Lần trình {attemptNo}
                  </span>
                  <span className="text-xs font-black text-slate-900">
                    {item.status_label || item.status || 'Đã nộp'}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-slate-400">
                  <span className="text-[10px] font-bold text-slate-500">{dateStr}</span>
                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </button>

              {/* Nội dung Mở rộng khi Unfold */}
              {isExpanded && (
                <div className="p-3 pt-0 border-t border-slate-200/60 space-y-2.5 text-xs">
                  
                  {/* Bút phê Tổng thể Admin */}
                  {item.admin_note && (
                    <div className="bg-amber-50/90 border border-amber-200 p-2.5 rounded-xl text-amber-950 font-bold italic leading-snug">
                      📌 Bút phê Admin: "{item.admin_note}"
                    </div>
                  )}

                  {/* Bút phê chi tiết theo Đời (SCS Items nếu có) */}
                  {item.scs_items && Array.isArray(item.scs_items) && item.scs_items.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[10px] font-black uppercase text-slate-500 block">
                        Đánh giá chi tiết từng Đời:
                      </span>
                      {item.scs_items.map((scs, sIdx) => (
                        <div
                          key={sIdx}
                          className={`p-2 rounded-xl text-[11px] font-bold flex items-start gap-1.5 ${
                            scs.approved
                              ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                              : 'bg-rose-50 text-rose-900 border border-rose-200'
                          }`}
                        >
                          {scs.approved ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                          )}
                          <div>
                            <span>Đời {scs.generation_depth}: {scs.approved ? 'Đã duyệt' : 'Không duyệt'}</span>
                            {scs.note && <p className="text-[10px] font-normal italic mt-0.5">{scs.note}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* NÚT SOI LẠI BẢN CỦ VÀO LỚP SOI RIÊNG (READ-ONLY MODAL) */}
                  <button
                    type="button"
                    onClick={() => {
                      if (onOpenPreviewModal) onOpenPreviewModal(item);
                    }}
                    className="w-full min-h-[44px] bg-white border-2 border-indigo-200 hover:bg-indigo-50 text-indigo-950 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 active:scale-98 transition-all shadow-sm"
                  >
                    <Eye className="w-4 h-4 text-indigo-600" />
                    <span>Soi lại Sơ đồ bản Lần trình {attemptNo} (Chế độ xem)</span>
                  </button>

                </div>
              )}
            </div>
          );
        })}
      </div>

    </div>
  );
}

export default MfoHistoryChain;