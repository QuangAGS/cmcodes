/**
 * =============================================================================
 * PATH        : frontend/src/components/routes/OpProtectedRoute.jsx
 * DATETIME    : 2026-11-10T11:25:00+07:00
 * VERSION     : 1.1.0-OP-PROTECTED-ROUTE-MULTILINK
 * DESCRIPTION : Bộ lọc bảo vệ đường dẫn chuyên biệt cho các tác vụ Onboarding & Phả hệ.
 *               Mở rộng kiểm tra activeLinkStatus từ AuthContext:
 *               - DRAFT: Chỉ cho phép truy cập các màn hình thiết lập (ví dụ /op/mfo/plan),
 *                 chặn truy cập vào Cây phả hệ chính thức (/tree).
 *               - CHO_DUYET: Điều hướng về màn hình trạng thái (/membership/status).
 *               - DA_DUYET: Cho phép truy cập đầy đủ các phân hệ.
 * =============================================================================
 * CHANGELOGS:
 * - 2026-11-10T11:25:00+07:00 (v1.1.0-OP-PROTECTED-ROUTE-MULTILINK):
 *   + Chuẩn hóa theo tiêu chí QX.
 *   + Cập nhật kiểm tra activeLinkStatus thay vì chỉ dựa vào users.status.
 * =============================================================================
 */

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export const OpProtectedRoute = ({ children, allowedStatuses = ['DA_DUYET'] }) => {
  const { user, activeContext, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // 1. Chưa đăng nhập -> Chuyển về trang Login
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 2. Chưa có bản ghi thành viên hoặc chưa có liên kết dòng họ -> Chuyển sang nhận hồ sơ
  if (!activeContext?.activeMemberId && location.pathname !== '/membership/claim') {
    return <Navigate to="/membership/claim" replace />;
  }

  const currentLinkStatus = activeContext?.activeLinkStatus || 'DRAFT';

  // 3. Nếu đang chờ duyệt (CHO_DUYET) mà cố vào các trang yêu cầu DA_DUYET -> Về trang trạng thái
  if (currentLinkStatus === 'CHO_DUYET' && location.pathname !== '/membership/status') {
    return <Navigate to="/membership/status" replace />;
  }

  // 4. Nếu đang ở bản nháp (DRAFT) mà cố vào Cây chính thức (/tree) -> Ép về màn hình lập sơ đồ
  if (currentLinkStatus === 'DRAFT' && location.pathname.startsWith('/tree')) {
    return <Navigate to="/op/mfo/plan" replace />;
  }

  // 5. Kiểm tra quyền trạng thái cho phép truyền vào qua props
  if (allowedStatuses && !allowedStatuses.includes(currentLinkStatus)) {
    return <Navigate to="/membership/status" replace />;
  }

  return children;
};