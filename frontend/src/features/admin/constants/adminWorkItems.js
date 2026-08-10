/**
 * PATH       : src/features/admin/constants/adminWorkItems.js
 * DATETIME   : 2026-08-10T11:50:00+07:00
 * VERSION    : 1.0.0-OP-2
 * DESCRIPTION:
 * - Định nghĩa tập hợp công việc Admin (SYSTEM_ADMIN / CLAN_ADMIN).
 * - Mở rộng sau chỉ cần thêm object vào mảng tương ứng.
 * - `when`: mảng tenantStatus được phép hiện (CLAN_ADMIN). Omit = luôn hiện.
 */

export const SYSTEM_ADMIN_WORK_ITEMS = [
  {
    id: 'approval',
    title: 'Phê duyệt thành viên',
    description: 'Duyệt hồ sơ đăng ký toàn hệ thống',
    path: '/admin/approval',
    icon: 'Users',
  },
];

export const CLAN_ADMIN_WORK_ITEMS = [
  {
    id: 'activate',
    title: 'Kích hoạt dòng họ',
    description: 'Chuyển dòng họ từ tạm ngưng sang hoạt động',
    path: '/admin/tenant/activate',
    icon: 'Building2',
    when: ['TAM_NGUNG'],
    primary: true,
  },
  {
    id: 'approval',
    title: 'Phê duyệt thành viên',
    description: 'Duyệt, từ chối hoặc yêu cầu bổ sung hồ sơ đăng ký',
    path: '/admin/approval',
    icon: 'Users',
    when: ['HOAT_DONG'],
  },
  {
    id: 'tree',
    title: 'Xem cây gia phả',
    description: 'Xem và quản lý cây phả hệ của dòng họ',
    path: '/tree',
    icon: 'ShieldCheck',
    when: ['HOAT_DONG'],
  },
];