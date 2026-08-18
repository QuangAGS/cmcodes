/**
 * PATH       : src/pages/OpBaseProfilePage.jsx
 * DATETIME   : 2026-08-17T18:15:00+07:00
 * VERSION    : 1.0.0-FE-OP-B1-UI2
 * DESCRIPTION:
 * - Shell /op/base-profile: load my-op → BaseProfileForm.
 * - Sau lưu nháp: refresh my-op. Sau gửi duyệt: toast + về /op.
 * - Q1: không đụng RP.
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { useAuth } from '../context/AuthContext.jsx';
import apiClient from '../lib/apiClient.js';
import BaseProfileForm from '../features/onboarding/components/BaseProfileForm.jsx';
import { OP_BASE_PROFILE_TOAST } from '../features/onboarding/constants/opMessages.js';

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
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white px-4 py-8">
      <div className="mx-auto w-full max-w-[480px]">
        <header className="mb-6 text-center">
          <h1 className="text-2xl font-black text-slate-800">Hồ sơ cơ sở</h1>
          {subtitle ? (
            <p className="mt-2 text-sm font-semibold text-slate-600">{subtitle}</p>
          ) : null}
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

        <div className="mt-10 space-y-3 pb-6 text-center text-sm">
          <button
            type="button"
            onClick={() => navigate('/op')}
            className="font-semibold text-indigo-600 underline-offset-2 hover:underline"
          >
            Quay lại danh mục công việc
          </button>
          <div>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="font-semibold text-slate-500 underline-offset-2 hover:underline"
            >
              Trang chủ
            </button>
          </div>
          <div>
            <button
              type="button"
              onClick={handleLogout}
              className="font-semibold text-slate-400 underline-offset-2 hover:underline"
            >
              Đăng xuất
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}