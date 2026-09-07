/**
 * PATH       : src/lib/profileTarget.js
 * DATETIME   : 2026-09-06T23:10:00+07:00
 * VERSION    : 1.1.0-P0-section-url
 * DESCRIPTION: /me vs /members/:id. profileHome gắn ?section= khi về từ trang con.
 */

export function memberIdFromSearch(params) {
  const id = params && params.get ? params.get('member_id') : null;
  return id ? String(id) : null;
}

export function profileHome(memberId, section) {
  const base = memberId ? `/members/${memberId}/profile` : '/me/profile';
  const s = section ? String(section).trim() : '';
  if (!s) return base;
  return `${base}?section=${encodeURIComponent(s)}`;
}

export function profileApi(memberId) {
  return memberId ? `/members/${memberId}/profile` : '/me/profile';
}
