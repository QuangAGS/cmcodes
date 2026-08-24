/**
 * PATH       : src/components/shell/TenantHeader.jsx
 * DATETIME   : 2026-08-23T18:05:00+07:00
 * VERSION    : 1.0.0-SHELL
 * DESCRIPTION:
 * - Header nhận diện tenant (mọi actor, kể cả SYSTEM_ADMIN — tenant đặc biệt).
 * - Cùng pattern: biểu tượng + tên dòng họ (gia đạo). Không nhánh UI theo role.
 * - tenant: { id, name, logo_url? | symbol_url? | logo? }
 */

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

  const initials = String(name)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || 'DH';

  return (
    <header
      className={`flex items-center gap-3 border-b border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur ${className}`}
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-sm font-black tracking-tight text-indigo-700">
            {initials}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1 text-left">
        <p className="truncate text-sm font-black text-slate-800">{name}</p>
        {subtitle ? (
          <p className="truncate text-xs font-medium text-slate-500">{subtitle}</p>
        ) : null}
      </div>
    </header>
  );
}
