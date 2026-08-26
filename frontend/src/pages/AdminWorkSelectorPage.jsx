/**
 * PATH       : src/pages/AdminWorkSelectorPage.jsx
 * DATETIME   : 2026-08-26T08:55:00+07:00
 * VERSION    : 1.5.0-ELDER-FOOTER
 * DESCRIPTION:
 * - Work Selector + elder (AudioHelp / ZoneVoice) + AppFooterNav SSOT.
 * - Titles: Phê duyệt người dùng (RP) · Phê duyệt thành viên (OP).
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ShieldCheck,
  Users,
  Building2,
  UserCheck,
  Settings,
  ChevronRight,
  AlertCircle,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import apiClient from '../lib/apiClient.js';
import {
  SYSTEM_ADMIN_WORK_ITEMS,
  CLAN_ADMIN_WORK_ITEMS,
} from '../features/admin/constants/adminWorkItems.js';
import TenantHeader from '../components/shell/TenantHeader.jsx';
import AppFooterNav from '../components/shell/AppFooterNav.jsx';
import { resolveTenant } from '../lib/resolveTenant.js';
import { resolveFooterNav } from '../lib/resolveFooterNav.js';
import AudioHelpButton from '../features/elder-doctrine/components/AudioHelpButton.jsx';
import ZoneVoiceButton from '../features/elder-doctrine/components/ZoneVoiceButton.jsx';
import {
  ADMIN_PAGE_HELP,
  ADMIN_ZONE_WORK,
  ADMIN_ZONE_TENANTS,
} from '../features/admin/constants/adminMessages.js';

const ICON_MAP = {
  Users,
  Building2,
  UserCheck,
  ShieldCheck,
  Settings,
};

function getDisplayIdentity(user) {
  return user?.phone || user?.email || user?.name || 'Quản trị viên';
}

function WorkCard({ item, onClick }) {
  const Icon = ICON_MAP[item.icon] || Building2;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        flex w-full items-center gap-4 rounded-3xl border p-5 text-left shadow-sm transition active:scale-[0.98]
        ${
          item.primary
            ? 'border-indigo-300 bg-indigo-50 shadow-indigo-100'
            : 'border-slate-200 bg-white'
        }
      `}
    >
      <div
        className={`
          flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl
          ${item.primary ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}
        `}
      >
        <Icon className="h-6 w-6" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-black text-slate-800">{item.title}</p>
        <p className="mt-0.5 text-sm text-slate-500">{item.description}</p>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" />
    </button>
  );
}

const AdminWorkSelectorPage = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const sessionTenant = resolveTenant(user);
  const displayIdentity = getDisplayIdentity(user);
  const footerNav = resolveFooterNav(user, {
    pageKey: 'admin',
    showBack: false,
  });

  const handleLogout = () => {
    logout();
    navigate('/auth', { replace: true });
  };

  const isSystemAdmin = user?.role === 'SYSTEM_ADMIN';
  const isClanAdmin = user?.role === 'CLAN_ADMIN';
  const tenantStatus = user?.tenantStatus || user?.tenant_status || null;

  const [tenants, setTenants] = useState([]);
  const [loadingList, setLoadingList] = useState(false);

  const fetchTenants = useCallback(async () => {
    if (!isSystemAdmin) return;
    setLoadingList(true);
    try {
      const res = await apiClient.get('/tenants', {
        params: { status: 'TAM_NGUNG', page_size: 50 },
      });
      const data = res.data?.data || res.data;
      const list = Array.isArray(data) ? data : data?.items || data?.rows || [];
      setTenants(list);
    } catch {
      toast.error('Không tải được danh sách dòng họ.');
      setTenants([]);
    } finally {
      setLoadingList(false);
    }
  }, [isSystemAdmin]);

  useEffect(() => {
    fetchTenants();
  }, [fetchTenants]);

  const clanItems = CLAN_ADMIN_WORK_ITEMS.filter((item) => {
    if (!item.when) return true;
    if (!tenantStatus) return true;
    return item.when.includes(tenantStatus);
  });

  if (isSystemAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
        <div className="mx-auto w-full max-w-[480px]">
          <TenantHeader tenant={sessionTenant} subtitle={displayIdentity} />

          <div className="mb-6 px-4 pt-6 text-center sm:px-6">
            <div className="mb-2 flex justify-end">
              <AudioHelpButton text={ADMIN_PAGE_HELP} />
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-800">
              Quản trị hệ thống
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Xin chào,{' '}
              <span className="font-semibold text-slate-700">
                {displayIdentity}
              </span>
            </p>
          </div>

          <div className="mb-6 space-y-3 px-4 sm:px-6">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                Công việc
              </h2>
              <ZoneVoiceButton visible text={ADMIN_ZONE_WORK} label="Nghe hướng dẫn" />
            </div>
            {SYSTEM_ADMIN_WORK_ITEMS.map((item) => (
              <WorkCard
                key={item.id}
                item={item}
                onClick={() => navigate(item.path)}
              />
            ))}
          </div>

          <div className="mb-3 flex items-center justify-between px-4 sm:px-6">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
              Dòng họ chờ kích hoạt
            </h2>
            <div className="flex items-center gap-2">
              <ZoneVoiceButton visible text={ADMIN_ZONE_TENANTS} label="Nghe" />
              <button
                type="button"
                onClick={fetchTenants}
                disabled={loadingList}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${loadingList ? 'animate-spin' : ''}`}
                />
                Làm mới
              </button>
            </div>
          </div>

          <div className="px-4 sm:px-6">
            {loadingList ? (
              <div className="flex items-center justify-center gap-2 rounded-3xl border border-slate-200 bg-white py-16 text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm font-medium">Đang tải...</span>
              </div>
            ) : tenants.length === 0 ? (
              <div className="rounded-3xl border border-slate-200 bg-white py-16 text-center">
                <Building2 className="mx-auto h-10 w-10 text-slate-300" />
                <p className="mt-3 text-sm font-medium text-slate-400">
                  Không có dòng họ nào đang tạm ngưng
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {tenants.map((t) => (
                  <div
                    key={t.id}
                    className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <div className="font-bold text-slate-800">{t.name}</div>
                    {t.description ? (
                      <p className="mt-1 line-clamp-2 text-sm text-slate-500">
                        {t.description}
                      </p>
                    ) : null}
                    {t.slug ? (
                      <p className="mt-1 text-xs text-slate-400">{t.slug}</p>
                    ) : null}
                    <button
                      type="button"
                      onClick={() =>
                        navigate(`/admin/tenant/activate?tenantId=${t.id}`)
                      }
                      className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-200 transition active:scale-[0.98]"
                    >
                      <Building2 className="h-4 w-4" />
                      Kích hoạt
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-8 px-4 pb-6 sm:px-6">
            <AppFooterNav {...footerNav} onLogout={handleLogout} />
          </div>
        </div>
      </div>
    );
  }

  // CLAN_ADMIN
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="mx-auto w-full max-w-[480px]">
        <TenantHeader tenant={sessionTenant} subtitle={displayIdentity} />

        <div className="mb-6 px-4 pt-6 text-center sm:px-6">
          <div className="mb-2 flex justify-end">
            <AudioHelpButton text={ADMIN_PAGE_HELP} />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-slate-800">
            Chọn công việc
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Xin chào,{' '}
            <span className="font-semibold text-slate-700">
              {displayIdentity}
            </span>
          </p>

          {tenantStatus === 'TAM_NGUNG' ? (
            <div className="mt-4 flex items-start gap-2 rounded-3xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm text-amber-800">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <span>
                Dòng họ đang ở trạng thái <strong>Tạm ngưng</strong>. Vui lòng
                kích hoạt trước khi dùng chức năng quản trị.
              </span>
            </div>
          ) : null}
        </div>

        <div className="space-y-3 px-4 sm:px-6">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
              Công việc
            </h2>
            <ZoneVoiceButton visible text={ADMIN_ZONE_WORK} label="Nghe hướng dẫn" />
          </div>
          {clanItems.map((item) => (
            <WorkCard
              key={item.id}
              item={item}
              onClick={() => navigate(item.path)}
            />
          ))}
        </div>

        <div className="mt-8 px-4 pb-6 sm:px-6">
          <AppFooterNav {...footerNav} onLogout={handleLogout} />
        </div>
      </div>
    </div>
  );
};

export default AdminWorkSelectorPage;
