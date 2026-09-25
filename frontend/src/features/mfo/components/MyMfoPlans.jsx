/**
 * PATH       : frontend/src/features/mfo/components/MyMfoPlans.jsx
 * DATETIME   : 2026-09-20T22:25:00+07:00
 * VERSION    : 1.3.0-ACCORDION
 * DESCRIPTION: Tờ khai 5 đời — select + card thu/mở. Tên người, không mã.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext.jsx';
import { ChevronDown, ChevronUp } from 'lucide-react';
import ZoneVoiceButton from '../../elder-doctrine/components/ZoneVoiceButton.jsx';
import { listMyPlans, getPlan, getMember } from '../api/mfoApi.js';
import { unwrapPlanList, unwrapPlanTicket } from '../lib/normalizePlanRow.js';
import { listLotDrafts, deleteLotDraft } from '../lib/mfoDraftStore.js';
import { OP_MFO_WORK, opMfoStatusLabel } from '../../op/constants/opMfoWork.js';
import { MFO_VOICE_SELF } from '../constants/mfoVoiceHelp.self.js';
import { toMfoUserMessage } from '../constants/mfoUserErrors.js';

const selectCls =
  'w-full rounded-2xl border border-slate-200 px-4 py-3 text-base font-medium outline-none focus:border-indigo-400';

function unwrapList(res) {
  const d = res?.data?.data ?? res?.data ?? {};
  const raw = Array.isArray(d)
    ? d
    : Array.isArray(d.items)
      ? d.items
      : Array.isArray(d.tickets)
        ? d.tickets
        : Array.isArray(d.plans)
          ? d.plans
          : d.ticket
            ? [d.ticket]
            : [];
  return raw.map((t) => {
    const p = t.payload && typeof t.payload === 'object' ? t.payload : {};
    return {
      ...t,
      plan_ok: t.plan_ok === true || p.plan_ok === true,
      result_ok: t.result_ok === true || p.result_ok === true,
      payload: {
        ...p,
        plan_ok: t.plan_ok === true || p.plan_ok === true,
        result_ok: t.result_ok === true || p.result_ok === true,
        k: t.k ?? p.k,
        origin_member_id: t.origin_member_id || p.origin_member_id,
        note: t.note || p.note,
      },
    };
  });
}

function unwrapPlan(res) {
  const d = res?.data?.data ?? res?.data ?? {};
  return {
    ticket: d.ticket || d,
    tree: d.tree || null,
  };
}

function unwrapMember(res) {
  const d = res?.data?.data ?? res?.data ?? {};
  return d.member || d;
}

function looksLikeCode(s) {
  const t = String(s || '').trim();
  if (!t) return true;
  if (/^[0-9a-f-]{16,}$/i.test(t)) return true;
  if (/^\d{6,}_\w/.test(t)) return true;
  return false;
}

function nameFromTree(tree, id) {
  if (!id || !tree) return '';
  const bags = [tree.members, tree.nodes, tree.people, tree.is_clan].filter(Array.isArray);
  for (const bag of bags) {
    const hit = bag.find((n) => n && (n.id === id || n.member_id === id));
    const nm = hit?.full_name || hit?.name;
    if (nm && !looksLikeCode(nm)) return nm;
  }
  return '';
}

function declaredGenerations(payload) {
  const lines = Array.isArray(payload?.lines) ? payload.lines : [];
  if (!lines.length) return null;
  const empty = lines.filter((row) => String(row?.op || '').toUpperCase() === 'EMPTY').length;
  return Math.max(0, 5 - empty);
}

function optionLabel(ticket) {
  const when = ticket?.created_at
    ? new Date(ticket.created_at).toLocaleDateString('vi-VN')
    : '';
  return `${when ? `${when} — ` : ''}${opMfoStatusLabel(ticket)}`;
}

export default function MyMfoPlans({ declarantName = '' }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [topic, setTopic] = useState('');
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [originName, setOriginName] = useState('');
  const [nameMap, setNameMap] = useState({});
  const { user } = useAuth();
  const uid = user?.id || user?.userId || '';
  const [drafts, setDrafts] = useState(() => listLotDrafts(uid));

  useEffect(() => {
    setDrafts(listLotDrafts(uid));
  }, [uid]);

  const refreshList = useCallback(async () => {
    try {
      const res = await listMyPlans();
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
      setDrafts(listLotDrafts(uid));
    } catch (e) {
      setErr(toMfoUserMessage(e));
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    refreshList();
    const onVis = () => {
      if (document.visibilityState === 'visible') refreshList();
    };
    window.addEventListener('focus', refreshList);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('focus', refreshList);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [refreshList]);

  const selected = useMemo(
    () => rows.find((t) => t.id === topic) || null,
    [rows, topic]
  );

  useEffect(() => {
    setOpen(false);
    setDetail(null);
    setOriginName('');
    setNameMap({});
  }, [topic]);

  useEffect(() => {
    if (!open || !selected?.id) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await getPlan(selected.id);
        if (cancelled) return;
        const pack = unwrapPlan(res);
        const ticket = pack.ticket || selected;
        setDetail(ticket);
        const originId =
          ticket?.payload?.origin_member_id ||
          selected?.payload?.origin_member_id ||
          selected?.target_id;
        let nm = nameFromTree(pack.tree, originId);
        if (!nm && originId) {
          try {
            const mres = await getMember(originId);
            const m = unwrapMember(mres);
            nm = m?.full_name || '';
          } catch {
            nm = '';
          }
        }
        if (!cancelled) setOriginName(looksLikeCode(nm) ? '' : nm);
        const ids = new Set();
        (ticket?.payload?.lines || []).forEach((row) => {
          if (row?.member_id) ids.add(row.member_id);
          (row?.created_ids || []).forEach((x) => ids.add(x));
        });
        (ticket?.payload?.created_member_ids || []).forEach((x) => ids.add(x));
        (ticket?.payload?.created_spouse_ids || []).forEach((x) => ids.add(x));
        const nextNames = {};
        if (originId && nm && !looksLikeCode(nm)) nextNames[originId] = nm;
        for (const mid of ids) {
          if (nextNames[mid]) continue;
          let hit = nameFromTree(pack.tree, mid);
          if (!hit) {
            try {
              const m = unwrapMember(await getMember(mid));
              hit = m?.full_name || '';
            } catch {
              hit = '';
            }
          }
          if (hit && !looksLikeCode(hit)) nextNames[mid] = hit;
        }
        if (!cancelled) setNameMap(nextNames);
      } catch (e) {
        if (!cancelled) setErr(toMfoUserMessage(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, selected]);

  const payload = detail?.payload || selected?.payload || {};
  const status = selected ? opMfoStatusLabel(detail || selected) : '';
  const declaredAt = selected?.created_at
    ? new Date(selected.created_at).toLocaleString('vi-VN')
    : 'chưa rõ ngày';
  const n = declaredGenerations(payload);
  const k = Number(payload.k);
  const kText = Number.isInteger(k) ? String(k) : 'chưa rõ';
  const who = looksLikeCode(declarantName) ? 'bạn' : declarantName || 'bạn';
  const originPhrase = originName
    ? `Đời gốc là ${originName}, chọn từ sổ Họ.`
    : 'Đời gốc chọn từ sổ Họ.';

  const summaryBlocks = useMemo(() => {
    const raw = Array.isArray(payload.lines) ? payload.lines : [];
    const st = String(selected?.status || '').toUpperCase();
    const filed =
      payload.result_submitted === true ||
      st === 'NEEDS_REVISION' ||
      st === 'APPROVED' ||
      (payload.created_member_ids || []).length > 0;
    const rows5 = [0, 1, 2, 3, 4].map((i) => raw.find((r) => Number(r.line) === i) || { line: i, op: 'EMPTY' });
    const blocks = rows5.map((row) => {
      const title = row.line === 0 ? 'Đời gốc' : `Đời ${row.line}`;
      const op = String(row.op || 'EMPTY').toUpperCase();
      const isYou = Number(payload.k) === row.line;
      const people = [];
      if (filed) {
        const ids = [];
        if (row.member_id) ids.push(row.member_id);
        (row.created_ids || []).forEach((id) => {
          if (!ids.includes(id)) ids.push(id);
        });
        if (!ids.length) {
          people.push({ text: op === 'EMPTY' ? 'Không khai' : 'Chưa ghi người', tag: '' });
        } else {
          ids.forEach((id) => {
            const nm = nameMap[id] || (row.line === 0 ? originName : '') || 'Đã ghi trên sổ';
            people.push({
              text: looksLikeCode(nm) ? 'Đã ghi trên sổ' : nm,
              tag: isYou && id === row.member_id ? 'Chính bạn' : '',
            });
          });
        }
      } else if (op === 'EMPTY') people.push({ text: 'Không khai', tag: '' });
      else if (op === 'CREATE') people.push({ text: row.hint && row.hint !== 'Xin tạo' ? row.hint : 'Chưa đặt tên', tag: 'Xin tạo' });
      else {
        const nm =
          (row.member_id && nameMap[row.member_id]) ||
          (row.line === 0 ? originName : '') ||
          row.hint ||
          'Đã chọn trên sổ';
        people.push({ text: looksLikeCode(nm) ? 'Đã chọn trên sổ' : nm, tag: isYou ? 'Chính bạn' : '' });
      }
      return { title, people };
    });
    if (filed && (payload.created_spouse_ids || []).length) {
      blocks.push({
        title: 'Vợ/chồng mới',
        people: payload.created_spouse_ids.map((id) => ({
          text: nameMap[id] || 'Đã ghi trên sổ',
          tag: '',
        })),
      });
    }
    return blocks;
  }, [payload, nameMap, originName, selected?.status]);

  const spoken = selected
    ? [
        'Tờ khai.',
        `Ngày khai báo: ${declaredAt}.`,
        `Tình trạng tờ khai: ${status}.`,
        summaryBlocks
          .map((b) => `${b.title}. ${b.people.map((p) => `${p.text}${p.tag ? ` ${p.tag}` : ''}`).join('. ')}`)
          .join('. '),
        `Người khai: ${who}, thuộc đời ${kText} tính từ đời gốc.`,
      ].join(' ')
    : MFO_VOICE_SELF.enterOp;

  return (
    <div className="flex flex-col gap-4">
      <label className="block">
        <span className="mb-1 block text-base font-black text-slate-800">Khung dự kiến và tờ khai</span>
        <select
          className={selectCls}
          value={topic}
          onPointerDown={() => {
            refreshList();
          }}
          onFocus={() => {
            refreshList();
          }}
          onChange={(e) => setTopic(e.target.value)}
        >
          <option value="">Bấm để chọn</option>
          <option value="open">Tạo khung dự kiến</option>
          {drafts.map((d) => (
            <option key={d.id} value={d.id}>
              Khung đang tạo — {d.originName || 'chưa chọn gốc'} —{' '}
              {d.updated_at ? new Date(d.updated_at).toLocaleString('vi-VN') : ''}
            </option>
          ))}
          {rows.map((t) => (
            <option key={t.id} value={t.id}>
              {optionLabel(t)}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="min-h-11 w-full rounded-2xl border border-slate-200 bg-white text-sm font-bold text-slate-700"
        onClick={() => refreshList()}
      >
        Làm mới danh sách tờ
      </button>

      {topic ? (
      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        {String(topic).startsWith('draft-') ? (
          <>
            <h2 className="text-base font-black text-slate-800">Tờ đang soạn</h2>
            <p className="mt-2 text-base text-slate-700">
              {drafts.find((d) => d.id === topic)?.originName
                ? `Đời gốc: ${drafts.find((d) => d.id === topic).originName}`
                : 'Chưa chọn đời gốc.'}
            </p>
            <button
              type="button"
              className="mt-3 min-h-12 w-full rounded-2xl bg-indigo-600 text-base font-black text-white"
              onClick={() => navigate(`/op/mfo/plans/new?draft=${encodeURIComponent(topic)}`)}
            >
              Tiếp tục tạo khung
            </button>
            <button
              type="button"
              className="mt-2 min-h-12 w-full rounded-2xl border border-rose-200 bg-rose-50 text-base font-bold text-rose-800"
              onClick={() => {
                deleteLotDraft(topic);
                setDrafts(listLotDrafts(uid));
                setTopic('');
              }}
            >
              Xóa tờ đang soạn
            </button>
          </>
        ) : topic === 'open' ? (
          <>
            <div className="mb-3 flex items-center gap-2">
              <h2 className="flex-1 text-base font-black text-slate-800">{OP_MFO_WORK.title}</h2>
              <ZoneVoiceButton visible text={MFO_VOICE_SELF.enterOp} label="Nghe" />
            </div>
            <p className="text-base leading-relaxed text-slate-700">{OP_MFO_WORK.blurb}</p>
            <button
              type="button"
              className="mt-3 min-h-12 w-full rounded-2xl bg-indigo-600 text-base font-black text-white"
              onClick={() => navigate(OP_MFO_WORK.path)}
            >
              Tạo khung dự kiến
            </button>
          </>
        ) : selected ? (
          <>
            <button
              type="button"
              className="flex w-full items-center gap-2 text-left"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
            >
              <div className="min-w-0 flex-1">
                <p className="text-base font-black text-slate-800">Tờ khai</p>
                <p className="mt-1 text-sm text-slate-600">
                  {selected.created_at
                    ? new Date(selected.created_at).toLocaleDateString('vi-VN')
                    : ''}
                  {' · '}
                  {status}
                </p>
              </div>
              <span
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                role="presentation"
              >
                <ZoneVoiceButton visible text={spoken} label="Nghe" />
              </span>
              {open ? (
                <ChevronUp className="h-5 w-5 shrink-0 text-slate-400" />
              ) : (
                <ChevronDown className="h-5 w-5 shrink-0 text-slate-400" />
              )}
            </button>

            {!payload.plan_ok && String(selected.status || '').toUpperCase() === 'REJECTED' ? (
              <button
                type="button"
                className="mt-3 min-h-12 w-full rounded-2xl bg-indigo-600 text-base font-black text-white"
                onClick={() => navigate(`/op/mfo/plans/new?from=${encodeURIComponent(selected.id)}`)}
              >
                Sửa khung và trình lại
              </button>
            ) : null}

            {payload.plan_ok &&
            !payload.result_ok &&
            !payload.result_submitted &&
            String(selected.status || '').toUpperCase() !== 'NEEDS_REVISION' ? (
              <button
                type="button"
                className="mt-3 min-h-12 w-full rounded-2xl bg-indigo-600 text-base font-black text-white"
                onClick={() => navigate(`/op/mfo/plans/${selected.id}/work`)}
              >
                Mở tờ khai theo khung
              </button>
            ) : null}
            {String(selected.status || '').toUpperCase() === 'NEEDS_REVISION' ? (
              <button
                type="button"
                className="mt-3 min-h-12 w-full rounded-2xl bg-indigo-600 text-base font-black text-white"
                onClick={() => navigate(`/op/mfo/plans/${selected.id}/work`)}
              >
                Sửa tờ khai theo chỉ đạo
              </button>
            ) : null}

            {open ? (
              <dl className="mt-3 space-y-2 border-t border-slate-200 pt-3 text-base text-slate-800">
                <div>
                  <dt className="text-sm font-normal text-slate-500">Ngày khai báo</dt>
                  <dd className="text-base font-semibold text-slate-800">{declaredAt}</dd>
                </div>
                <div>
                  <dt className="text-sm font-normal text-slate-500">Tình trạng</dt>
                  <dd className="text-base font-semibold text-slate-800">{status}</dd>
                </div>
                <div>
                  <dt className="text-sm font-normal text-slate-500">Tóm tắt nội dung trình</dt>
                  <dd className="mt-1 space-y-2 text-base font-semibold text-slate-800">
                    {summaryBlocks.map((b) => (
                      <div key={b.title}>
                        <p className="font-bold">{b.title}</p>
                        {b.people.map((p, i) => (
                          <p key={`${b.title}-${i}`} className="pl-3 font-semibold leading-snug">
                            {p.text}
                            {p.tag ? ` (${p.tag})` : ''}
                          </p>
                        ))}
                      </div>
                    ))}
                  </dd>
                </div>
                {(payload.admin_review || payload.review || payload.approver_note || detail?.admin_note) ? (
                  <div>
                    <dt className="text-sm font-normal text-slate-500">Chỉ đạo Ban quản trị</dt>
                    <dd className="mt-1 space-y-1 font-semibold text-slate-800">
                      {Object.entries((payload.admin_review || payload.review || {}).dirNote || {})
                        .filter(([, v]) => String(v || '').trim())
                        .map(([id, v]) => (
                          <p key={id} className="pl-3">
                            {nameMap[id] || id}: {v}
                          </p>
                        ))}
                      {(payload.admin_review || payload.review)?.extra ? (
                        <p className="pl-3">{(payload.admin_review || payload.review).extra}</p>
                      ) : null}
                      {!Object.keys((payload.admin_review || payload.review || {}).dirNote || {}).length &&
                      (payload.approver_note || detail?.admin_note) ? (
                        <p className="pl-3 whitespace-pre-wrap">
                          {payload.approver_note || detail?.admin_note}
                        </p>
                      ) : null}
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-sm font-normal text-slate-500">Người khai</dt>
                  <dd className="text-base font-semibold text-slate-800">
                    {who} thuộc đời {kText} tính từ đời gốc.
                  </dd>
                </div>
              </dl>
            ) : null}
          </>
        ) : null}

        {loading ? <p className="mt-2 text-base text-slate-500">Đang tải tờ khai…</p> : null}
        {err ? (
          <p className="mt-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-base text-rose-800">{err}</p>
        ) : null}
      </section>
      ) : null}
    </div>
  );
}
