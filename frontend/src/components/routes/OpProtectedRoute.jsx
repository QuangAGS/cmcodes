/**
 * =============================================================================
 * PATH        : frontend/src/components/routes/OpProtectedRoute.jsx
 * DATETIME    : 2026-11-10T19:45:00+07:00
 * VERSION     : 1.2.2-OP-PROTECTED-ROUTE-DRAFT-MEMBERSHIP-SAFE
 * DESCRIPTION : Bộ lọc bảo vệ đường dẫn theo activeLinkStatus (Multi-Home).
 *               Đảm bảo DRAFT được vào /membership/claim và các path whitelist
 *               mà không bị đẩy ngược về /auth khi user vừa login.
 * =============================================================================
 * CHANGELOGS:
 * - 2026-11-10T14:35:00+07:00 (v1.2.1-OP-PROTECTED-ROUTE-DUAL-EXPORT):
 *   + Dual export (named + default).
 * - 2026-11-10T19:45:00+07:00 (v1.2.2-OP-PROTECTED-ROUTE-DRAFT-MEMBERSHIP-SAFE):
 *   + Không chặn DRAFT trên /membership/* và whitelist.
 *   + Chỉ áp dụng allowedStatuses khi được truyền tường minh.
 *   + Chuẩn hóa QX.
 * =============================================================================
 */

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const DRAFT_WHITELIST_PATHS = [
  '/op',
  '/op/mfo',
  '/op/mfo/plan',
  '/op/base-profile',
  '/membership/claim',
  '/membership/status',
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
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <span className="sr-only">Đang xác thực quyền truy cập...</span>
      </div>
    );
  }

  // 1. Chưa đăng nhập
  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // 2. Chưa có member → chỉ ép về claim nếu không đang ở claim
  if (!activeContext?.activeMemberId && location.pathname !== '/membership/claim') {
    return <Navigate to="/membership/claim" replace />;
  }

  const currentLinkStatus = activeContext?.activeLinkStatus || 'DRAFT';

  // 3. CHO_DUYET → chỉ cho vào status
  if (currentLinkStatus === 'CHO_DUYET') {
    if (location.pathname !== '/membership/status') {
      return <Navigate to="/membership/status" replace />;
    }
    return children;
  }

  // 4. DRAFT → whitelist + chặn tree
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

    // DRAFT + whitelist → cho qua, không áp dụng allowedStatuses mặc định
    return children;
  }

  // 5. allowedStatuses chỉ áp dụng khi được truyền tường minh
  if (Array.isArray(allowedStatuses) && allowedStatuses.length > 0) {
    if (!allowedStatuses.includes(currentLinkStatus)) {
      return <Navigate to="/membership/status" replace />;
    }
  }

  return children;
};

export default OpProtectedRoute;
