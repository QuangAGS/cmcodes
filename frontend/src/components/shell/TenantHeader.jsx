/**
 * PATH       : src/components/shell/TenantHeader.jsx
 * DATETIME   : 2026-08-25T19:20:00+07:00
 * VERSION    : 1.2.0-SHELL
 * DESCRIPTION:
 * - logo_url (ảnh) > logo_icon (Lucide) > chữ viết tắt.
 * - name + slogan (ưu tiên slogan; subtitle phụ).
 */

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

  const line2 = slogan || (subtitle ? String(subtitle) : null);

  return (
    <header
      className={`flex items-center gap-3 border-b border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur ${className}`}
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
        {logoUrl ? (
          <img src={logoUrl} alt="" className="h-full w-full object-cover" />
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
        {line2 ? (
          <p className="truncate text-xs font-medium text-slate-500">{line2}</p>
        ) : null}
        {slogan && subtitle ? (
          <p className="truncate text-[11px] text-slate-400">{subtitle}</p>
        ) : null}
      </div>
    </header>
  );
}
