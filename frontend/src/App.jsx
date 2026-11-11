/**
 * =============================================================================
 * PATH        : frontend/src/App.jsx
 * DATETIME    : 2026-11-10T14:30:00+07:00
 * VERSION     : 3.3.0-APP-MEMBERSHIP-MERGED
 * DESCRIPTION : Merge bản routing cũ (OP / Admin / Profile / Tree) với phân hệ
 *               Membership mới (AMEND-RP-OP-2026-01-V1.1).
 *               - Giữ toàn bộ routes cũ.
 *               - Thêm /membership/claim và /membership/status.
 *               - Mount SandboxModeBanner + HeaderClanSwitcher trên layout chính.
 *               - Bảo vệ /tree và các trang nghiệp vụ bằng OpProtectedRoute
 *                 (dựa trên activeLinkStatus).
 * =============================================================================
 * CHANGELOGS:
 * - 2026-10-13T19:41:00+07:00 (v3.2.0-REUSE-REACT-ALARM): Bản cũ đầy đủ routes.
 * - 2026-11-10T14:30:00+07:00 (v3.3.0-APP-MEMBERSHIP-MERGED):
 *   + Merge membership (P0/P1) vào bản cũ.
 *   + Mount SandboxModeBanner + HeaderClanSwitcher.
 *   + Thêm routes /membership/*.
 *   + Chuẩn hóa QX.
 * =============================================================================
 */

import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './context/AuthContext';
import { OpProtectedRoute } from './components/routes/OpProtectedRoute.jsx';
import { SandboxModeBanner } from './components/common/SandboxModeBanner';
import { HeaderClanSwitcher } from './features/membership/components/HeaderClanSwitcher';
import MfoAlarmHost from './features/mfo/components/MfoAlarmHost.jsx';

// --- Membership (P0) ---
import { ClaimMemberPage } from './features/membership/pages/ClaimMemberPage';
import { MembershipStatusPage } from './features/membership/pages/MembershipStatusPage';

// --- Lazy pages (giữ nguyên từ bản cũ) ---
const HomePage = lazy(() => import('./pages/HomePage.jsx'));
const AuthPage = lazy(() => import('./pages/AuthPage.jsx'));
const TreePage = lazy(() => import('./pages/TreePage.jsx'));
const WaitingPage = lazy(() => import('./pages/WaitingPage.jsx'));
const AdminUserApprovalPage = lazy(() => import('./pages/AdminUserApprovalPage.jsx'));
const AdminMfoPlanPage = lazy(() => import('./pages/AdminMfoPlanPage.jsx'));
const AdminWorkSelectorPage = lazy(() => import('./pages/AdminWorkSelectorPage.jsx'));
const AdminTenantActivatePage = lazy(() => import('./pages/AdminTenantActivatePage.jsx'));
const OpHubPage = lazy(() => import('./pages/OpHubPage.jsx'));
const OpBaseProfilePage = lazy(() => import('./pages/OpBaseProfilePage.jsx'));
const OpMfoPlanPage = lazy(() => import('./pages/OpMfoPlanPage.jsx'));
const OpMfoPlanTicketPage = lazy(() => import('./pages/OpMfoPlanTicketPage.jsx'));
const OpMfoWorkbenchPage = lazy(() => import('./pages/OpMfoWorkbenchPage.jsx'));
const OpMfoMemberPreviewPage = lazy(() => import('./pages/OpMfoMemberPreviewPage.jsx'));
const OpMemberSearchPage = lazy(() => import('./pages/OpMemberSearchPage.jsx'));
const OpGflPickPage = lazy(() => import('./pages/OpGflPickPage.jsx'));
const OpCaseDetailPage = lazy(() => import('./pages/OpCaseDetailPage.jsx'));
const AdminTenantSettingsPage = lazy(() => import('./pages/AdminTenantSettingsPage.jsx'));
const AdminTenantOriginPage = lazy(() => import('./pages/AdminTenantOriginPage.jsx'));
const AdminTenantDirectoryPage = lazy(() => import('./pages/AdminTenantDirectoryPage.jsx'));
const MemberProfilePage = lazy(() => import('./pages/MemberProfilePage.jsx'));
const AddressFormPage = lazy(() => import('./pages/AddressFormPage.jsx'));
const ProofUploadPage = lazy(() => import('./pages/ProofUploadPage.jsx'));
const DocumentUploadPage = lazy(() => import('./pages/DocumentUploadPage.jsx'));
const BioFileUploadPage = lazy(() => import('./pages/BioFileUploadPage.jsx'));
const AdminMemberVitalPage = lazy(() => import('./pages/AdminMemberVitalPage.jsx'));
const AdminBranchesPage = lazy(() => import('./pages/AdminBranchesPage.jsx'));
import { SelectTenantPage } from './features/membership/pages/SelectTenantPage';

