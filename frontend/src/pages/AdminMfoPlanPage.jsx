/**
 * PATH       : frontend/src/pages/AdminMfoPlanPage.jsx
 * DATETIME   : 2026-09-24T16:20:00+07:00
 * VERSION    : 1.0.0-ADMIN-PLAN
 * DESCRIPTION: ADMIN tem PLAN — đóng dấu / không duyệt. Không hard-delete.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp } from 'lucide-react';
import TenantHeader from '../components/shell/TenantHeader.jsx';
import AppFooterNav from '../components/shell/AppFooterNav.jsx';
import AudioHelpButton from '../features/elder-doctrine/components/AudioHelpButton.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { resolveTenant } from '../lib/resolveTenant.js';
import { resolveFooterNav } from '../lib/resolveFooterNav.js';
import {
  listAdminPlans,
  getPlan,
  getMember,
  getOriginTree,
  approvePlan,
  rejectPlan,
  approveResult,
  rejectResult,
} from '../features/mfo/api/mfoApi.js';
import { unwrapPlanList, unwrapPlanTicket, mfoQueueOf, resultLineBlocks } from '../features/mfo/lib/normalizePlanRow.js';
import { toMfoUserMessage } from '../features/mfo/constants/mfoUserErrors.js';
import { opMfoStatusLabel } from '../features/op/constants/opMfoWork.js';
import { useTts } from '../shared/hooks/useTts.js';

function unwrapList(res) {
  const d = res?.data?.data ?? res?.data ?? {};
  if (Array.isArray(d)) return d;
  if (Array.isArray(d.items)) return d.items;
  if (Array.isArray(d.tickets)) return d.tickets;
  return [];
}

function unwrapTicket(res) {
  const d = res?.data?.data ?? res?.data ?? {};
  const ticket = d.ticket || d;
  let payload = ticket.payload || d.payload || {};
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      payload = {};
    }
  }
  return { ...ticket, payload };
}

function packLines(payload) {
  if (Array.isArray(payload?.lines)) return payload.lines;
  if (Array.isArray(payload?.presentment?.lines)) return payload.presentment.lines;
  return [];
}

function lineBlocks(payload, names = {}) {
  const raw = packLines(payload);
  const snap = payload?.presentment?.lines;
  if (Array.isArray(snap) && snap.length) {
    return snap.map((r) => ({
      title: Number(r.line) === 0 ? 'Đời gốc' : `Đời ${r.line}`,
      text: r.text || '',
      tag: r.tag || '',
    }));
  }
  return [0, 1, 2, 3, 4].map((i) => {
    const row = raw.find((r) => Number(r.line) === i) || { op: 'EMPTY' };
    const op = String(row.op || 'EMPTY').toUpperCase();
    let text = 'Không khai';
    let tag = '';
    if (op === 'CREATE') {
      text = row.hint && row.hint !== 'Xin tạo' ? row.hint : 'Chưa đặt tên';
      tag = 'Xin tạo';
    } else if (op === 'ASSIGN') {
      text = names[row.member_id] || row.hint || 'Đã chọn trên sổ';
      if (Number(payload.k) === i) tag = 'Người khai';
    }
    return { title: i === 0 ? 'Đời gốc' : `Đời ${i}`, text, tag };
  });
}

export default function AdminMfoPlanPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { speak } = useTts();
  const tenant = resolveTenant(user);
  const footerNav = resolveFooterNav(user, {
    pageKey: 'admin-mfo-plan',
    backTo: '/admin',
    showBack: true,
  });

  const [rows, setRows] = useState([]);
  const [pick, setPick] = useState('');
  const [detail, setDetail] = useState(null);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState('');
  const [queue, setQueue] = useState('plan');
  const [names, setNames] = useState({});
  const [grantedGen, setGrantedGen] = useState('');
  const [originGen, setOriginGen] = useState(null);
  const [openSummary, setOpenSummary] = useState(true);
  const [openRules, setOpenRules] = useState(true);
  const [openLine, setOpenLine] = useState({ 0: true, 1: true, 2: false, 3: false, 4: false });
  const [snaps, setSnaps] = useState({});
  const [partners, setPartners] = useState({});
  const [checks, setChecks] = useState({});
  const [dirNote, setDirNote] = useState({});

  function stageOf(t) {
    let p = t?.payload;
    if (typeof p === 'string') {
      try {
        p = JSON.parse(p);
      } catch {
        p = {};
      }
    }
    p = p && typeof p === 'object' ? p : {};
    const planOk = t.plan_ok === true || p.plan_ok === true;
    const resultOk = t.result_ok === true || p.result_ok === true;
    if (resultOk) return 'done';
    if (planOk) return 'result';
    return 'plan';
  }

  async function reload() {
    const res = await listAdminPlans();
    const all = unwrapPlanList(res);
    const rich = [];
    for (const row of all) {
      try {
        rich.push(unwrapPlanTicket(await getPlan(row.id)));
      } catch {
        rich.push(row);
      }
    }
    setRows(rich);
  }

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        await reload();
      } catch (e) {
        if (live) setErr(toMfoUserMessage(e));
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!pick) {
      setDetail(null);
      return undefined;
    }
    let live = true;
    (async () => {
      try {
        const res = await getPlan(pick);
        const t = unwrapPlanTicket(res);
        if (live) setDetail(t);
        const tree = res?.data?.data?.tree || res?.data?.tree || {};
        const bags = [tree.members, tree.nodes, tree.people].filter(Array.isArray);
        const pmap = {};
        bags.forEach((bag) => {
          bag.forEach((n) => {
            const nid = n.id || n.member_id;
            (n.partners || []).forEach((p) => {
              const pid = p.id || p.member_id;
              if (nid && pid) {
                pmap[nid] = pid;
                pmap[pid] = nid;
              }
            });
          });
        });
        const map = {};
        const snap = {};
        let og = null;
        const ids = [];
        for (const row of packLines(t.payload)) {
          if (row?.member_id) ids.push(row.member_id);
          (row?.created_ids || []).forEach((x) => ids.push(x));
        }
        (t.payload?.created_member_ids || []).forEach((x) => ids.push(x));
        (t.payload?.created_spouse_ids || []).forEach((x) => ids.push(x));
        for (const mid of [...new Set(ids)]) {
          if (!mid) continue;
          try {
            const mres = await getMember(mid);
            const m = mres?.data?.data?.member || mres?.data?.data || mres?.data || {};
            const nm = m.full_name || m.name || '';
            if (nm) map[mid] = nm;
            snap[mid] = {
              full_name: nm || '',
              is_alive: m.is_alive,
              generation: m.generation,
              gender: m.gender,
              birth_year: m.birth_year,
              note: m.note,
              father_id: m.father_id,
              mother_id: m.mother_id,
            };
            try {
              const bag = (await getOriginTree(mid))?.data?.data || (await getOriginTree(mid))?.data || {};
              const tree = bag.tree || bag;
              const nodes = tree.nodes || tree.members || [];
              const self = nodes.find((n) => n && n.id === mid) || nodes.find((n) => n.is_origin);
              const list = self?.partners || self?.spouses || [];
              const p = list.find((x) => x && (x.id || x.full_name));
              if (p?.id) {
                pmap[mid] = p.id;
                pmap[p.id] = mid;
                if (!snap[p.id]) {
                  snap[p.id] = {
                    full_name: p.full_name || p.name || '',
                    is_alive: p.is_alive,
                    generation: p.generation,
                    gender: p.gender,
                    birth_year: p.birth_year,
                    note: p.note,
                  };
                }
                if (p.full_name) map[p.id] = p.full_name;
                ids.push(p.id);
                try {
                  const sm = (await getMember(p.id))?.data?.data?.member
                    || (await getMember(p.id))?.data?.data
                    || {};
                  snap[p.id] = {
                    ...snap[p.id],
                    full_name: sm.full_name || snap[p.id].full_name,
                    is_alive: sm.is_alive,
                    generation: sm.generation ?? snap[p.id].generation,
                    gender: sm.gender || snap[p.id].gender,
                    birth_year: sm.birth_year ?? snap[p.id].birth_year,
                    note: sm.note || snap[p.id].note,
                  };
                  if (sm.full_name) map[p.id] = sm.full_name;
                } catch {
                  /* keep tree snap */
                }
              }
            } catch {
              /* no tree */
            }
            const originId = packLines(t.payload).find((r) => Number(r.line) === 0)?.member_id;
            if (mid === originId && m.generation != null && m.generation !== '') {
              og = Number(m.generation);
            }
          } catch {
            /* skip */
          }
        }
        if (live) {
          const leftover = (t.payload?.created_spouse_ids || []).filter((id) => !Object.values(pmap).includes(id));
          leftover.forEach((sid) => {
            const host = ids.find((id) => id !== sid && !pmap[id]);
            if (host) {
              pmap[host] = sid;
              pmap[sid] = host;
            }
          });
          const saved = t.payload?.admin_review || t.payload?.review || {};
          const ck = {};
          [...new Set(ids)].forEach((id) => {
            ck[id] = saved.checks?.[id] === true;
          });
          setNames(map);
          setSnaps(snap);
          setPartners(pmap);
          setChecks(ck);
          if (saved.dirNote) setDirNote(saved.dirNote);
          if (saved.extra) setNote(saved.extra);
          setOriginGen(Number.isFinite(og) ? og : null);
          if (Number.isFinite(og)) setGrantedGen(String(og));
        }
      } catch (e) {
        if (live) setErr(toMfoUserMessage(e));
      }
    })();
    return () => {
      live = false;
    };
  }, [pick]);

  async function act(kind) {
    if (!pick) return;
    setBusy(kind);
    setErr('');
    setOk('');
    try {
      const resultStage = queue === 'result';
      if (kind === 'ok' && !resultStage) {
        const g = Number(grantedGen || originGen);
        if (!Number.isInteger(g) || g < 1) {
          setErr('Đời gốc cần xác định đời trên cây họ.');
          setBusy('');
          return;
        }
      }
      const review = {
        checks,
        dirNote,
        extra: note,
        at: new Date().toISOString(),
      };
      const parts = Object.entries(dirNote)
        .filter(([, v]) => String(v || '').trim())
        .map(([id, v]) => `${snaps[id]?.full_name || id}: ${String(v).trim()}`);
      if (String(note || '').trim()) parts.push(String(note).trim());
      const packed = parts.join('\n') || 'Đã kiểm tra tờ khai.';
      const body = { note: packed, reason: packed, review, admin_review: review };
      if (kind === 'ok') {
        if (resultStage) await approveResult(pick, body);
        else
          await approvePlan(pick, {
            ...body,
            decision: 'APPROVE',
            granted_generation: Number(grantedGen || originGen),
          });
      } else if (resultStage) await rejectResult(pick, body);
      else await rejectPlan(pick, { ...body, decision: 'REJECT' });
      const msg = resultStage
        ? kind === 'ok'
          ? 'Đã đóng dấu kết quả khai.'
          : 'Đã từ chối kết quả khai.'
        : kind === 'ok'
          ? 'Đã đóng dấu khung đề xuất.'
          : 'Đã từ chối khung đề xuất.';
      setPick('');
      setDetail(null);
      setNote('');
      setDirNote({});
      setChecks({});
      setSnaps({});
      setPartners({});
      setNames({});
      await reload();
      setOk(msg);
      if (typeof speak === 'function') speak(msg, { rate: 0.82 });
    } catch (e) {
      const msg = toMfoUserMessage(e);
      setErr(msg);
      if (typeof speak === 'function') speak(msg, { rate: 0.82 });
    } finally {
      setBusy('');
    }
  }

  const payload = detail?.payload || {};
  const checkIds = Object.keys(checks);
  const allChecked = checkIds.length > 0 && checkIds.every((id) => checks[id] === true);
  const stampReady =
    queue === 'result'
      ? allChecked && String(note || '').trim().length > 0
      : String(note || '').trim().length > 0;
  const blocks = detail
    ? payload.result_submitted || queue === 'result'
      ? resultLineBlocks(payload, names)
      : lineBlocks(payload, names)
    : [];
  const queued = rows.filter((t) => {
    const q = mfoQueueOf(t);
    if (queue === 'result') return q === 'result' || q === 'done' || q === 'work';
    return q === 'plan';
  });
  const voice =
    ok ||
    (queue === 'result'
      ? 'Duyệt kết quả khai người trên sổ.'
      : 'Duyệt khung đề xuất năm đời.');

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50">
      <TenantHeader tenant={tenant} />
      <main className="mx-auto w-full max-w-[480px] flex-1 px-4 py-4">
        <div className="mb-3 flex justify-end">
          <AudioHelpButton text={voice} />
        </div>
        <h1 className="text-lg font-bold text-slate-900">Duyệt khung và tờ khai</h1>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            className={`min-h-11 rounded-2xl text-sm font-bold ${
              queue === 'plan' ? 'bg-indigo-600 text-white' : 'border border-slate-200 bg-white'
            }`}
            onClick={() => {
              setQueue('plan');
              setPick('');
            }}
          >
            Khung đề xuất
          </button>
          <button
            type="button"
            className={`min-h-11 rounded-2xl text-sm font-bold ${
              queue === 'result' ? 'bg-indigo-600 text-white' : 'border border-slate-200 bg-white'
            }`}
            onClick={() => {
              setQueue('result');
              setPick('');
            }}
          >
            Kết quả khai
          </button>
        </div>

        {ok ? (
          <section className="mt-4 rounded-3xl border-2 border-emerald-500 bg-emerald-50 px-4 py-5 text-center">
            <p className="font-black text-emerald-900">{ok}</p>
          </section>
        ) : null}
        {err ? (
          <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-rose-800">{err}</p>
        ) : null}

        <label className="mt-4 block">
          <span className="mb-1 block text-sm font-bold text-slate-700">Tờ chờ duyệt</span>
          <select
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-base"
            value={pick}
            onFocus={() => {
              reload().catch(() => {});
            }}
            onChange={(e) => setPick(e.target.value)}
          >
            <option value="">Bấm để chọn</option>
            {queued.map((t) => (
              <option key={t.id} value={t.id}>
                {(t.created_at ? new Date(t.created_at).toLocaleDateString('vi-VN') : '') +
                  ' — ' +
                  opMfoStatusLabel(t)}
              </option>
            ))}
          </select>
        </label>

        {detail ? (
          <>
          <section className="mt-4 rounded-3xl border border-slate-200 bg-white p-4">
            <button
              type="button"
              className="flex w-full items-center gap-2 text-left"
              onClick={() => setOpenSummary((v) => !v)}
            >
              <p className="flex-1 text-base font-black text-slate-800">
                {queue === 'result' ? 'Tóm tắt tờ khai' : 'Tóm tắt khung dự kiến'}
              </p>
              {openSummary ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
            </button>
            {openSummary ? (
              <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                {queue === 'result'
                  ? [0, 1, 2, 3, 4].map((i) => {
                      const row = packLines(payload).find((r) => Number(r.line) === i) || { op: 'EMPTY' };
                      const op = String(row.op || 'EMPTY').toUpperCase();
                      const source =
                        op === 'EMPTY'
                          ? 'Không khai báo'
                          : op === 'CREATE' || (row.created_ids || []).length
                            ? 'Tạo mới'
                            : 'Đã chọn từ sổ họ';
                      const ids = [];
                      if (row.member_id) ids.push(row.member_id);
                      (row.created_ids || []).forEach((id) => {
                        if (!ids.includes(id)) ids.push(id);
                      });
                      const title = i === 0 ? 'Đời gốc' : `Đời ${i}`;
                      const opened = openLine[i] !== false;
                      const cell = (mid) => {
                        const s = snaps[mid] || {};
                        const alive =
                          s.is_alive === false ? 'Đã mất' : s.is_alive === true ? 'Còn sống' : '';
                        const gen =
                          s.generation != null && s.generation !== ''
                            ? `Đời: ${s.generation}`
                            : 'Đời: chưa có';
                        const g = String(s.gender || '').toUpperCase();
                        const gLabel = g === 'NAM' ? 'Nam' : g === 'NU' ? 'Nữ' : '';
                        return (
                          <div className="rounded-xl bg-slate-50 px-3 py-2">
                            <p className="font-semibold text-slate-900">{s.full_name || names[mid] || 'Đã ghi'}</p>
                            {gLabel ? <p className="text-sm text-slate-600">{gLabel}</p> : null}
                            <p className="text-sm text-slate-600">
                              Năm sinh: {s.birth_year != null && s.birth_year !== '' ? s.birth_year : 'chưa rõ'}
                            </p>
                            {alive ? <p className="text-sm text-slate-600">{alive}</p> : null}
                            <p className="text-sm text-slate-600">{gen}</p>
                            {s.note ? <p className="text-sm text-slate-600">Ghi chú: {s.note}</p> : null}
                            <label className="mt-2 flex min-h-10 items-center gap-2 text-sm font-semibold">
                              <input
                                type="checkbox"
                                checked={!!checks[mid]}
                                onChange={(e) =>
                                  setChecks((p) => ({ ...p, [mid]: e.target.checked }))
                                }
                              />
                              Đã kiểm tra
                            </label>
                            <textarea
                              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                              rows={2}
                              placeholder="Ý kiến chỉ đạo (nếu cần)"
                              value={dirNote[mid] || ''}
                              onChange={(e) =>
                                setDirNote((p) => ({ ...p, [mid]: e.target.value }))
                              }
                            />
                          </div>
                        );
                      };
                      return (
                        <div key={i} className="rounded-2xl border border-slate-100">
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 px-3 py-2 text-left"
                            onClick={() => setOpenLine((p) => ({ ...p, [i]: !opened }))}
                          >
                            <span className="flex-1 font-bold text-slate-800">
                              {title}: {source}
                            </span>
                            {opened ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                          </button>
                          {opened ? (
                            <div className="space-y-2 px-3 pb-3">
                              {ids.length === 0 ? (
                                <p className="text-sm text-slate-600">Không có người trên đời này.</p>
                              ) : (
                                (() => {
                                  const seen = new Set();
                                  return ids.map((id) => {
                                    if (seen.has(id)) return null;
                                    const pid = partners[id];
                                    seen.add(id);
                                    if (pid) seen.add(pid);
                                    return (
                                      <div key={id} className="grid grid-cols-2 gap-2">
                                        {cell(id)}
                                        {pid ? (
                                          cell(pid)
                                        ) : (
                                          <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-500">
                                            Chưa có vợ/chồng trên sổ
                                          </div>
                                        )}
                                      </div>
                                    );
                                  });
                                })()
                              )}
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  : blocks.map((b) => (
                      <div key={b.title}>
                        <p className="font-bold text-slate-800">{b.title}</p>
                        <p className="pl-3 font-semibold text-slate-800">
                          {b.text}
                          {b.tag ? ` (${b.tag})` : ''}
                        </p>
                      </div>
                    ))}
                {payload.note ? (
                  <p className="text-sm text-slate-600">Ghi chú người khai: {payload.note}</p>
                ) : null}
              </div>
            ) : null}
          </section>

          {queue === 'plan' ? (
            <section className="mt-3 rounded-3xl border border-slate-200 bg-white p-4">
              <button
                type="button"
                className="flex w-full items-center gap-2 text-left"
                onClick={() => setOpenRules((v) => !v)}
              >
                <p className="flex-1 text-base font-black text-slate-800">Máy đã kiểm</p>
                {openRules ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
              </button>
              {openRules ? (
                <ul className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-base">
                  {(() => {
                    const raw = packLines(payload);
                    const origin = raw.find((r) => Number(r.line) === 0);
                    const hasOrigin = String(origin?.op || '').toUpperCase() === 'ASSIGN' && origin?.member_id;
                    const k = Number(payload.k);
                    const founder = raw.find((r) => Number(r.line) === k);
                    const founderOk =
                      Number.isInteger(k) &&
                      k >= 0 &&
                      k <= 4 &&
                      String(founder?.op || '').toUpperCase() === 'ASSIGN' &&
                      founder?.member_id;
                    const items = [
                      {
                        ok: hasOrigin,
                        yes: 'Đời gốc đã chọn trên sổ.',
                        no: 'Chưa chọn đời gốc trên sổ.',
                      },
                      {
                        ok: originGen != null || Number(grantedGen) >= 1,
                        yes:
                          originGen != null
                            ? `Đời gốc đã có đời trên sổ: ${originGen}.`
                            : 'Đã ghi đời của đời gốc trên cây họ.',
                        no: 'Đời gốc cần xác định đời trên cây họ.',
                      },
                      {
                        ok: founderOk,
                        yes: `Người khai gắn đúng đời ${Number.isInteger(k) ? k : '?'}.`,
                        no: 'Chưa gắn người khai vào một đời trên khung.',
                      },
                    ];
                    const pass = items.every((x) => x.ok);
                    return (
                      <>
                        <li className={pass ? 'font-bold text-emerald-800' : 'font-bold text-amber-800'}>
                          {pass ? 'Khung đề xuất đạt yêu cầu.' : 'Khung đề xuất chưa đạt.'}
                        </li>
                        {items.map((x) => (
                          <li key={x.yes} className={x.ok ? 'text-emerald-800' : 'text-amber-800'}>
                            {x.ok ? x.yes : x.no}
                          </li>
                        ))}
                      </>
                    );
                  })()}
                </ul>
              ) : null}
              {originGen == null ? (
                <label className="mt-3 block">
                  <span className="mb-1 block text-sm font-bold text-slate-700">Đời của đời gốc trên cây họ</span>
                  <input
                    type="number"
                    min={1}
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-base"
                    placeholder="Số đời trên cây họ, không phải Đời 0–4 trên tờ"
                    value={grantedGen}
                    onChange={(e) => setGrantedGen(e.target.value)}
                  />
                </label>
              ) : null}
            </section>
          ) : null}

          {queue === 'result' ? (
            <section className="mt-3 rounded-3xl border border-slate-200 bg-white p-4">
              <button
                type="button"
                className="flex w-full items-center gap-2 text-left"
                onClick={() => setOpenRules((v) => !v)}
              >
                <p className="flex-1 text-base font-black text-slate-800">Đánh giá của máy</p>
                {openRules ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
              </button>
              {openRules ? (
                <ul className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-base">
                  {(() => {
                    const raw = packLines(payload);
                    const createOk = raw
                      .filter((r) => String(r.op || '').toUpperCase() === 'CREATE')
                      .every((r) => (r.created_ids || []).length || r.member_id);
                    const created = [
                      ...(payload.created_member_ids || []),
                      ...(payload.created_spouse_ids || []),
                    ];
                    const named = created.every((id) => snaps[id]?.full_name);
                    const linked = created
                      .filter((id) => !(payload.created_spouse_ids || []).includes(id))
                      .every((id) => snaps[id]?.father_id || snaps[id]?.mother_id || true);
                    const items = [
                      {
                        ok: !!payload.result_submitted,
                        yes: 'Đã trình kết quả khai báo.',
                        no: 'Chưa trình kết quả.',
                      },
                      {
                        ok: createOk,
                        yes: 'Mọi đời xin tạo đã có người trên sổ.',
                        no: 'Còn đời xin tạo chưa ghi người.',
                      },
                      {
                        ok: named,
                        yes: 'Người mới đều có họ tên.',
                        no: 'Còn người mới thiếu họ tên.',
                      },
                    ];
                    const pass = items.every((x) => x.ok);
                    return (
                      <>
                        <li className={pass ? 'font-bold text-emerald-800' : 'font-bold text-amber-800'}>
                          {pass ? 'Tờ khai đạt yêu cầu máy.' : 'Tờ khai chưa đạt yêu cầu máy.'}
                        </li>
                        {items.map((x) => (
                          <li key={x.yes} className={x.ok ? 'text-emerald-800' : 'text-amber-800'}>
                            {x.ok ? x.yes : x.no}
                          </li>
                        ))}
                        <li className="text-slate-500">
                          Đôi vợ chồng nhiều đời / nhiều con: máy chưa chấm hết — Ban quản trị xem tóm tắt.
                        </li>
                      </>
                    );
                  })()}
                </ul>
              ) : null}
            </section>
          ) : null}

          <section className="mt-3 rounded-3xl border border-slate-200 bg-white p-4">
            <textarea
              className="mt-3 w-full rounded-2xl border border-slate-300 px-4 py-3 text-base"
              rows={2}
              placeholder="Thêm lời phê chung nếu cần. Các ý kiến từng người ở trên sẽ gộp vào đây khi đóng dấu."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button
              type="button"
              disabled={!!busy || !stampReady}
              className="mt-3 min-h-12 w-full rounded-2xl bg-indigo-600 font-black text-white disabled:opacity-60"
              onClick={() => act('ok')}
            >
              {busy === 'ok' ? 'Đang đóng dấu…' : 'Đóng dấu tờ này'}
            </button>
            <button
              type="button"
              disabled={!!busy}
              className="mt-2 min-h-12 w-full rounded-2xl border border-rose-200 bg-rose-50 font-bold text-rose-800 disabled:opacity-60"
              onClick={() => act('no')}
            >
              {busy === 'no' ? 'Đang xử lý…' : 'Không duyệt'}
            </button>
          </section>
          </>
        ) : null}

        <button
          type="button"
          className="mt-6 min-h-12 w-full rounded-2xl border border-slate-300 bg-white font-bold"
          onClick={() => navigate('/admin')}
        >
          Về trang việc quản trị
        </button>
      </main>
      <AppFooterNav {...footerNav} />
    </div>
  );
}
