/**
 * PATH       : src/lib/profileTarget.js
 * DATETIME   : 2026-09-05T09:45:00+07:00
 * VERSION    : 1.0.0-M12I
 * DESCRIPTION: /me vs /members/:id — cùng hồ sơ, khác target.
 */
export function memberIdFromSearch(params) {
  const id = params && params.get ? params.get('member_id') : null;
  return id ? String(id) : null;
}

export function profileHome(memberId) {
  return memberId ? `/members/${memberId}/profile` : '/me/profile';
}

export function profileApi(memberId) {
  return memberId ? `/members/${memberId}/profile` : '/me/profile';
}
