/**
 * PATH       : frontend/src/features/members/constants/memberSearchPresets.js
 * DATETIME   : 2026-09-21T10:10:00+07:00
 * VERSION    : 1.0.0-MS
 * DESCRIPTION: Preset cửa tìm người — Origin / ASSIGN cùng công cụ.
 */

export const MEMBER_SEARCH_PRESETS = {
  origin: {
    key: 'origin',
    title: 'Chọn Đời gốc trên sổ họ',
    hint: 'Gõ tên người (có thể chỉ cần hai chữ cái đầu tiên). Bấm chọn xem kỹ thông tin rồi chọn.',
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
