/**
 * PATH       : frontend/src/pages/OpMfoPlanTicketPage.jsx
 * DATETIME   : 2026-10-16T08:30:00+07:00
 * VERSION    : 1.1.0-FRAME-TERMS
 * DESCRIPTION: Màn chờ duyệt cửa 1 dùng chữ nhánh phả hệ, không dùng khung.
 *
 * CHANGE LOG:
 * - 2026-10-16T08:30:00+07:00 | 1.1.0 | Tiêu đề và câu chờ duyệt đúng doctrine mục 9.
 */
/**
 * PATH       : frontend/src/pages/OpMfoPlanTicketPage.jsx
 * DATETIME   : 2026-10-13T11:32:00+07:00
 * VERSION    : 2.1.1-LAT3-Q1Q2
 * DESCRIPTION: Bảo tồn phần ngoài cửa 2 và chú thích; mở cửa 2 tại màn cây.
 * RULE       : Q1 bảo tồn ngoài phạm vi; Q2 metadata và chú thích theo thời gian.
 */
/**
 * PATH       : frontend/src/pages/OpMfoPlanTicketPage.jsx
 * DATETIME   : 2026-10-11T15:40:00+07:00
 * VERSION    : 2.0.0-WORKBENCH-AT-PLAN
 * DESCRIPTION: /op/mfo/plans/:id. Chờ tem hoặc xưởng tờ khai.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import TenantHeader from '../components/shell/TenantHeader.jsx';
import AppFooterNav from '../components/shell/AppFooterNav.jsx';
import AudioHelpButton from '../features/elder-doctrine/components/AudioHelpButton.jsx';
import MfoBusyClock from '../features/mfo/components/MfoBusyClock.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { resolveTenant } from '../lib/resolveTenant.js';
import { resolveFooterNav } from '../lib/resolveFooterNav.js';
import { getPlan, saveStaging, submitResult } from '../features/mfo/api/mfoApi.js';
import { toMfoUserMessage } from '../features/mfo/constants/mfoUserErrors.js';
import { opMfoStatusLabel } from '../features/op/constants/opMfoWork.js';
import { useTts } from '../shared/hooks/useTts.js';

/** <2026-10-13T11:32:00+07:00> Mục đích: Khối unwrap: bảo tồn hành vi hiện có; phần thay đổi giới hạn lát 3. */
function unwrap(res) {
  const d = res?.data?.data ?? res?.data ?? {};
  return d.ticket || d;
}

/** <2026-10-13T11:32:00+07:00> Mục đích: Khối ready: bảo tồn hành vi hiện có; phần thay đổi giới hạn lát 3. */
function ready(item, staging) {
  const smp = staging[item.key] || {};
  if (!smp.full_name || !smp.gender || smp.is_alive == null) return false;
  return item.kind !== 'child' || Boolean(smp.child_type);
}

/** <2026-10-13T11:32:00+07:00> Mục đích: Khối Card: bảo tồn hành vi hiện có; phần thay đổi giới hạn lát 3. */
function Card({ title, open, onToggle, children }) {
  return (
    <section className="mt-3 rounded-2xl border border-slate-200 bg-white">
      <button type="button" className="flex min-h-12 w-full items-center justify-between px-4 text-left" onClick={onToggle}>
        <span className="font-bold text-slate-900">{title}</span>
        <span className="text-sm text-slate-500">{open ? 'Thu lại' : 'Mở'}</span>
      </button>
      {open ? <div className="border-t border-slate-100 px-4 py-3">{children}</div> : null}
    </section>
  );
}

export default /** <2026-10-13T11:32:00+07:00> Mục đích: Khối OpMfoPlanTicketPage: bảo tồn hành vi hiện có; phần thay đổi giới hạn lát 3. */
function OpMfoPlanTicketPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { speak } = useTts();
  const tenant = resolveTenant(user);
  const footerNav = resolveFooterNav(user, { pageKey: 'op-mfo-ticket', backTo: '/op', showBack: true });
  const [ticket, setTicket] = useState(null);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState('');
  const [frameOpen, setFrameOpen] = useState(false);
  const [contentOpen, setContentOpen] = useState(false);
  const [picked, setPicked] = useState('');
  const [form, setForm] = useState({ full_name: '', gender: '', is_alive: 'true', child_type: 'CON_DE', birth_year: '', note: '', is_anonymous: false });

  /** <2026-10-13T11:32:00+07:00> Mục đích: Khối load: bảo tồn hành vi hiện có; phần thay đổi giới hạn lát 3. */
