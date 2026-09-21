/**
 * PATH       : frontend/src/pages/OpMfoPlanPage.jsx
 * DATETIME   : 2026-09-20T10:50:00+07:00
 * VERSION    : 1.1.0-ORIGIN-PICK
 * DESCRIPTION: Wizard PLAN SELF — chọn gốc theo tên sổ Họ.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext.jsx';
import TenantHeader from '../components/shell/TenantHeader.jsx';
import AppFooterNav from '../components/shell/AppFooterNav.jsx';
import AudioHelpButton from '../features/elder-doctrine/components/AudioHelpButton.jsx';
import ZoneVoiceButton from '../features/elder-doctrine/components/ZoneVoiceButton.jsx';
import { resolveTenant } from '../lib/resolveTenant.js';
import { resolveFooterNav } from '../lib/resolveFooterNav.js';
import {
  MFO_VOICE_SELF,
  MFO_OP_LABEL,
  voiceForLineSelf,
  mfoOpLabel,
  mfoLineTitle,
} from '../features/mfo/constants/mfoVoiceHelp.self.js';
import { toMfoUserMessage } from '../features/mfo/constants/mfoUserErrors.js';
import { createPlan } from '../features/mfo/api/mfoApi.js';
import MemberSearchSheet from '../features/member/components/MemberSearchSheet.jsx';
import { useTts } from '../shared/hooks/useTts.js';

const STEPS = ['origin', 'k', 'lines', 'review'];
const OPS = ['ASSIGN', 'CREATE', 'EMPTY'];


const BOOK_CACHE_KEY = 'mfo.memberBook';

function readBookCache() {
  try {
    const raw = sessionStorage.getItem(BOOK_CACHE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return Array.isArray(d.items) ? d.items : null;
  } catch {
    return null;
  }
}

function writeBookCache(items) {
  try {
    sessionStorage.setItem(BOOK_CACHE_KEY, JSON.stringify({ at: Date.now(), items }));
  } catch { /* ignore */ }
}

function unwrapMembers(res) {
  const d = res?.data?.data ?? res?.data ?? {};
  if (Array.isArray(d)) return d;
  if (Array.isArray(d.items)) return d.items;
  if (Array.isArray(d.members)) return d.members;
  return [];
}

function memberLabel(m) {
  return String(m?.full_name || m?.name || '').trim();
}

function foldName(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}

function genderVi(g) {
  const x = String(g || '').toUpperCase();
  if (x === 'NAM' || x === 'MALE') return 'Nam';
  if (x === 'NU' || x === 'NỮ' || x === 'FEMALE') return 'Nữ';
  if (x === 'KHAC' || x === 'OTHER') return 'Khác';
  return x ? 'Khác' : '';
}

function yearVi(m) {
  const y = m?.birth_year;
  return y ? `sinh năm ${y}` : 'chưa rõ năm sinh';
}

