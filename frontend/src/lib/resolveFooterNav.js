/**
 * =============================================================================
 * PATH        : frontend/src/lib/resolveFooterNav.js
 * DATETIME    : 2026-11-10T13:55:00+07:00
 * VERSION     : 1.2.0-RESOLVE-FOOTER-NAV-MULTILINK
 * DESCRIPTION : Bộ điều phối danh mục Menu chân trang (Bottom Navigation Bar)
 *               trên thiết bị di động. Tự động chuyển đổi các mục Menu dựa theo
 *               ngữ cảnh liên kết (activeLinkStatus) của người dùng:
 *               - DRAFT: Hiển thị tab lập hồ sơ 5L (/op/mfo/plan).
 *               - CHO_DUYET: Hiển thị tab theo dõi tiến độ duyệt (/membership/status).
 *               - DA_DUYET: Hiển thị đầy đủ Cây phả hệ (/tree), Tin tức, Sổ cái.
 * =============================================================================
 * CHANGELOGS:
 * - 2026-08-20T14:00:00+07:00 (v1.0.0-LEGACY):
 *   + Menu điều hướng 4 nút cố định cũ.
 * - 2026-11-10T13:55:00+07:00 (v1.2.0-RESOLVE-FOOTER-NAV-MULTILINK):
 *   + Cập nhật quy chuẩn QX.
 *   + Bổ sung điều phối động dựa trên activeLinkStatus và activeContext.
 *   + Đảm bảo người dùng ở trạng thái DRAFT / CHO_DUYET luôn có lối tắt hợp lệ.
 * =============================================================================
 */

/**
 * Tạo danh sách các nút bấm thanh điều hướng chân trang (Bottom Nav)
 * @param {object} params
 * @param {object} params.user - Thông tin tài khoản người dùng
 * @param {object} params.activeContext - Ngữ cảnh dòng họ hiện tại (activeLinkStatus, roleInTenant)
 * @returns {Array<{id: string, label: string, path: string, icon: string, badge?: string}>}
 */
export const resolveFooterNav = ({ user, activeContext } = {}) => {
  // Nếu chưa đăng nhập: Trả về điều hướng cơ bản công khai
  if (!user) {
    return [
      { id: 'home', label: 'Trang chủ', path: '/', icon: 'Home' },
      { id: 'search', label: 'Tra cứu họ', path: '/search', icon: 'Search' },
      { id: 'login', label: 'Đăng nhập', path: '/login', icon: 'LogIn' },
    ];
  }

  const linkStatus = activeContext?.activeLinkStatus;

  // 1. NGƯỜI DÙNG Ở TRẠNG THÁI DRAFT (Đang lập hồ sơ/cây 5 đời MFO)
  if (linkStatus === 'DRAFT') {
    return [
      { id: 'plan', label: 'Lập sơ đồ 5L', path: '/op/mfo/plan', icon: 'FileEdit' },
      { id: 'hub', label: 'Cổng tác nghiệp', path: '/op', icon: 'LayoutDashboard' },
      { id: 'profile', label: 'Cá nhân', path: '/me', icon: 'User' },
    ];
  }

  // 2. NGƯỜI DÙNG Ở TRẠNG THÁI CHO_DUYET / NEEDS_REVISION (Đang chờ thẩm định)
  if (linkStatus === 'CHO_DUYET' || linkStatus === 'NEEDS_REVISION') {
    return [
      {
        id: 'status',
        label: 'Tiến độ hồ sơ',
        path: '/membership/status',
        icon: 'Clock',
        badge: linkStatus === 'NEEDS_REVISION' ? 'Cần sửa' : undefined,
      },
      { id: 'hub', label: 'Cổng tác nghiệp', path: '/op', icon: 'LayoutDashboard' },
      { id: 'profile', label: 'Cá nhân', path: '/me', icon: 'User' },
    ];
  }

  // 3. THÀNH VIÊN ĐÃ ĐƯỢC DUYỆT CHÍNH THỨC (DA_DUYET - Full Access)
  return [
    { id: 'tree', label: 'Cây phả hệ', path: '/tree', icon: 'Network' },
    { id: 'events', label: 'Việc họ', path: '/events', icon: 'Calendar' },
    { id: 'fund', label: 'Quỹ họ', path: '/fund', icon: 'Wallet' },
    { id: 'hub', label: 'Tác nghiệp', path: '/op', icon: 'LayoutDashboard' },
    { id: 'profile', label: 'Cá nhân', path: '/me', icon: 'User' },
  ];
};