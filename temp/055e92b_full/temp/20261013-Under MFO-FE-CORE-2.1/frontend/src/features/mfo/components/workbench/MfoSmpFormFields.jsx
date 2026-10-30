/**
 * PATH       : src/features/mfo/components/workbench/MfoSmpFormFields.jsx
 * DATETIME   : 2026-10-12T15:45:00+07:00
 * VERSION    : 2.1.1-DOCTRINE211-SMPFIELDS
 * DESCRIPTION:
 * - Các trường Form kê khai Hồ sơ Nhân sự SMP đầy đủ theo Amendment 4[cite: 11, 13, 20].
 * - Tích hợp câu hỏi khẳng định Nội tộc (is_clan) bắt buộc theo Amendment 5 & Patch Plan 2.1.1.
 * - 🛑 CẤM HIỂN THỊ CÁC TRƯỜNG KHUNG: generation, father_id, mother_id, parent_union_id[cite: 11, 13, 18, 20].
 * REFERENCE  : MFO-FE-DOCTRINE-2.1 Section 10; Patch Plan 2.1.1 Section 6
 */

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, UserCheck, ShieldAlert } from 'lucide-react';

export function MfoSmpFormFields({
  smpData = {},
  isChild = false,
  onChangeField,
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Cập nhật giá trị trường form
  const handleChange = (field, value) => {
    if (onChangeField) {
      onChangeField(field, value);
    }
  };

  return (
    <div className="space-y-3 text-xs">
      
      {/* 1. HỌ VÀ TÊN (BẮT BUỘC)[cite: 11, 13, 18, 20] */}
      <div>
        <label className="block text-[10px] font-black uppercase text-slate-600 mb-1">
          Họ và tên (*):
        </label>
        <input
          type="text"
          value={smpData.full_name || ''}
          onChange={(e) => handleChange('full_name', e.target.value)}
          placeholder="Nhập họ tên đầy đủ..."
          className="w-full min-h-[44px] p-2.5 bg-white border-2 border-indigo-200 focus:border-indigo-600 rounded-xl font-black text-slate-900 outline-none transition-all"
        />
      </div>

      {/* 2. GIỚI TÍNH VÀ TÌNH TRẠNG SỐNG (BẮT BUỘC)[cite: 11, 13, 18, 20] */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] font-black uppercase text-slate-600 mb-1">
            Giới tính (*):
          </label>
          <select
            value={smpData.gender || 'NAM'}
            onChange={(e) => handleChange('gender', e.target.value)}
            className="w-full min-h-[44px] p-2.5 bg-white border border-slate-200 focus:border-indigo-600 rounded-xl font-bold text-slate-900 outline-none"
          >
            <option value="NAM">Nam</option>
            <option value="NU">Nữ</option>
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-black uppercase text-slate-600 mb-1">
            Tình trạng (*):
          </label>
          <select
            value={smpData.is_alive !== false ? 'true' : 'false'}
            onChange={(e) => handleChange('is_alive', e.target.value === 'true')}
            className="w-full min-h-[44px] p-2.5 bg-white border border-slate-200 focus:border-indigo-600 rounded-xl font-bold text-slate-900 outline-none"
          >
            <option value="true">Còn sống</option>
            <option value="false">Đã mất</option>
          </select>
        </div>
      </div>

      {/* 3. CÂU HỎI BẮT BUỘC CỜ NỘI TỘC (AMENDMENT 5 & PATCH PLAN 2.1.1)[cite: 18, 20] */}
      <div className="p-3 bg-amber-50/90 border-2 border-amber-300 rounded-2xl space-y-2">
        <div className="flex items-start gap-1.5 text-amber-950 font-black text-[11px]">
          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <span>Người này có phải người nội tộc không? (*)</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => handleChange('is_clan', true)}
            className={`min-h-[44px] rounded-xl font-black text-xs flex items-center justify-center gap-1 border transition-all ${
              smpData.is_clan === true
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>Đúng (Nội tộc)</span>
          </button>

          <button
            type="button"
            onClick={() => handleChange('is_clan', false)}
            className={`min-h-[44px] rounded-xl font-black text-xs flex items-center justify-center gap-1 border transition-all ${
              smpData.is_clan === false
                ? 'bg-amber-600 text-white border-amber-600 shadow-md'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            <span>Ngoại tộc</span>
          </button>
        </div>
        {smpData.is_clan === undefined && (
          <p className="text-[10px] font-extrabold text-rose-600 italic">
            ⚠️ Bác chưa khẳng định nội tộc. Thiếu trường này sẽ không thể trình Tờ khai!
          </p>
        )}
      </div>

      {/* 4. LOẠI CON (CHỈ HIỂN THỊ ĐỐI VỚI NODE CON)[cite: 11, 13, 18, 20] */}
      {isChild && (
        <div>
          <label className="block text-[10px] font-black uppercase text-slate-600 mb-1">
            Loại con (child_type):
          </label>
          <select
            value={smpData.child_type || 'CON_DE'}
            onChange={(e) => handleChange('child_type', e.target.value)}
            className="w-full min-h-[44px] p-2.5 bg-white border border-slate-200 focus:border-indigo-600 rounded-xl font-bold text-slate-900 outline-none"
          >
            <option value="CON_DE">Con đẻ (Con ruột)</option>
            <option value="CON_NUOI">Con nuôi</option>
            <option value="CON_DAU">Con dâu</option>
            <option value="CON_RE">Con rể</option>
          </select>
        </div>
      )}

      {/* 5. NĂM SINH VÀ NĂM MẤT CƠ BẢN[cite: 11, 13, 20] */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] font-black uppercase text-slate-600 mb-1">
            Năm sinh:
          </label>
          <input
            type="number"
            value={smpData.birth_year || ''}
            onChange={(e) => handleChange('birth_year', e.target.value)}
            placeholder="Ví dụ: 1998"
            className="w-full min-h-[44px] p-2.5 bg-white border border-slate-200 focus:border-indigo-600 rounded-xl font-bold text-slate-900 outline-none"
          />
        </div>

        {smpData.is_alive === false && (
          <div>
            <label className="block text-[10px] font-black uppercase text-slate-600 mb-1">
              Năm mất:
            </label>
            <input
              type="number"
              value={smpData.death_year || ''}
              onChange={(e) => handleChange('death_year', e.target.value)}
              placeholder="Ví dụ: 2020"
              className="w-full min-h-[44px] p-2.5 bg-white border border-slate-200 focus:border-indigo-600 rounded-xl font-bold text-slate-900 outline-none"
            />
          </div>
        )}
      </div>

      {/* 6. GHI CHÚ CHUNG (`note`)[cite: 11, 13, 20] */}
      <div>
        <label className="block text-[10px] font-black uppercase text-slate-600 mb-1">
          Ghi chú thêm:
        </label>
        <textarea
          rows={2}
          value={smpData.note || ''}
          onChange={(e) => handleChange('note', e.target.value)}
          placeholder="Thông tin chú thích thêm..."
          className="w-full p-2.5 bg-white border border-slate-200 focus:border-indigo-600 rounded-xl font-medium text-slate-900 outline-none"
        />
      </div>

      {/* 7. PHẦN TÙY CHỌN MỞ RỘNG (ACCORDION MỞ RỘNG)[cite: 11, 13, 20] */}
      <div className="border-t border-slate-200 pt-2">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full min-h-[40px] px-3 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold text-slate-700 text-xs flex items-center justify-between transition-all"
        >
          <span>Chi tiết Ngày/Tháng sinh, mất & Âm lịch</span>
          {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showAdvanced && (
          <div className="mt-2.5 p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5 animate-in fade-in duration-150">
            {/* Ngày/Tháng sinh */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[9px] font-bold uppercase text-slate-500 mb-0.5">
                  Ngày sinh:
                </label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={smpData.birth_day || ''}
                  onChange={(e) => handleChange('birth_day', e.target.value)}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg font-bold"
                />
              </div>
              <div>
                <label className="block text-[9px] font-bold uppercase text-slate-500 mb-0.5">
                  Tháng sinh:
                </label>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={smpData.birth_month || ''}
                  onChange={(e) => handleChange('birth_month', e.target.value)}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg font-bold"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={Boolean(smpData.is_birth_lunar)}
                onChange={(e) => handleChange('is_birth_lunar', e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600"
              />
              <span className="text-[11px] font-bold text-slate-700">Ngày sinh tính theo Âm lịch</span>
            </label>

            {/* Chi tiết thông tin mất */}
            {smpData.is_alive === false && (
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <div class="grid grid-cols-2 gap-2">
                  <div>
                    <label class="block text-[9px] font-bold uppercase text-slate-500 mb-0.5">
                      Ngày mất:
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={smpData.death_day || ''}
                      onChange={(e) => handleChange('death_day', e.target.value)}
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold uppercase text-slate-500 mb-0.5">
                      Tháng mất:
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={smpData.death_month || ''}
                      onChange={(e) => handleChange('death_month', e.target.value)}
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg font-bold"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(smpData.is_death_lunar)}
                    onChange={(e) => handleChange('is_death_lunar', e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600"
                  />
                  <span className="text-[11px] font-bold text-slate-700">Ngày mất tính theo Âm lịch</span>
                </label>

                <div>
                  <label className="block text-[9px] font-bold uppercase text-slate-500 mb-0.5">
                    Ghi chú phần mộ / Nơi an nghỉ:
                  </label>
                  <textarea
                    rows={2}
                    value={smpData.death_note || ''}
                    onChange={(e) => handleChange('death_note', e.target.value)}
                    placeholder="Nhập vị trí phần mộ..."
                    className="w-full p-2 bg-white border border-slate-200 rounded-lg font-medium text-xs"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}

export default MfoSmpFormFields;