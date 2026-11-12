/**
 * ============================================================================
 * PATH       : frontend/src/features/membership/components/RegistrationProfileForm.jsx
 * DATETIME   : 2026-11-12T12:20:00+07:00
 * VERSION    : 1.0.0-MULTIHOME-AMEND02-V15-LAT1
 * DESCRIPTION:
 * - [AMEND-RP-OP-2026-02 V1.5.0 MF-06] Biểu mẫu khai báo nhân thân chuẩn 21 trường phả hệ
 *   (dành cho Case 2 No EM khi người dùng chưa có tên trên cây gia phả).
 * - Tương thích 100% với REGISTRATION_SCHEMA (Backend registrationValidator.js).
 * - Dùng chung cho cả C2 (Guest tại /auth) và C1 (Multi-Home tại /membership/claim).
 * ============================================================================
 */

import { User, GitBranch, MapPin, FileText } from 'lucide-react';

const GENDER_OPTIONS = [
  { value: 'NAM', label: 'Nam' },
  { value: 'NU', label: 'Nữ' },
  { value: 'KHAC', label: 'Khác' },
];

const MEMBER_ROLE_OPTIONS = [
  { value: 'THANH_VIEN', label: 'Thành viên trong họ' },
  { value: 'TRUONG_CHI', label: 'Trưởng chi / Trưởng phái' },
  { value: 'TRUONG_NGANH', label: 'Trưởng ngành' },
  { value: 'TRUONG_TOC', label: 'Trưởng tộc' },
  { value: 'KHAC', label: 'Vai vế khác' },
];

const RELATIONSHIP_OPTIONS = [
  { value: 'CON_DE', label: 'Con đẻ' },
  { value: 'CON_DAU', label: 'Con dâu' },
  { value: 'CON_RE', label: 'Con rể' },
  { value: 'CON_NUOI', label: 'Con nuôi' },
  { value: 'CON_DO_DAU', label: 'Con đỡ đầu' },
  { value: 'KHAC', label: 'Khác' },
];

