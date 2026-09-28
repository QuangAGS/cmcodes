/**
 * PATH       : frontend/src/pages/OpMfoWorkbenchPage.jsx
 * DATETIME   : 2026-09-24T16:10:00+07:00
 * VERSION    : 1.0.0-W3
 * DESCRIPTION: Xưởng sau plan_ok — ghi tên CREATE rồi trình kết quả.
 */

import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import TenantHeader from '../components/shell/TenantHeader.jsx';
import AppFooterNav from '../components/shell/AppFooterNav.jsx';
import AudioHelpButton from '../features/elder-doctrine/components/AudioHelpButton.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { resolveTenant } from '../lib/resolveTenant.js';
import { resolveFooterNav } from '../lib/resolveFooterNav.js';
import {
  getPlan,
  getMember,
  getOriginTree,
  createMemberInPlan,
  createSpouseInPlan,
  submitResult,
} from '../features/mfo/api/mfoApi.js';
import { toMfoUserMessage } from '../features/mfo/constants/mfoUserErrors.js';
import { opMfoStatusLabel } from '../features/op/constants/opMfoWork.js';
import { useTts } from '../shared/hooks/useTts.js';
import MfoDeclaredTree from '../features/mfo/components/MfoDeclaredTree.jsx';

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
  const location = useLocation();
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
  const [spCreate, setSpCreate] = useState({});
  const [extraSibs, setExtraSibs] = useState({});
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState('');
  const [bookLanes, setBookLanes] = useState([]);
  const [pickedNode, setPickedNode] = useState('');

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
      if (row?.spouse_id) ids.push(row.spouse_id);
      (row?.created_ids || []).forEach((x) => ids.push(x));
      (row?.siblings || []).forEach((s) => {
        if (s?.member_id) ids.push(s.member_id);
        if (s?.spouse_id) ids.push(s.spouse_id);
      });
    }
    (t?.payload?.created_member_ids || []).forEach((x) => ids.push(x));
    (t?.payload?.created_spouse_ids || []).forEach((x) => ids.push(x));
    (t?.payload?.reuse_member_ids || []).forEach((x) => ids.push(x));
    (t?.payload?.result?.presentment || []).forEach((ln) => {
      (ln.people || []).forEach((p) => {
        if (p?.id) ids.push(p.id);
        if (p?.spouse_id) ids.push(p.spouse_id);
      });
    });
    if (t?.payload?.founder_member_id) ids.push(t.payload.founder_member_id);
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
    const seeded = {};
    const seedOrigin = t?.payload?.origin_member_id;
    const founderId0 = t?.payload?.founder_member_id;
    const kLine = Number(t?.payload?.k);
    (t?.payload?.lines || []).forEach((row) => {
      const i = Number(row.line);
      const bag = [];
      (row.siblings || []).forEach((s) => {
        if (s?.member_id && s.member_id !== row.member_id) {
          bag.push({ id: s.member_id, name: map[s.member_id] || s.hint || '' });
        }
      });
      seeded[i] = bag;
    });
    if (Number.isInteger(kLine)) {
      const skip = new Set([seedOrigin, founderId0, (t?.payload?.lines || []).find((r) => Number(r.line) === kLine)?.member_id]);
      (t?.payload?.reuse_member_ids || []).forEach((rid) => {
        if (!rid || skip.has(rid)) return;
        seeded[kLine] = [...(seeded[kLine] || []).filter((x) => x.id !== rid), { id: rid, name: map[rid] || '' }];
      });
    }
    (t?.payload?.result?.presentment || []).forEach((ln) => {
      const i = Number(ln.line);
      (ln.people || []).forEach((p) => {
        if (!p?.id || p.id === seedOrigin) return;
        const main = (t?.payload?.lines || []).find((r) => Number(r.line) === i)?.member_id;
        if (p.id === main) return;
        seeded[i] = [...(seeded[i] || []).filter((x) => x.id !== p.id), { id: p.id, name: p.name || map[p.id] || '' }];
      });
    });
    setExtraSibs((prev) => {
      const next = { ...prev };
      Object.keys(seeded).forEach((k) => {
        next[k] = [...(next[k] || [])];
        seeded[k].forEach((p) => {
          if (!next[k].some((x) => x.id === p.id)) next[k].push(p);
        });
      });
      return next;
    });
    const originId = t?.payload?.origin_member_id || t?.target_id;
    if (originId) {
      try {
        let bag = pack.tree;
        if (!bag || !Array.isArray(bag.nodes)) {
          const tr = await getOriginTree(originId);
          bag = tr?.data?.data ?? tr?.data ?? tr ?? {};
        }
        const nodes = Array.isArray(bag.nodes) ? bag.nodes : [];
        const lanes = [[], [], [], [], []];
        nodes.forEach((n) => {
          if (!n?.id || n.deleted_at) return;
          if (n.role === 'partner') return;
          const d = Number(n.depth);
          if (!Number.isInteger(d) || d < 0 || d > 4) return;
          const partner = Array.isArray(n.partners) && n.partners[0] ? n.partners[0] : null;
          lanes[d].push({
            id: n.id,
            name: n.full_name || n.name || '',
            spouse: partner ? partner.full_name || partner.name || '' : '',
          });
        });
        setBookLanes(lanes);
      } catch {
        setBookLanes([]);
      }
    }
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
        let pick = location.state?.spousePick;
        if (!pick) {
          try {
            pick = JSON.parse(sessionStorage.getItem('mfo.spousePick') || 'null');
          } catch {
            pick = null;
          }
        }
        let host = '';
        try {
          host = sessionStorage.getItem('mfo.spouseHost') || '';
        } catch {
          host = '';
        }
        let sibPick = location.state?.siblingPick;
        if (!sibPick) {
          try {
            sibPick = JSON.parse(sessionStorage.getItem('mfo.siblingPick') || 'null');
          } catch {
            sibPick = null;
          }
        }
        if (sibPick?.id && Number.isInteger(Number(sibPick.line))) {
          const lineNo = Number(sibPick.line);
          setExtraSibs((p) => ({
            ...p,
            [lineNo]: [...(p[lineNo] || []).filter((x) => x.id !== sibPick.id), { id: sibPick.id, name: sibPick.name }],
          }));
          try {
            const m = unwrapMember(await getMember(sibPick.id));
            if (m?.full_name) setNames((n) => ({ ...n, [sibPick.id]: m.full_name }));
          } catch {
            /* skip */
          }
          try {
            sessionStorage.removeItem('mfo.siblingPick');
            sessionStorage.removeItem('mfo.pickRole');
          } catch {
            /* ignore */
          }
          setOk('Đã thêm anh/chị/em từ sổ Họ. Bác gắn vợ hoặc chồng cho người này nếu cần.');
        }
        if (pick?.id && host) {
          try {
            await createSpouseInPlan(id, {
              member_id: host,
              spouse_member_id: pick.id,
            });
            setOk('Đã gắn vợ hoặc chồng từ sổ Họ.');
            try {
              sessionStorage.removeItem('mfo.spousePick');
              sessionStorage.removeItem('mfo.spouseHost');
              sessionStorage.removeItem('mfo.pickRole');
            } catch {
              /* ignore */
            }
            await load();
          } catch (e) {
            if (live) setErr(toMfoUserMessage(e));
          }
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
  const canSubmitResult =
    payload.plan_ok &&
    !payload.result_ok &&
    openCreate.length === 0 &&
    !payload.result_submitted;

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

  function openSpouseSearch(hostId) {
    try {
      sessionStorage.setItem('mfo.pickRole', 'spouse');
      sessionStorage.setItem('mfo.spouseHost', hostId);
      sessionStorage.setItem('mfo.assignLine', '0');
    } catch {
      /* ignore */
    }
    navigate(
      `/op/members/search?preset=assign&returnTo=${encodeURIComponent(`/op/mfo/plans/${id}/work`)}`
    );
  }

  function openSibSearch(lineNo) {
    try {
      sessionStorage.setItem('mfo.pickRole', 'sibling');
      sessionStorage.setItem('mfo.assignLine', String(lineNo));
      sessionStorage.setItem('mfo.siblingIndex', '0');
    } catch {
      /* ignore */
    }
    navigate(
      `/op/members/search?preset=assign&returnTo=${encodeURIComponent(`/op/mfo/plans/${id}/work`)}`
    );
  }

  function spouseTools(mid) {
    if (!mid) return null;
    return (
      <div className="mt-3 rounded-2xl border border-slate-100 p-3">
        <p className="text-sm font-bold text-slate-700">Thêm vợ hoặc chồng</p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            className="min-h-11 min-w-0 flex-1 rounded-2xl bg-indigo-600 px-2 text-sm font-black text-white"
            onClick={() => openSpouseSearch(mid)}
          >
            Chọn từ sổ
          </button>
          <button
            type="button"
            className="min-h-11 min-w-0 flex-1 rounded-2xl border border-indigo-200 bg-indigo-50 px-2 text-sm font-bold text-indigo-800"
            onClick={() => setSpCreate((p) => ({ ...p, [mid]: !p[mid] }))}
          >
            Tạo mới
          </button>
        </div>
        {spCreate[mid] ? (
          <>
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
          </>
        ) : null}
      </div>
    );
  }

  async function onSubmitResult() {
    setBusy('result');
    setErr('');
    setOk('');
    try {
      const founderId = user?.member_id || user?.memberId || payload.founder_member_id || '';
      const presentment = [0, 1, 2, 3, 4].map((i) => {
        const row = lines.find((r) => Number(r.line) === i) || { line: i, op: 'EMPTY' };
        const people = [];
        const pushP = (id, name, role, spouseId) => {
          if (!id && !name) return;
          if (people.some((p) => p.id && id && p.id === id)) return;
          people.push({
            id: id || null,
            name: name || names[id] || '',
            role: founderId && id && String(id) === String(founderId) ? 'khai' : role,
            spouse_id: spouseId || null,
          });
        };
        if (row.member_id || String(row.op).toUpperCase() === 'ASSIGN' || String(row.op).toUpperCase() === 'CREATE') {
          pushP(row.member_id, names[row.member_id] || row.hint, 'chinh', row.spouse_id);
        }
        (row.siblings || []).forEach((s) =>
          pushP(s.member_id, names[s.member_id] || s.hint, 'anh_em', s.spouse_id)
        );
        (extraSibs[i] || []).forEach((s) => pushP(s.id, s.name, 'anh_em', null));
        (row.created_ids || []).forEach((id) => pushP(id, names[id], 'tao', null));
        return { line: i, op: row.op || 'EMPTY', people };
      });
      await submitResult(id, { presentment });
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

        {bookLanes.some((a) => a.length) ? (
          <section className="mt-4 rounded-3xl border border-slate-200 bg-white p-4">
            <p className="font-black text-slate-900">Đã có trên sổ dưới đời gốc</p>
            <p className="mt-1 text-sm text-slate-600">
              Đây là người đã ghi trên sổ. Phần dưới là chỗ khai thêm theo khung.
            </p>
            {bookLanes.map((lane, d) =>
              lane.length ? (
                <div key={d} className="mt-3">
                  <p className="text-sm font-bold text-slate-600">
                    {d === 0 ? 'Đời gốc' : `Đời ${d}`}
                  </p>
                  <ul className="mt-1 space-y-1">
                    {lane.map((p) => (
                      <li key={p.id} className="text-base font-semibold text-slate-800">
                        {p.name}
                        {p.spouse ? ` · ${p.spouse}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null
            )}
          </section>
        ) : null}

        {(payload.admin_review?.dirNote || payload.admin_review?.extra || payload.approver_note) ? (
          <section className="mt-4 rounded-3xl border border-amber-200 bg-amber-50 p-4">
            <p className="font-black text-amber-950">Chỉ đạo Ban quản trị</p>
            {Object.entries(payload.admin_review?.dirNote || {})
              .filter(([, v]) => String(v || '').trim())
              .map(([mid, v]) => (
                <p key={mid} className="mt-2 font-semibold text-slate-800">
                  {names[mid] || mid}: {v}
                </p>
              ))}
            {payload.admin_review?.extra ? (
              <p className="mt-2 font-semibold text-slate-800">{payload.admin_review.extra}</p>
            ) : null}
            {!payload.admin_review?.dirNote && payload.approver_note ? (
              <p className="mt-2 whitespace-pre-wrap font-semibold text-slate-800">
                {payload.approver_note}
              </p>
            ) : null}
          </section>
        ) : null}

        <section className="mt-4">
          <MfoDeclaredTree
            lines={lines.map((row) => ({
              ...row,
              siblings: [
                ...(row.siblings || []),
                ...(extraSibs[row.line] || []).map((s) => ({
                  member_id: s.id,
                  hint: s.name,
                })),
              ],
            }))}
            names={names}
            genders={genders}
            k={payload.k}
            founderId={payload.founder_member_id || user?.member_id}
            selectedId={pickedNode}
            onSelect={(mid) => setPickedNode(mid)}
          />
          <p className="mt-2 text-center text-sm text-slate-600">Bấm một hộ trên cây để khai vợ/chồng hoặc xem.</p>
          {pickedNode ? (
            <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
              <p className="font-bold text-slate-800">
                {names[pickedNode] || 'Đã chọn'}
                {String(pickedNode) === String(payload.founder_member_id || user?.member_id)
                  ? ' (Người khai)'
                  : ''}
              </p>
              {spouseTools(pickedNode)}
              <button
                type="button"
                className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 text-sm font-bold text-slate-800"
                onClick={() => {
                  const row = lines.find((r) => r.member_id === pickedNode)
                    || lines.find((r) => (r.siblings || []).some((s) => s.member_id === pickedNode));
                  openSibSearch(row ? Number(row.line) : Number(payload.k) || 1);
                }}
              >
                Thêm anh/chị/em từ sổ
              </button>
            </div>
          ) : null}
        </section>
        <section className="mt-4 space-y-3">
          {[0, 1, 2, 3, 4].map((i) => {
            const row = lines.find((r) => Number(r.line) === i) || { line: i, op: 'EMPTY' };
            const op = String(row.op || 'EMPTY').toUpperCase();
            const title = i === 0 ? 'Đời gốc' : `Đời ${i}`;
            const founderId = user?.member_id || user?.memberId || payload.founder_member_id || '';
            const isFounder = (mid) =>
              !!(founderId && mid && String(mid) === String(founderId));
            if (op === 'EMPTY' && !(extraSibs[i] || []).length) {
              return null;
            }
            const created = row.created_ids || [];
            if (op === 'ASSIGN' || (row.member_id && op !== 'CREATE')) {
              return null;
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