function parentName(book, id) {
  if (!id) return '';
  const p = book.find((x) => x.id === id);
  return memberLabel(p);
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function aliveVi(m) {
  return m?.is_alive === false ? 'Đã mất' : 'Còn sống';
}

function speakMember(m, book) {
  const cap = pickCaption(m, book);
  const parts = [
    cap.name,
    genderVi(m.gender) ? `Giới tính ${genderVi(m.gender)}` : '',
    `Năm sinh ${cap.year}`,
    cap.alive,
  ];
  const fa = parentName(book, m.father_id);
  const mo = parentName(book, m.mother_id);
  if (fa) parts.push(`Con ông ${fa}`);
  if (mo) parts.push(`Bà ${mo}`);
  if (cap.note) parts.push(`Ghi chú: ${cap.note}`);
  return parts.filter(Boolean).join('. ') + '.';
}

function pickCaption(m, book) {
  const name = memberLabel(m);
  const g = genderVi(m.gender);
  const y = m?.birth_year ? String(m.birth_year) : 'chưa rõ năm';
  const note = String(m?.note || '').trim();
  const fa = parentName(book, m.father_id);
  const mo = parentName(book, m.mother_id);
  const bits = [g, y, aliveVi(m)].filter(Boolean);
  if (fa) bits.push(`con ông ${fa}`);
  if (mo) bits.push(`bà ${mo}`);
  if (note) bits.push(note);
  return { name, year: y, alive: aliveVi(m), note, sub: bits.join(' · ') };
}

function emptyLines(originId) {
  return [
    { line: 0, op: 'ASSIGN', member_id: originId || '', hint: 'Origin' },
    { line: 1, op: 'EMPTY', member_id: '', hint: '' },
    { line: 2, op: 'EMPTY', member_id: '', hint: '' },
    { line: 3, op: 'EMPTY', member_id: '', hint: '' },
    { line: 4, op: 'EMPTY', member_id: '', hint: '' },
  ];
}

export default function OpMfoPlanPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { speak, speakError } = useTts();
  const tenant = resolveTenant(user);
  const footerNav = resolveFooterNav(user, {
    pageKey: 'op-mfo-plan',
    backTo: '/op',
    showBack: true,
  });

  const myMemberId = user?.member_id || user?.memberId || '';
  const [step, setStep] = useState(0);
  const [originId, setOriginId] = useState('');
  const [originName, setOriginName] = useState('');
  const [k, setK] = useState('');
  const [lines, setLines] = useState(() => emptyLines(''));
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [hits, setHits] = useState([]);
  const [picked, setPicked] = useState(false);
  const [book, setBook] = useState([]);
  const [previewId, setPreviewId] = useState('');

  const stepKey = STEPS[step];
  const help = useMemo(() => {
    if (stepKey === 'origin') return MFO_VOICE_SELF.origin;
    if (stepKey === 'k') return MFO_VOICE_SELF.k;
    if (stepKey === 'lines') return MFO_VOICE_SELF.whyFive;
    return MFO_VOICE_SELF.review;
  }, [stepKey]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('mfo.planDraft');
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d.originName) setOriginName((prev) => prev || d.originName);
      if (d.originId) setOriginId((prev) => prev || d.originId);
      if (d.picked) setPicked(true);
      if (d.k !== undefined && d.k !== '') setK((prev) => (prev === '' ? d.k : prev));
      if (d.note) setNote((prev) => prev || d.note);
      if (Number.isInteger(d.step)) setStep(d.step);
      if (Array.isArray(d.lines) && d.lines.length === 5) setLines(d.lines);
    } catch { /* ignore */ }
  }, []);


  useEffect(() => {
    const fromState = location.state?.originPick;
    let fromStore = null;
    try {
      fromStore = JSON.parse(sessionStorage.getItem('mfo.originPick') || 'null');
    } catch {
      fromStore = null;
    }
    const pick = fromState || fromStore;
    if (pick?.id && pick?.name) {
      setOriginId(pick.id);
      setOriginName(pick.name);
      setPicked(true);
      setPreviewId('');
      try { sessionStorage.removeItem('mfo.originPick'); } catch { /* ignore */ }
    }
  }, [location.state]);

  useEffect(() => {
    let linePick = location.state?.linePick;
    if (!linePick) {
      try { linePick = JSON.parse(sessionStorage.getItem('mfo.linePick') || 'null'); }
      catch { linePick = null; }
    }
    if (linePick && Number.isInteger(linePick.line) && linePick.id) {
      setLine(linePick.line, {
        op: 'ASSIGN',
        member_id: linePick.id,
        hint: linePick.name || '',
      });
      setStep(2);
      try { sessionStorage.removeItem('mfo.linePick'); } catch { /* ignore */ }
    }
  }, [location.state]);

  function setLine(i, patch) {
    setLines((prev) => {
      const next = prev.map((row, idx) => (idx === i ? { ...row, ...patch } : { ...row }));
      if (i === 0) {
        next[0].op = 'ASSIGN';
        next[0].member_id = originId;
      }
      const firstEmpty = next.findIndex((row, idx) => idx > 0 && row.op === 'EMPTY' && !row.need_um);
      if (firstEmpty >= 0) {
        for (let j = firstEmpty + 1; j <= 4; j += 1) {
          next[j].op = 'EMPTY';
          next[j].member_id = '';
        }
      }
      const kk = Number(k);
      if (Number.isInteger(kk) && kk >= 0 && kk <= 4 && myMemberId) {
        next[kk].op = 'ASSIGN';
        next[kk].member_id = myMemberId;
      }
      return next;
    });
  }

  function validateStep() {
    if (stepKey === 'origin' && !originId) return 'MFO_ORIGIN_REQUIRED';
    if (stepKey === 'k') {
      const n = Number(k);
      if (!Number.isInteger(n) || n < 0) return 'MFO_K_REQUIRED';
      if (n > 4) return 'MFO_K_TOO_FAR';
    }
    return '';
  }

  function goNext() {
    const code = validateStep();
    if (code) {
      const msg = toMfoUserMessage({ code });
      setErr(msg);
      return;
    }
    setErr('');
    if (stepKey === 'origin') {
      setLines((prev) => {
        const next = emptyLines(originId);
        const kk = Number(k);
        if (Number.isInteger(kk) && kk >= 0 && kk <= 4 && myMemberId) {
          next[kk] = { ...next[kk], op: 'ASSIGN', member_id: myMemberId };
        }
        return next.map((row, idx) => (idx === 0 ? { ...row, member_id: originId } : row));
      });
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  async function submit() {
    const n = Number(k);
    if (!originId) {
      setErr(toMfoUserMessage({ code: 'MFO_ORIGIN_REQUIRED' }));
      return;
    }
    if (!Number.isInteger(n) || n < 0 || n > 4) {
      setErr(toMfoUserMessage({ code: n > 4 ? 'MFO_K_TOO_FAR' : 'MFO_K_REQUIRED' }));
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const payload = {
        origin_member_id: originId,
        k: n,
        note,
        mode: 'DEPTH',
        fill: 'SELF',
        lines: lines.map((row) => ({
          line: row.line,
          op: row.op,
          member_id: row.op === 'ASSIGN' ? row.member_id || undefined : undefined,
          hint: row.hint || undefined,
        })),
      };
      await createPlan(payload);
      const ok = MFO_VOICE_SELF.submitted;
      toast.success(ok);
      if (typeof speak === 'function') speak(ok, { rate: 0.82 });
      else speakError?.(ok);
      navigate('/op', { replace: true });
    } catch (e) {
      const msg = toMfoUserMessage(e);
      setErr(msg);
      if (typeof speak === 'function') speak(msg, { rate: 0.82 });
      else speakError?.(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-slate-50">
      <TenantHeader tenant={tenant} subtitle="Khai năm đời" />

      <main className="flex flex-1 flex-col gap-4 px-4 py-4 pb-28">
        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-base font-medium leading-relaxed text-slate-800">{help}</p>
          <div className="mt-3">
            <AudioHelpButton text={help} label="Nghe hướng dẫn" />
          </div>
        </section>

        {err ? (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3 text-base text-rose-800">{err}</p>
        ) : null}

        {stepKey === 'origin' ? (
          picked && originId ? (
            <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-normal text-slate-500">Chọn Đời gốc trên sổ họ</p>
              <p className="mt-1 text-base font-semibold text-slate-800">{originName}</p>
              <button
                type="button"
                className="mt-3 min-h-12 w-full rounded-2xl border border-slate-300 bg-white text-base font-bold"
                onClick={() => {
                  setPicked(false);
                  setOriginId('');
                }}
              >
                Chọn người khác
              </button>
            </section>
          ) : (
            <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-normal text-slate-500">Chọn Đời gốc trên sổ họ</p>
              <p className="mt-2 text-base text-slate-700">Bấm nút Tìm kiếm và lựa chọn một người rồi quay lại.</p>
              <button
                type="button"
                className="mt-3 min-h-12 w-full rounded-2xl bg-indigo-600 text-base font-black text-white"
                onClick={() => {
                  try {
                    sessionStorage.setItem(
                      'mfo.planDraft',
                      JSON.stringify({ originName, k, note, step })
                    );
                  } catch { /* ignore */ }
                  navigate(
                    '/op/members/search?preset=origin&returnTo=' +
                      encodeURIComponent('/op/mfo/plans/new')
                  );
                }}
              >
                Tìm kiếm
              </button>
            </section>
          )
        ) : null}

        {stepKey === 'k' ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-base font-bold text-slate-800">Bạn cách gốc mấy đời?</p>
            <div className="mt-3 grid grid-cols-5 gap-2">
              {[0, 1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`min-h-12 rounded-2xl text-lg font-black ${
                    String(k) === String(n) ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'
                  }`}
                  onClick={() => setK(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {stepKey === 'lines' ? (
          <div className="flex flex-col gap-3">
            {lines.map((row) => (
              <section key={row.line} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-lg font-black text-slate-800">
                    {mfoLineTitle(row.line)}
                  </h2>
                  <ZoneVoiceButton visible text={voiceForLineSelf(row.line)} label="Nghe" />
                </div>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{voiceForLineSelf(row.line)}</p>
                {Number(k) === row.line ? (
                  <p className="mt-2 rounded-2xl bg-amber-50 px-3 py-2 text-sm text-amber-900">{MFO_VOICE_SELF.lineK}</p>
                ) : null}
                {row.line === 0 || Number(k) === row.line ? (
                  <p className="mt-3 text-base font-semibold text-slate-700">Chọn người có sẵn</p>
                ) : (
                  <div className="mt-3 flex flex-col gap-2">
                    {OPS.map((op) => (
                      <button
                        key={op}
                        type="button"
                        className={`min-h-12 rounded-2xl px-4 text-left text-base font-bold ${
                          row.op === op ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'
                        }`}
                        onClick={() => setLine(row.line, { op, member_id: op === 'ASSIGN' ? row.member_id : '' })}
                      >
                        {MFO_OP_LABEL[op]}
                      </button>
                    ))}
                    {row.op === 'ASSIGN' ? (
                      <div className="mt-2">
                        {row.hint || row.member_id ? (
                          <p className="text-base font-semibold text-slate-800">
                            Đã chọn: {row.hint || 'người trên sổ'}
                          </p>
                        ) : (
                          <p className="text-sm font-normal text-slate-500">Chưa chọn người cho đời này.</p>
                        )}
                        <button
                          type="button"
                          className="mt-2 min-h-12 w-full rounded-2xl bg-indigo-600 text-base font-black text-white"
                          onClick={() => {
                            try {
                              sessionStorage.setItem(
                                'mfo.planDraft',
                                JSON.stringify({ originName, originId, picked: true, k, note, step: 2, lines })
                              );
                              sessionStorage.setItem('mfo.assignLine', String(row.line));
                            } catch { /* ignore */ }
                            navigate(
                              '/op/members/search?preset=assign&returnTo=' +
                                encodeURIComponent('/op/mfo/plans/new')
                            );
                          }}
                        >
                          Tìm kiếm
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}
              </section>
            ))}
          </div>
        ) : null}

        {stepKey === 'review' ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <ul className="space-y-2 text-base text-slate-800">
              <li>
                Người gốc:{' '}
                {originName && !/^[0-9a-f-]{16,}$/i.test(originName.trim())
                  ? originName
                  : 'Đã chọn trên sổ Họ'}
              </li>
              <li>
                Bạn cách gốc {String(k)} đời
                {Number(k) === 0 ? ' (chính bạn là gốc)' : ''}
              </li>
              {lines.map((row) => (
                <li key={row.line}>
                  {mfoLineTitle(row.line)}: {mfoOpLabel(row.op)}
                  {Number(k) === row.line ? ' — đây là bạn' : ''}
                </li>
              ))}
            </ul>
            <textarea
              className="mt-3 w-full rounded-2xl border border-slate-300 px-4 py-3 text-base"
              rows={3}
              placeholder="Ghi chú cho người duyệt"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </section>
        ) : null}

        <div className="flex gap-3">
          {step > 0 ? (
            <button
              type="button"
              className="min-h-12 flex-1 rounded-2xl border border-slate-300 bg-white text-base font-bold"
              onClick={() => {
                setErr('');
                setStep((s) => Math.max(0, s - 1));
              }}
            >
              Quay lại
            </button>
          ) : (
            <button
              type="button"
              className="min-h-12 flex-1 rounded-2xl border border-slate-300 bg-white text-base font-bold"
              onClick={() => navigate('/op')}
            >
              Quay lại
            </button>
          )}
          {stepKey !== 'review' ? (
            <button
              type="button"
              className="min-h-12 flex-1 rounded-2xl bg-indigo-600 text-base font-black text-white"
              onClick={goNext}
            >
              Tiếp
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              className="min-h-12 flex-1 rounded-2xl bg-indigo-600 text-base font-black text-white disabled:opacity-60"
              onClick={submit}
            >
              {busy ? 'Đang gửi…' : 'Gửi tờ khai'}
            </button>
          )}
        </div>
      </main>

      <AppFooterNav {...footerNav} />
    </div>
  );
}
