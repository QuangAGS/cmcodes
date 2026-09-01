/**
 * PATH       : src/features/member/constants/achievementCatalog.js
 * DATETIME   : 2026-09-01T07:00:00+07:00
 * VERSION    : 1.0.0-ACH-SUBCAT
 * DESCRIPTION: Catalog category → sub_category. Mã EN_SNAKE; label song ngữ.
 *              Thêm dòng = thêm mã. Không ALTER enum mỗi loại chi tiết.
 */

export const ACHIEVEMENT_CATEGORIES = [
  { code: 'KHOA_BANG', label: 'Học thuật / khoa bảng' },
  { code: 'QUAN_SU', label: 'Quân sự' },
  { code: 'CHINH_TRI', label: 'Chính trị / hành chính' },
  { code: 'KINH_DOANH', label: 'Kinh doanh / nghề' },
  { code: 'TON_GIAO', label: 'Tôn giáo' },
  { code: 'DONG_GOP_XA_HOI', label: 'Đóng góp xã hội' },
  { code: 'KHAC', label: 'Khác' },
];

export const ACHIEVEMENT_SUBCATEGORIES = {
  KHOA_BANG: [
    { code: 'GIAO_SU', label: 'Giáo sư' },
    { code: 'PHO_GIAO_SU', label: 'Phó giáo sư' },
    { code: 'TIEN_SI', label: 'Tiến sĩ' },
    { code: 'THAC_SI', label: 'Thạc sĩ' },
    { code: 'DAI_HOC', label: 'Đại học / cử nhân' },
    { code: 'CAO_DANG', label: 'Cao đẳng' },
    { code: 'GIAI_THUONG', label: 'Giải thưởng học thuật' },
    { code: 'SANG_CHE', label: 'Bằng sáng chế (patent)' },
    { code: 'KHAC', label: 'Loại khác trong khoa bảng' },
  ],
  QUAN_SU: [
    { code: 'SI_QUAN', label: 'Sĩ quan' },
    { code: 'HA_SI_QUAN', label: 'Hạ sĩ quan / binh sĩ' },
    { code: 'HUAN_CHUONG', label: 'Huân / huy chương' },
    { code: 'CHIEN_CONG', label: 'Chiến công / danh hiệu' },
    { code: 'KHAC', label: 'Loại khác trong quân sự' },
  ],
  CHINH_TRI: [
    { code: 'LANH_DAO', label: 'Lãnh đạo / ủy viên' },
    { code: 'CONG_CHUC', label: 'Công chức / viên chức' },
    { code: 'DAN_CU', label: 'Dân cử' },
    { code: 'KHAC', label: 'Loại khác trong chính trị' },
  ],
  KINH_DOANH: [
    { code: 'DOANH_NHAN', label: 'Doanh nhân / chủ cơ sở' },
    { code: 'NGHE_DANH', label: 'Nghề / chức danh' },
    { code: 'GIAI_THUONG', label: 'Giải thưởng nghề nghiệp' },
    { code: 'KHAC', label: 'Loại khác trong kinh doanh' },
  ],
  TON_GIAO: [
    { code: 'CHUC_SAC', label: 'Chức sắc' },
    { code: 'TU_SI', label: 'Tu sĩ' },
    { code: 'KHAC', label: 'Loại khác trong tôn giáo' },
  ],
  DONG_GOP_XA_HOI: [
    { code: 'TU_THIEN', label: 'Từ thiện / cứu tế' },
    { code: 'VAN_HOA', label: 'Văn hóa / giáo dục cộng đồng' },
    { code: 'DANH_HIEU', label: 'Danh hiệu thi đua' },
    { code: 'KHAC', label: 'Loại khác đóng góp xã hội' },
  ],
  KHAC: [{ code: 'KHAC', label: 'Khác' }],
};

export function subsOfCategory(category) {
  return ACHIEVEMENT_SUBCATEGORIES[category] || ACHIEVEMENT_SUBCATEGORIES.KHAC;
}


export function categoryLabel(code) {
  const hit = ACHIEVEMENT_CATEGORIES.find((c) => c.code === code);
  return hit ? hit.label : code || '';
}

export function subLabel(category, code) {
  const hit = (ACHIEVEMENT_SUBCATEGORIES[category] || []).find((s) => s.code === code);
  return hit ? hit.label : code || '';
}

export const EMPTY_ACHIEVEMENT = {
  id: '',
  category: 'KHOA_BANG',
  sub_category: '',
  title: '',
  issued_by: '',
  achieved_year: '',
  achieved_month: '',
  achieved_day: '',
  is_lunar: false,
  ended_year: '',
  ended_month: '',
  ended_day: '',
  is_current: false,
  description: '',
};

export function achievementFromApi(row) {
  if (!row) return { ...EMPTY_ACHIEVEMENT };
  return {
    id: row.id || '',
    category: row.category || 'KHOA_BANG',
    sub_category: row.sub_category || '',
    title: row.title || '',
    issued_by: row.issued_by || '',
    achieved_year: row.achieved_year ?? '',
    achieved_month: row.achieved_month ?? '',
    achieved_day: row.achieved_day ?? '',
    is_lunar: !!row.is_lunar,
    ended_year: row.ended_year ?? '',
    ended_month: row.ended_month ?? '',
    ended_day: row.ended_day ?? '',
    is_current: !!row.is_current,
    description: row.description || '',
  };
}

export function achievementToPayload(row) {
  return {
    category: row.category,
    sub_category: row.sub_category || null,
    title: row.title,
    issued_by: row.issued_by || null,
    achieved_year: row.achieved_year === '' ? null : Number(row.achieved_year),
    achieved_month: row.achieved_month === '' ? null : Number(row.achieved_month),
    achieved_day: row.achieved_day === '' ? null : Number(row.achieved_day),
    is_lunar: !!row.is_lunar,
    ended_year: row.ended_year === '' ? null : Number(row.ended_year),
    ended_month: row.ended_month === '' ? null : Number(row.ended_month),
    ended_day: row.ended_day === '' ? null : Number(row.ended_day),
    is_current: !!row.is_current,
    description: row.description || null,
  };
}
