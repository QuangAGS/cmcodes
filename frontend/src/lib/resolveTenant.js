/**
 * PATH       : src/lib/resolveTenant.js
 * DATETIME   : 2026-08-25T19:20:00+07:00
 * VERSION    : 1.0.0
 * DESCRIPTION:
 * - SSOT map user.tenant (+ optional extra tenant) → props TenantHeader.
 * - FE only.
 */

export function resolveTenant(user, extraTenant = null) {
  const t = user?.tenant || null;
  const x = extraTenant || null;

  return {
    id:
      x?.id ||
      t?.id ||
      user?.tenantId ||
      user?.tenant_id ||
      null,
    name:
      x?.name ||
      t?.name ||
      user?.clanName ||
      user?.tenantName ||
      user?.tenant_name ||
      (user?.role === 'SYSTEM_ADMIN' ? 'Hệ thống' : 'Dòng họ'),
    logo_url:
      x?.logo_url ||
      t?.logo_url ||
      user?.tenantLogo ||
      null,
    slogan: x?.slogan ?? t?.slogan ?? null,
    logo_icon: x?.logo_icon ?? t?.logo_icon ?? null,
    status:
      x?.status ||
      t?.status ||
      user?.tenantStatus ||
      user?.tenant_status ||
      null,
  };
}

export default resolveTenant;
