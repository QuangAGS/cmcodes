/**
 * PATH       : src/components/routes/OpProtectedRoute.jsx
 * DATETIME   : 2026-08-16T23:05:00+07:00
 * VERSION    : 1.0.0-FE-OP-B1
 * DESCRIPTION:
 * - Guard cho /op và /op/base-profile.
 * - SSOT: GET /onboarding/my-op → hasOpen === true mới cho vào.
 * - DU_BI có thể từ RP hoặc định nghĩa family — không đoán nguồn, chỉ tin my-op.
 * - Q1: không sửa ProtectedRoute / AdminProtectedRoute.
 */

import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import apiClient from '../../lib/apiClient.js';

export default function OpProtectedRoute({ children }) {
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();

  const [opState, setOpState] = useState({
    loading: true,
    hasOpen: false,
    data: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (authLoading) return;
      if (!user) {
        if (!cancelled) {
          setOpState({ loading: false, hasOpen: false, data: null, error: null });
        }
        return;
      }

      try {
        const res = await apiClient.get('/onboarding/my-op');
        const data = res.data?.data ?? res.data ?? null;
        const hasOpen = data?.hasOpen === true;

        if (!cancelled) {
          setOpState({
            loading: false,
            hasOpen,
            data,
            error: null,
          });
        }
      } catch (err) {
        const status = err?.response?.status;
        if (!cancelled) {
          setOpState({
            loading: false,
            hasOpen: false,
            data: null,
            error: status === 401 ? 'UNAUTHORIZED' : 'MY_OP_FAILED',
          });
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  if (authLoading || (user && opState.loading)) {
    return (
      <div className="flex h-screen items-center justify-center font-sans text-slate-500">
        Đang tải...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  if (opState.error === 'UNAUTHORIZED') {
    return <Navigate to="/auth" replace />;
  }

  if (!opState.hasOpen) {
    return <Navigate to="/tree" replace />;
  }

  // Cho page con đọc my-op đã fetch (tránh gọi lại ngay)
  if (typeof children === 'function') {
    return children(opState.data);
  }

  return children;
}