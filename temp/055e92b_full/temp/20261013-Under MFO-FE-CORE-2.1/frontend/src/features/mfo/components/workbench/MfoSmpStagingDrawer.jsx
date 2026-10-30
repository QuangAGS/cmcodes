/**
 * PATH       : src/features/mfo/components/workbench/MfoSmpStagingDrawer.jsx
 * DATETIME   : 2026-10-12T15:50:00+07:00
 * VERSION    : 2.1.1-DOCTRINE211-DRAWER
 * DESCRIPTION:
 * - Drawer kê khai SMP trực tiếp từ Node nháp trên Cây 5L (Cửa 2 Workbench).
 * - Realtime Mirroring họ tên người lên ô nháp trên Cây 5L khi gõ[cite: 11, 20].
 * - Khóa/Kiểm tra cờ Nội tộc is_clan bắt buộc trước khi lưu[cite: 18, 20].
 * REFERENCE  : MFO-FE-DOCTRINE-2.1 Section 10; Patch Plan 2.1.1 Section 6
 */

import React from 'react';
import { Edit3, X, Check } from 'lucide-react';
import MfoSmpFormFields from './MfoSmpFormFields';

export function MfoSmpStagingDrawer({
  isOpen,
  activeNode,
  smpStagingData = {},
  onClose,
  onChangeSmpField,
  onSaveStaging,
}) {
  if (!isOpen || !activeNode) return null;

  const nodeKey = activeNode.activeUnionDraftId || activeNode.id;
  const currentSmp = smpStagingData[nodeKey] || {};
  const isChild = activeNode.id && String(activeNode.id).startsWith('draft-child-');

  // Xử lý thay đổi từng field SMP và gọi Mirroring tên lên Cây 5L
  const handleFieldChange = (field, value) => {
    if (onChangeSmpField) {
      onChangeSmpField(nodeKey, field, value, activeNode);
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm flex items-end p-2 md:p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-[480px] mx-auto bg-white rounded-3xl p-4 space-y-3 shadow-2xl animate-in slide-in-from-bottom duration-200 border-2 border-indigo-500 max-h-[85vh] flex flex-col justify-between">
        
        {/* Header Drawer */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <div className="flex items-center gap-1.5">
            <div className="p-1.5 bg-indigo-100 text-indigo-700 rounded-lg">
              <Edit3 className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase text-indigo-600 tracking-wider block">
                Khai báo thông tin trên Cây
              </span>
              <h3 className="text-xs font-black text-slate-900">
                {activeNode.label || activeNode.full_name || 'Ô nháp đang chọn'}
              </h3>
            </div>
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

        {/* Nội dung Form Kê khai SMP Đầy Đủ */}
        <div className="overflow-y-auto flex-1 pr-1">
          <MfoSmpFormFields
            smpData={currentSmp}
            isChild={isChild}
            onChangeField={handleFieldChange}
          />
        </div>

        {/* Cụm Nút bấm Đáy */}
        <div className="pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => {
              if (onSaveStaging) onSaveStaging();
              if (onClose) onClose();
            }}
            className="w-full min-h-[48px] bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-md active:scale-98 transition-all flex items-center justify-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>Lưu thông tin ô này</span>
          </button>
        </div>

      </div>
    </div>
  );
}

export default MfoSmpStagingDrawer;