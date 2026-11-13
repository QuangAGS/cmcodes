/**
 * =============================================================================
 * PATH        : frontend/src/components/routes/OpProtectedRoute.jsx
 * DATETIME    : 2026-11-13T11:20:00+07:00
 * VERSION     : 1.3.0-MULTIHOME-AMEND02-V15-LAT5
 * DESCRIPTION : Bộ lọc bảo vệ đường dẫn theo activeLinkStatus (Multi-Home V1.5.0 Mục 4):
 *               1. SYSTEM_ADMIN được phép truy cập.
 *               2. Các đường dẫn Multi-Home (/membership/claim, /membership/status, /membership/setup)
 *                  luôn mở cho người dùng đã đăng nhập (bao gồm user C1 đã DA_DUYET ở họ gốc A).
 *               3. CHO_DUYET / TU_CHOI -> điều hướng về /membership/status.
 *               4. DRAFT (Clan-setup sandbox) -> chỉ cho vào whitelist + chặn /tree.
 *               5. Không có activeMemberId -> điều hướng về /membership/claim.
 *               6. Kiểm tra allowedStatuses khi được truyền tường minh (ví dụ /tree yêu cầu DA_DUYET).
 * =============================================================================
 * CHANGELOGS:
 * - 2026-11-10T19:45:00+07:00 (v1.2.2-OP-PROTECTED-ROUTE-DRAFT-MEMBERSHIP-SAFE):
 *   + Whitelist DRAFT và dual export.
 * - 2026-11-13T11:20:00+07:00 (v1.3.0-MULTIHOME-AMEND02-V15-LAT5):
 *   + Mở quyền /membership/setup, /membership/claim, /membership/status cho user Multi-Home.
 *   + Đồng bộ thứ tự kiểm tra CHO_DUYET, TU_CHOI, DRAFT, !activeMemberId theo Mục 4 V1.5.0.
 * =============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const MEMBERSHIP_PATHS = [
  '/membership/claim',
  '/membership/status',
  '/membership/setup',
];

const DRAFT_WHITELIST_PATHS = [
  '/op',
  '/op/mfo',
  '/op/mfo/plan',
  '/op/base-profile',
  '/membership/claim',
  '/membership/status',
  '/membership/setup',
  '/membership/select-tenant',
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
      <div className="flex min-h-[60vh] flex-col items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        <span className="sr-only">Đang xác thực quyền truy cập...</span>
      </div>
    );
  }

  // 1. Chưa đăng nhập
  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // SYSTEM_ADMIN không bị ràng buộc activeMemberId
  if (String(user?.role || '').toUpperCase() === 'SYSTEM_ADMIN') {
    return children;
  }

  const isMembershipRoute = MEMBERSHIP_PATHS.some((p) =>
    location.pathname.startsWith(p)
  );
  const currentLinkStatus = String(
    activeContext?.activeLinkStatus || ''
  ).toUpperCase();

  // 2. Luồng Multi-Home C1 / C1-S: luôn cho phép người dùng đã đăng nhập truy cập /membership/*
  if (isMembershipRoute) {
    return children;
  }

  // 3. Ngữ cảnh hiện tại đang CHO_DUYET hoặc TU_CHOI -> điều hướng về /membership/status
  if (currentLinkStatus === 'CHO_DUYET' || currentLinkStatus === 'TU_CHOI') {
    return <Navigate to="/membership/status" replace />;
  }

  // 4. DRAFT (Clan-setup sandbox) -> whitelist + chặn tree
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

    return children;
  }

  // 5. Không có activeMemberId -> về /membership/claim
  if (!activeContext?.activeMemberId) {
    return <Navigate to="/membership/claim" replace />;
  }

  // 6. Kiểm tra allowedStatuses khi được truyền tường minh (ví dụ /tree yêu cầu DA_DUYET)
  if (Array.isArray(allowedStatuses) && allowedStatuses.length > 0) {
    if (!allowedStatuses.includes(currentLinkStatus)) {
      return <Navigate to="/membership/status" replace />;
    }
  }

  return children;
};

export default OpProtectedRoute;