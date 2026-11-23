/**
 * PATH       : src/pages/AdminTenantDirectoryPage.jsx
 * DATETIME   : 2026-11-23T16:30:00+07:00
 * VERSION    : 1.3.0-ISO29148-RPOP-NO-TOAST
 * DESCRIPTION:
 * SYS Tenant Directory. pageKey=admin, Home=/.
 * - Hiển thị trạng thái dựng cây ban đầu (Sandbox) vs Vận hành chính thức.
 * - Điều hướng nhanh sang duyệt CLAN_SETUP (CHO_DUYET) hoặc kích hoạt chính thức.
 */

import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import PersistentMessageBanner from '../components/common/PersistentMessageBanner.jsx';
import { Building2, Loader2, RefreshCw, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import apiClient from '../lib/apiClient.js';
import TenantHeader from '../components/shell/TenantHeader.jsx';
import AppFooterNav from '../components/shell/AppFooterNav.jsx';
import { resolveTenant } from '../lib/resolveTenant.js';
import { resolveFooterNav } from '../lib/resolveFooterNav.js';

const STATUS_OPTIONS = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'CHO_DUYET', label: 'Chờ duyệt thành lập' },
  { value: 'SANDBOX', label: 'Đang dựng cây (Sandbox)' },
  { value: 'HOAT_DONG', label: 'Hoạt động (Tất cả)' },
  { value: 'TAM_NGUNG', label: 'Tạm ngưng' },
  { value: 'TU_CHOI', label: 'Từ chối' },
  { value: 'BI_KHOA', label: 'Bị khóa' },
  { value: 'NGUNG_HAN', label: 'Ngưng hẳn' },
];

const STATUS_LABEL = {
  HOAT_DONG: 'Hoạt động',
  TAM_NGUNG: 'Tạm ngưng',
  CHO_DUYET: 'Chờ duyệt',
  TU_CHOI: 'Từ chối',
  BI_KHOA: 'Bị khóa',
  NGUNG_HAN: 'Ngưng hẳn',
};

function statusClass(status) {
  if (status === 'HOAT_DONG') return 'bg-emerald-50 text-emerald-700';
  if (status === 'TAM_NGUNG') return 'bg-amber-50 text-amber-800';
  if (status === 'CHO_DUYET') return 'bg-sky-50 text-sky-700';
  if (status === 'TU_CHOI' || status === 'BI_KHOA' || status === 'NGUNG_HAN') {
    return 'bg-rose-50 text-rose-700';
  }
  return 'bg-slate-100 text-slate-600';
}

