/**
 * PATH       : src/pages/AdminTenantActivatePage.jsx
 * DATETIME   : 2026-08-10T11:20:00+07:00
 * VERSION    : 1.2.0-OP-2-Final
 * DESCRIPTION:
 * - OP-2 Final: Trang xác nhận kích hoạt tenant.
 * - Hiện name + description trước khi xác nhận.
 * - Sau success → bắt buộc logout + /auth.
 * - SYSTEM_ADMIN: tenantId từ query. CLAN_ADMIN: tenantId từ user.
 * - Q1: Không đụng Approval / Register.
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

const AdminTenantActivatePage = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

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

  // Fetch tenant info để hiện name + description
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
    return () => { cancelled = true; };
  }, [tenantId]);

  // Guard CLAN_ADMIN
  if (isClanAdmin && tenantStatus && tenantStatus !== 'TAM_NGUNG') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <p className="text-center text-slate-600">
          Dòng họ không ở trạng thái cần kích hoạt.
        </p>
        <button
          type="button"
          onClick={() => navigate('/admin')}
          className="rounded-2xl bg-slate-800 px-6 py-3 font-bold text-white"
        >
          Quay lại
        </button>
      </div>
    );
  }

  // Guard SYSTEM_ADMIN thiếu query
  if (isSystemAdmin && !queryTenantId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <p className="text-center text-slate-600">
          Vui lòng chọn dòng họ cần kích hoạt từ trang quản trị.
        </p>
        <button
          type="button"
          onClick={() => navigate('/admin')}
          className="rounded-2xl bg-slate-800 px-6 py-3 font-bold text-white"
        >
          Quay lại
        </button>
      </div>
    );
  }

  const handleActivate = async () => {
    if (!tenantId) {
      toast.error('Không tìm thấy thông tin dòng họ.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiClient.post(`/tenants/${tenantId}/activate`);
      toast.success(
        res.data?.message ||
          'Dòng họ đã kích hoạt thành công. Vui lòng đăng nhập lại.'
      );
      setDone(true);
      setTimeout(() => {
        logout();
        navigate('/auth', { replace: true });
      }, 1600);
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error?.message ||
        err.message ||
        'Không thể kích hoạt dòng họ.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white px-4 py-8 sm:px-6">
      <div className="mx-auto w-full max-w-[480px]">
        <button
          type="button"
          onClick={() => navigate('/admin')}
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-500"
        >
          <ArrowLeft className="h-4 w-4" />
          Quay lại
        </button>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
              {done ? (
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              ) : (
                <Building2 className="h-8 w-8" />
              )}
            </div>
          </div>

          <h1 className="text-center text-xl font-black text-slate-800">
            {done ? 'Đã kích hoạt thành công' : 'Xác nhận kích hoạt'}
          </h1>

          {fetching ? (
            <div className="mt-6 flex items-center justify-center gap-2 text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Đang tải thông tin...</span>
            </div>
          ) : tenantInfo ? (
            <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
              <div className="font-bold text-slate-800">{tenantInfo.name}</div>
              {tenantInfo.description && (
                <p className="mt-1 text-sm leading-relaxed text-slate-500">
                  {tenantInfo.description}
                </p>
              )}
              {tenantInfo.slug && (
                <p className="mt-1 text-xs text-slate-400">{tenantInfo.slug}</p>
              )}
            </div>
          ) : null}

          <p className="mt-4 text-center text-sm leading-relaxed text-slate-500">
            {done
              ? 'Hệ thống sẽ yêu cầu bạn đăng nhập lại để áp dụng trạng thái mới.'
              : 'Hành động này sẽ chuyển dòng họ sang trạng thái Hoạt động và không thể hoàn tác dễ dàng.'}
          </p>

          {!done && (
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
                onClick={() => navigate('/admin')}
                className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-6 py-3.5 text-sm font-bold text-slate-600 transition active:scale-[0.98]"
              >
                Quay lại — tôi chọn nhầm
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminTenantActivatePage;