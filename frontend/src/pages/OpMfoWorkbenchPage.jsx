/**
 * PATH       : frontend/src/pages/OpMfoWorkbenchPage.jsx
 * DATETIME   : 2026-10-11T14:40:00+07:00
 * VERSION    : 2.0.0-GATE2-WORKBENCH
 * DESCRIPTION: Xưởng Cửa 2. Khung đóng. Chỉ điền SMP vào staging.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import TenantHeader from '../components/shell/TenantHeader.jsx';
import AppFooterNav from '../components/shell/AppFooterNav.jsx';
import AudioHelpButton from '../features/elder-doctrine/components/AudioHelpButton.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { resolveTenant } from '../lib/resolveTenant.js';
import { resolveFooterNav } from '../lib/resolveFooterNav.js';
import { getPlan, saveStaging, submitResult } from '../features/mfo/api/mfoApi.js';
import { toMfoUserMessage } from '../features/mfo/constants/mfoUserErrors.js';
import { useTts } from '../shared/hooks/useTts.js';

function unwrapPlan(res) {
  const d = res?.data?.data ?? res?.data ?? {};
  return d.ticket || d;
}

function ready(item, staging, kind) {
  const smp = staging[item.key] || {};
  if (!smp.full_name || !smp.gender || smp.is_alive == null) return false;
  if (kind === 'child' && !smp.child_type) return false;
  return true;
}

export default function OpMfoWorkbenchPage() {
  const { id } = useParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { speak } = useTts();
  const tenant = resolveTenant(user);
  const footerNav = resolveFooterNav(user, { pageKey: 'op-mfo-work', backTo: '/op', showBack: true });

  const [ticket, setTicket] = useState(null);
  const [picked, setPicked] = useState('');
  const [form, setForm] = useState({ full_name: '', gender: '', is_alive: 'true', child_type: 'CON_DE', birth_year: '', note: '', is_anonymous: false });
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState('');

  async function load() {
    const t = unwrapPlan(await getPlan(id));
    setTicket(t);
    return t;
  }

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/auth?mode=login', { replace: true });
      return;
    }
    let live = true;
    (async () => {
      try {
        const t = await load();
        if (!live) return;
        if (!t?.payload?.plan_ok) navigate(`/op/mfo/plans/${id}`, { replace: true });
      } catch (e) {
        if (live) setErr(toMfoUserMessage(e));
      }
    })();
    return () => {
      live = false;
    };
  }, [id, authLoading, user]);

  const payload = ticket?.payload || {};
  const delta = payload.canvas_delta || {};
  const staging = payload.smp_staging_data || {};
  const locked = Boolean(payload.result_submitted || payload.result_ok);
  const items = useMemo(() => {
    const children = (delta.draft_children || []).map((row) => ({
      key: row.id,
      kind: 'child',
      depth: Number(row.depth || 0),
      label: staging[row.id]?.full_name || row.label || 'Con xin tạo',
    }));
    const spouses = (delta.draft_spouses || []).map((row) => ({
      key: row.union_id,
      kind: 'spouse',
      depth: null,
      label: staging[row.union_id]?.full_name || row.partner_name || 'Vợ hoặc chồng xin tạo',
    }));
    return [...children, ...spouses];
  }, [delta, staging]);
  const missing = items.filter((item) => !ready(item, staging, item.kind));
  const selected = items.find((item) => item.key === picked) || null;

  useEffect(() => {
    if (!selected) return;
    const smp = staging[selected.key] || {};
    setForm({
      full_name: smp.full_name || '',
      gender: smp.gender || '',
      is_alive: smp.is_alive === false ? 'false' : 'true',
      child_type: smp.child_type || 'CON_DE',
      birth_year: smp.birth_year || '',
      note: smp.note || '',
      is_anonymous: smp.is_anonymous === true,
    });
  }, [picked]);

  const voice = ok || (missing.length ? `Còn ${missing.length} người chưa đủ hồ sơ.` : 'Đủ hồ sơ. Có thể trình tờ khai.');

  function pick(item) {
    setPicked(item.key);
    setErr('');
    setOk('');
  }

  async function save() {
    if (!selected || locked) return;
    if (!form.full_name.trim() || !form.gender) {
      setErr('Điền họ tên và giới tính.');
      return;
    }
    const smp = {
      full_name: form.full_name.trim(),
      gender: form.gender,
      is_alive: form.is_alive !== 'false',
      birth_year: form.birth_year ? Number(form.birth_year) : null,
      note: form.note || null,
    };
    if (selected.kind === 'child') {
      smp.child_type = form.child_type || 'CON_DE';
      smp.is_anonymous = form.is_anonymous === true;
    }
    setBusy('save');
    setErr('');
    try {
      await saveStaging(id, { [selected.key]: smp });
      const msg = 'Đã lưu hồ sơ.';
      setOk(msg);
      if (typeof speak === 'function') speak(msg, { rate: 0.82 });
      await load();
    } catch (e) {
      const msg = toMfoUserMessage(e);
      setErr(msg);
      if (typeof speak === 'function') speak(msg, { rate: 0.82 });
    } finally {
      setBusy('');
    }
  }

  async function submit() {
    if (missing.length || locked) return;
    setBusy('submit');
    setErr('');
    try {
      await submitResult(id, {});
      const msg = 'Đã trình tờ khai. Chờ Ban quản trị duyệt.';
      setOk(msg);
      if (typeof speak === 'function') speak(msg, { rate: 0.82 });
      await load();
    } catch (e) {
      const msg = toMfoUserMessage(e);
      setErr(msg);
      if (typeof speak === 'function') speak(msg, { rate: 0.82 });
    } finally {
      setBusy('');
    }
  }

  if (authLoading) {
    return <div className="mx-auto flex min-h-screen max-w-[480px] items-center justify-center">Đang mở xưởng.</div>;
  }

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50">
      <TenantHeader tenant={tenant} />
      <main className="mx-auto w-full max-w-[480px] flex-1 px-4 py-4">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-lg font-black text-slate-900">Xưởng tờ khai</h1>
          <AudioHelpButton text={voice} />
        </div>
        <p className="text-sm text-slate-600">Khung đã đóng tem. Chỉ ghi hồ sơ người xin tạo.</p>
        {err ? <p className="mt-3 text-sm text-rose-700">{err}</p> : null}
        {ok ? <p className="mt-3 text-sm text-emerald-700">{ok}</p> : null}

        <section className="mt-4 space-y-2">
          {items.length === 0 ? <p className="text-sm text-slate-600">Khung không có người xin tạo.</p> : null}
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`min-h-12 w-full rounded-2xl border px-4 text-left ${picked === item.key ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 bg-white'}`}
              onClick={() => pick(item)}
            >
              <span className="font-bold text-slate-900">{item.label}</span>
              <span className="ml-2 text-xs font-bold text-indigo-700">{item.kind === 'child' ? 'XT' : 'Hôn phối'}</span>
              <span className="ml-2 text-xs text-slate-500">{ready(item, staging, item.kind) ? 'Đủ' : 'Chưa đủ'}</span>
            </button>
          ))}
        </section>

        {selected && !locked ? (
          <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
            <p className="font-bold text-slate-900">Hồ sơ người này</p>
            <input className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" placeholder="Họ tên" value={form.full_name} onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))} />
            <select className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" value={form.gender} onChange={(e) => setForm((p) => ({ ...p, gender: e.target.value }))}>
              <option value="">Bấm để chọn giới tính</option>
              <option value="NAM">Nam</option>
              <option value="NU">Nữ</option>
            </select>
            <select className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" value={form.is_alive} onChange={(e) => setForm((p) => ({ ...p, is_alive: e.target.value }))}>
              <option value="true">Còn sống</option>
              <option value="false">Đã mất</option>
            </select>
            {selected.kind === 'child' ? (
              <select className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" value={form.child_type} onChange={(e) => setForm((p) => ({ ...p, child_type: e.target.value }))}>
                <option value="CON_DE">Con đẻ</option>
                <option value="CON_NUOI">Con nuôi</option>
                <option value="CON_RIENG">Con riêng</option>
              </select>
            ) : null}
            <input className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" placeholder="Năm sinh, không bắt buộc" inputMode="numeric" value={form.birth_year} onChange={(e) => setForm((p) => ({ ...p, birth_year: e.target.value }))} />
            <input className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" placeholder="Ghi chú, không bắt buộc" value={form.note} onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))} />
            {selected.kind === 'child' ? (
              <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={form.is_anonymous} onChange={(e) => setForm((p) => ({ ...p, is_anonymous: e.target.checked }))} />
                Đề xuất khuyết danh
              </label>
            ) : null}
            <p className="mt-2 text-sm text-slate-500">Đời và cha mẹ do hệ thống gắn lúc duyệt.</p>
            <button type="button" disabled={busy === 'save'} className="mt-3 min-h-12 w-full rounded-2xl bg-indigo-600 font-black text-white disabled:opacity-60" onClick={save}>
              {busy === 'save' ? 'Đang lưu…' : 'Lưu hồ sơ'}
            </button>
          </section>
        ) : null}

        {locked ? <p className="mt-4 text-sm text-slate-600">Tờ khai đã trình. Chỉ xem.</p> : null}
        {!locked && missing.length === 0 && items.length > 0 ? (
          <button type="button" disabled={busy === 'submit'} className="mt-4 min-h-12 w-full rounded-2xl bg-indigo-700 font-black text-white disabled:opacity-60" onClick={submit}>
            {busy === 'submit' ? 'Đang trình…' : 'Trình tờ khai'}
          </button>
        ) : null}
        <button type="button" className="mt-3 min-h-12 w-full rounded-2xl border border-slate-300 bg-white font-bold text-slate-800" onClick={() => navigate('/op')}>
          Về trang việc
        </button>
      </main>
      <AppFooterNav {...footerNav} />
    </div>
  );
}
