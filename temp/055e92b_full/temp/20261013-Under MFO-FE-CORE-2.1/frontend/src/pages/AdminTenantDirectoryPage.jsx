/**
 * PATH       : src/pages/AdminTenantDirectoryPage.jsx
 * DATETIME   : 2026-08-27T20:40:00+07:00
 * VERSION    : 1.0.0-HUB-V2-D01
 * DESCRIPTION:
 * SYS Tenant Directory. pageKey=admin, Home=/.
 * P0: list/filter + link activate TAM_NGUNG (không POST status).
 */

import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Building2, Loader2, RefreshCw, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import apiClient from '../lib/apiClient.js';
import TenantHeader from '../components/shell/TenantHeader.jsx';
import AppFooterNav from '../components/shell/AppFooterNav.jsx';
import { resolveTenant } from '../lib/resolveTenant.js';
import { resolveFooterNav } from '../lib/resolveFooterNav.js';

const STATUS_OPTIONS = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'HOAT_DONG', label: 'Hoạt động' },
  { value: 'TAM_NGUNG', label: 'Tạm ngưng' },
  { value: 'CHO_DUYET', label: 'Chờ duyệt' },
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
  const [result, setResult] = useState({ items: [], total: 0, pages: 1, page: 1 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/tenants', {
        params: { q: q || undefined, status: status || undefined, page, limit: 20 },
      });
      const data = res.data?.data || res.data || {};
      setResult({
        items: data.items || [],
        total: data.total || 0,
        pages: data.pages || 1,
        page: data.page || page,
        limit: data.limit || 20,
      });
    } catch {
      toast.error('Không tải được danh sách dòng họ.');
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
              {result.items.map((t) => (
                <div
                  key={t.id}
                  className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-800">{t.name}</p>
                      {t.slug ? (
                        <p className="mt-0.5 text-xs text-slate-400">{t.slug}</p>
                      ) : null}
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${statusClass(
                        t.status
                      )}`}
                    >
                      {STATUS_LABEL[t.status] || t.status}
                    </span>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        navigate(`/admin/tenant/settings?tenant_id=${t.id}`)
                      }
                      className="flex-1 rounded-2xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-700"
                    >
                      Cài đặt
                    </button>
                    {t.status === 'TAM_NGUNG' ? (
                      <button
                        type="button"
                        onClick={() =>
                          navigate(`/admin/tenant/activate?tenantId=${t.id}`)
                        }
                        className="flex-1 rounded-2xl bg-indigo-600 py-2.5 text-sm font-bold text-white"
                      >
                        Kích hoạt
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
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