/**
 * ProtectedRoute cũ (dựa trên user.status) — giữ cho các trang không thuộc OP/Membership.
 * Các trang OP / Tree / Membership nên dùng OpProtectedRoute.
 */
const ProtectedRoute = ({ children, allowedStatus = 'DA_DUYET' }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="flex h-screen items-center justify-center font-sans">Đang tải...</div>;
  }
  if (!user) return <Navigate to="/auth" replace />;

  if (user.status !== allowedStatus) {
    return <Navigate to={user.status === 'CHO_DUYET' ? '/waiting' : '/auth'} replace />;
  }

  return children;
};

const AdminProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="flex h-screen items-center justify-center font-sans">Đang tải...</div>;
  }
  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  if (user.role !== 'SYSTEM_ADMIN' && user.role !== 'CLAN_ADMIN') {
    return <Navigate to="/" replace />;
  }

  return children;
};

/**
 * Layout chính: Banner DRAFT + Header (có Clan Switcher)
 */
const AppLayout = ({ children }) => {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Banner Sandbox khi activeLinkStatus === 'DRAFT' */}
      <SandboxModeBanner />

      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold text-slate-800">Gia Phả Số</span>
          </div>

          {/* Multi-clan switcher */}
          <HeaderClanSwitcher />
        </div>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
};

