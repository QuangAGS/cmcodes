/**
 * =============================================================================
 * PATH        : frontend/src/features/membership/components/RegistrationProfileForm.jsx
 * DATETIME    : 2026-11-10T11:55:00+07:00
 * VERSION     : 1.1.0-REGISTRATION-PROFILE-FORM-VALIDATED
 * DESCRIPTION : Biểu mẫu khai báo thông tin phả hệ 21 trường (AMEND-RP-OP-2026-01-V1.1).
 *               Tích hợp bộ kiểm tra tính hợp lệ dữ liệu client-side khớp 100%
 *               với hàm validateRegistrationProfile của Backend nhằm loại bỏ hoàn toàn
 *               các mã lỗi 400 VALIDATION_REQUIRED, VALIDATION_MAX, VALIDATION_MIN.
 * =============================================================================
 * CHANGELOGS:
 * - 2026-11-10T11:22:00+07:00 (v1.0.0-REGISTRATION-PROFILE-FORM-21F):
 *   + Khởi tạo 21 trường dữ liệu cơ bản theo AMEND.
 * - 2026-11-10T11:55:00+07:00 (v1.1.0-REGISTRATION-PROFILE-FORM-VALIDATED):
 *   + Bổ sung client-side validation logic tương đương Backend SSOT validator.
 *   + Giữ nút bấm chuẩn Elder min-h-[52px], cỡ chữ to, tương phản cao.
 * =============================================================================
 */

import React, { useState } from 'react';

/**
 * Bộ quy chuẩn ràng buộc trường dữ liệu khớp chuẩn Backend AMEND-RP-OP-2026-01-V1.1
 */
const CLIENT_VALIDATION_RULES = {
  full_name: { required: true, max: 100, label: 'Họ và tên chính thức' },
  alias: { max: 100, label: 'Tên thường gọi / Tên húy' },
  gender: { required: true, enum: ['NAM', 'NU', 'KHAC'], label: 'Giới tính' },
  birth_year: { min: 1800, max: new Date().getFullYear(), label: 'Năm sinh' },
  birth_month: { min: 1, max: 12, label: 'Tháng sinh' },
  birth_day: { min: 1, max: 31, label: 'Ngày sinh' },
  birth_place: { max: 200, label: 'Nơi sinh' },
  death_year: { min: 1800, max: new Date().getFullYear(), label: 'Năm mất' },
  generation: { min: 1, max: 20, label: 'Đời thứ' },
  phone: { max: 20, label: 'Số điện thoại' },
  email: { max: 100, label: 'Hộp thư điện tử' },
  branch_name: { max: 100, label: 'Tên Chi / Nhánh' },
  father_name: { max: 100, label: 'Họ tên Cha' },
  mother_name: { max: 100, label: 'Họ tên Mẹ' },
  grandfather_name: { max: 100, label: 'Họ tên Ông nội' },
  grandmother_name: { max: 100, label: 'Họ tên Bà nội' },
  address: { max: 500, label: 'Địa chỉ thường trú' },
  note: { max: 1000, label: 'Ghi chú' },
};

