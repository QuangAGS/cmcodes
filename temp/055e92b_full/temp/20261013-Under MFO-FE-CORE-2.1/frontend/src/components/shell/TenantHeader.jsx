/**
 * PATH       : src/components/shell/TenantHeader.jsx
 * DATETIME   : 2026-09-03T09:25:00+07:00
 * VERSION    : 1.3.1-LOGO-ONERROR
 * DESCRIPTION:
 * - logo_url > logo_icon > initials.
 * - Slogan: italic + bold. Subtitle phụ khi có cả hai.
 * - img lỗi (presign/CORS/mobile) → fallback icon/initials, không ô vỡ.
 */

import { useState } from 'react';
import {
  Landmark,
  Home,
  TreePine,
  UsersRound,
  GitFork,
  Crown,
  ShieldCheck,
  Settings,
} from 'lucide-react';

const ICON_MAP = {
  Landmark,
  Home,
  House: Home,
  TreePine,
  UsersRound,
  GitFork,
  Crown,
  ShieldCheck,
  Settings,
};

export default function TenantHeader({ tenant, subtitle = null, className = '' }) {
  const [logoBroken, setLogoBroken] = useState(false);
  const name =
    (tenant && (tenant.name || tenant.tenant_name || tenant.displayName)) ||
    'Dòng họ';
  const logoUrl =
    tenant?.logo_url ||
    tenant?.symbol_url ||
    tenant?.logo ||
    tenant?.symbol ||
    null;
  const iconKey = tenant?.logo_icon || null;
  const IconComp = iconKey && ICON_MAP[iconKey] ? ICON_MAP[iconKey] : null;
  const slogan =
    (tenant?.slogan && String(tenant.slogan).trim()) || null;

  const initials =
    String(name)
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || 'DH';

  const showLogo = logoUrl && !logoBroken;

  return (
    <header
      className={`flex items-center gap-3 border-b border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur ${className}`}
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
        {showLogo ? (
          <img
            src={logoUrl}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setLogoBroken(true)}
          />
        ) : IconComp ? (
          <IconComp className="h-6 w-6 text-indigo-700" strokeWidth={2.25} />
        ) : (
          <span className="text-sm font-black tracking-tight text-indigo-700">
            {initials}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1 text-left">
        <p className="truncate text-sm font-black text-slate-800">{name}</p>
        {slogan ? (
          <p className="truncate text-xs font-bold italic text-slate-600">
            {slogan}
          </p>
        ) : null}
        {subtitle ? (
          <p
            className={`truncate text-[11px] ${
              slogan ? 'text-slate-400' : 'font-medium text-slate-500'
            }`}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
    </header>
  );
}
