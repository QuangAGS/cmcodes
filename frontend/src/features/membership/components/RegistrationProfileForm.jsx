/**
 * ============================================================================
 * PATH       : frontend/src/features/membership/components/RegistrationProfileForm.jsx
 * DATETIME   : 2026-11-21T11:20:00+07:00
 * VERSION    : 2.0.0-ISO29148-UAT-IMP4
 * DESCRIPTION:
 * - [UAT-IMP4 2026-11-21]:
 *   1. Chuẩn hóa cả 4 nhóm khai báo ("Chưa có tên trong sổ họ") theo đúng cấu trúc
 *      CollapsibleDetailCard (Dòng 1: Title; Dòng 2: 3 cột Icon trạng thái | Nghe |
 *      Mở ra/Đóng lại; khi đóng chỉ hiện 2 dòng).
 *   2. Phân cấp thị giác rõ ràng giữa Nhãn (font-normal text-slate-600) và Dữ liệu
 *      nhập (font-bold text-slate-900 placeholder:font-normal placeholder:text-slate-400).
 *   3. Card 1. Thông tin nhân thân:
 *      - Tên tự / Tên hiệu / Tên thường gọi: 1 hàng riêng biệt trọn chiều ngang.
 *      - "Giới tính" và "Sống/Chết" (đổi từ Tình trạng hiện tại): 1 hàng 2 cột.
 *      - Nơi sinh / Nguyên quán: Text Area tối thiểu 2 dòng.
 *   4. Card 2. Vị trí phả hệ & Tiền nhân (đổi từ "... Tiền nhân 3 đời"):
 *      - Tất cả thông tin tên người thân & chi/nhánh dàn thành từng hàng riêng biệt.
 *   5. Card 3. Địa chỉ cư trú & Mạng xã hội:
 *      - Địa chỉ cư trú hiện tại: Text Area tối thiểu 2 dòng.
 *      - Mạng xã hội: danh sách dòng động gồm Loại (Zalo, Facebook, Telegram,
 *        WhatsApp, Viber, Khác) và Giá trị, kèm nút "+ Thêm mạng xã hội".
 *   6. Card 4. Lời nhắn & Minh chứng (đổi từ "... Thông tin minh chứng"):
 *      - Bắt buộc (*) nhập Họ & tên người giới thiệu trong họ và Số điện thoại
 *        người giới thiệu (EU tự nhập tự do, không tra cứu danh sách members).
 * ============================================================================
 * CHANGELOGS:
 * - 2026-11-20T22:15:00+07:00 (v1.1.0-UAT-IMP2-COLLAPSIBLE-CARDS): 4 Card thu gọn.
 * - 2026-11-21T11:20:00+07:00 (v2.0.0-ISO29148-UAT-IMP4): Áp dụng trọn bộ UAT-IMP4.
 * ============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

import { useState, useEffect, useRef } from 'react';
import {
  Plus,
  Trash2,
  CheckCircle2,
  CircleDashed,
  Phone,
} from 'lucide-react';
import CollapsibleDetailCard from '../../../components/common/CollapsibleDetailCard.jsx';
import {
  COUNTRY_PHONE_OPTIONS,
  validatePhoneWithCountry,
} from '../../../shared/utils/validationRules.js';

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

const SOCIAL_NETWORK_OPTIONS = [
  { value: 'Zalo', label: 'Zalo' },
  { value: 'Facebook', label: 'Facebook' },
  { value: 'Telegram', label: 'Telegram' },
  { value: 'WhatsApp', label: 'WhatsApp' },
  { value: 'Viber', label: 'Viber' },
  { value: 'YouTube', label: 'YouTube' },
  { value: 'TikTok', label: 'TikTok' },
  { value: 'Khác', label: 'Khác' },
];

function buildInitialSocialLinks(profile) {
  if (Array.isArray(profile?.social_links) && profile.social_links.length > 0) {
    return profile.social_links.map((item, idx) => ({
      id: item?.id || `soc-${idx + 1}`,
      type: item?.type || 'Zalo',
      value: item?.value || '',
    }));
  }
  const sp =
    profile?.social_profiles && typeof profile.social_profiles === 'object'
      ? profile.social_profiles
      : {};
  const entries = Object.entries(sp).filter(
    ([, val]) => val !== undefined && val !== null && String(val).trim() !== ''
  );
  if (entries.length > 0) {
    return entries.map(([k, val], idx) => {
      const matched = SOCIAL_NETWORK_OPTIONS.find(
        (opt) => opt.value.toLowerCase() === String(k).toLowerCase()
      );
      return {
        id: `soc-${idx + 1}`,
        type: matched ? matched.value : k,
        value: String(val),
      };
    });
  }
  return [{ id: 'soc-1', type: 'Zalo', value: '' }];
}

function serializeSocialProfilesObject(links) {
  const obj = {};
  (links || []).forEach((item) => {
    const val = String(item?.value || '').trim();
    if (!val) return;
    const key = String(item?.type || 'khac')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_');
    obj[key] = obj[key] ? `${obj[key]}, ${val}` : val;
  });
  return obj;
}

const FIELD_TO_CARD_MAP = {
  full_name: 'basic',
  temp_full_name: 'basic',
  alias: 'basic',
  gender: 'basic',
  is_alive: 'basic',
  death_year: 'basic',
  birth_day: 'basic',
  birth_month: 'basic',
  birth_year: 'basic',
  temp_birth_year: 'basic',
  birth_place: 'basic',
  father_name: 'lineage',
  temp_father_name: 'lineage',
  mother_name: 'lineage',
  grandfather_name: 'lineage',
  grandmother_name: 'lineage',
  branch_name: 'lineage',
  generation: 'lineage',
  temp_relationship: 'lineage',
  member_role: 'lineage',
  address: 'residence',
  social_profiles: 'residence',
  referrer_name: 'note',
  referrer_phone: 'note',
  note: 'note',
  temp_note: 'note',
};

const RegistrationProfileForm = ({
  value = {},
  onChange,
  onFocusZone,
  disabled = false,
  errors = {},
  focusRequest = null,
}) => {
  const rootRef = useRef(null);
  const [expandedCards, setExpandedCards] = useState({
    basic: true,
    lineage: true,
    residence: true,
    note: true,
  });

  // [UAT-Bug 6] Tự động mở đúng Card con và cuộn/focus tới đúng trường khi có lỗi validation
  useEffect(() => {
    const targetField = focusRequest?.field;
    if (!targetField) return undefined;
    const cardKey = FIELD_TO_CARD_MAP[targetField];
    if (!cardKey) return undefined;

    setExpandedCards((prev) => ({
      ...prev,
      [cardKey]: true,
    }));

    const timer = window.setTimeout(() => {
      const container = rootRef.current || document;
      const el =
        container.querySelector(`[data-field-key="${targetField}"]`) ||
        document.querySelector(`[data-field-key="${targetField}"]`);
      if (el) {
        el.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
        el.focus?.({ preventScroll: true });
      }
    }, 140);

    return () => window.clearTimeout(timer);
  }, [focusRequest?.field, focusRequest?.tick]);

  const toggleCard = (key, nextState) => {
    setExpandedCards((prev) => ({
      ...prev,
      [key]: typeof nextState === 'boolean' ? nextState : !prev[key],
    }));
  };

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
    social_profiles: {},
    social_links: null,
    proof_documents: [],
    referrer_name: '',
    referrer_phone: '',
    referrer_phone_country: 'VN',
    ...(value || {}),
  };

  const socialLinks = buildInitialSocialLinks(profile);
  const referrerPhoneCountry = profile.referrer_phone_country || 'VN';
  const selectedRefCountryMeta =
    COUNTRY_PHONE_OPTIONS.find((c) => c.code === referrerPhoneCountry) ||
    COUNTRY_PHONE_OPTIONS[0];

  const emitProfilePatch = (patch) => {
    onFocusZone?.();
    if (!onChange) return;
    onChange({
      ...profile,
      claim_mode: 'NEW_PROFILE_21',
      claimed_member_id: null,
      ...patch,
    });
  };

  const updateField = (field, fieldVal) => {
    emitProfilePatch({ [field]: fieldVal });
  };

  const handleSocialLinkChange = (idx, field, val) => {
    const nextLinks = socialLinks.map((item, i) =>
      i === idx ? { ...item, [field]: val } : item
    );
    emitProfilePatch({
      social_links: nextLinks,
      social_profiles: serializeSocialProfilesObject(nextLinks),
    });
  };

  const handleAddSocialLink = () => {
    const usedTypes = new Set(socialLinks.map((s) => s.type));
    const nextSuggested =
      SOCIAL_NETWORK_OPTIONS.find((opt) => !usedTypes.has(opt.value))?.value ||
      'Zalo';
    const nextLinks = [
      ...socialLinks,
      {
        id: `soc-${Date.now()}-${socialLinks.length + 1}`,
        type: nextSuggested,
        value: '',
      },
    ];
    emitProfilePatch({
      social_links: nextLinks,
      social_profiles: serializeSocialProfilesObject(nextLinks),
    });
  };

  const handleRemoveSocialLink = (idx) => {
    const filtered = socialLinks.filter((_, i) => i !== idx);
    const nextLinks =
      filtered.length > 0
        ? filtered
        : [{ id: 'soc-1', type: 'Zalo', value: '' }];
    emitProfilePatch({
      social_links: nextLinks,
      social_profiles: serializeSocialProfilesObject(nextLinks),
    });
  };

  // Quy chuẩn phân tách rõ ràng giữa Nhãn (Label) và Dữ liệu (Data) [UAT-IMP4]:
  // - Nhãn: chữ thường nét mảnh vừa (font-normal text-slate-600), dấu * đỏ rõ.
  // - Dữ liệu: chữ đậm tương phản cao (font-bold text-slate-900), placeholder mảnh mờ.
  const labelClass = 'block text-base font-normal text-slate-600 mb-1.5';
  const inputClass =
    'min-h-[48px] h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base font-bold text-slate-900 placeholder:font-normal placeholder:text-slate-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100 disabled:text-slate-500';
  const textareaClass =
    'min-h-[76px] w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-base font-bold leading-relaxed text-slate-900 placeholder:font-normal placeholder:text-slate-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100 disabled:text-slate-500';

  // Đánh giá trạng thái hoàn chỉnh từng Card (biểu tượng ✓ xanh lá vs ◌ hổ phách)
  const isCard1Complete = Boolean(String(profile.full_name || '').trim());
  const isCard2Complete = Boolean(String(profile.father_name || '').trim());
  const hasAnySocial = socialLinks.some((s) => String(s.value || '').trim() !== '');
  const isCard3Complete = Boolean(
    String(profile.address || '').trim() || hasAnySocial
  );

  const rawRefName = String(profile.referrer_name || '').trim();
  const rawRefPhone = String(profile.referrer_phone || '').trim();
  const refPhoneValid = rawRefPhone
    ? validatePhoneWithCountry(rawRefPhone, referrerPhoneCountry).valid
    : false;
  const isCard4Complete = Boolean(
    rawRefName && refPhoneValid && String(profile.note || '').trim().length > 10
  );

  return (
    <div ref={rootRef} className="space-y-4">
      {/* Chú giải quy ước biểu tượng trạng thái Card cho người cao tuổi */}
      <div
        role="note"
        className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-base text-slate-700"
      >
        <span className="inline-flex items-center gap-1.5 font-normal">
          <CheckCircle2 size={20} strokeWidth={2.5} className="text-emerald-700 shrink-0" />
          <span>Đã hoàn chỉnh</span>
        </span>
        <span className="inline-flex items-center gap-1.5 font-normal">
          <CircleDashed size={20} strokeWidth={2.2} className="text-amber-600 shrink-0" />
          <span>Chưa hoàn chỉnh</span>
        </span>
      </div>

      {/* =====================================================================
          CARD 1: 1. Thông tin nhân thân [UAT-IMP4 Mục 3]
         ===================================================================== */}
      <CollapsibleDetailCard
        title="1. Thông tin nhân thân"
        statusLabel={isCard1Complete ? 'Đã hoàn chỉnh' : 'Chưa hoàn chỉnh'}
        statusVariant={isCard1Complete ? 'complete' : 'pending'}
        voiceText="Mục 1: Thông tin nhân thân. Bác nhập họ và tên khai sinh, tên tự hoặc tên thường gọi, chọn giới tính và tình trạng sống chết, ngày tháng năm sinh và nơi sinh nguyên quán."
        expanded={expandedCards.basic}
        onToggle={(next) => toggleCard('basic', next)}
        disabled={disabled}
      >
        <div className="space-y-3.5">
          {/* Họ và tên khai sinh (1 hàng riêng) */}
          <div>
            <label className={labelClass}>
              Họ và tên khai sinh <span className="font-bold text-rose-600">*</span>
            </label>
            <input
              type="text"
              disabled={disabled}
              value={profile.full_name || ''}
              onFocus={() => onFocusZone?.()}
              onChange={(e) => updateField('full_name', e.target.value)}
              data-field-key="full_name"
              placeholder="Ví dụ: Nguyễn Văn An"
              className={inputClass}
            />
            {errors.full_name && (
              <p className="mt-1 text-base font-bold text-rose-600">
                {errors.full_name}
              </p>
            )}
          </div>

          {/* 3a) Tên tự / Tên hiệu / Tên thường gọi: 1 hàng riêng biệt trọn chiều ngang */}
          <div>
            <label className={labelClass}>
              Tên tự / Tên hiệu / Tên thường gọi
            </label>
            <input
              type="text"
              disabled={disabled}
              value={profile.alias || ''}
              onFocus={() => onFocusZone?.()}
              onChange={(e) => updateField('alias', e.target.value)}
              data-field-key="alias"
              placeholder="Nhập tên tự, tên hiệu hoặc tên thường gọi ở quê (nếu có)"
              className={inputClass}
            />
          </div>

          {/* 3b) Giới tính & Sống/Chết trên cùng 1 hàng chia 2 cột */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>
                Giới tính <span className="font-bold text-rose-600">*</span>
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

            <div>
              <label className={labelClass}>Sống/Chết</label>
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
                <option value="false">Đã mất</option>
              </select>
            </div>
          </div>

          {profile.is_alive === false && (
            <div>
              <label className={labelClass}>Năm mất (nếu khai hộ thân nhân đã mất)</label>
              <input
                type="number"
                min={1800}
                max={new Date().getFullYear()}
                disabled={disabled}
                value={profile.death_year ?? ''}
                onFocus={() => onFocusZone?.()}
                onChange={(e) => updateField('death_year', e.target.value)}
                placeholder="Ví dụ: 2020"
                className={inputClass}
              />
            </div>
          )}

          {/* Ngày / Tháng / Năm sinh */}
          <div>
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
                placeholder="Ngày"
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
                placeholder="Tháng"
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
                data-field-key="birth_year"
                placeholder="Năm sinh"
                className={inputClass}
              />
            </div>
            {errors.birth_year && (
              <p className="mt-1 text-base font-bold text-rose-600">
                {errors.birth_year}
              </p>
            )}
          </div>

          {/* 3c) Nơi sinh / Nguyên quán: Text Area tối thiểu 2 dòng */}
          <div>
            <label className={labelClass}>Nơi sinh / Nguyên quán</label>
            <textarea
              rows={2}
              disabled={disabled}
              value={profile.birth_place || ''}
              onFocus={() => onFocusZone?.()}
              onChange={(e) => updateField('birth_place', e.target.value)}
              data-field-key="birth_place"
              placeholder="Thôn/Xóm, Xã/Phường, Huyện/Quận, Tỉnh/Thành phố"
              className={`${textareaClass} resize-y`}
            />
          </div>
        </div>
      </CollapsibleDetailCard>

      {/* =====================================================================
          CARD 2: 2. Vị trí phả hệ & Tiền nhân [UAT-IMP4 Mục 4]
          - 4a) Tiêu đề: "2. Vị trí phả hệ & Tiền nhân"
          - 4b) Tất cả thông tin tên & chi/nhánh bố trí thành 1 hàng
         ===================================================================== */}
      <CollapsibleDetailCard
        title="2. Vị trí phả hệ & Tiền nhân"
        statusLabel={isCard2Complete ? 'Đã hoàn chỉnh' : 'Chưa hoàn chỉnh'}
        statusVariant={isCard2Complete ? 'complete' : 'pending'}
        voiceText="Mục 2: Vị trí phả hệ và Tiền nhân. Bác nhập họ tên Cha bắt buộc, cùng tên Mẹ, Ông Bà nội, đời thứ và tên Chi Phái nếu biết."
        expanded={expandedCards.lineage}
        onToggle={(next) => toggleCard('lineage', next)}
        disabled={disabled}
      >
        <div className="space-y-3.5">
          <div>
            <label className={labelClass}>
              Họ và tên Cha <span className="font-bold text-rose-600">*</span>
            </label>
            <input
              type="text"
              disabled={disabled}
              value={profile.father_name || ''}
              onFocus={() => onFocusZone?.()}
              onChange={(e) => updateField('father_name', e.target.value)}
              data-field-key="father_name"
              placeholder="Nhập họ tên đầy đủ của Cha"
              className={inputClass}
            />
            {errors.father_name && (
              <p className="mt-1 text-base font-bold text-rose-600">
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
              placeholder="Nhập họ tên đầy đủ của Mẹ"
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
              placeholder="Nhập họ tên Ông nội"
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
              placeholder="Nhập họ tên Bà nội"
              className={inputClass}
            />
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
            <label className={labelClass}>Quan hệ với dòng họ</label>
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
        </div>
      </CollapsibleDetailCard>

      {/* =====================================================================
          CARD 3: 3. Địa chỉ cư trú & Mạng xã hội [UAT-IMP4 Mục 5]
          - 5a) Địa chỉ cư trú: Text Area tối thiểu 2 dòng
          - 5b) Mạng xã hội: Loại (Zalo, Facebook, Telegram, WhatsApp...) + Giá trị + thêm dòng
         ===================================================================== */}
      <CollapsibleDetailCard
        title="3. Địa chỉ cư trú & Mạng xã hội"
        statusLabel={isCard3Complete ? 'Đã hoàn chỉnh' : 'Chưa hoàn chỉnh'}
        statusVariant={isCard3Complete ? 'complete' : 'default'}
        voiceText="Mục 3: Địa chỉ cư trú và Mạng xã hội. Bác nhập địa chỉ nơi ở hiện tại và chọn loại mạng xã hội như Zalo, Facebook, Telegram hoặc WhatsApp để điền thông tin liên lạc."
        expanded={expandedCards.residence}
        onToggle={(next) => toggleCard('residence', next)}
        disabled={disabled}
      >
        <div className="space-y-4">
          {/* 5a) Địa chỉ cư trú: Text Area ít nhất 2 dòng */}
          <div>
            <label className={labelClass}>Địa chỉ cư trú hiện tại</label>
            <textarea
              rows={2}
              disabled={disabled}
              value={profile.address || ''}
              onFocus={() => onFocusZone?.()}
              onChange={(e) => updateField('address', e.target.value)}
              data-field-key="address"
              placeholder="Số nhà, đường/xóm, xã/phường, quận/huyện, tỉnh/thành phố"
              className={`${textareaClass} resize-y`}
            />
          </div>

          {/* 5b) Mạng xã hội: Loại + Giá trị + nút thêm dòng */}
          <div className="space-y-2.5">
            <label className={labelClass}>Mạng xã hội liên hệ</label>

            <div className="space-y-2.5">
              {socialLinks.map((item, idx) => (
                <div
                  key={item.id || idx}
                  className="flex items-center gap-2"
                >
                  <select
                    aria-label={`Loại mạng xã hội dòng ${idx + 1}`}
                    disabled={disabled}
                    value={item.type || 'Zalo'}
                    onFocus={() => onFocusZone?.()}
                    onChange={(e) =>
                      handleSocialLinkChange(idx, 'type', e.target.value)
                    }
                    className="min-h-[48px] h-12 w-[132px] sm:w-[152px] shrink-0 rounded-xl border border-slate-300 bg-white px-3 text-base font-bold text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100"
                  >
                    {SOCIAL_NETWORK_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>

                  <input
                    type="text"
                    aria-label={`Tài khoản mạng xã hội dòng ${idx + 1}`}
                    disabled={disabled}
                    value={item.value || ''}
                    onFocus={() => onFocusZone?.()}
                    onChange={(e) =>
                      handleSocialLinkChange(idx, 'value', e.target.value)
                    }
                    placeholder={`Nhập số hoặc tên ${item.type || 'Zalo'}...`}
                    className={`${inputClass} flex-1 min-w-0`}
                  />

                  {socialLinks.length > 1 && (
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => handleRemoveSocialLink(idx)}
                      aria-label={`Xóa dòng mạng xã hội ${idx + 1}`}
                      title="Xóa dòng này"
                      className="min-h-[48px] h-12 w-12 shrink-0 inline-flex items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button
              type="button"
              disabled={disabled}
              onClick={handleAddSocialLink}
              className="min-h-[48px] h-12 w-full inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-slate-50 px-4 text-base font-bold text-slate-800 whitespace-nowrap transition hover:bg-slate-100 disabled:opacity-50"
            >
              <Plus size={18} />
              <span>Thêm mạng xã hội</span>
            </button>
          </div>
        </div>
      </CollapsibleDetailCard>

      {/* =====================================================================
          CARD 4: 4. Lời nhắn & Minh chứng [UAT-IMP4 Mục 6]
          - 6a) Tiêu đề: "4. Lời nhắn & Minh chứng"
          - 6b) Bắt buộc (*) Họ & tên người giới thiệu + Số điện thoại người giới thiệu
                (EU tự nhập tự do, không tra cứu danh sách thành viên)
         ===================================================================== */}
      <CollapsibleDetailCard
        title="4. Lời nhắn & Minh chứng"
        statusLabel={isCard4Complete ? 'Đã hoàn chỉnh' : 'Chưa hoàn chỉnh'}
        statusVariant={isCard4Complete ? 'complete' : 'pending'}
        voiceText="Mục 4: Lời nhắn và Minh chứng. Bác bắt buộc nhập họ và tên cùng số điện thoại của người giới thiệu trong họ, sau đó ghi lời nhắn gửi Ban Quản trị xác minh."
        expanded={expandedCards.note}
        onToggle={(next) => toggleCard('note', next)}
        disabled={disabled}
      >
        <div className="space-y-4">
          {/* 6b) Người giới thiệu trong họ (BẮT BUỘC * — tự nhập, không tra cứu members) */}
          <div className="space-y-3.5 rounded-xl border border-amber-200 bg-amber-50/60 p-3.5">
            <p className="text-base font-bold text-amber-950">
              Người giới thiệu trong họ{' '}
              <span className="font-bold text-rose-600">*</span>
            </p>

            <div>
              <label className={labelClass}>
                Họ và tên người giới thiệu{' '}
                <span className="font-bold text-rose-600">*</span>
              </label>
              <input
                type="text"
                disabled={disabled}
                value={profile.referrer_name || ''}
                onFocus={() => onFocusZone?.()}
                onChange={(e) => updateField('referrer_name', e.target.value)}
                data-field-key="referrer_name"
                placeholder="Nhập họ tên người thân trong họ giới thiệu bác"
                className={inputClass}
              />
              {errors.referrer_name && (
                <p className="mt-1 text-base font-bold text-rose-600">
                  {errors.referrer_name}
                </p>
              )}
            </div>

            <div>
              <label className={labelClass}>
                Số điện thoại người giới thiệu{' '}
                <span className="font-bold text-rose-600">*</span>
              </label>
              <div className="flex flex-row items-center gap-2">
                <select
                  aria-label="Chọn mã quốc gia số điện thoại người giới thiệu"
                  disabled={disabled}
                  value={referrerPhoneCountry}
                  onFocus={() => onFocusZone?.()}
                  onChange={(e) =>
                    updateField('referrer_phone_country', e.target.value)
                  }
                  className="min-h-[48px] h-12 w-[124px] sm:w-[136px] shrink-0 rounded-xl border border-slate-300 bg-white px-2.5 text-base font-bold text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100"
                >
                  {COUNTRY_PHONE_OPTIONS.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.shortLabel || c.label}
                    </option>
                  ))}
                </select>

                <div className="relative flex-1 min-w-0">
                  <Phone
                    size={18}
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="tel"
                    disabled={disabled}
                    value={profile.referrer_phone || ''}
                    onFocus={() => onFocusZone?.()}
                    onChange={(e) =>
                      updateField('referrer_phone', e.target.value)
                    }
                    data-field-key="referrer_phone"
                    placeholder={selectedRefCountryMeta.placeholder}
                    className={`${inputClass} pl-10`}
                  />
                </div>
              </div>
              {errors.referrer_phone && (
                <p className="mt-1 text-base font-bold text-rose-600">
                  {errors.referrer_phone}
                </p>
              )}
            </div>
          </div>

          {/* Lời nhắn gửi Ban Quản trị xác minh */}
          <div>
            <label className={labelClass}>
              Lời nhắn gửi Ban Quản trị xác minh{' '}
              <span className="font-bold text-rose-600">*</span>
            </label>
            <textarea
              rows={3}
              disabled={disabled}
              value={profile.note || ''}
              onFocus={() => onFocusZone?.()}
              onChange={(e) => updateField('note', e.target.value)}
              data-field-key="note"
              placeholder="Ghi rõ thông tin gia đình hoặc bối cảnh xin nhập phả để Hội đồng gia tộc đối chiếu (tối thiểu 11 ký tự)..."
              className="min-h-[100px] w-full resize-y rounded-xl border border-slate-300 bg-white px-4 py-3 text-base font-bold leading-relaxed text-slate-900 placeholder:font-normal placeholder:text-slate-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100"
            />
            {errors.note && (
              <p className="mt-1 text-base font-bold text-rose-600">
                {errors.note}
              </p>
            )}
          </div>
        </div>
      </CollapsibleDetailCard>
    </div>
  );
};

export default RegistrationProfileForm;