export const RegistrationProfileForm = ({
  initialValues = {},
  onSubmit,
  isSubmitting = false,
  mode = 'CREATE', // 'CREATE' | 'REVISION'
  revisionFeedback = '',
}) => {
  const [formData, setFormData] = useState({
    full_name: initialValues.full_name || '',
    alias: initialValues.alias || '',
    gender: initialValues.gender || 'NAM',
    birth_year: initialValues.birth_year || '',
    birth_month: initialValues.birth_month || '',
    birth_day: initialValues.birth_day || '',
    birth_place: initialValues.birth_place || '',
    death_year: initialValues.death_year || '',
    is_alive: initialValues.is_alive !== undefined ? initialValues.is_alive : true,
    generation: initialValues.generation || '',
    phone: initialValues.phone || '',
    email: initialValues.email || '',
    member_role: initialValues.member_role || 'THANH_VIEN',
    branch_name: initialValues.branch_name || '',
    father_name: initialValues.father_name || '',
    mother_name: initialValues.mother_name || '',
    grandfather_name: initialValues.grandfather_name || '',
    grandmother_name: initialValues.grandmother_name || '',
    address: initialValues.address || '',
    note: initialValues.note || '',
    claimed_member_id: initialValues.claimed_member_id || '',
    proof_documents: initialValues.proof_documents || [],
    social_facebook: initialValues.social_profiles?.facebook || '',
    social_zalo: initialValues.social_profiles?.zalo || '',
  });

  const [validationError, setValidationError] = useState('');

  const handleChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  /**
   * Thẩm định dữ liệu tương đồng với validateRegistrationProfile (Backend)
   */
  const validateForm = () => {
    for (const [key, rule] of Object.entries(CLIENT_VALIDATION_RULES)) {
      const val = formData[key];

      // Kiểm tra trường bắt buộc
      if (rule.required && (!val || !val.toString().trim())) {
        return `Trường [${rule.label}] là bắt buộc.`;
      }

      if (val !== undefined && val !== null && val !== '') {
        // Kiểm tra độ dài tối đa chuỗi
        if (rule.max && typeof val === 'string' && val.length > rule.max) {
          return `Trường [${rule.label}] không được vượt quá ${rule.max} ký tự.`;
        }

        // Kiểm tra giá trị số (min / max)
        if (rule.min !== undefined || (rule.max !== undefined && typeof val === 'number')) {
          const numVal = Number(val);
          if (isNaN(numVal)) {
            return `Trường [${rule.label}] phải là một con số hợp lệ.`;
          }
          if (rule.min !== undefined && numVal < rule.min) {
            return `Trường [${rule.label}] phải lớn hơn hoặc bằng ${rule.min}.`;
          }
          if (rule.max !== undefined && numVal > rule.max) {
            return `Trường [${rule.label}] không được vượt quá ${rule.max}.`;
          }
        }

        // Kiểm tra giá trị Enum
        if (rule.enum && !rule.enum.includes(val)) {
          return `Giá trị chọn cho trường [${rule.label}] không hợp lệ.`;
        }
      }
    }
    return null;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setValidationError('');

    const error = validateForm();
    if (error) {
      setValidationError(error);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Làm sạch và ép kiểu dữ liệu chuẩn xác trước khi dispatch
    const cleanPayload = {
      ...formData,
      birth_year: formData.birth_year ? Number(formData.birth_year) : undefined,
      birth_month: formData.birth_month ? Number(formData.birth_month) : undefined,
      birth_day: formData.birth_day ? Number(formData.birth_day) : undefined,
      death_year: formData.death_year ? Number(formData.death_year) : undefined,
      generation: formData.generation ? Number(formData.generation) : undefined,
      is_alive: Boolean(formData.is_alive),
      social_profiles: {
        facebook: formData.social_facebook || undefined,
        zalo: formData.social_zalo || undefined,
      },
    };

    delete cleanPayload.social_facebook;
    delete cleanPayload.social_zalo;

    onSubmit(cleanPayload);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-4xl mx-auto">
      {mode === 'REVISION' && revisionFeedback && (
        <div className="p-5 bg-amber-50 border-2 border-amber-400 rounded-2xl">
          <h4 className="text-base font-bold text-amber-950 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-amber-500 text-white flex items-center justify-center text-xs font-black">
              !
            </span>
            Nội dung Ban quản trị yêu cầu bổ sung / chỉnh sửa:
          </h4>
          <p className="mt-2 text-base text-amber-900 font-semibold whitespace-pre-wrap">
            {revisionFeedback}
          </p>
        </div>
      )}

      {validationError && (
        <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded-r-xl text-red-800 font-bold text-base shadow-sm">
          {validationError}
        </div>
      )}

      {/* 1. THÔNG TIN CÁ NHÂN */}
      <section className="p-6 bg-white border border-gray-200 rounded-3xl shadow-sm space-y-6">
        <h3 className="text-xl font-bold text-gray-900 border-b pb-3">
          1. Thông tin cá nhân cơ bản
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-base font-bold text-gray-800 mb-2">
              Họ và tên chính thức (*)
            </label>
            <input
              type="text"
              required
              value={formData.full_name}
              onChange={(e) => handleChange('full_name', e.target.value)}
              placeholder="Ví dụ: Nguyễn Văn An"
              className="w-full px-4 py-3 min-h-[48px] rounded-xl border border-gray-300 text-base focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-base font-bold text-gray-800 mb-2">
              Tên thường gọi / Tên tự / Tên húy
            </label>
            <input
              type="text"
              value={formData.alias}
              onChange={(e) => handleChange('alias', e.target.value)}
              placeholder="Ví dụ: Ba An"
              className="w-full px-4 py-3 min-h-[48px] rounded-xl border border-gray-300 text-base focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-base font-bold text-gray-800 mb-2">
              Giới tính (*)
            </label>
            <select
              value={formData.gender}
              onChange={(e) => handleChange('gender', e.target.value)}
              className="w-full px-4 py-3 min-h-[48px] rounded-xl border border-gray-300 text-base focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="NAM">Nam</option>
              <option value="NU">Nữ</option>
              <option value="KHAC">Khác</option>
            </select>
          </div>

          <div>
            <label className="block text-base font-bold text-gray-800 mb-2">
              Đời thứ (Thế hệ trong dòng họ)
            </label>
            <input
              type="number"
              min="1"
              max="20"
              value={formData.generation}
              onChange={(e) => handleChange('generation', e.target.value)}
              placeholder="Ví dụ: 15"
              className="w-full px-4 py-3 min-h-[48px] rounded-xl border border-gray-300 text-base focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Ngày sinh</label>
            <input
              type="number"
              min="1"
              max="31"
              value={formData.birth_day}
              onChange={(e) => handleChange('birth_day', e.target.value)}
              placeholder="Ngày (1-31)"
              className="w-full px-3 py-2.5 min-h-[48px] rounded-xl border border-gray-300 text-base"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Tháng sinh</label>
            <input
              type="number"
              min="1"
              max="12"
              value={formData.birth_month}
              onChange={(e) => handleChange('birth_month', e.target.value)}
              placeholder="Tháng (1-12)"
              className="w-full px-3 py-2.5 min-h-[48px] rounded-xl border border-gray-300 text-base"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Năm sinh</label>
            <input
              type="number"
              min="1800"
              max={new Date().getFullYear()}
              value={formData.birth_year}
              onChange={(e) => handleChange('birth_year', e.target.value)}
              placeholder={`Năm (1800-${new Date().getFullYear()})`}
              className="w-full px-3 py-2.5 min-h-[48px] rounded-xl border border-gray-300 text-base"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
          <div>
            <label className="block text-base font-bold text-gray-800 mb-2">Nơi sinh</label>
            <input
              type="text"
              value={formData.birth_place}
              onChange={(e) => handleChange('birth_place', e.target.value)}
              placeholder="Xã/Phường, Huyện/Quận, Tỉnh/TP"
              className="w-full px-4 py-3 min-h-[48px] rounded-xl border border-gray-300 text-base"
            />
          </div>

          <div className="flex flex-col justify-center">
            <span className="block text-base font-bold text-gray-800 mb-2">Tình trạng</span>
            <div className="flex items-center gap-6 h-[48px]">
              <label className="flex items-center gap-2 text-base font-medium text-gray-800 cursor-pointer">
                <input
                  type="radio"
                  name="is_alive"
                  checked={formData.is_alive === true}
                  onChange={() => handleChange('is_alive', true)}
                  className="w-5 h-5 text-blue-600"
                />
                Còn sống
              </label>
              <label className="flex items-center gap-2 text-base font-medium text-gray-800 cursor-pointer">
                <input
                  type="radio"
                  name="is_alive"
                  checked={formData.is_alive === false}
                  onChange={() => handleChange('is_alive', false)}
                  className="w-5 h-5 text-blue-600"
                />
                Đã mất
              </label>
            </div>
          </div>
        </div>
      </section>

      {/* 2. HUYẾT THỐNG TIỀN NHÂN */}
      <section className="p-6 bg-white border border-gray-200 rounded-3xl shadow-sm space-y-6">
        <h3 className="text-xl font-bold text-gray-900 border-b pb-3">
          2. Tiền nhân & Nhánh tộc (Thẩm định huyết thống)
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-base font-bold text-gray-800 mb-2">Họ tên Cha</label>
            <input
              type="text"
              value={formData.father_name}
              onChange={(e) => handleChange('father_name', e.target.value)}
              placeholder="Họ tên thân phụ"
              className="w-full px-4 py-3 min-h-[48px] rounded-xl border border-gray-300 text-base"
            />
          </div>

          <div>
            <label className="block text-base font-bold text-gray-800 mb-2">Họ tên Mẹ</label>
            <input
              type="text"
              value={formData.mother_name}
              onChange={(e) => handleChange('mother_name', e.target.value)}
              placeholder="Họ tên thân mẫu"
              className="w-full px-4 py-3 min-h-[48px] rounded-xl border border-gray-300 text-base"
            />
          </div>

          <div>
            <label className="block text-base font-bold text-gray-800 mb-2">Họ tên Ông nội</label>
            <input
              type="text"
              value={formData.grandfather_name}
              onChange={(e) => handleChange('grandfather_name', e.target.value)}
              placeholder="Họ tên ông nội"
              className="w-full px-4 py-3 min-h-[48px] rounded-xl border border-gray-300 text-base"
            />
          </div>

          <div>
            <label className="block text-base font-bold text-gray-800 mb-2">Họ tên Bà nội</label>
            <input
              type="text"
              value={formData.grandmother_name}
              onChange={(e) => handleChange('grandmother_name', e.target.value)}
              placeholder="Họ tên bà nội"
              className="w-full px-4 py-3 min-h-[48px] rounded-xl border border-gray-300 text-base"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-base font-bold text-gray-800 mb-2">Tên Chi / Nhánh dòng họ</label>
            <input
              type="text"
              value={formData.branch_name}
              onChange={(e) => handleChange('branch_name', e.target.value)}
              placeholder="Ví dụ: Chi 2, Nhánh Giáp Ba..."
              className="w-full px-4 py-3 min-h-[48px] rounded-xl border border-gray-300 text-base"
            />
          </div>
        </div>
      </section>

      {/* 3. LIÊN LẠC & ĐỊA CHỈ */}
      <section className="p-6 bg-white border border-gray-200 rounded-3xl shadow-sm space-y-6">
        <h3 className="text-xl font-bold text-gray-900 border-b pb-3">
          3. Thông tin liên lạc & Địa chỉ hiện tại
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-base font-bold text-gray-800 mb-2">Số điện thoại liên hệ</label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => handleChange('phone', e.target.value)}
              placeholder="09xxxxxxxx"
              className="w-full px-4 py-3 min-h-[48px] rounded-xl border border-gray-300 text-base"
            />
          </div>

          <div>
            <label className="block text-base font-bold text-gray-800 mb-2">Hộp thư điện tử (Email)</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => handleChange('email', e.target.value)}
              placeholder="email@example.com"
              className="w-full px-4 py-3 min-h-[48px] rounded-xl border border-gray-300 text-base"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-base font-bold text-gray-800 mb-2">Địa chỉ thường trú</label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => handleChange('address', e.target.value)}
              placeholder="Số nhà, đường phố, thôn/xóm, tỉnh/thành phố"
              className="w-full px-4 py-3 min-h-[48px] rounded-xl border border-gray-300 text-base"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-base font-bold text-gray-800 mb-2">Ghi chú thêm cho Ban quản trị</label>
            <textarea
              rows="3"
              value={formData.note}
              onChange={(e) => handleChange('note', e.target.value)}
              placeholder="Bác có thể ghi thêm thông tin gia cảnh hoặc các chi tiết phả ký khác..."
              className="w-full px-4 py-3 rounded-xl border border-gray-300 text-base"
            />
          </div>
        </div>
      </section>

      {/* NÚT THAO TÁC SUBMIT */}
      <div className="pt-4">
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-4 px-6 min-h-[52px] bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-extrabold text-lg rounded-2xl shadow-xl transition-all focus:outline-none focus:ring-4 focus:ring-blue-200 flex items-center justify-center"
        >
          {isSubmitting
            ? 'Đang kiểm tra và lưu hồ sơ...'
            : mode === 'REVISION'
            ? 'Nộp lại hồ sơ đã bổ sung'
            : 'Hoàn tất & Gửi hồ sơ đăng ký'}
        </button>
      </div>
    </form>
  );
};