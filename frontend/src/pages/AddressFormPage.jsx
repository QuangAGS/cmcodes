/**
 * PATH       : src/pages/AddressFormPage.jsx
 * DATETIME   : 2026-08-29T16:40:00+07:00
 * VERSION    : 1.3.7-HISTORY-KIND
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
  const home = profileHome(targetId, 'address');
  const apiPath = profileApi(targetId);

  const mode = params.get('mode') === 'edit' ? 'edit' : 'create';
  const residenceQueryId = params.get('residence_id') || '';
  const isHistory = params.get('history') === '1';
  const onlyResidence = !!residenceQueryId;
  const sessionTenant = resolveTenant(user);
  const footerNav = resolveFooterNav(user, {
    pageKey: 'public',
    backTo: home,
    showBack: true,
  });

  const [addr, setAddr] = useState({ ...EMPTY_ADDRESS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [alive, setAlive] = useState(true);
  const [residenceId, setResidenceId] = useState('');
  const [resMeta, setResMeta] = useState({
    kind: 'RESIDENCE',
    from_year: '',
    from_month: '',
    from_day: '',
    to_year: '',
    to_month: '',
    to_day: '',
    is_lunar: false,
    is_current: true,
    note: '',
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.get(apiPath, { params: { section: 'address' } });
        const d = res.data?.data || {};
        const row = usage === 'current' ? d.current_address : usage === 'resting' ? d.resting_address : d.origin_address;
        const isAlive = d.member?.is_alive !== false;
        if (usage === 'current' && !isAlive) TITLES.current = 'Nơi ở cuối';
        if (!cancelled) {
          setAlive(isAlive);
          if (mode === 'create') setAddr({ ...EMPTY_ADDRESS });
          else setAddr(addressFromApi(row));
          if (isHistory) {
            setResMeta((m) => ({ ...m, kind: 'RESIDENCE', is_current: false }));
          } else if (usage === 'current') {
            setResMeta((m) => ({ ...m, kind: isAlive ? 'RESIDENCE' : 'LAST', is_current: true }));
          }
          if (usage === 'resting') {
            setResMeta((m) => ({ ...m, kind: 'RESTING', is_current: false }));
          }
        }
        if (!cancelled && residenceQueryId) {
          try {
            const lr = await apiClient.get('/me/residences', { params: targetId ? { member_id: targetId } : {} });
            const items = lr.data?.data?.items || [];
            const hit = items.find((it) => it.id === residenceQueryId);
            if (hit) {
              setResidenceId(hit.id);
              setAddr(addressFromApi(hit.address || { id: hit.address_id, full_address: hit.full_address }));
              setResMeta({
                kind: (!alive && hit.is_current && hit.kind !== 'RESTING') ? 'LAST' : (hit.kind || 'RESIDENCE'),
                from_year: hit.from_year ?? '',
                from_month: hit.from_month ?? '',
                from_day: hit.from_day ?? '',
                to_year: hit.to_year ?? '',
                to_month: hit.to_month ?? '',
                to_day: hit.to_day ?? '',
                is_lunar: !!hit.is_lunar,
                is_current: !!hit.is_current,
                note: hit.note || '',
              });
            }
          } catch (_) {}
        } else if (!cancelled && mode === 'edit' && usage !== 'origin' && row?.id) {
          try {
            const lr = await apiClient.get('/me/residences', { params: targetId ? { member_id: targetId } : {} });
            const items = lr.data?.data?.items || [];
            const hit = items.find((it) => it.address_id === row.id)
              || items.find((it) => usage === 'current' && it.is_current)
              || items.find((it) => usage === 'resting' && it.kind === 'RESTING');
            if (hit) {
              setResidenceId(hit.id);
              setResMeta({
                kind: (usage === 'resting' ? 'RESTING' : ((!isAlive && hit.is_current) ? 'LAST' : (hit.kind || 'RESIDENCE'))),
                from_year: hit.from_year ?? '',
                from_month: hit.from_month ?? '',
                from_day: hit.from_day ?? '',
                to_year: hit.to_year ?? '',
                to_month: hit.to_month ?? '',
                to_day: hit.to_day ?? '',
                is_lunar: !!hit.is_lunar,
                is_current: !!hit.is_current,
                note: hit.note || '',
              });
            }
          } catch (_) { /* list rỗng */ }
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
    if (usage !== 'origin') {
      const y = Number(resMeta.from_year);
      if (!Number.isInteger(y) || y < 1000) {
        toastSpeak('error', 'Phải có năm bắt đầu (from year).');
        return;
      }
    }
    if (!window.confirm('Lưu địa chỉ này?')) return;
    setSaving(true);
    try {
      const body = usage === 'current'
        ? { current_address: payload }
        : usage === 'resting'
          ? { resting_address: payload }
          : { origin_address: payload };

      let addressId = addr.address_id;
      if (isHistory) {
        await apiClient.post('/me/residences', {
          address_id: addressId || undefined,
          place: addressId ? undefined : payload,
          kind: resMeta.kind || 'RESIDENCE',
          from_year: resMeta.from_year || null,
          from_month: resMeta.from_month || null,
          from_day: resMeta.from_day || null,
          to_year: resMeta.to_year || null,
          to_month: resMeta.to_month || null,
          to_day: resMeta.to_day || null,
          is_lunar: !!resMeta.is_lunar,
          is_current: false,
          note: resMeta.note || null,
          member_id: targetId || undefined,
        });
        toastSpeak('ok', 'Đã thêm lần ở vào lịch sử.');
        writeProfileSection('address');
        navigate(home, { replace: true });
        return;
      }
      if (!onlyResidence) {
        const saved = await apiClient.patch(apiPath, {
          ...(usage === 'current'
            ? { current_address: { ...payload, reuse_place: mode === 'create' && !!addr.address_id } }
            : usage === 'resting'
              ? { resting_address: { ...payload, reuse_place: mode === 'create' && !!addr.address_id } }
              : { origin_address: payload }),
        });
        const d = saved.data?.data || {};
        const place = usage === 'current' ? d.current_address : usage === 'resting' ? d.resting_address : d.origin_address;
        addressId = place?.id || addr.address_id;
      }
      if (addressId && usage !== 'origin') {
        const resBody = {
          address_id: addressId,
          kind: resMeta.kind || (usage === 'resting' ? 'RESTING' : (alive ? 'RESIDENCE' : 'LAST')),
          from_year: resMeta.from_year || null,
          from_month: resMeta.from_month || null,
          from_day: resMeta.from_day || null,
          to_year: resMeta.to_year || null,
          to_month: resMeta.to_month || null,
          to_day: resMeta.to_day || null,
          is_lunar: !!resMeta.is_lunar,
          is_current: usage === 'current' ? true : !!resMeta.is_current,
          note: resMeta.note || null,
          member_id: targetId || undefined,
        };
        if (mode === 'edit' && residenceId) {
          await apiClient.patch(`/me/residences/${residenceId}`, resBody);
        } else {
          await apiClient.post('/me/residences', resBody);
        }
      }
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
      <TenantHeader tenant={sessionTenant} subtitle={(isHistory ? 'Thêm lần ở (lịch sử)' : ((mode === 'edit' ? 'Sửa: ' : 'Thêm: ') + TITLES[usage]))} />
      <div className="px-4 pt-3">
        <h1 className="text-2xl font-black text-slate-800">{(isHistory ? 'Thêm lần ở (lịch sử)' : ((mode === 'edit' ? 'Sửa: ' : 'Thêm: ') + TITLES[usage]))}</h1>
        <p className="mt-1 text-sm text-slate-500">Chuẩn 34 tỉnh / xã-phường. Tên cũ ghi ở Note.</p>
      </div>
      {loading ? (
        <div className="flex flex-1 items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-1 flex-col gap-4 px-4 py-4 pb-10">
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <AddressForm value={addr} onChange={setAddr} usageKind={isHistory ? 'RESIDENCE' : (usage === 'resting' ? 'RESTING' : usage === 'current' ? (alive ? 'RESIDENCE' : 'LAST') : (resMeta.kind || ''))} />
          </div>
          {usage !== 'origin' ? (
            <div className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-black text-slate-800">Thời gian / loại lần ở</p>
              <label className="block text-sm font-bold text-slate-700">
                Loại
                <select
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3"
                  value={resMeta.kind}
                  onChange={(e) => setResMeta({ ...resMeta, kind: e.target.value })}
                >
                  {usage === 'resting' ? (
                    <option value="RESTING">Nơi an nghỉ</option>
                  ) : (
                    <>
                      <option value="RESIDENCE">Nơi ở</option>
                      <option value="TEMPORARY">Tạm trú</option>
                      <option value="LAST">Nơi ở cuối</option>
                    </>
                  )}
                </select>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {['from_day','from_month','from_year'].map((k) => (
                  <label key={k} className="block text-xs font-bold text-slate-600">
                    {k.replace('from_','Từ ')}
                    <input className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2" value={resMeta[k]} onChange={(e) => setResMeta({ ...resMeta, [k]: e.target.value })} />
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {['to_day','to_month','to_year'].map((k) => (
                  <label key={k} className="block text-xs font-bold text-slate-600">
                    {k.replace('to_','Đến ')}
                    <input className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2" value={resMeta[k]} onChange={(e) => setResMeta({ ...resMeta, [k]: e.target.value })} />
                  </label>
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                <input type="checkbox" checked={resMeta.is_lunar} onChange={(e) => setResMeta({ ...resMeta, is_lunar: e.target.checked })} />
                Âm lịch
              </label>
              {usage === 'current' ? (
                <p className="text-xs text-slate-500">Lần này sẽ là nơi ở hiện tại.</p>
              ) : null}
            </div>
          ) : null}
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
