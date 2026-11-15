/**
 * PATH       : src/features/onboarding/constants/opFieldLabels.js
 * DATETIME   : 2026-08-24T10:45:00+07:00
 * VERSION    : 1.1.0-FE-OP-LABELS
 * DESCRIPTION:
 * - Từ điển ngữ nghĩa field/enum phục vụ OP (MEMBER_PROMOTE).
 * - UI chỉ hiện nhãn tiếng Việt; mã enum chỉ trong API/DB.
 */

'use strict';

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

export const ONBOARDING_CASE_FIELD_LABELS = {
  id: 'Mã hồ sơ',
  status: 'Trạng thái hồ sơ',
  case_type: 'Loại hồ sơ',
  process_kind: 'Loại quy trình',
  review_note: 'Góp ý của quản trị',
  revision_request: 'Yêu cầu bổ sung',
  rejection_reason: 'Lý do từ chối',
  primary_member_id: 'Thành viên chính',
  user_id: 'Tài khoản',
  tenant_id: 'Dòng họ',
  correlation_id: 'Mã theo dõi',
};

/** Enum → tiếng Việt (UI + TTS) */
export const ENUM_LABELS = {
  members_status: {
    DU_BI: 'Dự bị',
    CHINH_THUC: 'Chính thức',
  },
  members_gender: {
    NAM: 'Nam',
    NU: 'Nữ',
    KHAC: 'Khác',
  },
  members_roles: {
    THANH_VIEN: 'Thành viên',
    TRUONG_HO: 'Trưởng họ',
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
    EXPIRED: 'Hết hạn',
  },
  case_type: {
    MEMBER_JOIN: 'Xin vào dòng họ',
    CLAN_SETUP: 'Thành lập dòng họ',
  },
  process_kind: {
    MEMBER_PROMOTE: 'Xét duyệt thành viên chính thức',
    REGISTER: 'Đăng ký tài khoản',
  },
  users_role: {
    SYSTEM_ADMIN: 'Quản trị hệ thống',
    CLAN_ADMIN: 'Quản trị dòng họ',
    USER: 'Thành viên',
    VIEWER: 'Người xem',
    GUEST: 'Khách',
    EDITOR: 'Biên tập',
    KHAC: 'Khác',
  },
  users_status: {
    CHO_DUYET: 'Chờ duyệt',
    DA_DUYET: 'Đã duyệt',
    BI_KHOA: 'Bị khóa',
    BI_CAM: 'Bị cấm',
    TAM_NGUNG: 'Tạm ngưng',
    TU_CHOI: 'Từ chối',
  },
};

export function labelField(fieldKey, table = 'members') {
  if (!fieldKey) return '';
  if (table === 'onboarding_cases') {
    return ONBOARDING_CASE_FIELD_LABELS[fieldKey] || fieldKey;
  }
  return MEMBERS_FIELD_LABELS[fieldKey] || fieldKey;
}

export function labelFields(keys = [], table = 'members') {
  return (Array.isArray(keys) ? keys : []).map((k) => labelField(k, table));
}

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
