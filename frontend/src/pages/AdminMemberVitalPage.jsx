/**
 * PATH       : src/pages/AdminMemberVitalPage.jsx
 * DATETIME   : 2026-09-04T12:40:00+07:00
 * VERSION    : 1.0.0-M11
 * DESCRIPTION: Steward sống/mất. CLAN_ADMIN / SYSTEM_ADMIN. Không mở OP.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext.jsx';
import apiClient from '../lib/apiClient.js';
import TenantHeader from '../components/shell/TenantHeader.jsx';
import AppFooterNav from '../components/shell/AppFooterNav.jsx';
import { resolveTenant } from '../lib/resolveTenant.js';
import { resolveFooterNav } from '../lib/resolveFooterNav.js';

const inputCls =
  'w-full rounded-2xl border border-slate-200 px-4 py-3 text-base font-medium outline-none focus:border-indigo-400';

function vitalSnapshot(row) {
  return {
    is_alive: row.is_alive !== false,
    death_year: row.death_year === null || row.death_year === undefined ? '' : String(row.death_year),
    death_month: row.death_month === null || row.death_month === undefined ? '' : String(row.death_month),
    death_day: row.death_day === null || row.death_day === undefined ? '' : String(row.death_day),
    is_death_lunar: row.is_death_lunar !== false,
    death_note: String(row.death_note || ''),
  };
}

export default function AdminMemberVitalPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const sessionTenant = resolveTenant(user);
  const footerNav = resolveFooterNav(user, {
    pageKey: 'admin',
    backTo: '/admin',
    showBack: true,
  });

  const [q, setQ] = useState('');
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    full_name: '',
    is_alive: true,
    death_year: '',
    death_month: '',
    death_day: '',
    is_death_lunar: true,
    death_note: '',
  });
  const [saved, setSaved] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        if (id) {
          const res = await apiClient.get(`/members/${id}`);
          const m = res.data?.data || {};
          if (!cancelled) {
            const next = {
              full_name: m.full_name || '',
              ...vitalSnapshot(m),
            };
            setForm(next);
            setSaved(vitalSnapshot(next));
          }
        } else {
          const res = await apiClient.get('/members');
          const raw = res.data?.data ?? res.data ?? [];
          const items = Array.isArray(raw) ? raw : raw.items || [];
          if (!cancelled) setList(items);
        }
      } catch (e) {
        toast.error(e.response?.data?.message || 'Không tải được danh sách.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  async function onSave(ev) {
    ev.preventDefault();
    if (!id) return;
    if (!form.is_alive && !form.death_year) {
      toast.error('Người đã mất cần năm mất.');
      return;
    }
    setSaving(true);
    try {
      await apiClient.patch(`/members/${id}/vital`, {
        is_alive: !!form.is_alive,
        death_year: form.is_alive ? null : form.death_year,
        death_month: form.is_alive ? null : (form.death_month || null),
        death_day: form.is_alive ? null : (form.death_day || null),
        is_death_lunar: form.is_alive ? false : !!form.is_death_lunar,
        death_note: form.is_alive ? null : (form.death_note || null),
      });
      toast.success('Đã lưu tình trạng sống.');
      navigate('/admin/members/vital', { replace: true });
    } catch (e) {
      toast.error(e.response?.data?.message || 'Không lưu được.');
    } finally {
      setSaving(false);
    }
  }

  const dirty = useMemo(() => {
    if (!saved) return false;
    const now = vitalSnapshot(form);
    return JSON.stringify(now) !== JSON.stringify(saved);
  }, [form, saved]);

  const filtered = list.filter((m) => {
    const hay = `${m.full_name || ''} ${m.alias || ''}`.toLowerCase();
    return !q.trim() || hay.includes(q.trim().toLowerCase());
  });

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-slate-50">
      <TenantHeader tenant={sessionTenant} subtitle="Tình trạng sống" />
      <div className="px-4 pt-3">
        <h1 className="text-2xl font-black text-slate-800">
          {id ? form.full_name || 'Thành viên' : 'Chọn thành viên'}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Chỉ quản trị ghi nhận đã mất. Không mở lại hồ sơ nhập tộc.
        </p>
      </div>

      {loading ? (
        <p className="px-4 py-6 text-sm text-slate-500">Đang tải...</p>
      ) : id ? (
        <form onSubmit={onSave} className="flex flex-1 flex-col gap-4 px-4 py-4">
          <div className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4">
            <label className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <input
                type="radio"
                name="alive"
                checked={form.is_alive}
                onChange={() => setForm((p) => ({ ...p, is_alive: true }))}
              />
              Còn sống
            </label>
            <label className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <input
                type="radio"
                name="alive"
                checked={!form.is_alive}
                onChange={() => setForm((p) => ({ ...p, is_alive: false }))}
              />
              Đã mất
            </label>
            {!form.is_alive ? (
              <div className="grid grid-cols-3 gap-2">
                <input className={inputCls} inputMode="numeric" placeholder="Năm" value={form.death_year} onChange={(e) => setForm((p) => ({ ...p, death_year: e.target.value }))} />
                <input className={inputCls} inputMode="numeric" placeholder="Tháng" value={form.death_month} onChange={(e) => setForm((p) => ({ ...p, death_month: e.target.value }))} />
                <input className={inputCls} inputMode="numeric" placeholder="Ngày" value={form.death_day} onChange={(e) => setForm((p) => ({ ...p, death_day: e.target.value }))} />
                <label className="col-span-3 flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input type="checkbox" checked={!!form.is_death_lunar} onChange={(e) => setForm((p) => ({ ...p, is_death_lunar: e.target.checked }))} />
                  Ngày mất theo âm lịch
                </label>
                <textarea className={`${inputCls} col-span-3`} rows={3} maxLength={100} placeholder="Ghi chú (nơi an táng…)" value={form.death_note} onChange={(e) => setForm((p) => ({ ...p, death_note: e.target.value }))} />
              </div>
            ) : null}
          </div>
          <button
            type="submit"
            disabled={saving || !dirty}
            className="rounded-2xl bg-indigo-600 py-4 text-base font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? 'Đang lưu...' : 'Lưu'}
          </button>
        </form>
      ) : (
        <div className="flex flex-1 flex-col gap-3 px-4 py-4">
          <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm tên..." />
          <ul className="space-y-2">
            {filtered.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left"
                  onClick={() => navigate(`/admin/members/${m.id}/vital`)}
                >
                  <span className="text-sm font-black text-slate-800">{m.full_name || 'Không tên'}</span>
                  <span className="text-xs font-bold text-slate-500">{m.is_alive === false ? 'Đã mất' : 'Còn sống'}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
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
