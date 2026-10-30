/**
 * PATH       : frontend/src/features/mfo/constants/mfoIcons.js
 * DATETIME   : 2026-10-15T08:18:00+07:00
 * VERSION    : 1.0.0-UI-LAT1
 * DESCRIPTION: Một việc một icon, một nhãn. Trang không tự chọn.
 */
import {
  ArrowLeft,
  Minus,
  Pencil,
  Plus,
  Save,
  Send,
  Trash2,
  UserCheck,
  Volume2,
  X,
} from 'lucide-react';

export const MFO_ICON = {
  hear: { Icon: Volume2, label: 'Nghe' },
  close: { Icon: X, label: 'Đóng' },
  back: { Icon: ArrowLeft, label: 'Quay lại' },
  save: { Icon: Save, label: 'Lưu' },
  submit: { Icon: Send, label: 'Trình' },
  add: { Icon: Plus, label: 'Thêm' },
  cancel: { Icon: Minus, label: 'Hủy' },
  remove: { Icon: Trash2, label: 'Xóa' },
  edit: { Icon: Pencil, label: 'Sửa' },
  pick: { Icon: UserCheck, label: 'Chọn' },
};

export const MFO_ICON_CLASS = 'h-5 w-5';
