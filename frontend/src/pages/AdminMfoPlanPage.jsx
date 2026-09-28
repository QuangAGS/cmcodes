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
  adminPatchMember,
  adminCreateMember,
} from '../features/mfo/api/mfoApi.js';
import { unwrapPlanList, unwrapPlanTicket, mfoQueueOf, resultLineBlocks } from '../features/mfo/lib/normalizePlanRow.js';
import { toMfoUserMessage } from '../features/mfo/constants/mfoUserErrors.js';
import { opMfoStatusLabel } from '../features/op/constants/opMfoWork.js';
import { useTts } from '../shared/hooks/useTts.js';
import MfoDeclaredTree from '../features/mfo/components/MfoDeclaredTree.jsx';

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

function extrasFromNote(note, lineNo) {
  const extra = [];
  String(note || '')
    .split('\n')
    .forEach((ln) => {
      const m = ln.match(/Anh\/em\s+đời\s+(\d+)\s*:\s*(.+)/i);
      if (m && Number(m[1]) === Number(lineNo)) extra.push(String(m[2]).trim());
    });
  return extra;
}

function extraOnLine(row, names = {}, note) {
  const extra = [];
  (row.siblings || []).forEach((s) => {
    const op = String(s.op || '').toUpperCase();
    extra.push(
      names[s.member_id] ||
        s.hint ||
        (op === 'CREATE' ? 'Xin tạo anh/chị/em' : 'Anh/chị/em trên sổ')
    );
  });
  if (row.spouse_id || row.spouse_hint) {
    extra.push(
      `Vợ/chồng: ${names[row.spouse_id] || row.spouse_hint || 'đã chọn'}`
    );
  }
  extrasFromNote(note, row.line).forEach((x) => {
    if (x && !extra.includes(x) && !extra.some((e) => String(e).includes(x))) extra.push(x);
  });
  return extra;
}

