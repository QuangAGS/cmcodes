/**
 * =============================================================================
 * PATH        : frontend/src/components/routes/OpProtectedRoute.jsx
 * DATETIME    : 2026-11-10T14:35:00+07:00
 * VERSION     : 1.2.1-OP-PROTECTED-ROUTE-DUAL-EXPORT
 * DESCRIPTION : Bộ lọc bảo vệ đường dẫn kiểm soát ngữ cảnh Multi-Home (activeLinkStatus).
 *               Bổ sung cả Named Export và Default Export nhằm triệt tiêu hoàn toàn
 *               lỗi "Element type is invalid: expected a string or function but got undefined"
 *               khi import từ App.jsx.
 * =============================================================================
 * CHANGELOGS:
 * - 2026-11-10T11:50:00+07:00 (v1.2.0-OP-PROTECTED-ROUTE-WHITELIST-HARDENED):
 *   + Whitelist an toàn cho DRAFT và chặn các route /tree chính thức.
 * - 2026-11-10T14:35:00+07:00 (v1.2.1-OP-PROTECTED-ROUTE-DUAL-EXPORT):
 *   + Thêm export default OpProtectedRoute để tương thích với cú pháp import trong App.jsx.
 * =============================================================================
 */

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const DRAFT_WHITELIST_PATHS = [
  '/op/mfo',
  '/op/mfo/plan',
  '/op/base-profile',
  '/membership/claim',
  '/membership/status',
  '/op',
  '/me',
  '/profile',
];

const RESTRICTED_TREE_PATHS = [
  '/tree',
  '/pedigree',
  '/lineage',
  '/clan-members',
];

export const OpProtectedRoute = ({ children, allowedStatuses }) => {
  const { user, activeContext, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <span className="sr-only">Đang xác thực quyền truy cập...</span>
      </div>
    );
  }

  // 1. Chưa đăng nhập -> Chuyển về Auth/Login
  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // 2. Chưa có bản ghi thành viên hoặc liên kết dòng họ -> Chuyển sang nhận hồ sơ
  if (!activeContext?.activeMemberId && location.pathname !== '/membership/claim') {
    return <Navigate to="/membership/claim" replace />;
  }

  const currentLinkStatus = activeContext?.activeLinkStatus;

  // 3. Nếu không xác định được trạng thái liên kết -> Chuyển về Status
  if (!currentLinkStatus) {
    return <Navigate to="/membership/status" replace />;
  }

  // 4. Trạng thái CHO_DUYET: Hồ sơ đang chờ duyệt
  if (currentLinkStatus === 'CHO_DUYET') {
    if (location.pathname !== '/membership/status') {
      return <Navigate to="/membership/status" replace />;
    }
    return children;
  }

  // 5. Trạng thái DRAFT (Chế độ nháp khởi tạo)
  if (currentLinkStatus === 'DRAFT') {
    const isAccessingTree = RESTRICTED_TREE_PATHS.some((path) =>
      location.pathname.startsWith(path)
    );
    if (isAccessingTree) {
      return <Navigate to="/op/mfo/plan" replace />;
    }

    const isWhitelisted = DRAFT_WHITELIST_PATHS.some((path) =>
      location.pathname.startsWith(path)
    );
    if (!isWhitelisted) {
      return <Navigate to="/op/mfo/plan" replace />;
    }
  }

  // 6. Kiểm tra allowedStatuses truyền từ props
  if (Array.isArray(allowedStatuses) && allowedStatuses.length > 0) {
    if (!allowedStatuses.includes(currentLinkStatus)) {
      return <Navigate to="/membership/status" replace />;
    }
  }

  return children;
};

// Hỗ trợ Default Export cho App.jsx
export default OpProtectedRoute;