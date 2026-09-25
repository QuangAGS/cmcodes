/**
 * PATH       : frontend/src/pages/OpMfoPlanTicketPage.jsx
 * DATETIME   : 2026-09-24T10:50:00+07:00
 * VERSION    : 1.0.0-W0
 * DESCRIPTION: Sau gửi PLAN — chờ tem. Chưa phải xưởng (W3).
 */

import { useEffect, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import TenantHeader from '../components/shell/TenantHeader.jsx';
import AppFooterNav from '../components/shell/AppFooterNav.jsx';
import AudioHelpButton from '../features/elder-doctrine/components/AudioHelpButton.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { resolveTenant } from '../lib/resolveTenant.js';
import { resolveFooterNav } from '../lib/resolveFooterNav.js';
import { getPlan } from '../features/mfo/api/mfoApi.js';
import { toMfoUserMessage } from '../features/mfo/constants/mfoUserErrors.js';
import { opMfoStatusLabel } from '../features/op/constants/opMfoWork.js';
import { useTts } from '../shared/hooks/useTts.js';
import { toast } from 'sonner';

function unwrapTicket(res) {
  const d = res?.data?.data ?? res?.data ?? {};
  return d.ticket || d;
}

export default function OpMfoPlanTicketPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const justSubmitted = !!location.state?.justSubmitted;
  const { speak } = useTts();
  const tenant = resolveTenant(user);
  const footerNav = resolveFooterNav(user, {
    pageKey: 'op-mfo-ticket',
    backTo: '/op',
    showBack: true,
  });

  const [ticket, setTicket] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await getPlan(id);
        if (live) setTicket(unwrapTicket(res));
      } catch (e) {
        if (live) setErr(toMfoUserMessage(e));
      }
    })();
    return () => {
      live = false;
    };
  }, [id]);

  const status = ticket ? opMfoStatusLabel(ticket) : '';
  const pending = !ticket || ticket.status === 'PENDING' || !(ticket.payload && ticket.payload.plan_ok);
  const okMsg = 'Đã gửi tờ khai. Chờ Ban quản trị đóng dấu. Chưa thêm người được.';
  const voice = justSubmitted || pending ? okMsg : `Tình trạng tờ khai: ${status}.`;

  useEffect(() => {
    toast.dismiss();
    if (!justSubmitted) return undefined;
    if (typeof speak === 'function') speak(okMsg, { rate: 0.82 });
    return undefined;
  }, [justSubmitted, speak]);

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50">
      <TenantHeader tenant={tenant} />
      <main className="mx-auto w-full max-w-[480px] flex-1 px-4 py-4">
        <div className="mb-3 flex justify-end">
          <AudioHelpButton text={voice} />
        </div>
        <h1 className="text-lg font-bold text-slate-900">Tờ khai 5 đời</h1>
        {justSubmitted ? (
          <section className="mt-4 rounded-3xl border-2 border-emerald-500 bg-emerald-50 px-4 py-6 text-center shadow-sm">
            <p className="text-lg font-black text-emerald-900">Đã gửi tờ khai</p>
            <p className="mt-2 text-base leading-relaxed text-emerald-800">
              Chờ Ban quản trị đóng dấu. Khi có dấu, vào lại mục Tờ khai 5 đời của tôi trên trang việc.
            </p>
          </section>
        ) : null}
        {err ? <p className="mt-3 text-sm text-rose-700">{err}</p> : null}
        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-600">Tình trạng tờ khai</p>
          <p className="mt-1 text-base font-semibold text-slate-900">{status || 'Đang tải…'}</p>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            {pending
              ? 'Đã gửi. Chờ Ban quản trị đóng dấu. Khi có dấu, vào lại mục Tờ khai 5 đời của tôi trên trang việc.'
              : 'Tờ này đã có dấu. Bước vào xưởng sẽ mở ở lát sau.'}
          </p>
        </section>
        {ticket?.payload?.plan_ok && !ticket?.payload?.result_ok ? (
          <button
            type="button"
            className="mt-6 min-h-12 w-full rounded-2xl bg-indigo-600 font-black text-white"
            onClick={() => navigate(`/op/mfo/plans/${id}/work`)}
          >
            Vào xưởng khai báo
          </button>
        ) : null}
        <button
          type="button"
          className="mt-3 min-h-12 w-full rounded-2xl bg-indigo-700 font-bold text-white"
          onClick={() => {
            if (typeof speak === 'function') speak('Về trang việc.', { rate: 0.82 });
            navigate('/op');
          }}
        >
          Về trang việc
        </button>
      </main>
      <AppFooterNav {...footerNav} />
    </div>
  );
}
