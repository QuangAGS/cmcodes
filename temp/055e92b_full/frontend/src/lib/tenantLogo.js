/**
 * PATH       : src/lib/tenantLogo.js
 * DATETIME   : 2026-08-25T20:10:00+07:00
 * VERSION    : 1.0.0
 * DESCRIPTION:
 * - Resolve URL đọc logo dòng họ từ media (purpose=LOGO, is_primary).
 * - Private R2 → presigned GET; không dùng tenants.logo_url (trừ http legacy).
 */

import apiClient from './apiClient.js';

export function isHttpUrl(s) {
  return typeof s === 'string' && /^https?:\/\//i.test(String(s).trim());
}

/**
 * @param {string} tenantId
 * @returns {Promise<{ mediaId: string|null, readUrl: string|null }>}
 */
export async function fetchTenantLogo(tenantId) {
  if (!tenantId) return { mediaId: null, readUrl: null };
  try {
    const res = await apiClient.get(
      `/media/entity/TENANT/${encodeURIComponent(tenantId)}`
    );
    const list = res.data?.data ?? res.data ?? [];
    const rows = Array.isArray(list) ? list : [];
    const logo =
      rows.find((m) => m.purpose === 'LOGO' && m.is_primary) ||
      rows.find((m) => m.purpose === 'LOGO') ||
      null;
    if (!logo?.id) return { mediaId: null, readUrl: null };

    let readUrl = logo.read_url || null;
    if (!isHttpUrl(readUrl)) {
      const urlRes = await apiClient.get(`/media/${logo.id}/url`);
      readUrl =
        urlRes.data?.data?.url ||
        urlRes.data?.url ||
        null;
    }
    return {
      mediaId: logo.id,
      readUrl: isHttpUrl(readUrl) ? String(readUrl).trim() : null,
    };
  } catch (e) {
    console.warn('[tenantLogo] fetch failed', e?.response?.data || e?.message);
    return { mediaId: null, readUrl: null };
  }
}

/**
 * Gắn logo_url (presign) vào object user.tenant — không mutate sâu nếu có thể.
 */
export function withTenantLogoUrl(user, readUrl) {
  if (!user) return user;
  const tenant = {
    ...(user.tenant || {}),
    id:
      user.tenant?.id ||
      user.tenantId ||
      user.tenant_id ||
      null,
    name:
      user.tenant?.name ||
      user.clanName ||
      user.tenantName ||
      null,
    slogan: user.tenant?.slogan ?? null,
    logo_icon: user.tenant?.logo_icon ?? null,
    status:
      user.tenant?.status ||
      user.tenantStatus ||
      null,
    logo_url: isHttpUrl(readUrl) ? readUrl : user.tenant?.logo_url || null,
  };
  return { ...user, tenant };
}

export default fetchTenantLogo;
