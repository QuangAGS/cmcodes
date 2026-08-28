/**
 * PATH: src/App.jsx
 * DATETIME: 2026-06-08
 * VERSION: 13.2.5-FE-OP-B1 add routes
 * DESCRIPTION: 
 * Hỗ trợ SYSTEM_ADMIN + CLAN_ADMIN cho trang phê duyệt
 */

import { Toaster } from 'sonner';

import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';


// Lazy load
const HomePage = lazy(() => import('./pages/HomePage.jsx'));
const AuthPage = lazy(() => import('./pages/AuthPage.jsx'));
const TreePage = lazy(() => import('./pages/TreePage.jsx'));
const WaitingPage = lazy(() => import('./pages/WaitingPage.jsx'));
const AdminUserApprovalPage = lazy(() => import('./pages/AdminUserApprovalPage.jsx'));
const AdminWorkSelectorPage = lazy(() => import('./pages/AdminWorkSelectorPage.jsx'));
const AdminTenantActivatePage = lazy(() => import('./pages/AdminTenantActivatePage.jsx'));
//13.2.5-FE-OP-B1
import OpProtectedRoute from './components/routes/OpProtectedRoute.jsx';
const OpHubPage = lazy(() => import('./pages/OpHubPage.jsx'));
const OpBaseProfilePage = lazy(() => import('./pages/OpBaseProfilePage.jsx'));
const OpCaseDetailPage = lazy(() => import('./pages/OpCaseDetailPage.jsx'));

const AdminTenantSettingsPage = lazy(() => import('./pages/AdminTenantSettingsPage.jsx'));
const AdminTenantDirectoryPage = lazy(() => import('./pages/AdminTenantDirectoryPage.jsx'));
const MemberProfilePage = lazy(() => import('./pages/MemberProfilePage.jsx'));

const ProtectedRoute = ({ children, allowedStatus = 'DA_DUYET' }) => {
  const { user, loading } = useAuth();

  if (loading) return <div className="flex h-screen items-center justify-center font-sans">Đang tải...</div>;
  if (!user) return <Navigate to="/auth" replace />;
  
  if (user.status !== allowedStatus) {
    return <Navigate to={user.status === 'CHO_DUYET' ? '/waiting' : '/auth'} replace />;
  }

  return children;
};

// Admin Protected Route - Hỗ trợ cả SYSTEM_ADMIN và CLAN_ADMIN
const AdminProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="flex h-screen items-center justify-center font-sans">Đang tải...</div>;
  if (!user) {
    // Lưu lại trang đích để redirect sau login
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // Cho phép cả 2 loại admin
  if (user.role !== 'SYSTEM_ADMIN' && user.role !== 'CLAN_ADMIN') {
    return <Navigate to="/" replace />;
  }

  return children;
};

const AppRouter = () => {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center font-sans text-slate-400 font-bold uppercase tracking-widest animate-pulse">Khởi động hệ thống...</div>}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/auth" element={<AuthPage />} />

        <Route path="/tree" element={
          <ProtectedRoute allowedStatus="DA_DUYET">
            <TreePage />
          </ProtectedRoute>
        } />

        <Route path="/me/profile" element={
          <ProtectedRoute allowedStatus="DA_DUYET">
            <MemberProfilePage />
          </ProtectedRoute>
        } />

        <Route path="/waiting" element={
          <ProtectedRoute allowedStatus="CHO_DUYET">
            <WaitingPage />
          </ProtectedRoute>
        } />

        // OP2
        <Route path="/admin" element={
          <AdminProtectedRoute>
            <AdminWorkSelectorPage />
          </AdminProtectedRoute>
        } />

        <Route path="/admin/tenant/activate" element={
          <AdminProtectedRoute>
            <AdminTenantActivatePage />
          </AdminProtectedRoute>
        } />

        {/* ADMIN APPROVAL - Cho phép cả SYSTEM_ADMIN và CLAN_ADMIN */}
        <Route path="/admin/approval" element={     // process=OP → OpApprovalPanel
          <AdminProtectedRoute>
            <AdminUserApprovalPage />
          </AdminProtectedRoute>
        } />

        {/* OP case detail — B3 list → Xem & xử lý */}
        <Route path="/admin/approval/op/:caseId" element={
          <AdminProtectedRoute>
            <OpCaseDetailPage />
          </AdminProtectedRoute>
        } />

        //13.2.5-FE-OP-B1
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

        {/* ADMIN TENANT SETTINGS */}
        <Route path="/admin/tenant/settings" element={
          <AdminProtectedRoute>
            <AdminTenantSettingsPage />
          </AdminProtectedRoute>
          } 
        />

        <Route path="/admin/tenants" element={
          <AdminProtectedRoute>
            <AdminTenantDirectoryPage />
          </AdminProtectedRoute>
        } />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <Toaster 
        position="top-center" 
        richColors 
        closeButton
        toastOptions={{ style: { borderRadius: '20px', padding: '16px' } }}
      />
      <BrowserRouter>
        <AppRouter />
      </BrowserRouter>
    </AuthProvider>
  );
}