const RegistrationProfileForm = ({
  value = {},
  onChange,
  onFocusZone,
  disabled = false,
  errors = {},
}) => {
  const profile = {
    full_name: '',
    alias: '',
    gender: 'NAM',
    birth_day: '',
    birth_month: '',
    birth_year: '',
    birth_place: '',
    is_alive: true,
    death_year: '',
    generation: '',
    member_role: 'THANH_VIEN',
    branch_name: '',
    father_name: '',
    mother_name: '',
    grandfather_name: '',
    grandmother_name: '',
    address: '',
    note: '',
    temp_relationship: 'CON_DE',
    social_profiles: { zalo: '', facebook: '' },
    proof_documents: [],
    ...(value || {}),
  };

  const socialProfiles =
    profile.social_profiles && typeof profile.social_profiles === 'object'
      ? profile.social_profiles
      : { zalo: '', facebook: '' };

  const updateField = (field, fieldVal) => {
    onFocusZone?.();
    if (!onChange) return;
    onChange({
      ...profile,
      claim_mode: 'NEW_PROFILE_21',
      claimed_member_id: null,
      [field]: fieldVal,
    });
  };

  const updateSocial = (key, text) => {
    onFocusZone?.();
    if (!onChange) return;
    onChange({
      ...profile,
      claim_mode: 'NEW_PROFILE_21',
      claimed_member_id: null,
      social_profiles: {
        ...socialProfiles,
        [key]: text,
      },
    });
  };

  const inputClass =
    'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100';
  const labelClass = 'block text-xs font-black text-slate-700 mb-1';

  return (
    <div className="space-y-5">
      {/* NHÓM 1: THÔNG TIN NHÂN THÂN */}
      <div className="space-y-3.5 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
        <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-emerald-800">
          <User size={15} />
          1. Thông tin nhân thân
        </h4>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass}>
              Họ và tên khai sinh <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              disabled={disabled}
              value={profile.full_name || ''}
              onFocus={() => onFocusZone?.()}
              onChange={(e) => updateField('full_name', e.target.value)}
              placeholder="Ví dụ: Nguyễn Văn An"
              className={inputClass}
            />
            {errors.full_name && (
              <p className="mt-1 text-xs font-bold text-rose-600">
                {errors.full_name}
              </p>
            )}
          </div>

          <div>
            <label className={labelClass}>Tên tự / Tên hiệu / Tên thường gọi</label>
            <input
              type="text"
              disabled={disabled}
              value={profile.alias || ''}
              onFocus={() => onFocusZone?.()}
              onChange={(e) => updateField('alias', e.target.value)}
              placeholder="Tên tự, tên hiệu (nếu có)"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>
              Giới tính <span className="text-rose-500">*</span>
            </label>
            <select
              disabled={disabled}
              value={profile.gender || 'NAM'}
              onFocus={() => onFocusZone?.()}
              onChange={(e) => updateField('gender', e.target.value)}
              className={inputClass}
            >
              {GENDER_OPTIONS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>

          {/* Ngày / Tháng / Năm sinh */}
          <div className="sm:col-span-2">
            <label className={labelClass}>Ngày / Tháng / Năm sinh (Dương lịch)</label>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="number"
                min={1}
                max={31}
                disabled={disabled}
                value={profile.birth_day ?? ''}
                onFocus={() => onFocusZone?.()}
                onChange={(e) => updateField('birth_day', e.target.value)}
                placeholder="Ngày (1-31)"
                className={inputClass}
              />
              <input
                type="number"
                min={1}
                max={12}
                disabled={disabled}
                value={profile.birth_month ?? ''}
                onFocus={() => onFocusZone?.()}
                onChange={(e) => updateField('birth_month', e.target.value)}
                placeholder="Tháng (1-12)"
                className={inputClass}
              />
              <input
                type="number"
                min={1800}
                max={new Date().getFullYear()}
                disabled={disabled}
                value={profile.birth_year ?? ''}
                onFocus={() => onFocusZone?.()}
                onChange={(e) => updateField('birth_year', e.target.value)}
                placeholder="Năm (VD: 1975)"
                className={inputClass}
              />
            </div>
            {errors.birth_year && (
              <p className="mt-1 text-xs font-bold text-rose-600">
                {errors.birth_year}
              </p>
            )}
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass}>Nơi sinh / Nguyên quán</label>
            <input
              type="text"
              disabled={disabled}
              value={profile.birth_place || ''}
              onFocus={() => onFocusZone?.()}
              onChange={(e) => updateField('birth_place', e.target.value)}
              placeholder="Xã/Phường, Huyện/Quận, Tỉnh/Thành phố"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Tình trạng hiện tại</label>
            <select
              disabled={disabled}
              value={profile.is_alive === false ? 'false' : 'true'}
              onFocus={() => onFocusZone?.()}
              onChange={(e) =>
                updateField('is_alive', e.target.value === 'true')
              }
              className={inputClass}
            >
              <option value="true">Còn sống</option>
              <option value="false">Đã mất (Khai hộ thân nhân)</option>
            </select>
          </div>

          {profile.is_alive === false && (
            <div>
              <label className={labelClass}>Năm mất</label>
              <input
                type="number"
                min={1800}
                max={new Date().getFullYear()}
                disabled={disabled}
                value={profile.death_year ?? ''}
                onFocus={() => onFocusZone?.()}
                onChange={(e) => updateField('death_year', e.target.value)}
                placeholder="Năm mất (VD: 2020)"
                className={inputClass}
              />
            </div>
          )}
        </div>
      </div>

      {/* NHÓM 2: VỊ TRÍ PHẢ HỆ & TIỀN NHÂN 3 ĐỜI */}
      <div className="space-y-3.5 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4">
        <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-indigo-800">
          <GitBranch size={15} />
          2. Vị trí phả hệ & Tiền nhân 3 đời
        </h4>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Đời thứ mấy trong họ (nếu biết)</label>
            <input
              type="number"
              min={1}
              max={30}
              disabled={disabled}
              value={profile.generation ?? ''}
              onFocus={() => onFocusZone?.()}
              onChange={(e) => updateField('generation', e.target.value)}
              placeholder="Ví dụ: 8"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Quan hệ huyết thống</label>
            <select
              disabled={disabled}
              value={profile.temp_relationship || 'CON_DE'}
              onFocus={() => onFocusZone?.()}
              onChange={(e) => updateField('temp_relationship', e.target.value)}
              className={inputClass}
            >
              {RELATIONSHIP_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Tên Chi / Phái / Nhánh</label>
            <input
              type="text"
              disabled={disabled}
              value={profile.branch_name || ''}
              onFocus={() => onFocusZone?.()}
              onChange={(e) => updateField('branch_name', e.target.value)}
              placeholder="Ví dụ: Chi 2 - Phái Giáp"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Vai vế / Chức trách trong họ</label>
            <select
              disabled={disabled}
              value={profile.member_role || 'THANH_VIEN'}
              onFocus={() => onFocusZone?.()}
              onChange={(e) => updateField('member_role', e.target.value)}
              className={inputClass}
            >
              {MEMBER_ROLE_OPTIONS.map((mr) => (
                <option key={mr.value} value={mr.value}>
                  {mr.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>
              Họ và tên Cha <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              disabled={disabled}
              value={profile.father_name || ''}
              onFocus={() => onFocusZone?.()}
              onChange={(e) => updateField('father_name', e.target.value)}
              placeholder="Họ tên đầy đủ của Cha"
              className={inputClass}
            />
            {errors.father_name && (
              <p className="mt-1 text-xs font-bold text-rose-600">
                {errors.father_name}
              </p>
            )}
          </div>

          <div>
            <label className={labelClass}>Họ và tên Mẹ</label>
            <input
              type="text"
              disabled={disabled}
              value={profile.mother_name || ''}
              onFocus={() => onFocusZone?.()}
              onChange={(e) => updateField('mother_name', e.target.value)}
              placeholder="Họ tên đầy đủ của Mẹ"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Họ và tên Ông nội</label>
            <input
              type="text"
              disabled={disabled}
              value={profile.grandfather_name || ''}
              onFocus={() => onFocusZone?.()}
              onChange={(e) => updateField('grandfather_name', e.target.value)}
              placeholder="Họ tên Ông nội"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Họ và tên Bà nội</label>
            <input
              type="text"
              disabled={disabled}
              value={profile.grandmother_name || ''}
              onFocus={() => onFocusZone?.()}
              onChange={(e) => updateField('grandmother_name', e.target.value)}
              placeholder="Họ tên Bà nội"
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* NHÓM 3: CƯ TRÚ & LIÊN LẠC MỞ RỘNG */}
      <div className="space-y-3.5 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
        <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-700">
          <MapPin size={15} />
          3. Địa chỉ cư trú & Mạng xã hội
        </h4>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass}>Địa chỉ cư trú hiện tại</label>
            <input
              type="text"
              disabled={disabled}
              value={profile.address || ''}
              onFocus={() => onFocusZone?.()}
              onChange={(e) => updateField('address', e.target.value)}
              placeholder="Số nhà, đường, xã/phường, tỉnh/thành phố"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Zalo liên hệ</label>
            <input
              type="text"
              disabled={disabled}
              value={socialProfiles.zalo || ''}
              onFocus={() => onFocusZone?.()}
              onChange={(e) => updateSocial('zalo', e.target.value)}
              placeholder="Số/Tên Zalo"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Facebook liên hệ</label>
            <input
              type="text"
              disabled={disabled}
              value={socialProfiles.facebook || ''}
              onFocus={() => onFocusZone?.()}
              onChange={(e) => updateSocial('facebook', e.target.value)}
              placeholder="Tên hoặc link Facebook"
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* NHÓM 4: LỜI NHẮN & MINH CHỨNG */}
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
        <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-700">
          <FileText size={15} />
          4. Lời nhắn & Thông tin minh chứng
        </h4>

        <div>
          <label className={labelClass}>
            Lời nhắn gửi Ban Quản trị xác minh{' '}
            <span className="text-rose-500">*</span>
          </label>
          <textarea
            disabled={disabled}
            value={profile.note || ''}
            onFocus={() => onFocusZone?.()}
            onChange={(e) => updateField('note', e.target.value)}
            placeholder="Ghi rõ thông tin gia đình, người thân quen trong họ hoặc bối cảnh xin nhập phả để Hội đồng gia tộc đối chiếu..."
            className={`${inputClass} min-h-[96px] resize-none`}
          />
          {errors.note && (
            <p className="mt-1 text-xs font-bold text-rose-600">{errors.note}</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default RegistrationProfileForm;