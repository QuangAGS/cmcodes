/**
 * PATH       : src/lib/resolveFooterNav.js
 * DATETIME   : 2026-08-26T10:10:00+07:00
 * VERSION    : 1.2.0-HOME-CONTEXT
 * DESCRIPTION:
 * - SSOT footer theo pageKey.
 * - Hub / list admin: Home = Trang chủ (/).
 * - Page cấp dưới admin (settings, OP detail…): Home = Trung tâm QT (/admin).
 */

export function resolveNavRole(user) {
  const r = String(user?.role || '').toUpperCase();
  if (r === 'SYSTEM_ADMIN') return 'SYSTEM_ADMIN';
  if (r === 'CLAN_ADMIN') return 'CLAN_ADMIN';
  if (r === 'USER' || r === 'VIEWER' || r === 'THANH_VIEN') return 'USER';
  return 'GUEST';
}

/**
 * Home mặc định theo role (khi không có pageKey đặc biệt).
 * USER → /op · ADMIN → /admin · else → /
 */
export function resolveHomeTo(user) {
  const role = resolveNavRole(user);
  if (role === 'SYSTEM_ADMIN' || role === 'CLAN_ADMIN') return '/admin';
  if (role === 'USER') return '/op';
  return '/';
}

export function resolveHomeLabel(user) {
  const role = resolveNavRole(user);
  if (role === 'SYSTEM_ADMIN' || role === 'CLAN_ADMIN') return 'Trung tâm QT';
  if (role === 'USER') return 'Việc của tôi';
  return 'Trang chủ';
}

/**
 * pageKey quyết định home “đúng tầng”:
 * - admin | admin-approval  → Trang chủ (/)
 * - admin-settings | admin-op-detail | admin-child → Trung tâm QT (/admin)
 * - op-* → theo role USER
 */
function resolveHomeByPageKey(user, pageKey) {
  const key = String(pageKey || '').toLowerCase();
  const role = resolveNavRole(user);

  // Hub + list approval: đã có Quay lại → /admin; Home = Landing
  if (key === 'admin' || key === 'admin-approval') {
    return { homeTo: '/', homeLabel: 'Trang chủ' };
  }

  // Cấp dưới /admin
  if (
    key === 'admin-settings' ||
    key === 'admin-op-detail' ||
    key === 'admin-child'
  ) {
    return { homeTo: '/admin', homeLabel: 'Trung tâm QT' };
  }

  if (key.startsWith('op-') || key === 'op-hub' || key === 'op-base-profile') {
    if (role === 'USER') return { homeTo: '/op', homeLabel: 'Việc của tôi' };
    return { homeTo: '/', homeLabel: 'Trang chủ' };
  }

  return {
    homeTo: resolveHomeTo(user),
    homeLabel: resolveHomeLabel(user),
  };
}

export function resolveDefaultBackTo(user, pageKey = 'op-other') {
  const role = resolveNavRole(user);
  const key = String(pageKey || '').toLowerCase();

  const map = {
    admin: null,
    'admin-approval': '/admin',
    'admin-settings': '/admin',
    'admin-op-detail': '/admin/approval?process=OP',
    'admin-child': '/admin',
    'op-hub': '/',
    'op-base-profile': '/op',
    'op-other': '/op',
    public: '/',
  };

  if (Object.prototype.hasOwnProperty.call(map, key)) return map[key];
  if (role === 'SYSTEM_ADMIN' || role === 'CLAN_ADMIN') return '/admin';
  if (role === 'USER') return '/op';
  return '/';
}

export function resolveFooterNav(user, opts = {}) {
  const {
    pageKey = 'op-other',
    backTo,
    homeTo,
    homeLabel,
    showBack = true,
    showHome = true,
    showLogout = true,
  } = opts;

  const byPage = resolveHomeByPageKey(user, pageKey);

  const resolvedBack =
    backTo !== undefined
      ? backTo
      : showBack
        ? resolveDefaultBackTo(user, pageKey)
        : null;

  return {
    backTo: resolvedBack,
    homeTo: homeTo !== undefined ? homeTo : showHome ? byPage.homeTo : null,
    homeLabel:
      homeLabel !== undefined ? homeLabel : byPage.homeLabel,
    showBack:
      showBack && resolvedBack != null && String(resolvedBack).length > 0,
    showHome,
    showLogout,
  };
}

export default resolveFooterNav;