const AppRouter = () => {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center font-sans text-slate-400 font-bold uppercase tracking-widest animate-pulse">
          Khởi động hệ thống...
        </div>
      }
    >
      <Routes>
        {/* ===== Public ===== */}
        <Route path="/" element={<HomePage />} />
        <Route path="/auth" element={<AuthPage />} />

        {/* ===== Membership (P0) ===== */}
        <Route
          path="/membership/claim"
          element={
            <OpProtectedRoute>
              <ClaimMemberPage />
            </OpProtectedRoute>
          }
        />
        <Route
          path="/membership/status"
          element={
            <OpProtectedRoute>
              <MembershipStatusPage />
            </OpProtectedRoute>
          }
        />

        {/* ===== Tree (chỉ DA_DUYET) ===== */}
        <Route
          path="/tree"
          element={
            <OpProtectedRoute allowedStatuses={['DA_DUYET']}>
              <TreePage />
            </OpProtectedRoute>
          }
        />

        {/* ===== Profile & Media (giữ ProtectedRoute cũ hoặc chuyển dần sang OpProtectedRoute) ===== */}
        <Route
          path="/members/:id/profile"
          element={
            <ProtectedRoute allowedStatus="DA_DUYET">
              <MemberProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/me/profile"
          element={
            <ProtectedRoute allowedStatus="DA_DUYET">
              <MemberProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/me/profile/address"
          element={
            <ProtectedRoute allowedStatus="DA_DUYET">
              <AddressFormPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/me/profile/achievement/:id/proof"
          element={
            <ProtectedRoute allowedStatus="DA_DUYET">
              <ProofUploadPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/me/profile/document"
          element={
            <ProtectedRoute allowedStatus="DA_DUYET">
              <DocumentUploadPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/me/profile/biography/:topic/file"
          element={
            <ProtectedRoute allowedStatus="DA_DUYET">
              <BioFileUploadPage />
            </ProtectedRoute>
          }
        />

        {/* ===== Waiting (legacy) ===== */}
        <Route
          path="/waiting"
          element={
            <ProtectedRoute allowedStatus="CHO_DUYET">
              <WaitingPage />
            </ProtectedRoute>
          }
        />

        {/* ===== OP / MFO ===== */}
        <Route
          path="/op"
          element={
            <OpProtectedRoute>
              <OpHubPage />
            </OpProtectedRoute>
          }
        />
        <Route
          path="/op/base-profile"
          element={
            <OpProtectedRoute>
              <OpBaseProfilePage />
            </OpProtectedRoute>
          }
        />
        <Route
          path="/op/mfo/plans/new"
          element={
            <OpProtectedRoute>
              <OpMfoPlanPage />
            </OpProtectedRoute>
          }
        />
        <Route
          path="/op/mfo/plan"
          element={
            <OpProtectedRoute>
              <OpMfoPlanPage />
            </OpProtectedRoute>
          }
        />
        <Route
          path="/op/mfo/plans/:id/work"
          element={
            <OpProtectedRoute>
              <OpMfoWorkbenchPage />
            </OpProtectedRoute>
          }
        />
        <Route
          path="/op/mfo/plans/:id"
          element={
            <OpProtectedRoute>
              <OpMfoPlanTicketPage />
            </OpProtectedRoute>
          }
        />
        <Route
          path="/op/mfo/members/:id"
          element={
            <OpProtectedRoute>
              <OpMfoMemberPreviewPage />
            </OpProtectedRoute>
          }
        />
        <Route
          path="/op/members/search"
          element={
            <OpProtectedRoute>
              <OpMemberSearchPage />
            </OpProtectedRoute>
          }
        />
        <Route
          path="/op/tree/pick-origin"
          element={
            <OpProtectedRoute>
              <OpGflPickPage />
            </OpProtectedRoute>
          }
        />

        {/* ===== Admin ===== */}
        <Route
          path="/admin"
          element={
            <AdminProtectedRoute>
              <AdminWorkSelectorPage />
            </AdminProtectedRoute>
          }
        />
        <Route
          path="/admin/tenant/activate"
          element={
            <AdminProtectedRoute>
              <AdminTenantActivatePage />
            </AdminProtectedRoute>
          }
        />
        <Route
          path="/admin/mfo/plans"
          element={
            <AdminProtectedRoute>
              <AdminMfoPlanPage />
            </AdminProtectedRoute>
          }
        />
        <Route
          path="/admin/approval"
          element={
            <AdminProtectedRoute>
              <AdminUserApprovalPage />
            </AdminProtectedRoute>
          }
        />
        <Route
          path="/admin/approval/op/:caseId"
          element={
            <AdminProtectedRoute>
              <OpCaseDetailPage />
            </AdminProtectedRoute>
          }
        />
        <Route
          path="/admin/tenant/origin"
          element={
            <AdminProtectedRoute>
              <AdminTenantOriginPage />
            </AdminProtectedRoute>
          }
        />
        <Route
          path="/admin/tenant/settings"
          element={
            <AdminProtectedRoute>
              <AdminTenantSettingsPage />
            </AdminProtectedRoute>
          }
        />
        <Route
          path="/admin/tenants"
          element={
            <AdminProtectedRoute>
              <AdminTenantDirectoryPage />
            </AdminProtectedRoute>
          }
        />
        <Route
          path="/admin/branches"
          element={
            <AdminProtectedRoute>
              <AdminBranchesPage />
            </AdminProtectedRoute>
          }
        />
        <Route
          path="/admin/members/vital"
          element={
            <AdminProtectedRoute>
              <AdminMemberVitalPage />
            </AdminProtectedRoute>
          }
        />
        <Route
          path="/admin/members/:id/vital"
          element={
            <AdminProtectedRoute>
              <AdminMemberVitalPage />
            </AdminProtectedRoute>
          }
        />
        <Route
          path="/membership/select-tenant"
          element={
            <OpProtectedRoute>
              <SelectTenantPage />
            </OpProtectedRoute>
          }
        />

        {/* ===== Fallback ===== */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <MfoAlarmHost />
      <Toaster
        position="top-center"
        richColors
        closeButton
        toastOptions={{ style: { borderRadius: '20px', padding: '16px' } }}
      />
      <BrowserRouter>
        <AppLayout>
          <AppRouter />
        </AppLayout>
      </BrowserRouter>
    </AuthProvider>
  );
}
