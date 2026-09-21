/**
 * PATH       : frontend/src/pages/OpMemberSearchPage.jsx
 * DATETIME   : 2026-09-21T11:15:00+07:00
 * VERSION    : 1.1.0-MS-PARAMS
 * DESCRIPTION: Trang tìm người. Nhận preset + q + gender + is_clan + is_alive + status.
 */

import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import TenantHeader from '../components/shell/TenantHeader.jsx';
import AppFooterNav from '../components/shell/AppFooterNav.jsx';
import { resolveTenant } from '../lib/resolveTenant.js';
import { resolveFooterNav } from '../lib/resolveFooterNav.js';
import MemberSearchSheet from '../features/member/components/MemberSearchSheet.jsx';
import { MEMBER_SEARCH_PRESETS } from '../features/member/constants/memberSearchPresets.js';

const selectCls =
  'w-full rounded-2xl border border-slate-200 px-4 py-3 text-base font-semibold text-slate-800 outline-none focus:border-indigo-400';

function parseBool(v) {
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return undefined;
}

export default function OpMemberSearchPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const preset = params.get('preset') === 'assign' ? 'assign' : 'origin';
  const returnTo = params.get('returnTo') || '/op';
  const spec = MEMBER_SEARCH_PRESETS[preset];

  const gender = String(params.get('gender') || '').toUpperCase();
  const filters = {
    status: params.get('status') || 'CHINH_THUC',
    gender: gender === 'NAM' || gender === 'NU' || gender === 'KHAC' ? gender : undefined,
    is_clan: parseBool(params.get('is_clan')),
    is_alive: parseBool(params.get('is_alive')),
  };

  const tenant = resolveTenant(user);
  const footerNav = resolveFooterNav(user, {
    pageKey: 'op-member-search',
    backTo: returnTo,
    showBack: true,
  });

  function setFilter(key, value) {
    const next = new URLSearchParams(params);
    if (!value) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-slate-50">
      <TenantHeader tenant={tenant} subtitle="Tìm người trên sổ" />
      <main className="flex flex-1 flex-col gap-4 px-4 py-4 pb-28">
        <p className="text-base font-black text-slate-800">{spec.title}</p>

        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-base font-black text-slate-800">Điều kiện tìm</p>
          <label className="mt-3 block">
            <span className="mb-1 block text-sm font-normal text-slate-500">Giới tính?</span>
            <select className={selectCls} value={filters.gender || ''} onChange={(e) => setFilter('gender', e.target.value)}>
              <option value="">Bấm để chọn</option>
              <option value="NAM">Nam</option>
              <option value="NU">Nữ</option>
              <option value="KHAC">Khác</option>
            </select>
          </label>
          <label className="mt-3 block">
            <span className="mb-1 block text-sm font-normal text-slate-500">Nội tộc hay ngoại tộc?</span>
            <select
              className={selectCls}
              value={filters.is_clan === undefined ? '' : String(filters.is_clan)}
              onChange={(e) => setFilter('is_clan', e.target.value)}
            >
              <option value="">Bấm để chọn</option>
              <option value="true">Nội tộc</option>
              <option value="false">Ngoại tộc</option>
            </select>
          </label>
          <label className="mt-3 block">
            <span className="mb-1 block text-sm font-normal text-slate-500">Còn sống?</span>
            <select
              className={selectCls}
              value={filters.is_alive === undefined ? '' : String(filters.is_alive)}
              onChange={(e) => setFilter('is_alive', e.target.value)}
            >
              <option value="">Bấm để chọn</option>
              <option value="true">Còn sống?</option>
              <option value="false">Đã mất</option>
            </select>
          </label>
        </section>

        <MemberSearchSheet
          key={JSON.stringify(filters) + preset}
          preset={preset}
          filters={filters}
          initialQ={params.get('q') || ''}
          previewPath={(id) =>
            `/op/mfo/members/${id}?returnTo=${encodeURIComponent(returnTo)}`
          }
          onLeaveToPreview={() => {
            try {
              sessionStorage.setItem('mfo.searchReturnTo', returnTo);
            } catch {
              /* ignore */
            }
          }}
          onPick={(pick) => {
            let assignLine = null;
            try {
              const raw = sessionStorage.getItem('mfo.assignLine');
              if (raw != null && raw !== '') assignLine = Number(raw);
            } catch { assignLine = null; }
            try {
              sessionStorage.setItem('mfo.searchReturnTo', returnTo);
              if (Number.isInteger(assignLine)) {
                sessionStorage.setItem(
                  'mfo.linePick',
                  JSON.stringify({ line: assignLine, id: pick.id, name: pick.name })
                );
                sessionStorage.removeItem('mfo.assignLine');
              } else {
                sessionStorage.setItem(
                  'mfo.originPick',
                  JSON.stringify({ id: pick.id, name: pick.name })
                );
              }
            } catch { /* ignore */ }
            const state = Number.isInteger(assignLine)
              ? { linePick: { line: assignLine, id: pick.id, name: pick.name } }
              : { originPick: { id: pick.id, name: pick.name } };
            navigate(returnTo, { replace: true, state });
          }}
        />
        <button
          type="button"
          className="min-h-12 w-full rounded-2xl border border-slate-300 bg-white text-base font-bold"
          onClick={() => navigate(returnTo)}
        >
          Quay lại việc đang làm
        </button>
      </main>
      <AppFooterNav {...footerNav} />
    </div>
  );
}