async function load() {
    const t = unwrap(await getPlan(id));
    setTicket(t);
    return t;
  }

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const t = await load();
        if (!live) return;
/** <2026-10-13T11:32:00+07:00> Mục đích: Tờ đã duyệt nhánh quay về cây; không mở form kê khai riêng. */
        if ((t?.payload?.plan_ok ?? t?.payload?.business_layer?.plan_ok) === true) {
          navigate(`/op/mfo/plans/new?draft=${encodeURIComponent(id)}`, { replace: true });
          return;
        }
        setTicket(t);
      } catch (e) {
        if (live) setErr(toMfoUserMessage(e));
      }
    })();
    return () => {
      live = false;
    };
  }, [id]);

  const payload = ticket?.payload || {};
  const delta = payload.canvas_delta || {};
  const staging = payload.smp_staging_data || {};
  const locked = Boolean(payload.result_submitted || payload.result_ok);
  const items = useMemo(() => {
    const children = (delta.draft_children || []).map((row) => ({
      key: row.id,
      kind: 'child',
      text: `Đời ${row.depth}: Thêm con ${row.label || 'xin tạo'}`,
      action: 'Ghi hồ sơ con',
    }));
    const spouses = (delta.draft_spouses || []).map((row) => ({
      key: row.union_id,
      kind: 'spouse',
      text: `Thêm hôn phối ${row.partner_name || 'xin tạo'}`,
      action: 'Ghi hồ sơ hôn phối',
    }));
    return [...children, ...spouses];
  }, [delta, staging]);
  const selected = items.find((item) => item.key === picked) || null;
  const missing = items.filter((item) => !ready(item, staging));

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

  /** <2026-10-13T11:32:00+07:00> Mục đích: Khối save: bảo tồn hành vi hiện có; phần thay đổi giới hạn lát 3. */
async function save() {
    if (!selected || locked) return;
    const smp = {
      full_name: form.full_name.trim(),
      gender: form.gender,
      is_alive: form.is_alive !== 'false',
      birth_year: form.birth_year ? Number(form.birth_year) : null,
      note: form.note || null,
    };
    if (selected.kind === 'child') {
      smp.child_type = form.child_type;
      smp.is_anonymous = form.is_anonymous;
    }
    setBusy('save');
    setErr('');
    try {
      await saveStaging(id, { [selected.key]: smp });
      setOk('Đã lưu hồ sơ.');
      if (typeof speak === 'function') speak('Đã lưu hồ sơ.', { rate: 0.82 });
      await load();
    } catch (e) {
      setErr(toMfoUserMessage(e));
    } finally {
      setBusy('');
    }
  }

  /** <2026-10-13T11:32:00+07:00> Mục đích: Khối submit: bảo tồn hành vi hiện có; phần thay đổi giới hạn lát 3. */
