/**
 * PATH       : frontend/src/features/mfo/components/MyMfoPlans.jsx
 * DATETIME   : 2026-09-20T22:25:00+07:00
 * VERSION    : 1.3.0-ACCORDION
 * DESCRIPTION: Tờ khai 5 đời — select + card thu/mở. Tên người, không mã.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp } from 'lucide-react';
import ZoneVoiceButton from '../../elder-doctrine/components/ZoneVoiceButton.jsx';
import { listMyPlans, getPlan, getMember } from '../api/mfoApi.js';
import { OP_MFO_WORK, opMfoStatusLabel } from '../../op/constants/opMfoWork.js';
import { MFO_VOICE_SELF } from '../constants/mfoVoiceHelp.self.js';
import { toMfoUserMessage } from '../constants/mfoUserErrors.js';

const selectCls =
  'w-full rounded-2xl border border-slate-200 px-4 py-3 text-base font-medium outline-none focus:border-indigo-400';

function unwrapList(res) {
  const d = res?.data?.data ?? res?.data ?? {};
  if (Array.isArray(d)) return d;
  if (Array.isArray(d.items)) return d.items;
  if (Array.isArray(d.tickets)) return d.tickets;
  if (d.ticket) return [d.ticket];
  return [];
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await listMyPlans();
        if (cancelled) return;
        setRows(unwrapList(res));
      } catch (e) {
        if (!cancelled) setErr(toMfoUserMessage(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = useMemo(
    () => rows.find((t) => t.id === topic) || null,
    [rows, topic]
  );

  useEffect(() => {
    setOpen(false);
    setDetail(null);
    setOriginName('');
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

  const spoken = selected
    ? [
        'Tờ khai.',
        `Ngày khai báo: ${declaredAt}.`,
        `Tình trạng tờ khai: ${status}.`,
        n == null ? originPhrase : `Đã khai ${n} đời. ${originPhrase}`,
        `Người khai: ${who}, thuộc đời ${kText} tính từ đời gốc.`,
      ].join(' ')
    : MFO_VOICE_SELF.enterOp;

  return (
    <div className="flex flex-col gap-4">
      <label className="block">
        <span className="mb-1 block text-base font-black text-slate-800">Tờ khai 5 đời của tôi</span>
        <select
          className={selectCls}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        >
          <option value="">Bấm để chọn</option>
          <option value="open">Mở tờ khai mới</option>
          {rows.map((t) => (
            <option key={t.id} value={t.id}>
              {optionLabel(t)}
            </option>
          ))}
        </select>
      </label>

      {topic ? (
      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        {topic === 'open' ? (
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
              Mở tờ khai
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
                  <dt className="text-sm font-normal text-slate-500">Đã khai</dt>
                  <dd className="text-base font-semibold text-slate-800">
                    {n == null ? 'Đang đọc tờ…' : `${n} đời. ${originPhrase}`}
                  </dd>
                </div>
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
