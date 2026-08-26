/**
 * PATH       : src/pages/AdminTenantActivatePage.jsx
 * DATETIME   : 2026-08-26T08:30:00+07:00
 * VERSION    : 1.3.0-FOOTER
 * DESCRIPTION:
 * - OP-2 Final: Xác nhận kích hoạt tenant + AppFooterNav chuẩn.
 * - Sau success → logout + /auth.
 */

import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Building2,
  Loader2,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import apiClient from '../lib/apiClient.js';
import AppFooterNav from '../components/shell/AppFooterNav.jsx';
import { resolveFooterNav } from '../lib/resolveFooterNav.js';

const AdminTenantActivatePage = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const footerNav = resolveFooterNav(user, { pageKey: 'admin-settings' });
  const handleLogout = () => {
    logout();
    navigate('/auth', { replace: true });
  };

  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [tenantInfo, setTenantInfo] = useState(null);
  const [fetching, setFetching] = useState(true);

  const isSystemAdmin = user?.role === 'SYSTEM_ADMIN';
  const isClanAdmin = user?.role === 'CLAN_ADMIN';

  const queryTenantId = searchParams.get('tenantId');
  const tenantId =
    (isSystemAdmin && queryTenantId) ||
    user?.tenantId ||
    user?.tenant_id ||
    null;

  const tenantStatus = user?.tenantStatus || user?.tenant_status || null;

  useEffect(() => {
    if (!tenantId) {
      setFetching(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.get(`/tenants/${tenantId}`);
        const data = res.data?.data || res.data;
        if (!cancelled) setTenantInfo(data);
      } catch {
        if (!cancelled) toast.error('Không tải được thông tin dòng họ.');
      } finally {
        if (!cancelled) setFetching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const handleActivate = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      await apiClient.post(`/tenants/${tenantId}/activate`);
      setDone(true);
      toast.success('Đã kích hoạt dòng họ.');
      setTimeout(() => {
        logout();
        navigate('/auth', { replace: true });
      }, 1500);
    } catch (e) {
      toast.error(
        e?.response?.data?.message || 'Không kích hoạt được. Thử lại.'
      );
    } finally {
      setLoading(false);
    }
  };

  const back = () => navigate(footerNav.backTo || '/admin');

  if (isClanAdmin && tenantStatus && tenantStatus !== 'TAM_NGUNG') {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col">
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4">
          <p className="text-center text-slate-600">
            Dòng họ không ở trạng thái cần kích hoạt.
          </p>
          <button
            type="button"
            onClick={back}
            className="rounded-2xl bg-slate-800 px-6 py-3 font-bold text-white"
          >
            Quay lại
          </button>
        </div>
        <div className="px-4 pb-6">
          <AppFooterNav {...footerNav} onLogout={handleLogout} />
        </div>
      </div>
    );
  }

  if (isSystemAdmin && !queryTenantId) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col">
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4">
          <p className="text-center text-slate-600">
            Vui lòng chọn dòng họ cần kích hoạt từ trang quản trị.
          </p>
          <button
            type="button"
            onClick={back}
            className="rounded-2xl bg-slate-800 px-6 py-3 font-bold text-white"
          >
            Quay lại
          </button>
        </div>
        <div className="px-4 pb-6">
          <AppFooterNav {...footerNav} onLogout={handleLogout} />
        </div>
      </div>
    );
  }

  if (!tenantId) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col">
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4">
          <p className="text-center text-slate-600">
            Không xác định được dòng họ.
          </p>
          <button
            type="button"
            onClick={back}
            className="rounded-2xl bg-slate-800 px-6 py-3 font-bold text-white"
          >
            Quay lại
          </button>
        </div>
        <div className="px-4 pb-6">
          <AppFooterNav {...footerNav} onLogout={handleLogout} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="mx-auto w-full max-w-[480px] px-4 py-8">
        <button
          type="button"
          onClick={back}
          className="mb-4 inline-flex items-center gap-1 text-sm font-bold text-indigo-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Quay lại
        </button>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex justify-center">
            {done ? (
              <CheckCircle2 className="h-12 w-12 text-emerald-500" />
            ) : (
              <Building2 className="h-12 w-12 text-indigo-600" />
            )}
          </div>
          <h1 className="mt-4 text-center text-xl font-black text-slate-800">
            {done ? 'Đã kích hoạt' : 'Kích hoạt dòng họ'}
          </h1>

          {fetching ? (
            <div className="mt-5 flex items-center justify-center gap-2 text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Đang tải thông tin...</span>
            </div>
          ) : tenantInfo ? (
            <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
              <div className="font-bold text-slate-800">{tenantInfo.name}</div>
              {tenantInfo.description ? (
                <p className="mt-1 text-sm leading-relaxed text-slate-500">
                  {tenantInfo.description}
                </p>
              ) : null}
              {tenantInfo.slug ? (
                <p className="mt-1 text-xs text-slate-400">{tenantInfo.slug}</p>
              ) : null}
            </div>
          ) : null}

          <p className="mt-4 text-center text-sm leading-relaxed text-slate-500">
            {done
              ? 'Hệ thống sẽ yêu cầu bạn đăng nhập lại để áp dụng trạng thái mới.'
              : 'Hành động này sẽ chuyển dòng họ sang trạng thái Hoạt động và không thể hoàn tác dễ dàng.'}
          </p>

          {!done ? (
            <>
              <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-left text-xs text-amber-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Sau khi kích hoạt, bạn sẽ được yêu cầu đăng nhập lại.
                </span>
              </div>

              <button
                type="button"
                disabled={loading || !tenantId || fetching}
                onClick={handleActivate}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-6 py-4 text-base font-bold text-white shadow-lg shadow-indigo-200 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Đang kích hoạt...
                  </>
                ) : (
                  'Xác nhận kích hoạt'
                )}
              </button>

              <button
                type="button"
                onClick={back}
                className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-6 py-3.5 text-sm font-bold text-slate-600 transition active:scale-[0.98]"
              >
                Quay lại — tôi chọn nhầm
              </button>
            </>
          ) : null}
        </div>

        <div className="mt-8 pb-6">
          <AppFooterNav {...footerNav} onLogout={handleLogout} />
        </div>
      </div>
    </div>
  );
};

export default AdminTenantActivatePage;
