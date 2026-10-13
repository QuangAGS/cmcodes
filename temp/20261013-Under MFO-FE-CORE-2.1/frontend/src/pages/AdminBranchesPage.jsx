/**
 * PATH       : src/pages/AdminBranchesPage.jsx
 * DATETIME   : 2026-09-10T16:15:00+07:00
 * VERSION    : 1.0.0
 * DESCRIPTION: CRUD chi họ. parent_id — BE chặn vòng / self.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import apiClient from '../lib/apiClient.js';
import { toastSpeak } from '../lib/toastSpeak.js';
import TenantHeader from '../components/shell/TenantHeader.jsx';
import AppFooterNav from '../components/shell/AppFooterNav.jsx';
import { resolveTenant } from '../lib/resolveTenant.js';
import { resolveFooterNav } from '../lib/resolveFooterNav.js';

function flatten(nodes, depth = 0, acc = []) {
  (nodes || []).forEach((n) => {
    acc.push({ id: n.id, name: n.name, depth, parent_id: n.parent_id || '' });
    flatten(n.children, depth + 1, acc);
  });
  return acc;
}

const EMPTY = { id: '', name: '', description: '', parent_id: '' };

export default function AdminBranchesPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const sessionTenant = resolveTenant(user);
  const footerNav = resolveFooterNav(user, { pageKey: 'public', backTo: '/admin', showBack: true });
  const [tree, setTree] = useState([]);
  const [form, setForm] = useState({ ...EMPTY });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const flat = useMemo(() => flatten(tree), [tree]);

  async function load() {
    const res = await apiClient.get('/branches/tree');
    setTree(res.data?.data || []);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await load();
      } catch (e) {
        toastSpeak('error', e.response?.data?.message || 'Không tải được cây chi.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const parentOptions = flat.filter((b) => b.id !== form.id);

  async function onSubmit(ev) {
    ev.preventDefault();
    const name = String(form.name || '').trim();
    if (!name) {
      toastSpeak('error', 'Tên chi bắt buộc.');
      return;
    }
    if (!window.confirm(form.id ? 'Lưu chi này?' : 'Tạo chi mới?')) return;
    setSaving(true);
    try {
      const body = {
        name,
        description: form.description || null,
        parent_id: form.parent_id || null,
      };
      if (form.id) await apiClient.put(`/branches/${form.id}`, body);
      else await apiClient.post('/branches', body);
      toastSpeak('ok', form.id ? 'Đã lưu chi.' : 'Đã tạo chi.');
      setForm({ ...EMPTY });
      await load();
    } catch (e) {
      toastSpeak('error', e.response?.data?.message || 'Không lưu được chi.');
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id, name) {
    if (!window.confirm(`Xóa mềm chi «${name}»? Con sẽ mất cha (parent null).`)) return;
    try {
      await apiClient.delete(`/branches/${id}`, { data: { change_reason: 'ADMIN xóa chi' } });
      toastSpeak('ok', 'Đã xóa chi.');
      if (form.id === id) setForm({ ...EMPTY });
      await load();
    } catch (e) {
      toastSpeak('error', e.response?.data?.message || 'Không xóa được chi.');
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-slate-50">
      <TenantHeader tenant={sessionTenant} subtitle="Chi họ" />
      <div className="px-4 pt-3">
        <h1 className="text-2xl font-black text-slate-800">Chi / ngành</h1>
        <p className="mt-1 text-sm text-slate-500">Cây chi (parent). Không sinh chi từ sơ đồ người.</p>
      </div>
      {loading ? (
        <div className="flex flex-1 items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-4 px-4 py-4 pb-10">
          <ul className="min-h-[12rem] overflow-auto rounded-3xl border border-slate-200 bg-white">
            {flat.length ? flat.map((b) => (
              <li key={b.id} className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 last:border-0">
                <button
                  type="button"
                  className="flex-1 truncate text-left text-sm font-bold text-slate-800"
                  style={{ paddingLeft: `${b.depth * 12}px` }}
                  onClick={() => setForm({ id: b.id, name: b.name, description: '', parent_id: b.parent_id || '' })}
                >
                  {b.name}
                </button>
                <button type="button" className="text-xs font-bold text-rose-600" onClick={() => onDelete(b.id, b.name)}>Xóa</button>
              </li>
            )) : (
              <li className="px-3 py-8 text-center text-sm text-slate-500">Chưa có chi.</li>
            )}
          </ul>

          <form onSubmit={onSubmit} className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-black text-slate-800">{form.id ? 'Sửa chi' : 'Thêm chi'}</p>
            <label className="block text-sm font-bold text-slate-700">
              Tên
              <input
                className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label className="block text-sm font-bold text-slate-700">
              Chi cha
              <select
                className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3"
                value={form.parent_id}
                onChange={(e) => setForm({ ...form, parent_id: e.target.value })}
              >
                <option value="">— Gốc dòng họ —</option>
                {parentOptions.map((b) => (
                  <option key={b.id} value={b.id}>
                    {'—'.repeat(b.depth)} {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-bold text-slate-700">
              Mô tả
              <textarea
                className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3"
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="rounded-2xl border border-slate-200 py-3 text-sm font-black" onClick={() => setForm({ ...EMPTY })}>
                Làm mới
              </button>
              <button type="submit" disabled={saving} className="rounded-2xl bg-indigo-600 py-3 text-sm font-black text-white disabled:opacity-60">
                {saving ? '…' : 'Lưu'}
              </button>
            </div>
          </form>
        </div>
      )}
      <AppFooterNav {...footerNav} onLogout={logout} />
    </div>
  );
}
