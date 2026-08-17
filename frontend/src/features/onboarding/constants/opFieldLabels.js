/**
 * PATH       : src/features/onboarding/constants/opFieldLabels.js
 * DATETIME   : 2026-08-17T15:30:00+07:00
 * VERSION    : 1.0.0-FE-OP-B1-UI1
 * DESCRIPTION:
 * - Từ điển ngữ nghĩa field/enum phục vụ OP (MEMBER_PROMOTE).
 * - Namespace theo bảng — không raw API key trên UI/TTS.
 * - Module-scoped (features/onboarding) theo LEVEL D2 feature isolation.
 * - Không chứa error-map CED (orchestrator / shared.network sau này).
 */

'use strict';

/** members — nhãn UI (bổ sung dần; đủ chỗ cho OP + form sau) */
export const MEMBERS_FIELD_LABELS = {
  id: 'Mã thành viên',
  full_name: 'Họ và tên',
  alias: 'Tên thường gọi / biệt danh',
  gender: 'Giới tính',
  is_alive: 'Còn sống',
  generation: 'Thuộc đời thứ mấy',
  child_type: 'Quan hệ với cha mẹ',
  father_id: 'Cha',
  mother_id: 'Mẹ',
  birth_day: 'Ngày sinh',
  birth_month: 'Tháng sinh',
  birth_year: 'Năm sinh',
  is_birth_lunar: 'Ngày sinh âm lịch',
  birth_note: 'Ghi chú ngày sinh',
  death_day: 'Ngày mất',
  death_month: 'Tháng mất',
  death_year: 'Năm mất',
  is_death_lunar: 'Ngày mất âm lịch',
  death_note: 'Ghi chú ngày mất',
  phone_number: 'Số điện thoại',
  email: 'Thư điện tử',
  note: 'Ghi chú',
  role: 'Vai trò trong dòng họ',
  status: 'Trạng thái thành viên',
  branch_id: 'Chi họ',
  is_clan: 'Thuộc dòng họ',
  current_address_id: 'Địa chỉ hiện tại',
  origin_address_id: 'Quê quán',
  is_contact_public: 'Công khai liên hệ',
  tenant_id: 'Dòng họ',
};

/** onboarding_cases — field FE hay hiện */
export const ONBOARDING_CASE_FIELD_LABELS = {
  id: 'Mã hồ sơ',
  status: 'Trạng thái hồ sơ',
  case_type: 'Loại hồ sơ',
  process_kind: 'Loại quy trình',
  review_note: 'Góp ý của quản trị',
  primary_member_id: 'Thành viên chính',
  user_id: 'Tài khoản',
  tenant_id: 'Dòng họ',
  correlation_id: 'Mã theo dõi',
};

/** Enum → câu ngắn (UI + TTS) */
export const ENUM_LABELS = {
  members_status: {
    DU_BI: 'Thành viên dự bị',
    CHINH_THUC: 'Thành viên chính thức',
  },
  members_gender: {
    NAM: 'Nam',
    NU: 'Nữ',
    KHAC: 'Khác',
  },
  case_status: {
    DRAFT: 'Chưa gửi duyệt',
    SUBMITTED: 'Đã gửi — chờ xem xét',
    UNDER_REVIEW: 'Đang được xem xét',
    NEEDS_REVISION: 'Cần bổ sung theo góp ý',
    APPROVED: 'Đã duyệt',
    REJECTED: 'Không được duyệt',
    CANCELLED: 'Đã hủy',
    PROFILE_COMPLETED: 'Đã hoàn thiện hồ sơ',
  },
  case_type: {
    MEMBER_JOIN: 'Xin vào dòng họ',
    CLAN_SETUP: 'Thành lập dòng họ',
  },
  process_kind: {
    MEMBER_PROMOTE: 'Xét duyệt thành viên chính thức',
    REGISTER: 'Đăng ký tài khoản',
  },
};

/**
 * @param {string} fieldKey - e.g. birth_month
 * @param {'members'|'onboarding_cases'} [table='members']
 */
export function labelField(fieldKey, table = 'members') {
  if (!fieldKey) return '';
  if (table === 'onboarding_cases') {
    return ONBOARDING_CASE_FIELD_LABELS[fieldKey] || fieldKey;
  }
  return MEMBERS_FIELD_LABELS[fieldKey] || fieldKey;
}

/**
 * @param {string[]} keys
 * @param {'members'|'onboarding_cases'} [table='members']
 * @returns {string[]}
 */
export function labelFields(keys = [], table = 'members') {
  return (Array.isArray(keys) ? keys : []).map((k) => labelField(k, table));
}

/**
 * @param {string} enumGroup - e.g. case_status
 * @param {string} value
 */
export function labelEnum(enumGroup, value) {
  if (value == null || value === '') return '';
  const group = ENUM_LABELS[enumGroup];
  if (!group) return String(value);
  return group[value] || String(value);
}

export default {
  MEMBERS_FIELD_LABELS,
  ONBOARDING_CASE_FIELD_LABELS,
  ENUM_LABELS,
  labelField,
  labelFields,
  labelEnum,
};