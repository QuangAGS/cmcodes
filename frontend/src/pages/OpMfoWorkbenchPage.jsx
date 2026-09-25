/**
 * PATH       : frontend/src/pages/OpMfoWorkbenchPage.jsx
 * DATETIME   : 2026-09-24T16:10:00+07:00
 * VERSION    : 1.0.0-W3
 * DESCRIPTION: Xưởng sau plan_ok — ghi tên CREATE rồi trình kết quả.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import TenantHeader from '../components/shell/TenantHeader.jsx';
import AppFooterNav from '../components/shell/AppFooterNav.jsx';
import AudioHelpButton from '../features/elder-doctrine/components/AudioHelpButton.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { resolveTenant } from '../lib/resolveTenant.js';
import { resolveFooterNav } from '../lib/resolveFooterNav.js';
import {
  getPlan,
  getMember,
  createMemberInPlan,
  createSpouseInPlan,
  submitResult,
} from '../features/mfo/api/mfoApi.js';
import { toMfoUserMessage } from '../features/mfo/constants/mfoUserErrors.js';
import { opMfoStatusLabel } from '../features/op/constants/opMfoWork.js';
import { useTts } from '../shared/hooks/useTts.js';

function unwrapPlan(res) {
  const d = res?.data?.data ?? res?.data ?? {};
  return { ticket: d.ticket || d, tree: d.tree || null };
}

function unwrapMember(res) {
  const d = res?.data?.data ?? res?.data ?? {};
  return d.member || d;
}

function looksLikeCode(s) {
  const t = String(s || '').trim();
  return !t || /^[0-9a-f-]{16,}$/i.test(t) || /^\d{6,}_\w/.test(t);
}

export default function OpMfoWorkbenchPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { speak } = useTts();
  const tenant = resolveTenant(user);
  const footerNav = resolveFooterNav(user, {
    pageKey: 'op-mfo-work',
    backTo: '/op',
    showBack: true,
  });

  const [ticket, setTicket] = useState(null);
  const [names, setNames] = useState({});
  const [draftName, setDraftName] = useState({});
  const [draftGender, setDraftGender] = useState({});
  const [draftYear, setDraftYear] = useState({});
  const [draftNote, setDraftNote] = useState({});
  const [genders, setGenders] = useState({});
  const [spName, setSpName] = useState({});
  const [spGender, setSpGender] = useState({});
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState('');

  async function load() {
    const pack = unwrapPlan(await getPlan(id));
    const t = pack.ticket;
    setTicket(t);
    const map = {};
    const gmap = {};
    const lines = t?.payload?.lines || [];
    const ids = [];
    for (const row of lines) {
      if (row?.member_id) ids.push(row.member_id);
      (row?.created_ids || []).forEach((x) => ids.push(x));
    }
    (t?.payload?.created_member_ids || []).forEach((x) => ids.push(x));
    (t?.payload?.created_spouse_ids || []).forEach((x) => ids.push(x));
    for (const mid of [...new Set(ids)]) {
      try {
        const m = unwrapMember(await getMember(mid));
        const nm = m?.full_name || '';
        if (nm && !looksLikeCode(nm)) map[mid] = nm;
        if (m?.gender) gmap[mid] = String(m.gender).toUpperCase();
      } catch {
        /* skip */
      }
    }
    setNames(map);
    setGenders(gmap);
    return t;
  }

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const t = await load();
        if (!live) return;
        if (!t?.payload?.plan_ok) {
          navigate(`/op/mfo/plans/${id}`, { replace: true });
        }
      } catch (e) {
        if (live) setErr(toMfoUserMessage(e));
      }
    })();
    return () => {
      live = false;
    };
  }, [id]);

  const payload = ticket?.payload || {};
  const lines = Array.isArray(payload.lines) ? payload.lines : [];
  const createRows = lines.filter((r) => String(r.op || '').toUpperCase() === 'CREATE');
  const openCreate = createRows.filter(
    (r) => !r.member_id && !(Array.isArray(r.created_ids) && r.created_ids.length)
  );
  const canSubmitResult = payload.plan_ok && !payload.result_ok && openCreate.length === 0;

  const voice = useMemo(() => {
    if (ok) return ok;
    if (!ticket) return 'Đang mở xưởng khai báo.';
    if (openCreate.length) {
      return `Tờ đã có dấu. Còn ${openCreate.length} đời xin tạo. Ghi tên thật rồi lưu từng đời.`;
    }
    return 'Đã ghi đủ người xin tạo. Có thể trình kết quả.';
  }, [ticket, openCreate.length, ok]);

  function parentsOf(lineNo) {
    const prev = lines.find((r) => Number(r.line) === Number(lineNo) - 1);
    if (!prev) return { father_id: null, mother_id: null };
    const ids = [prev.member_id, ...(prev.created_ids || [])].filter(Boolean);
    let father_id = null;
    let mother_id = null;
    ids.forEach((mid) => {
      const g = genders[mid];
      if (g === 'NAM' && !father_id) father_id = mid;
      if (g === 'NU' && !mother_id) mother_id = mid;
    });
    if (!father_id && !mother_id && ids[0]) father_id = ids[0];
    return { father_id, mother_id };
  }

  async function saveCreate(row) {
    const name = String(draftName[row.line] || '').trim();
    const gender = String(draftGender[row.line] || '').toUpperCase();
    if (!name) {
      setErr('Điền họ tên.');
      return;
    }
    if (!['NAM', 'NU', 'KHAC'].includes(gender)) {
      setErr('Chọn nam hoặc nữ.');
      return;
    }
    const parents = parentsOf(row.line);
    setBusy(`c-${row.line}`);
    setErr('');
    setOk('');
    try {
      await createMemberInPlan(id, {
        line: row.line,
        full_name: name,
        gender,
        birth_year: draftYear[row.line] ? Number(draftYear[row.line]) : null,
        note: draftNote[row.line] || null,
        father_id: parents.father_id,
        mother_id: parents.mother_id,
        child_type: 'CON_DE',
      });
      const msg = `Đã ghi đời ${row.line === 0 ? 'gốc' : row.line}.`;
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

  async function saveSpouse(memberId, key) {
    const name = String(spName[key] || '').trim();
    const gender = String(spGender[key] || '').toUpperCase();
    if (!name) {
      setErr('Điền họ tên vợ hoặc chồng.');
      return;
    }
    if (!['NAM', 'NU', 'KHAC'].includes(gender)) {
      setErr('Chọn nam hoặc nữ cho vợ hoặc chồng.');
      return;
    }
    setBusy(`sp-${key}`);
    setErr('');
    setOk('');
    try {
      await createSpouseInPlan(id, {
        member_id: memberId,
        full_name: name,
        gender,
        child_type: gender === 'NAM' ? 'CON_RE' : 'CON_DAU',
        is_clan: false,
      });
      const msg = 'Đã ghi vợ hoặc chồng.';
      setOk(msg);
      if (typeof speak === 'function') speak(msg, { rate: 0.82 });
      setSpName((p) => ({ ...p, [key]: '' }));
      await load();
    } catch (e) {
      const msg = toMfoUserMessage(e);
      setErr(msg);
      if (typeof speak === 'function') speak(msg, { rate: 0.82 });
    } finally {
      setBusy('');
    }
  }

  async function onSubmitResult() {
    setBusy('result');
    setErr('');
    setOk('');
    try {
      await submitResult(id, {});
      const msg = 'Đã trình kết quả. Chờ Ban quản trị đóng dấu lần hai.';
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

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50">
      <TenantHeader tenant={tenant} />
      <main className="mx-auto w-full max-w-[480px] flex-1 px-4 py-4">
        <div className="mb-3 flex justify-end">
          <AudioHelpButton text={voice} />
        </div>
        <h1 className="text-lg font-bold text-slate-900">Tờ khai theo khung</h1>
        <p className="mt-1 text-sm text-slate-600">
          {ticket ? opMfoStatusLabel(ticket) : 'Đang tải…'}
        </p>

        {ok ? (
          <section className="mt-4 rounded-3xl border-2 border-emerald-500 bg-emerald-50 px-4 py-5 text-center">
            <p className="text-base font-black text-emerald-900">{ok}</p>
          </section>
        ) : null}
        {err ? (
          <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-base text-rose-800">
            {err}
          </p>
        ) : null}

        <section className="mt-4 space-y-3">
          {[0, 1, 2, 3, 4].map((i) => {
            const row = lines.find((r) => Number(r.line) === i) || { line: i, op: 'EMPTY' };
            const op = String(row.op || 'EMPTY').toUpperCase();
            const title = i === 0 ? 'Đời gốc' : `Đời ${i}`;
            const you = Number(payload.k) === i;
            if (op === 'EMPTY') {
              return (
                <article key={i} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="font-bold text-slate-800">{title}</p>
                  <p className="mt-1 text-slate-600">Không khai</p>
                </article>
              );
            }
            const created = row.created_ids || [];
            if (op === 'ASSIGN' || row.member_id || created.length) {
              const mid = row.member_id || created[0];
              const nm = names[mid] || row.hint || 'Đã có trên sổ';
              const parents = parentsOf(i);
              return (
                <article key={i} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="font-bold text-slate-800">{title}</p>
                  <p className="mt-1 font-semibold text-slate-800">
                    {nm}
                    {you ? ' (Chính bạn)' : ''}
                  </p>
                  {i > 0 ? (
                    <p className="mt-1 text-sm text-slate-600">
                      Cha: {names[parents.father_id] || 'chưa rõ'} · Mẹ:{' '}
                      {names[parents.mother_id] || 'chưa rõ'}
                    </p>
                  ) : null}
                  {mid ? (
                    <div className="mt-3 rounded-2xl border border-slate-100 p-3">
                      <p className="text-sm font-bold text-slate-700">Thêm vợ hoặc chồng</p>
                      <input
                        className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-base"
                        placeholder="Họ tên"
                        value={spName[mid] || ''}
                        onChange={(e) => setSpName((p) => ({ ...p, [mid]: e.target.value }))}
                      />
                      <select
                        className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-base"
                        value={spGender[mid] || ''}
                        onChange={(e) => setSpGender((p) => ({ ...p, [mid]: e.target.value }))}
                      >
                        <option value="">Bấm để chọn giới tính</option>
                        <option value="NAM">Nam</option>
                        <option value="NU">Nữ</option>
                      </select>
                      <button
                        type="button"
                        disabled={busy === `sp-${mid}`}
                        className="mt-2 min-h-11 w-full rounded-2xl border border-indigo-200 bg-indigo-50 font-bold text-indigo-800 disabled:opacity-60"
                        onClick={() => saveSpouse(mid, mid)}
                      >
                        {busy === `sp-${mid}` ? 'Đang ghi…' : 'Lưu vợ hoặc chồng'}
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            }
            return (
              <article key={i} className="rounded-2xl border border-indigo-200 bg-white p-4">
                <p className="font-bold text-slate-800">{title} (Xin tạo)</p>
                <input
                  className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-base"
                  placeholder="Họ tên"
                  value={draftName[i] || ''}
                  onChange={(e) => setDraftName((p) => ({ ...p, [i]: e.target.value }))}
                />
                <select
                  className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-base"
                  value={draftGender[i] || ''}
                  onChange={(e) => setDraftGender((p) => ({ ...p, [i]: e.target.value }))}
                >
                  <option value="">Bấm để chọn giới tính</option>
                  <option value="NAM">Nam</option>
                  <option value="NU">Nữ</option>
                </select>
                <input
                  className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-base"
                  placeholder="Năm sinh (không bắt buộc)"
                  inputMode="numeric"
                  value={draftYear[i] || ''}
                  onChange={(e) => setDraftYear((p) => ({ ...p, [i]: e.target.value }))}
                />
                <input
                  className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-base"
                  placeholder="Ghi chú (không bắt buộc)"
                  value={draftNote[i] || ''}
                  onChange={(e) => setDraftNote((p) => ({ ...p, [i]: e.target.value }))}
                />
                <p className="mt-2 text-sm text-slate-600">
                  Cha/mẹ lấy từ đời trên trên khung.
                </p>
                <button
                  type="button"
                  disabled={busy === `c-${i}`}
                  className="mt-2 min-h-12 w-full rounded-2xl bg-indigo-600 font-black text-white disabled:opacity-60"
                  onClick={() => saveCreate(row)}
                >
                  {busy === `c-${i}` ? 'Đang ghi…' : 'Lưu đời này'}
                </button>
              </article>
            );
          })}
        </section>

        {canSubmitResult ? (
          <button
            type="button"
            disabled={busy === 'result'}
            className="mt-6 min-h-12 w-full rounded-2xl bg-indigo-700 font-black text-white disabled:opacity-60"
            onClick={onSubmitResult}
          >
            {busy === 'result' ? 'Đang gửi…' : 'Trình kết quả'}
          </button>
        ) : (
          <p className="mt-4 text-sm text-slate-600">
            {openCreate.length
              ? 'Ghi đủ tên các đời xin tạo rồi mới trình kết quả.'
              : payload.result_ok
                ? 'Đã trình kết quả.'
                : ''}
          </p>
        )}

        <button
          type="button"
          className="mt-3 min-h-12 w-full rounded-2xl border border-slate-300 bg-white font-bold text-slate-800"
          onClick={() => navigate('/op')}
        >
          Về trang việc
        </button>
      </main>
      <AppFooterNav {...footerNav} />
    </div>
  );
}
