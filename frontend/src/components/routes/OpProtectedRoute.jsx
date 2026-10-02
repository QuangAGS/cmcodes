/**
 * PATH       : src/components/routes/OpProtectedRoute.jsx
 * DATETIME   : 2026-09-30T18:50:00+07:00
 * VERSION    : 1.3.0-OP-SAFE-MONKEYPATCH
 * DESCRIPTION:
 * - Guard đăng nhập cho /op, /op/base-profile, /op/mfo/*.
 * - Tôn trọng Q1: Không can thiệp ProtectedRoute / AdminProtectedRoute.
 * - Tôn trọng Q2: Bảo toàn logic Onboarding & OP Catalog logic.
 * - Tích hợp Patch Debug Window.String chống crash 'Cannot convert object to primitive value'.
 * - Bọc LocalErrorBoundary để cứu React Tree không bị sập trắng màn hình.
 */

import React, { useEffect, useState, Component } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import apiClient from '../../lib/apiClient.js';

// ============================================================================
// PATCH DEBUG: Chống văng Uncaught TypeError khi React DevTools/Console printWarning
// gọi String() trên các Object có Prototype rỗng hoặc Object.create(null).
// ============================================================================
if (typeof window !== 'undefined' && !window.__STRING_SAFE_PATCHED__) {
  window.__STRING_SAFE_PATCHED__ = true;
  const originalString = window.String;
  window.String = function (val) {
    try {
      return originalString(val);
    } catch (e) {
      if (val && typeof val === 'object') {
        try {
          return JSON.stringify(val);
        } catch (jsonErr) {
          return '[Unconvertible Object]';
        }
      }
      return '[Primitive Conversion Failure]';
    }
  };
}

/**
 * Local Error Boundary bảo lưu giao diện khi Component con (Lazy Page) bị lỗi runtime.
 */
class LocalErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[OpProtectedRoute ErrorBoundary Catch]:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen flex-col items-center justify-center p-6 text-center font-sans">
          <div className="max-w-md rounded-lg border border-red-200 bg-red-50 p-6 text-red-700 shadow-sm">
            <h3 className="mb-2 text-lg font-semibold">Lỗi khởi tạo màn hình MFO</h3>
            <p className="mb-4 text-sm text-red-600">
              Chi tiết: {String(this.state.error?.message || this.state.error || 'Unknown Error')}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700"
            >
              Tải lại trang
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

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
        // CHỐNG CRASH: Ép kiểu error code thành String thuần túy
        const status = err?.response?.status;
        const errType = status === 401 ? 'UNAUTHORIZED' : 'MY_OP_FAILED';

        if (!cancelled) {
          setOpState({
            loading: false,
            hasOpen: false,
            data: null,
            error: errType,
          });
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  // 1. Render Loading State
  if (authLoading || (user && opState.loading)) {
    return (
      <div className="flex h-screen items-center justify-center font-sans text-slate-500">
        Đang tải...
      </div>
    );
  }

  // 2. Chuyển hướng Auth
  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  if (opState.error === 'UNAUTHORIZED') {
    return <Navigate to="/auth" replace />;
  }

  // 3. Render Children được bọc trong ErrorBoundary an toàn tuyệt đối
  const renderContent = () => {
    if (typeof children === 'function') {
      try {
        return children(opState.data);
      } catch (renderErr) {
        console.error('[OpProtectedRoute] Error rendering functional children:', renderErr);
        return null;
      }
    }
    return React.isValidElement(children) ? children : <>{children}</>;
  };

  return <LocalErrorBoundary>{renderContent()}</LocalErrorBoundary>;
}