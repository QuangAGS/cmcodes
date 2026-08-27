/**
 * PATH       : src/features/admin/constants/adminWorkItems.js
 * DATETIME   : 2026-08-26T08:55:00+07:00
 * VERSION    : 1.3.0-TITLE-RENAME
 * DESCRIPTION:
 * - Work items Admin.
 * - "Phê duyệt người dùng" (RP) · "Phê duyệt thành viên" (OP).
 */

export const SYSTEM_ADMIN_WORK_ITEMS = [
  {
    id: 'approval',
    title: 'Phê duyệt người dùng',
    description: 'Duyệt hồ sơ đăng ký tài khoản toàn hệ thống',
    path: '/admin/approval',
    icon: 'Users',
  },
  {
    id: 'op-approval-join',
    title: 'Phê duyệt thành viên',
    description: 'Duyệt thành viên dự bị thành chính thức (nhập tộc / thành lập)',
    path: '/admin/approval?process=OP',
    icon: 'UserCheck',
  },
  {
    id: 'tenant-directory',
    title: 'Quản trị dòng họ',
    description: 'Danh sách mọi dòng họ, lọc trạng thái, kích hoạt hẹp',
    path: '/admin/tenants',
    icon: 'Building2',
  },
  {
    id: 'tenant-settings',
    title: 'Cài đặt dòng họ',
    description: 'Tên, gia đạo, biểu tượng, logo',
    path: '/admin/tenant/settings',
    icon: 'Settings',
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
    title: 'Phê duyệt người dùng',
    description: 'Duyệt, từ chối hoặc yêu cầu bổ sung hồ sơ đăng ký',
    path: '/admin/approval',
    icon: 'Users',
    when: ['HOAT_DONG'],
  },
  {
    id: 'op-approval-join',
    title: 'Phê duyệt thành viên',
    description: 'Duyệt thành viên dự bị thành chính thức',
    path: '/admin/approval?process=OP',
    icon: 'UserCheck',
    when: ['HOAT_DONG'],
  },
  {
    id: 'tenant-settings',
    title: 'Cài đặt dòng họ',
    description: 'Tên, gia đạo, biểu tượng, logo',
    path: '/admin/tenant/settings',
    icon: 'Settings',
    when: ['HOAT_DONG', 'TAM_NGUNG'],
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
