/**
 * PATH       : src/pages/AddressFormPage.jsx
 * DATETIME   : 2026-08-29T16:40:00+07:00
 * VERSION    : 1.1.0-A01-ADDR2
 * DESCRIPTION: Trang con tạo/sửa chỗ. usage=origin|current.
 */

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toastSpeak } from '../lib/toastSpeak.js';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import apiClient from '../lib/apiClient.js';
import TenantHeader from '../components/shell/TenantHeader.jsx';
import AppFooterNav from '../components/shell/AppFooterNav.jsx';
import { resolveTenant } from '../lib/resolveTenant.js';
import { resolveFooterNav } from '../lib/resolveFooterNav.js';
import { writeProfileSection } from '../lib/profileSection.js';
import { memberIdFromSearch, profileHome, profileApi } from '../lib/profileTarget.js';
import AddressForm from '../features/member/components/AddressForm.jsx';
import { EMPTY_ADDRESS, addressFromApi, addressToPatch, addressToUpdate } from '../features/member/constants/addressCatalog.js';

const TITLES = {
  origin: 'Quê quán',
  current: 'Nơi ở hiện tại',
  resting: 'Nơi an nghỉ',
};

export default function AddressFormPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const rawUsage = params.get('usage');
  const usage = rawUsage === 'current' || rawUsage === 'resting' ? rawUsage : 'origin';
  const targetId = memberIdFromSearch(params);
  const home = profileHome(targetId);
  const apiPath = profileApi(targetId);

  const mode = params.get('mode') === 'edit' ? 'edit' : 'create';
  const sessionTenant = resolveTenant(user);
  const footerNav = resolveFooterNav(user, {
    pageKey: 'public',
    backTo: home,
    showBack: true,
  });

  const [addr, setAddr] = useState({ ...EMPTY_ADDRESS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.get(apiPath);
        const d = res.data?.data || {};
        const row = usage === 'current' ? d.current_address : usage === 'resting' ? d.resting_address : d.origin_address;
        const alive = d.member?.is_alive !== false;
        if (usage === 'current' && !alive) TITLES.current = 'Nơi ở cuối';
        if (!cancelled) {
          if (mode === 'create') setAddr({ ...EMPTY_ADDRESS });
          else setAddr(addressFromApi(row));
        }
      } catch (e) {
        toastSpeak('error', e.response?.data?.message || 'Không tải được địa chỉ.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [usage, mode, apiPath]);

  async function onSubmit(ev) {
    ev.preventDefault();
    const payload = addressToPatch(addr);
    if (!payload) {
      toastSpeak('error', 'Chọn tỉnh/xã hoặc nhập ít nhất một phần địa chỉ.');
      return;
    }
    setSaving(true);
    try {
      const body = usage === 'current'
        ? { current_address: payload }
        : usage === 'resting'
          ? { resting_address: payload }
          : { origin_address: payload };

      await apiClient.patch(apiPath, body);
      toastSpeak('ok', 'Đã lưu địa chỉ.');
      writeProfileSection('address');
      navigate(home, { replace: true });
    } catch (e) {
      toastSpeak('error', e.response?.data?.message || 'Không lưu được địa chỉ.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-slate-50">
      <TenantHeader tenant={sessionTenant} subtitle={(mode === 'edit' ? 'Sửa: ' : 'Thêm: ') + TITLES[usage]} />
      <div className="px-4 pt-3">
        <h1 className="text-2xl font-black text-slate-800">{(mode === 'edit' ? 'Sửa: ' : 'Thêm: ') + TITLES[usage]}</h1>
        <p className="mt-1 text-sm text-slate-500">Chuẩn 34 tỉnh / xã-phường. Tên cũ ghi ở Note.</p>
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
          <button
            type="submit"
            disabled={saving}
            className="rounded-2xl bg-indigo-600 py-4 text-base font-black text-white shadow-lg shadow-indigo-200 disabled:opacity-60"
          >
            {saving ? 'Đang lưu...' : 'Lưu địa chỉ'}
          </button>
        </form>
      )}
      <div className="px-4 pb-6">
        <AppFooterNav
          {...footerNav}
          onLogout={() => {
            logout();
            navigate('/auth', { replace: true });
          }}
        />
      </div>
    </div>
  );
}
