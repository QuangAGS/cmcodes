/**
 * PATH       : frontend/src/pages/OpGflPickPage.jsx
 * DATETIME   : 2026-09-21T19:25:00+07:00
 * VERSION    : 1.0.0-GFL-A
 * DESCRIPTION: Chọn Origin trên GFL khi cây đã có. Không có cây → tìm sổ.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import TenantHeader from '../components/shell/TenantHeader.jsx';
import AppFooterNav from '../components/shell/AppFooterNav.jsx';
import { resolveTenant } from '../lib/resolveTenant.js';
import { resolveFooterNav } from '../lib/resolveFooterNav.js';
import { getOriginTree } from '../features/mfo/api/mfoApi.js';
import { toMfoUserMessage } from '../features/mfo/constants/mfoUserErrors.js';
import FamilyCoupleNode from '../features/genealogy/components/FamilyCoupleNode.jsx';

function unwrapTree(res) {
  return res?.data?.data ?? res?.data ?? {};
}

function asPerson(n) {
  if (!n) return { full_name: '—' };
  return { id: n.id, full_name: n.full_name || n.name || '—', gender: n.gender };
}

export default function OpGflPickPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnTo = params.get('returnTo') || '/op/mfo/plans/new';
  const seedId =
    params.get('seed') || user?.member_id || user?.memberId || '';

  const tenant = resolveTenant(user);
  const footerNav = resolveFooterNav(user, {
    pageKey: 'op-gfl-pick',
    backTo: returnTo,
    showBack: true,
  });

  const [tree, setTree] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(true);
  const [openIds, setOpenIds] = useState(() => new Set());
  const [picked, setPicked] = useState(null);

  useEffect(() => {
    if (!seedId) {
      setBusy(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await getOriginTree(seedId);
        if (!cancelled) setTree(unwrapTree(res));
      } catch (e) {
        if (!cancelled) setErr(toMfoUserMessage(e));
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [seedId]);

  const nodes = useMemo(() => {
    const list = tree?.nodes;
    return Array.isArray(list) ? list : [];
  }, [tree]);

  function coupleOf(n) {
    const g = String(n.gender || '').toUpperCase();
    const partners = Array.isArray(n.partners) ? n.partners : [];
    const spouse = partners[0] || null;
    if (g === 'NU') return { husband: asPerson(spouse), wife: asPerson(n) };
    return { husband: asPerson(n), wife: asPerson(spouse) };
  }

  function childrenOf(id) {
    return nodes.filter((x) => x.father_id === id || x.mother_id === id);
  }

  function choose(n) {
    if (!n?.id || !n.full_name) return;
    setPicked(n);
    try {
      sessionStorage.setItem(
        'mfo.originPick',
        JSON.stringify({ id: n.id, name: n.full_name })
      );
    } catch {
      /* ignore */
    }
    navigate(returnTo, {
      replace: true,
      state: { originPick: { id: n.id, name: n.full_name } },
    });
  }

  const searchUrl =
    '/op/members/search?preset=origin&returnTo=' + encodeURIComponent(returnTo);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-slate-50">
      <TenantHeader tenant={tenant} subtitle="Chọn đời gốc trên cây họ" />
      <main className="flex flex-1 flex-col gap-4 px-4 py-4 pb-28">
        <p className="text-base font-medium text-slate-700">
          Cây mở từ hồ sơ đang đăng nhập chỉ để định hướng. Chạm đúng người làm gốc — không tự lấy bạn làm gốc.
        </p>
        {busy ? <p className="text-base text-slate-500">Đang tải cây họ…</p> : null}
        {err ? (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3 text-base text-rose-800">{err}</p>
        ) : null}
        {!busy && !nodes.length ? (
          <p className="text-base text-slate-600">
            Cây họ chưa có đủ để chọn. Dùng tìm trên sổ.
          </p>
        ) : null}

        {nodes.map((n) => {
          const couple = coupleOf(n);
          const kids = childrenOf(n.id);
          const expanded = openIds.has(n.id);
          return (
            <div key={n.id}>
              <FamilyCoupleNode
                husband={couple.husband}
                wife={couple.wife}
                strong={n.is_clan !== false}
                selected={picked?.id === n.id}
                expanded={expanded}
                canExpand={kids.length > 0}
                onSelect={() => choose(n)}
                onToggleExpand={() => {
                  setOpenIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(n.id)) next.delete(n.id);
                    else next.add(n.id);
                    return next;
                  });
                }}
              />
              {expanded && kids.length ? (
                <div className="ml-6 mt-2 space-y-2 border-l-2 border-blue-200 pl-3">
                  {kids.map((c) => {
                    const cc = coupleOf(c);
                    return (
                      <FamilyCoupleNode
                        key={c.id}
                        husband={cc.husband}
                        wife={cc.wife}
                        strong={c.is_clan !== false}
                        canExpand={false}
                        onSelect={() => choose(c)}
                      />
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}

        <button
          type="button"
          className="min-h-12 w-full rounded-2xl bg-indigo-600 text-base font-black text-white"
          onClick={() => navigate(searchUrl)}
        >
          Tìm trên sổ
        </button>
        <button
          type="button"
          className="min-h-12 w-full rounded-2xl border border-slate-300 bg-white text-base font-bold"
          onClick={() => navigate(returnTo)}
        >
          Quay lại việc đang làm
        </button>
      </main>
      <AppFooterNav {...footerNav} />
    </div>
  );
}
