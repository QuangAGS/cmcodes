/**
 * PATH       : src/components/shell/AppFooterNav.jsx
 * DATETIME   : 2026-08-26T08:55:00+07:00
 * VERSION    : 2.1.0-HOME-LABEL
 * DESCRIPTION:
 * - Footer: Quay lại | Home (nhãn theo role) | Đăng xuất.
 * - Declarative backTo/homeTo/homeLabel + onLogout; legacy onBack/onHub/onExit.
 */

import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Home, LogOut } from 'lucide-react';

const btnBase =
  'inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-2xl border px-2 py-2.5 text-xs font-bold transition active:scale-[0.98] sm:text-sm';

export default function AppFooterNav({
  backTo = null,
  homeTo = null,
  homeLabel = 'Trang chủ',
  onLogout = null,
  showBack = true,
  showHome = true,
  showLogout = true,
  backLabel = 'Quay lại',
  logoutLabel = 'Đăng xuất',
  onBack = null,
  onHub = null,
  onExit = null,
  hubLabel = null,
  exitLabel = null,
  className = '',
  sticky = false,
}) {
  const navigate = useNavigate();

  const hasBack =
    showBack &&
    (typeof onBack === 'function' ||
      (typeof backTo === 'string' && backTo.length > 0));

  const hasHome =
    showHome &&
    (typeof onHub === 'function' ||
      (typeof homeTo === 'string' && homeTo.length > 0));

  const hasLogout =
    showLogout &&
    (typeof onExit === 'function' || typeof onLogout === 'function');

  if (!hasBack && !hasHome && !hasLogout) return null;

  const handleBack = () => {
    if (typeof onBack === 'function') return onBack();
    if (typeof backTo === 'string' && backTo) return navigate(backTo);
  };

  const handleHome = () => {
    if (typeof onHub === 'function') return onHub();
    if (typeof homeTo === 'string' && homeTo) return navigate(homeTo);
  };

  const handleLogout = () => {
    if (typeof onExit === 'function') return onExit();
    if (typeof onLogout === 'function') return onLogout();
  };

  return (
    <nav
      className={[
        'border-t border-slate-200 bg-white/95 backdrop-blur',
        sticky
          ? 'sticky bottom-0 z-20 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3'
          : 'mt-8 pt-4 pb-2',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="Điều hướng trang"
    >
      <div className="mx-auto flex w-full max-w-[480px] gap-2 px-1">
        {hasBack ? (
          <button
            type="button"
            onClick={handleBack}
            className={`${btnBase} border-slate-200 bg-slate-50 text-slate-800`}
          >
            <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">{backLabel}</span>
          </button>
        ) : null}

        {hasHome ? (
          <button
            type="button"
            onClick={handleHome}
            className={`${btnBase} border-indigo-100 bg-indigo-50 text-indigo-800`}
          >
            <Home className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">{hubLabel || homeLabel}</span>
          </button>
        ) : null}

        {hasLogout ? (
          <button
            type="button"
            onClick={handleLogout}
            className={`${btnBase} border-slate-200 bg-white text-slate-500`}
          >
            <LogOut className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">{exitLabel || logoutLabel}</span>
          </button>
        ) : null}
      </div>
    </nav>
  );
}
