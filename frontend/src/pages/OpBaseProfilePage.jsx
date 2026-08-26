/**
 * PATH       : src/pages/OpBaseProfilePage.jsx
 * DATETIME   : 2026-08-24T10:45:00+07:00
 * VERSION    : 1.2.0-FOOTER
 * DESCRIPTION:
 * - Shell /op/base-profile + TenantHeader + AppFooterNav.
 * - load my-op → BaseProfileForm.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { useAuth } from '../context/AuthContext.jsx';
import apiClient from '../lib/apiClient.js';
import BaseProfileForm from '../features/onboarding/components/BaseProfileForm.jsx';
import { OP_BASE_PROFILE_TOAST } from '../features/onboarding/constants/opMessages.js';
import TenantHeader from '../components/shell/TenantHeader.jsx';
import AppFooterNav from '../components/shell/AppFooterNav.jsx';
import { resolveTenant } from '../lib/resolveTenant.js';
import { resolveFooterNav } from '../lib/resolveFooterNav.js';

export default function OpBaseProfilePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [myOp, setMyOp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await apiClient.get('/onboarding/my-op');
      const data = res.data?.data ?? res.data ?? null;
      setMyOp(data);
    } catch {
      setMyOp(null);
      setLoadError(OP_BASE_PROFILE_TOAST.loadFailed);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleLogout = () => {
    logout();
    navigate('/auth', { replace: true });
  };

  const footerNav = resolveFooterNav(user, { pageKey: 'op-base-profile' });

  const sessionTenant = useMemo(
    () => resolveTenant(user, myOp?.tenant),
    [user, myOp?.tenant]
  );

  const subtitle =
    user?.phone || user?.email || myOp?.primary?.full_name || user?.name || '';

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Đang tải hồ sơ...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="mx-auto w-full max-w-[480px]">
        <TenantHeader tenant={sessionTenant} subtitle={subtitle} />

        <div className="px-4 py-6">
          {footerNav.backTo ? (
            <button
              type="button"
              onClick={() => navigate(footerNav.backTo)}
              className="mb-3 text-sm font-bold text-indigo-700"
            >
              ← Quay lại
            </button>
          ) : null}
          <header className="mb-6 text-center">
            <h1 className="text-2xl font-black text-slate-800">Hồ sơ cơ sở</h1>
          </header>

          {loadError ? (
            <p className="mb-4 text-center text-sm text-rose-600">{loadError}</p>
          ) : (
            <BaseProfileForm
              myOpData={myOp}
              onSuccessDraft={() => {
                load();
              }}
              onSuccessSubmit={() => {
                navigate('/op', { replace: true });
              }}
            />
          )}

          <AppFooterNav
            {...footerNav}
            onLogout={handleLogout}
          />
        </div>
      </div>
    </div>
  );
}
