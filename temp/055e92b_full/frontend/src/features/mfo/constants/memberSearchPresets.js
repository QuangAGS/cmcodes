/**
 * PATH       : frontend/src/features/members/constants/memberSearchPresets.js
 * DATETIME   : 2026-09-21T10:10:00+07:00
 * VERSION    : 1.0.0-MS
 * DESCRIPTION: Preset cửa tìm người — Origin / ASSIGN cùng công cụ.
 */

export const MEMBER_SEARCH_PRESETS = {
  origin: {
    key: 'origin',
    title: 'Người gốc trên sổ Họ',
    hint: 'Gõ tên người đã có trên sổ. Trùng tên thì xem đủ rồi mới chọn.',
    status: 'CHINH_THUC',
    is_clan: null,
  },
  assign: {
    key: 'assign',
    title: 'Chọn người đã có trên sổ',
    hint: 'Đã có trên sổ thì chọn, đừng tạo thêm.',
    status: 'CHINH_THUC',
    is_clan: null,
  },
};