function lineBlocks(payload, names = {}) {
  const raw = packLines(payload);
  return [0, 1, 2, 3, 4].map((i) => {
    const row = raw.find((r) => Number(r.line) === i) || { op: 'EMPTY' };
    const op = String(row.op || 'EMPTY').toUpperCase();
    const extra = extraOnLine(row, names, payload.note);
    let text = 'Không khai';
    let tag = '';
    if (op === 'CREATE') {
      text = row.hint && row.hint !== 'Xin tạo' ? row.hint : 'Chưa đặt tên';
      tag = 'Xin tạo';
    } else if (op === 'ASSIGN') {
      const fid = payload.founder_member_id;
      const mainIsYou = fid && String(row.member_id || '') === String(fid);
      text = `${names[row.member_id] || row.hint || 'Đã chọn trên sổ'}${mainIsYou ? ' (Người khai)' : ''}`;
      tag = '';
    }
    if (extra.length) {
      text = text === 'Không khai' ? extra.join('\n') : [text, ...extra].join('\n');
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
  const [editMid, setEditMid] = useState('');
  const [editGen, setEditGen] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editYear, setEditYear] = useState('');

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
    rich.sort((a, b) => {
      const ta = new Date(a.updated_at || a.reviewed_at || a.created_at || 0).getTime();
      const tb = new Date(b.updated_at || b.reviewed_at || b.created_at || 0).getTime();
      return tb - ta;
    });
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
    if (!editMid) return undefined;
    const el = document.getElementById('admin-member-edit');
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    return undefined;
  }, [editMid]);

  useEffect(() => {
    setOk('');
    setErr('');
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
        const oid = t.payload?.origin_member_id;
        const osp = t.payload?.origin_spouse_id || packLines(t.payload)[0]?.spouse_id;
        if (oid && osp) {
          pmap[oid] = osp;
          pmap[osp] = oid;
        }
        const map = {};
        const snap = {};
        let og = null;
        const ids = [];
        for (const row of packLines(t.payload)) {
          if (row?.member_id) ids.push(row.member_id);
          if (row?.spouse_id) ids.push(row.spouse_id);
          (row?.created_ids || []).forEach((x) => ids.push(x));
          (row?.siblings || []).forEach((s) => {
            if (s?.member_id) ids.push(s.member_id);
          });
        }
        (t.payload?.created_member_ids || []).forEach((x) => ids.push(x));
        (t.payload?.created_spouse_ids || []).forEach((x) => ids.push(x));
        (t.payload?.reuse_member_ids || []).forEach((x) => ids.push(x));
        (t.payload?.result?.presentment || []).forEach((ln) => {
          (ln.people || []).forEach((p) => {
            if (p?.id) ids.push(p.id);
            if (p?.spouse_id) ids.push(p.spouse_id);
          });
        });
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
              const live = list.find((x) => {
                const st = String(x?._status || x?.status || x?.union_status || '').toUpperCase();
                return x && x.id && (!st || st === 'DANG_KET_HON');
              });
              const p = live || list.find((x) => x && (x.id || x.full_name));
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
          const ar = t.payload?.admin_review || t.payload?.review || {};
          const saved =
            ar.plan || ar.result
              ? queue === 'result'
                ? ar.result || {}
                : ar.plan || {}
              : queue === 'result'
                ? {}
                : ar;
          const ck = {};
          [...new Set(ids)].forEach((id) => {
            ck[id] = saved.checks?.[id] === true;
          });
          setNames(map);
          setSnaps(snap);
          setPartners(pmap);
          setChecks(ck);
          setDirNote(saved.dirNote || {});
          if (saved.extra) setNote(saved.extra);
          else if (queue === 'result') setNote('');
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
  }, [pick, queue]);

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
      const body = {
        note: packed,
        reason: packed,
        review,
        admin_review: resultStage ? { result: review } : { plan: review },
      };
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

  async function saveEditMember() {
    if (!editMid) return;
    setBusy('edit');
    setErr('');
    try {
      const body = {};
      if (String(editGen).trim() !== '') body.generation = Number(editGen);
      if (String(editYear).trim() !== '') body.birth_year = Number(editYear);
      body.note = editNote;
      await adminPatchMember(editMid, body);
      const m = (await getMember(editMid))?.data?.data?.member
        || (await getMember(editMid))?.data?.data
        || {};
      setSnaps((p) => ({
        ...p,
        [editMid]: {
          ...(p[editMid] || {}),
          generation: m.generation ?? body.generation,
          birth_year: m.birth_year ?? body.birth_year,
          note: m.note ?? body.note,
          full_name: m.full_name || p[editMid]?.full_name,
        },
      }));
      setOk('Đã ghi trên sổ.');
      setEditMid('');
      window.setTimeout(() => setOk((cur) => (cur === 'Đã ghi trên sổ.' ? '' : cur)), 4000);
    } catch (e) {
      setErr(toMfoUserMessage(e));
    } finally {
      setBusy('');
    }
  }

  async function createUnknownParent(kind) {
    if (!editMid) return;
    const child = snaps[editMid] || {};
    const name = child.full_name || names[editMid] || 'thành viên';
    const isFather = kind === 'father';
    setBusy('um');
    setErr('');
    try {
      const res = await adminCreateMember({
        full_name: isFather ? `Chưa rõ — cha của ${name}` : `Chưa rõ — mẹ của ${name}`,
        gender: isFather ? 'NAM' : 'NU',
        is_clan: true,
        note: 'Người chưa rõ do Ban quản trị tạo khi duyệt tờ khai.',
        generation:
          child.generation != null && child.generation !== ''
            ? Number(child.generation) - 1
            : undefined,
      });
      const created = res?.data?.data?.member || res?.data?.data || res?.data || {};
      const nid = created.id;
      if (nid) {
        await adminPatchMember(editMid, isFather ? { father_id: nid } : { mother_id: nid });
      }
      setOk(isFather ? 'Đã tạo cha chưa rõ trên sổ.' : 'Đã tạo mẹ chưa rõ trên sổ.');
    } catch (e) {
      setErr(toMfoUserMessage(e));
    } finally {
      setBusy('');
    }
  }

  const payload = detail?.payload || {};
  const ticketStatus = String(detail?.status || '').toUpperCase();
  const ticketClosed =
    payload.result_ok === true ||
    ticketStatus === 'APPROVED' ||
    ticketStatus === 'REJECTED' ||
    ticketStatus === 'WITHDRAWN';
  const checkIds = Object.keys(checks);
  const allChecked = checkIds.length > 0 && checkIds.every((id) => checks[id] === true);
  const stampReady =
    queue === 'result'
      ? allChecked && String(note || '').trim().length > 0
      : String(note || '').trim().length > 0;
  const blocksRaw = detail
    ? payload.result_submitted || queue === 'result'
      ? resultLineBlocks(payload, names)
      : lineBlocks(payload, names)
    : [];
  const blocks = payload.plan_ok
    ? blocksRaw.filter((b) => b.text && !/^Không khai/.test(String(b.text)))
    : blocksRaw;
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
              setOk('');
              setErr('');
              setEditMid('');
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
              setOk('');
              setErr('');
              setEditMid('');
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
            onChange={(e) => {
              setOk('');
              setErr('');
              setEditMid('');
              setPick(e.target.value);
            }}
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
                <MfoDeclaredTree
                  lines={(payload.lines || []).map((row) => ({
                    ...row,
                    people: (payload.result?.presentment || []).find((x) => Number(x.line) === Number(row.line))
                      ?.people,
                  }))}
                  names={names}
                  genders={Object.fromEntries(
                    Object.entries(snaps).map(([id, s]) => [id, s.gender])
                  )}
                  k={payload.k}
                  founderId={payload.founder_member_id}
                />

                {queue === 'result'
                  ? [0, 1, 2, 3, 4].map((i) => {
                      const row = packLines(payload).find((r) => Number(r.line) === i) || { op: 'EMPTY' };
                      const shot = (payload.result?.presentment || []).find((x) => Number(x.line) === i);
                      const op = String(row.op || shot?.op || 'EMPTY').toUpperCase();
                      const source =
                        op === 'EMPTY'
                          ? 'Không khai báo'
                          : op === 'CREATE' || (row.created_ids || []).length
                            ? 'Tạo mới'
                            : 'Đã chọn từ sổ họ';
                      const ids = [];
                      (shot?.people || []).forEach((p) => {
                        if (p?.id && !ids.includes(p.id)) ids.push(p.id);
                        if (p?.spouse_id && !ids.includes(p.spouse_id)) ids.push(p.spouse_id);
                      });
                      if (row.member_id) ids.push(row.member_id);
                      if (row.spouse_id && !ids.includes(row.spouse_id)) ids.push(row.spouse_id);
                      (row.created_ids || []).forEach((id) => {
                        if (!ids.includes(id)) ids.push(id);
                      });
                      (row.siblings || []).forEach((s) => {
                        if (s?.member_id && !ids.includes(s.member_id)) ids.push(s.member_id);
                        if (s?.spouse_id && !ids.includes(s.spouse_id)) ids.push(s.spouse_id);
                      });
                      const kLine = Number(payload.k);
                      if (Number.isInteger(kLine) && kLine === i) {
                        const skip = new Set(
                          [payload.origin_member_id, payload.founder_member_id, row.member_id].filter(Boolean)
                        );
                        (payload.reuse_member_ids || []).forEach((rid) => {
                          if (rid && !skip.has(rid) && !ids.includes(rid)) ids.push(rid);
                        });
                      }
                      (payload.created_spouse_ids || []).forEach((sid) => {
                        const host = partners[sid];
                        if (sid && host && ids.includes(host) && !ids.includes(sid)) ids.push(sid);
                      });
                      const title = i === 0 ? 'Đời gốc' : `Đời ${i}`;
                      if (op === 'EMPTY' && ids.length === 0) return null;
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
                            <button
                              type="button"
                              className="w-full text-left"
                              onClick={() => {
                                setEditMid(mid);
                                setEditGen(s.generation != null ? String(s.generation) : '');
                                setEditNote(s.note || '');
                                setEditYear(s.birth_year != null ? String(s.birth_year) : '');
                              }}
                            >
                            <p className="font-semibold text-indigo-800 underline">
                              {s.full_name || names[mid] || 'Đã ghi'}
                              <span className="ml-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 no-underline">
                                {(payload.created_member_ids || []).includes(mid) ||
                                (payload.created_spouse_ids || []).includes(mid) ||
                                (row.created_ids || []).includes(mid)
                                  ? 'Tạo'
                                  : 'Sổ'}
                              </span>
                            </p>
                            {gLabel ? <p className="text-sm text-slate-600">{gLabel}</p> : null}
                            <p className="text-sm text-slate-600">
                              Năm sinh: {s.birth_year != null && s.birth_year !== '' ? s.birth_year : 'chưa rõ'}
                            </p>
                            {alive ? <p className="text-sm text-slate-600">{alive}</p> : null}
                            <p className="text-sm text-slate-600">{gen}</p>
                            {s.note ? <p className="text-sm text-slate-600">Ghi chú: {s.note}</p> : null}
                            <p className="mt-1 text-sm font-bold text-indigo-700">Bấm tên để xem / sửa trên sổ</p>
                            </button>
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
                                    const declared = partners[id];
                                    const anchor =
                                      String(id) === String(payload.origin_member_id) ||
                                      String(id) === String(payload.founder_member_id);
                                    const pid = declared && (anchor || ids.includes(declared)) ? declared : null;
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
                  : null}
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
            {ticketClosed ? (
              <p className="text-base font-semibold text-slate-700">
                {ticketStatus === 'REJECTED'
                  ? 'Khung hoặc tờ này đã từ chối. Không đóng dấu lại.'
                  : ticketStatus === 'WITHDRAWN'
                    ? 'Tờ đã rút. Không đóng dấu.'
                    : 'Tờ khai đã đóng dấu. Không đổi quyết định.'}
              </p>
            ) : (
              <>
            <textarea
              className="mt-3 w-full rounded-2xl border border-slate-300 px-4 py-3 text-base"
              rows={2}
              placeholder="Thêm lời phê chung nếu cần. Các ý kiến từng người ở trên sẽ gộp vào đây khi đóng dấu."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={!!busy || !stampReady}
              className="min-h-12 min-w-0 flex-1 rounded-2xl bg-indigo-600 px-2 text-sm font-black text-white disabled:opacity-60"
              onClick={() => act('ok')}
            >
              {busy === 'ok' ? 'Đang đóng dấu…' : 'Đóng dấu'}
            </button>
            <button
              type="button"
              disabled={!!busy}
              className="min-h-12 min-w-0 flex-1 rounded-2xl border border-rose-200 bg-rose-50 px-2 text-sm font-bold text-rose-800 disabled:opacity-60"
              onClick={() => act('no')}
            >
              {busy === 'no' ? 'Đang xử lý…' : 'Không duyệt'}
            </button>
            </div>
              </>
            )}
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

        {editMid ? (
          <section
            id="admin-member-edit"
            className="mt-4 scroll-mt-24 rounded-3xl border border-indigo-200 bg-white p-4"
          >
            <p className="font-black text-slate-800">Sửa trên sổ</p>
            <p className="mt-1 font-semibold text-slate-800">
              {snaps[editMid]?.full_name || names[editMid] || 'Thành viên'}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Không sửa giới tính, còn sống, điện thoại, thư (A01).
            </p>
            <label className="mt-3 block text-sm font-bold text-slate-700">
              Đời trên cây họ
              <input
                className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-base"
                inputMode="numeric"
                value={editGen}
                onChange={(e) => setEditGen(e.target.value)}
                placeholder="Ví dụ 11"
              />
            </label>
            <label className="mt-3 block text-sm font-bold text-slate-700">
              Năm sinh
              <input
                className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-base"
                inputMode="numeric"
                value={editYear}
                onChange={(e) => setEditYear(e.target.value)}
              />
            </label>
            <label className="mt-3 block text-sm font-bold text-slate-700">
              Ghi chú sổ
              <textarea
                className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-base"
                rows={2}
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
              />
            </label>
            <button
              type="button"
              disabled={!!busy}
              className="mt-3 min-h-12 w-full rounded-2xl bg-indigo-600 font-black text-white disabled:opacity-60"
              onClick={saveEditMember}
            >
              {busy === 'edit' ? 'Đang ghi…' : 'Lưu đời / ghi chú'}
            </button>
            <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={!!busy}
              className="min-h-12 min-w-0 flex-1 rounded-2xl border border-slate-200 px-2 text-sm font-bold text-slate-800 disabled:opacity-60"
              onClick={() => createUnknownParent('father')}
            >
              Tạo cha chưa rõ
            </button>
            <button
              type="button"
              disabled={!!busy}
              className="min-h-12 min-w-0 flex-1 rounded-2xl border border-slate-200 px-2 text-sm font-bold text-slate-800 disabled:opacity-60"
              onClick={() => createUnknownParent('mother')}
            >
              Tạo mẹ chưa rõ
            </button>
            </div>
            <button
              type="button"
              className="mt-2 min-h-11 w-full text-sm font-bold text-slate-600"
              onClick={() => setEditMid('')}
            >
              Đóng
            </button>
          </section>
        ) : null}
      </main>
      <AppFooterNav {...footerNav} />
    </div>
  );
}