export default function AdminTenantDirectoryPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const sessionTenant = resolveTenant(user);
  const footerNav = resolveFooterNav(user, {
    pageKey: 'admin',
    backTo: '/admin',
    showBack: true,
  });

  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [actionBusyId, setActionBusyId] = useState('');
  const [confirmCleanupId, setConfirmCleanupId] = useState('');
  const [bannerState, setBannerState] = useState(null);
  const [result, setResult] = useState({ items: [], total: 0, pages: 1, page: 1 });

  const handleExtendSandbox = async (tenantItem, extraDays = 15) => {
    setBannerState(null);
    try {
      setActionBusyId(tenantItem.id);
      await apiClient.post(`/tenants/${tenantItem.id}/sandbox/extend`, {
        extraDays,
        note: `SYSTEM_ADMIN gia hạn Sandbox thêm ${extraDays} ngày`,
      });
      await load();
      setBannerState({
        type: 'success',
        mode: 'inline',
        title: 'Đã gia hạn thời gian dùng thử Sandbox',
        message: `Đã gia hạn Sandbox thêm ${extraDays} ngày cho dòng họ ${tenantItem.name}.`,
      });
    } catch (e) {
      setBannerState({
        type: 'error',
        mode: 'inline',
        title: 'Gia hạn Sandbox thất bại',
        message: e?.response?.data?.message || 'Gia hạn Sandbox thất bại.',
      });
    } finally {
      setActionBusyId('');
    }
  };

  const handleCloseAndCleanSandbox = async (tenantItem) => {
    setBannerState(null);
    try {
      setActionBusyId(tenantItem.id);
      await apiClient.post(`/tenants/${tenantItem.id}/sandbox/cleanup`, {
        note: 'SYSTEM_ADMIN đóng và dọn dữ liệu dòng họ dùng thử',
      });
      setConfirmCleanupId('');
      await load();
      setBannerState({
        type: 'success',
        mode: 'inline',
        title: 'Đã đóng và dọn dữ liệu dòng họ dùng thử',
        message: `Đã chuyển ${tenantItem.name} sang NGUNG_HAN và dọn sạch dữ liệu dùng thử.`,
      });
    } catch (e) {
      setBannerState({
        type: 'error',
        mode: 'inline',
        title: 'Dọn dữ liệu dòng họ thất bại',
        message: e?.response?.data?.message || 'Dọn dữ liệu dòng họ thất bại.',
      });
    } finally {
      setActionBusyId('');
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const apiStatus = status === 'SANDBOX' ? 'HOAT_DONG' : status || undefined;
      const res = await apiClient.get('/tenants', {
        params: { q: q || undefined, status: apiStatus, page, limit: 20 },
      });
      const data = res.data?.data || res.data || {};
      const rawItems = data.items || [];
      const filteredItems =
        status === 'SANDBOX'
          ? rawItems.filter(
              (item) => Boolean(item?.isSandbox || item?.social_configs?.isSandbox)
            )
          : rawItems;
      setResult({
        items: filteredItems,
        total: status === 'SANDBOX' ? filteredItems.length : data.total || 0,
        pages: data.pages || 1,
        page: data.page || page,
        limit: data.limit || 20,
      });
    } catch {
      setBannerState({
        type: 'error',
        mode: 'inline',
        title: 'Không tải được danh sách dòng họ',
        message: 'Không tải được danh sách dòng họ từ máy chủ.',
      });
      setResult({ items: [], total: 0, pages: 1, page: 1 });
    } finally {
      setLoading(false);
    }
  }, [q, status, page]);

  useEffect(() => {
    load();
  }, [load]);

  if (user?.role !== 'SYSTEM_ADMIN') {
    return <Navigate to="/admin" replace />;
  }

  const handleLogout = () => {
    logout();
    navigate('/auth', { replace: true });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="mx-auto w-full max-w-[480px]">
        <TenantHeader tenant={sessionTenant} subtitle="Quản trị dòng họ" />

        <div className="px-4 pt-5 sm:px-6">
          {bannerState && (
            <div className="mb-4">
              <PersistentMessageBanner
                type={bannerState.type}
                mode={bannerState.mode}
                title={bannerState.title}
                message={bannerState.message}
                onClose={() => setBannerState(null)}
              />
            </div>
          )}

          <h1 className="text-2xl font-black tracking-tight text-slate-800">
            Danh sách dòng họ
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            SYSTEM_ADMIN · lọc và kích hoạt hẹp TAM_NGUNG → HOAT_DONG
          </p>
        </div>

        <div className="mt-4 space-y-2 px-4 sm:px-6">
          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={q}
              onChange={(e) => {
                setPage(1);
                setQ(e.target.value);
              }}
              placeholder="Tên hoặc slug"
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
          <select
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value);
            }}
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value || 'all'} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 flex items-center justify-between px-4 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            {result.total} dòng họ
          </p>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
        </div>

        <div className="mt-3 px-4 pb-2 sm:px-6">
          {loading ? (
            <div className="flex items-center justify-center gap-2 rounded-3xl border border-slate-200 bg-white py-16 text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Đang tải...</span>
            </div>
          ) : result.items.length === 0 ? (
            <div className="rounded-3xl border border-slate-200 bg-white py-16 text-center">
              <Building2 className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm text-slate-400">Không có dòng họ khớp bộ lọc</p>
            </div>
          ) : (
            <div className="space-y-3">
              {result.items.map((t) => {
                const isSandbox = Boolean(
                  t.isSandbox || t.social_configs?.isSandbox
                );
                const sbInfo = t.sandboxInfo || {};
                const canActivate =
                  t.status === 'TAM_NGUNG' ||
                  (t.status === 'HOAT_DONG' && isSandbox);
                const isBusy = actionBusyId === t.id;
                const isConfirmingClean = confirmCleanupId === t.id;

                let sandboxSubLabel = '';
                if (t.status === 'HOAT_DONG' && isSandbox) {
                  sandboxSubLabel =
                    sbInfo.daysRemaining != null
                      ? sbInfo.daysRemaining > 0
                        ? `Sandbox — Còn ${sbInfo.daysRemaining} ngày dùng thử`
                        : 'Sandbox — Đã đến hạn chuyển Tạm ngưng'
                      : 'Đang dựng cây (Sandbox 30 ngày)';
                } else if (t.status === 'TAM_NGUNG' && isSandbox) {
                  sandboxSubLabel =
                    sbInfo.bufferDaysRemaining != null
                      ? sbInfo.bufferDaysRemaining > 0
                        ? `Đệm Tạm ngưng — Còn ${sbInfo.bufferDaysRemaining} ngày trước khi dọn`
                        : 'Đệm Tạm ngưng — Đã đến hạn dọn dữ liệu'
                      : 'Đang trong 30 ngày đệm Tạm ngưng';
                }

                return (
                  <div
                    key={t.id}
                    className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-base font-bold text-slate-900">
                          {t.name}
                        </p>
                        {t.slug ? (
                          <p className="mt-0.5 text-xs font-mono text-slate-500">
                            Mã họ: {t.slug}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${statusClass(
                            t.status
                          )}`}
                        >
                          {STATUS_LABEL[t.status] || t.status}
                        </span>
                        {t.status === 'HOAT_DONG' && (
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                              isSandbox
                                ? 'bg-amber-100 text-amber-900'
                                : 'bg-emerald-100 text-emerald-900'
                            }`}
                          >
                            {isSandbox
                              ? 'Đang dựng cây (Sandbox)'
                              : 'Vận hành chính thức'}
                          </span>
                        )}
                      </div>
                    </div>

                    {sandboxSubLabel ? (
                      <p className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs font-bold text-amber-950">
                        {sandboxSubLabel}
                      </p>
                    ) : null}

                    {t.description ? (
                      <p className="text-sm text-slate-600 line-clamp-2">
                        {t.description}
                      </p>
                    ) : null}

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          navigate(`/admin/tenant/settings?tenant_id=${t.id}`)
                        }
                        className="min-h-[48px] flex-1 rounded-xl border border-slate-300 bg-white px-3 text-base font-bold text-slate-700 hover:bg-slate-50"
                      >
                        Cài đặt
                      </button>

                      {t.status === 'CHO_DUYET' ? (
                        <button
                          type="button"
                          onClick={() => navigate('/admin/approval')}
                          className="min-h-[48px] flex-1 rounded-xl bg-amber-600 px-3 text-base font-bold text-white hover:bg-amber-700"
                        >
                          Duyệt lập họ
                        </button>
                      ) : null}

                      {canActivate ? (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            navigate(`/admin/tenant/activate?tenantId=${t.id}`)
                          }
                          className="min-h-[48px] flex-1 rounded-xl bg-indigo-600 px-3 text-base font-bold text-white hover:bg-indigo-700"
                        >
                          {isSandbox ? 'Kích hoạt chính thức' : 'Kích hoạt'}
                        </button>
                      ) : null}
                    </div>

                    {isSandbox && (t.status === 'HOAT_DONG' || t.status === 'TAM_NGUNG') && (
                      <div className="space-y-2 border-t border-slate-100 pt-2.5">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleExtendSandbox(t, 15)}
                            className="min-h-[48px] flex-1 rounded-xl border border-indigo-200 bg-indigo-50 px-3 text-sm font-bold text-indigo-800 hover:bg-indigo-100 disabled:opacity-50"
                          >
                            Gia hạn +15 ngày
                          </button>

                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              setConfirmCleanupId(isConfirmingClean ? '' : t.id)
                            }
                            className="min-h-[48px] flex-1 rounded-xl border border-rose-200 bg-rose-50 px-3 text-sm font-bold text-rose-800 hover:bg-rose-100 disabled:opacity-50"
                          >
                            Đóng &amp; Dọn dữ liệu
                          </button>
                        </div>

                        {isConfirmingClean && (
                          <div className="rounded-xl border-2 border-rose-300 bg-rose-50 p-3 space-y-2">
                            <p className="text-xs font-bold text-rose-900">
                              Cảnh báo: Thao tác này sẽ chuyển dòng họ sang NGUNG_HAN và xóa cứng toàn bộ dữ liệu dùng thử (không thể khôi phục).
                            </p>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => setConfirmCleanupId('')}
                                className="min-h-[44px] flex-1 rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700"
                              >
                                Hủy
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleCloseAndCleanSandbox(t)}
                                className="min-h-[44px] flex-1 rounded-xl bg-rose-600 px-3 text-xs font-bold text-white hover:bg-rose-700"
                              >
                                {isBusy ? 'Đang dọn...' : 'Xác nhận xóa vĩnh viễn'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {result.pages > 1 ? (
            <div className="mt-4 flex items-center justify-center gap-3 text-sm">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="font-semibold text-indigo-600 disabled:text-slate-300"
              >
                Trước
              </button>
              <span className="text-slate-500">
                {result.page}/{result.pages}
              </span>
              <button
                type="button"
                disabled={page >= result.pages}
                onClick={() => setPage((p) => p + 1)}
                className="font-semibold text-indigo-600 disabled:text-slate-300"
              >
                Sau
              </button>
            </div>
          ) : null}
        </div>

        <div className="mt-8 px-4 pb-6 sm:px-6">
          <AppFooterNav {...footerNav} onLogout={handleLogout} />
        </div>
      </div>
    </div>
  );
}
