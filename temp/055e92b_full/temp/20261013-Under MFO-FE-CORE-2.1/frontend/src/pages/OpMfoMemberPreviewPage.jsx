/**
 * PATH       : frontend/src/pages/OpMfoMemberPreviewPage.jsx
 * DATETIME   : 2026-09-21T09:15:00+07:00
 * VERSION    : 1.0.0-C1
 * DESCRIPTION: Trang xem người trên sổ — xác nhận trước khi chọn Origin.
 */

import { useEffect, useState } from 'react';
import { useNavigate, useParams, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import TenantHeader from '../components/shell/TenantHeader.jsx';
import AppFooterNav from '../components/shell/AppFooterNav.jsx';
import ZoneVoiceButton from '../features/elder-doctrine/components/ZoneVoiceButton.jsx';
import { resolveTenant } from '../lib/resolveTenant.js';
import { resolveFooterNav } from '../lib/resolveFooterNav.js';
import { getMember, listBookMembers } from '../features/mfo/api/mfoApi.js';
import { toMfoUserMessage } from '../features/mfo/constants/mfoUserErrors.js';

function unwrapMember(res) {
  const d = res?.data?.data ?? res?.data ?? {};
  return d.member || d;
}

function unwrapList(res) {
  const d = res?.data?.data ?? res?.data ?? {};
  if (Array.isArray(d)) return d;
  if (Array.isArray(d.items)) return d.items;
  if (Array.isArray(d.members)) return d.members;
  return [];
}

function nameOf(m) {
  return String(m?.full_name || m?.name || '').trim();
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function genderVi(g) {
  const x = String(g || '').toUpperCase();
  if (x === 'NAM' || x === 'MALE') return 'Nam';
  if (x === 'NU' || x === 'NỮ' || x === 'FEMALE') return 'Nữ';
  if (x === 'KHAC' || x === 'OTHER') return 'Khác';
  return x ? 'Khác' : '';
}

export default function OpMfoMemberPreviewPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const returnTo =
    searchParams.get('returnTo') ||
    (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('mfo.searchReturnTo')) ||
    '/op/mfo/plans/new';
  const tenant = resolveTenant(user);
  const footerNav = resolveFooterNav(user, {
    pageKey: 'op-mfo-member',
    backTo: '/op/mfo/plans/new',
    showBack: true,
  });

  const [member, setMember] = useState(null);
  const [book, setBook] = useState([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [mres, lres] = await Promise.all([getMember(id), listBookMembers()]);
        if (cancelled) return;
        const mem = unwrapMember(mres);
        let list = unwrapList(lres);
        for (const pid of [mem?.father_id, mem?.mother_id]) {
          if (!pid || list.some((x) => x.id === pid)) continue;
          try {
            const extra = unwrapMember(await getMember(pid));
            if (extra) list = list.concat([extra]);
          } catch {
            /* không có quyền / không thấy */
          }
        }
        setMember(mem);
        setBook(list);
      } catch (e) {
        if (!cancelled) setErr(toMfoUserMessage(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const name = nameOf(member);
  const year = member?.birth_year ? String(member.birth_year) : 'chưa rõ năm';
  const alive = member?.is_alive === false ? 'Đã mất' : 'Còn sống';
  const note = String(member?.note || '').trim();
  const fa = book.find((x) => x.id === member?.father_id);
  const mo = book.find((x) => x.id === member?.mother_id);
  const spoken = [
    name,
    genderVi(member?.gender) ? `Giới tính ${genderVi(member?.gender)}` : '',
    `Năm sinh ${year}`,
    alive,
    nameOf(fa) ? `Con ông ${nameOf(fa)}` : '',
    nameOf(mo) ? `Bà ${nameOf(mo)}` : '',
    note ? `Ghi chú: ${note}` : '',
  ]
    .filter(Boolean)
    .join('. ');

  function chooseMember() {
    let assignLine = null;
    let role = 'person';
    try {
      const raw = sessionStorage.getItem('mfo.assignLine');
      if (raw != null && raw !== '') assignLine = Number(raw);
      role = sessionStorage.getItem('mfo.pickRole') || 'person';
    } catch {
      assignLine = null;
    }
    if (role === 'sibling' && Number.isInteger(assignLine)) {
      let index = 0;
      try { index = Number(sessionStorage.getItem('mfo.siblingIndex') || '0'); } catch { index = 0; }
      const pack = { line: assignLine, index, id: member.id, name };
      try {
        sessionStorage.setItem('mfo.siblingPick', JSON.stringify(pack));
        sessionStorage.removeItem('mfo.assignLine');
        sessionStorage.removeItem('mfo.pickRole');
        sessionStorage.removeItem('mfo.siblingIndex');
      } catch { /* ignore */ }
      navigate(returnTo, { replace: true, state: { siblingPick: pack } });
      return;
    }
    if (role === 'spouse' && Number.isInteger(assignLine)) {
      try {
        sessionStorage.setItem(
          'mfo.spousePick',
          JSON.stringify({ line: assignLine, id: member.id, name })
        );
        sessionStorage.removeItem('mfo.assignLine');
        sessionStorage.removeItem('mfo.pickRole');
      } catch {
        /* ignore */
      }
      navigate(returnTo, {
        replace: true,
        state: { spousePick: { line: assignLine, id: member.id, name } },
      });
      return;
    }
    try {
      if (Number.isInteger(assignLine)) {
        sessionStorage.setItem(
          'mfo.linePick',
          JSON.stringify({ line: assignLine, id: member.id, name })
        );
        sessionStorage.removeItem('mfo.assignLine');
      } else {
        sessionStorage.setItem(
          'mfo.originPick',
          JSON.stringify({ id: member.id, name })
        );
      }
    } catch {
      /* ignore */
    }
    const state = Number.isInteger(assignLine)
      ? { linePick: { line: assignLine, id: member.id, name } }
      : { originPick: { id: member.id, name } };
    navigate(returnTo, { replace: true, state });
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-slate-50">
      <TenantHeader tenant={tenant} subtitle="Xem người trên sổ" />
      <main className="flex flex-1 flex-col gap-4 px-4 py-4 pb-28">
        {loading ? <p className="text-base text-slate-500">Đang tải…</p> : null}
        {err ? (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3 text-base text-rose-800">{err}</p>
        ) : null}
        {member ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex w-16 shrink-0 flex-col items-center gap-1">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100 text-base font-black text-indigo-700">
                  {initials(name)}
                </span>
                <ZoneVoiceButton visible text={spoken} label="Nghe" />
              </div>
              <h1 className="flex-1 text-xl font-black text-slate-800">{name}</h1>
            </div>
            <dl className="mt-4 space-y-2">
              <div>
                <dt className="text-sm font-normal text-slate-500">Giới tính</dt>
                <dd className="text-base font-semibold text-slate-800">{genderVi(member.gender) || 'Khác'}</dd>
              </div>
              <div>
                <dt className="text-sm font-normal text-slate-500">Năm sinh</dt>
                <dd className="text-base font-semibold text-slate-800">{year}</dd>
              </div>
              <div>
                <dt className="text-sm font-normal text-slate-500">Tình trạng</dt>
                <dd className="text-base font-semibold text-slate-800">{alive}</dd>
              </div>
              {member.father_id ? (
                <div>
                  <dt className="text-sm font-normal text-slate-500">Cha</dt>
                  <dd className="text-base font-semibold text-slate-800">{nameOf(fa) || 'Có trên sổ, chưa đọc được tên'}</dd>
                </div>
              ) : null}
              {member.mother_id ? (
                <div>
                  <dt className="text-sm font-normal text-slate-500">Mẹ</dt>
                  <dd className="text-base font-semibold text-slate-800">{nameOf(mo) || 'Có trên sổ, chưa đọc được tên'}</dd>
                </div>
              ) : null}
              {note ? (
                <div>
                  <dt className="text-sm font-normal text-slate-500">Ghi chú</dt>
                  <dd className="whitespace-pre-wrap break-words text-base font-semibold text-slate-800">{note}</dd>
                </div>
              ) : null}
            </dl>
          </section>
        ) : null}
        <div className="flex gap-3">
          <button
            type="button"
            className="min-h-12 flex-1 rounded-2xl border border-slate-300 bg-white text-base font-bold"
            onClick={() => navigate(returnTo)}
          >
            Quay lại
          </button>
          {member ? (
            <button
              type="button"
              className="min-h-12 flex-1 rounded-2xl bg-indigo-600 text-base font-black text-white"
              onClick={chooseMember}
            >
              Chọn người này
            </button>
          ) : null}
        </div>
      </main>
      <AppFooterNav {...footerNav} />
    </div>
  );
}
