/**
 * PATH       : src/components/routes/OpProtectedRoute.jsx
 * DATETIME   : 2026-09-20T13:40:00+07:00
 * VERSION    : 1.1.0-OP-CATALOG
 * DESCRIPTION:
 * - Guard đăng nhập cho /op, /op/base-profile, /op/mfo/*.
 * - C1: /op = catalog việc. hasOpen false (OP đóng) KHÔNG đẩy /tree.
 * - Case OP mở + DU_BI: page con (/op/base-profile) tự xử lý.
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

  if (typeof children === 'function') {
    return children(opState.data);
  }

  return children;
}