async function submit() {
    setBusy('submit');
    setErr('');
    try {
      await submitResult(id, {});
      setOk('Đã trình tờ khai.');
      await load();
    } catch (e) {
      setErr(toMfoUserMessage(e));
    } finally {
      setBusy('');
    }
  }

  if (!payload.plan_ok) {
    return (
      <div className="flex min-h-dvh flex-col bg-slate-50">
        <TenantHeader tenant={tenant} />
        <main className="mx-auto w-full max-w-[480px] flex-1 px-4 py-4">
          {/* <2026-10-16T08:30:00+07:00> Mục đích: Cửa 1 chờ duyệt nói nhánh phả hệ. Lý do: màn còn chữ khung và tờ khai. */}
          <h1 className="text-lg font-bold">Nhánh phả hệ</h1>
          <p className="mt-3 text-sm text-slate-700">{ticket ? opMfoStatusLabel(ticket) : 'Đang tải…'}</p>
          <p className="mt-2 text-sm text-slate-600">Đã gửi nhánh phả hệ tới ban quản trị.</p>
          {err ? <p className="mt-3 text-sm text-rose-700">{err}</p> : null}
          <button type="button" className="mt-4 min-h-12 w-full rounded-2xl bg-indigo-700 font-bold text-white" onClick={() => navigate('/op')}>Về trang việc</button>
        </main>
        <AppFooterNav {...footerNav} />
      </div>
    );
  }

  return (
    <>
    <MfoBusyClock show={Boolean(busy)} />
    <div className="flex min-h-dvh flex-col bg-slate-50">
      <TenantHeader tenant={tenant} />
      <main className="mx-auto w-full max-w-[480px] flex-1 px-4 py-4">
        <div className="mb-2 flex items-center justify-between">
          <h1 className="text-lg font-black">Khai báo tờ khai</h1>
          <AudioHelpButton text="Khung đã có tem. Ghi hồ sơ người xin tạo rồi trình." />
        </div>
        {err ? <p className="text-sm text-rose-700">{err}</p> : null}
        {ok ? <p className="text-sm text-emerald-700">{ok}</p> : null}

        <Card title="Xem lại khung 5L đã duyệt" open={frameOpen} onToggle={() => setFrameOpen((v) => !v)}>
          {(payload.lines || []).map((row) => (
            <p key={row.line} className="text-sm text-slate-700">Đời {row.line}: {row.op || 'EMPTY'}</p>
          ))}
        </Card>

        <Card title="Nội dung đã duyệt" open={contentOpen} onToggle={() => setContentOpen((v) => !v)}>
          {items.map((item) => (
            <div key={item.key} className="grid grid-cols-2 gap-2 border-b border-slate-100 py-2">
              <p className="text-sm font-semibold text-slate-800">{item.text}</p>
              <button type="button" className="min-h-11 rounded-2xl bg-indigo-50 text-sm font-bold text-indigo-800" onClick={() => setPicked(item.key)}>
                {ready(item, staging) ? 'Đã ghi' : item.action}
              </button>
            </div>
          ))}
        </Card>

        {selected && !locked ? (
          <section className="mt-4 rounded-2xl border border-indigo-200 bg-white p-4">
            <p className="font-bold">{selected.action}</p>
            <input className="mt-2 w-full rounded-2xl border px-4 py-3" placeholder="Họ tên" value={form.full_name} onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))} />
            <select className="mt-2 w-full rounded-2xl border px-4 py-3" value={form.gender} onChange={(e) => setForm((p) => ({ ...p, gender: e.target.value }))}>
              <option value="">Bấm để chọn giới tính</option>
              <option value="NAM">Nam</option>
              <option value="NU">Nữ</option>
            </select>
            <select className="mt-2 w-full rounded-2xl border px-4 py-3" value={form.is_alive} onChange={(e) => setForm((p) => ({ ...p, is_alive: e.target.value }))}>
              <option value="true">Còn sống</option>
              <option value="false">Đã mất</option>
            </select>
            {selected.kind === 'child' ? (
              <select className="mt-2 w-full rounded-2xl border px-4 py-3" value={form.child_type} onChange={(e) => setForm((p) => ({ ...p, child_type: e.target.value }))}>
                <option value="CON_DE">Con đẻ</option>
                <option value="CON_NUOI">Con nuôi</option>
                <option value="CON_RIENG">Con riêng</option>
              </select>
            ) : null}
            <input className="mt-2 w-full rounded-2xl border px-4 py-3" placeholder="Năm sinh, không bắt buộc" value={form.birth_year} onChange={(e) => setForm((p) => ({ ...p, birth_year: e.target.value }))} />
            <input className="mt-2 w-full rounded-2xl border px-4 py-3" placeholder="Ghi chú, không bắt buộc" value={form.note} onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))} />
            {selected.kind === 'child' ? (
              <label className="mt-3 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.is_anonymous} onChange={(e) => setForm((p) => ({ ...p, is_anonymous: e.target.checked }))} />
                Đề xuất khuyết danh
              </label>
            ) : null}
            <p className="mt-2 text-sm text-slate-500">Đời và cha mẹ do hệ thống gắn lúc duyệt.</p>
            <button type="button" disabled={busy === 'save'} className="mt-3 min-h-12 w-full rounded-2xl bg-indigo-600 font-black text-white" onClick={save}>Lưu hồ sơ</button>
          </section>
        ) : null}

        {!locked && missing.length === 0 && items.length > 0 ? (
          <button type="button" disabled={busy === 'submit'} className="mt-4 min-h-12 w-full rounded-2xl bg-indigo-700 font-black text-white" onClick={submit}>Trình tờ khai</button>
        ) : null}
        <button type="button" className="mt-3 min-h-12 w-full rounded-2xl border bg-white font-bold" onClick={() => navigate('/op')}>Về trang việc</button>
      </main>
      <AppFooterNav {...footerNav} />
    </div>
    </>
  );
}
