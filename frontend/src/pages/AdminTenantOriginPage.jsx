/**
 * PATH       : src/pages/AdminTenantOriginPage.jsx
 * DATETIME   : 2026-09-10T14:10:00+07:00
 * VERSION    : 1.0.0
 * DESCRIPTION: CLAN_ADMIN — nơi phát tích dòng họ (addresses + tenants.origin_address_id).
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import apiClient from '../lib/apiClient.js';
import { toastSpeak } from '../lib/toastSpeak.js';
import TenantHeader from '../components/shell/TenantHeader.jsx';
import AppFooterNav from '../components/shell/AppFooterNav.jsx';
import { resolveTenant } from '../lib/resolveTenant.js';
import { resolveFooterNav } from '../lib/resolveFooterNav.js';
import AddressForm from '../features/member/components/AddressForm.jsx';
import { EMPTY_ADDRESS, addressFromApi, addressToPatch } from '../features/member/constants/addressCatalog.js';

export default function AdminTenantOriginPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const home = '/admin/tenant/settings';
  const sessionTenant = resolveTenant(user);
  const footerNav = resolveFooterNav(user, { pageKey: 'public', backTo: home, showBack: true });
  const [addr, setAddr] = useState({ ...EMPTY_ADDRESS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.get('/tenants/me');
        const row = res.data?.data?.originAddress || res.data?.data?.origin_address;
        if (!cancelled) setAddr(row ? addressFromApi(row) : { ...EMPTY_ADDRESS });
      } catch (e) {
        toastSpeak('error', e.response?.data?.message || 'Không tải được nơi phát tích.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function onSubmit(ev) {
    ev.preventDefault();
    const payload = addressToPatch(addr);
    if (!payload) {
      toastSpeak('error', 'Chọn tỉnh/xã hoặc nhập địa chỉ phát tích.');
      return;
    }
    if (!window.confirm('Lưu nơi phát tích dòng họ? (hiếm khi đổi)')) return;
    setSaving(true);
    try {
      await apiClient.patch('/tenants/me', {
        origin_address: { ...payload, reuse_place: !!addr.address_id },
      });
      toastSpeak('ok', 'Đã lưu nơi phát tích.');
      navigate(home, { replace: true });
    } catch (e) {
      toastSpeak('error', e.response?.data?.message || 'Không lưu được nơi phát tích.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-slate-50">
      <TenantHeader tenant={sessionTenant} subtitle="Nơi phát tích" />
      <div className="px-4 pt-3">
        <h1 className="text-2xl font-black text-slate-800">Nơi phát tích dòng họ</h1>
        <p className="mt-1 text-sm text-slate-500">Chỉ quản trị. Không đổi quê từng thành viên.</p>
      </div>
      {loading ? (
        <div className="flex flex-1 items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-1 flex-col gap-4 px-4 py-4 pb-10">
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <AddressForm value={addr} onChange={setAddr} />
          </div>
          <button type="submit" disabled={saving} className="rounded-2xl bg-indigo-600 py-4 text-base font-black text-white disabled:opacity-60">
            {saving ? 'Đang lưu…' : 'Lưu phát tích'}
          </button>
        </form>
      )}
      <AppFooterNav {...footerNav} onLogout={logout} />
    </div>
  );
}
