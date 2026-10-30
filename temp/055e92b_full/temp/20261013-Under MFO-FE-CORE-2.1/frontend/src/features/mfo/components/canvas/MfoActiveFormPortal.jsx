/**
 * PATH       : src/features/mfo/components/canvas/MfoActiveFormPortal.jsx
 * DATETIME   : 2026-10-12T15:35:00+07:00
 * VERSION    : 2.1.1-DOCTRINE211-AF7
 * DESCRIPTION:
 * - Active Form Portal nổi 7 Nút (Bố cục 2 cột chuẩn Amendment 2)[cite: 9, 18, 20].
 * - Hàng A: Chọn người từ sổ họ[cite: 9, 18, 20].
 * - 3 Cặp Thao tác/Đảo: Thêm/Hủy con, Thêm/Hủy vợ/chồng, Khai/Hủy khuyết danh[cite: 9, 18, 20].
 * - Bấm Hủy gỡ ô, cạnh hoặc tab nháp thực sự khỏi canvas_delta (không chỉ Toast)[cite: 9, 18, 20].
 * REFERENCE  : MFO-FE-DOCTRINE-2.1 Section 10; Patch Plan 2.1.1 Section 5
 */

import React from 'react';
import { Search, UserPlus, UserMinus, HeartHandshake, HeartOff, UserCheck, UserX, X } from 'lucide-react';

export function MfoActiveFormPortal({
  isOpen,
  activeNode, // Node đang bấm trên Canvas
  onClose,
  onPickMemberFromBook, // Hàng A: Chọn người từ sổ
  onAddDraftChild,      // b1: Thêm con
  onCancelDraftChild,   // b2: Hủy thêm con
  onAddDraftSpouse,     // c1: Thêm vợ/chồng
  onCancelDraftSpouse,  // c2: Hủy thêm vợ/chồng
  onDeclareAnonymous,   // d1: Khai khuyết danh
  onCancelAnonymous,    // d2: Hủy khai khuyết danh
}) {
  if (!isOpen || !activeNode) return null;

  const isDraftChild = activeNode.id && String(activeNode.id).startsWith('draft-child-');
  const hasDraftSpouseTab = Boolean(activeNode.data?.activeUnionDraftId || activeNode.activeUnionDraftId);
  const isAnonymousNode = Boolean(activeNode.is_anonymous || activeNode.data?.isAnonymous);
  const nodeDepth = Number(activeNode.depth ?? activeNode.data?.depth ?? 0);

  // Điều kiện hiển thị các nút theo Amendment 2 & Doctrine 2.1[cite: 9, 18]
  const canAddChild = nodeDepth < 4;
  const canCancelChild = isDraftChild;
  const canAddSpouse = true;
  const canCancelSpouse = hasDraftSpouseTab;
  const canDeclareAnonymous = !isAnonymousNode;
  const canCancelAnonymous = isAnonymousNode && activeNode.originSource === 'from_empty';

  return (
    <div className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm flex items-end p-3 animate-in fade-in duration-150">
      <div className="w-full max-w-[480px] mx-auto bg-white rounded-3xl p-4 space-y-3 shadow-2xl animate-in slide-in-from-bottom duration-200 border-2 border-indigo-500">
        
        {/* Header Modal */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <div>
            <span class="text-[10px] font-black uppercase text-indigo-600 tracking-wider block">
              Bảng tác vụ Ý định (Active Form)
            </span>
            <h3 className="text-xs font-black text-slate-900">
              {activeNode.label || activeNode.full_name || 'Vị trí trên Cây 5L'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center transition-all"
            title="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cụm 7 Nút Bố cục 2 Cột chuẩn Amendment 2[cite: 9, 18, 20] */}
        <div className="space-y-2">
          
          {/* HÀNG A: CHỌN NGƯỜI TỪ SỔ HỌ (FULL WIDTH)[cite: 9, 18, 20] */}
          <button
            type="button"
            onClick={() => {
              if (onPickMemberFromBook) onPickMemberFromBook(activeNode);
            }}
            className="w-full min-h-[48px] bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-2xl shadow-md flex items-center justify-center gap-1.5 active:scale-98 transition-all"
          >
            <Search className="w-4 h-4" />
            <span>Chọn người từ sổ họ</span>
          </button>

          {/* 3 CẶP THAO TÁC VÀ ĐẢO (2 CỘT)[cite: 9, 18, 20] */}
          <div class="grid grid-cols-2 gap-2">
            
            {/* CẶP B: CON[cite: 9, 18, 20] */}
            <button
              type="button"
              disabled={!canAddChild}
              onClick={() => {
                if (onAddDraftChild) onAddDraftChild(activeNode);
              }}
              className="min-h-[48px] px-2 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-950 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <UserPlus className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>Thêm con</span>
            </button>

            <button
              type="button"
              disabled={!canCancelChild}
              onClick={() => {
                if (onCancelDraftChild) onCancelDraftChild(activeNode);
              }}
              className="min-h-[48px] px-2 bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-800 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <UserMinus className="w-4 h-4 text-rose-600 shrink-0" />
              <span>Hủy thêm con</span>
            </button>

            {/* CẶP C: HÔN PHỐI[cite: 9, 18, 20] */}
            <button
              type="button"
              disabled={!canAddSpouse}
              onClick={() => {
                if (onAddDraftSpouse) onAddDraftSpouse(activeNode);
              }}
              className="min-h-[48px] px-2 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-950 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <HeartHandshake className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>Thêm vợ/chồng</span>
            </button>

            <button
              type="button"
              disabled={!canCancelSpouse}
              onClick={() => {
                if (onCancelDraftSpouse) onCancelDraftSpouse(activeNode);
              }}
              className="min-h-[48px] px-2 bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-800 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <HeartOff className="w-4 h-4 text-rose-600 shrink-0" />
              <span>Hủy thêm vợ/chồng</span>
            </button>

            {/* CẶP D: KHUYẾT DANH[cite: 9, 18, 20] */}
            <button
              type="button"
              disabled={!canDeclareAnonymous}
              onClick={() => {
                if (onDeclareAnonymous) onDeclareAnonymous(activeNode);
              }}
              className="min-h-[48px] px-2 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-950 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <UserCheck className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>Khai khuyết danh</span>
            </button>

            <button
              type="button"
              disabled={!canCancelAnonymous}
              onClick={() => {
                if (onCancelAnonymous) onCancelAnonymous(activeNode);
              }}
              className="min-h-[48px] px-2 bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-800 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <UserX className="w-4 h-4 text-rose-600 shrink-0" />
              <span>Hủy khai khuyết danh</span>
            </button>

          </div>

        </div>

      </div>
    </div>
  );
}

export default MfoActiveFormPortal;