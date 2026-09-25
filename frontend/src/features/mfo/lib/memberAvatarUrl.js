/**
 * PATH       : frontend/src/features/mfo/lib/memberAvatarUrl.js
 * DATETIME   : 2026-09-24T15:25:00+07:00
 * VERSION    : 1.1.0-W2
 * DESCRIPTION: Cùng kênh /me/profile — profile pack + media AVATAR.
 */

import apiClient from '../../../lib/apiClient.js';

function usable(u) {
  const s = String(u || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('/') || s.startsWith('blob:') || s.startsWith('data:')) return s;
  return '';
}

function pickAvatar(obj) {
  if (!obj || typeof obj !== 'object') return '';
  return usable(
    obj.url ||
      obj.read_url ||
      obj.avatar_url ||
      obj.photo_url ||
      obj.image_url ||
      (obj.avatar && (obj.avatar.url || obj.avatar.read_url))
  );
}

const cache = new Map();

export async function memberAvatarUrl(memberId) {
  const id = String(memberId || '').trim();
  if (!id) return '';
  if (cache.has(id)) return cache.get(id);

  const tryGet = async (path, params) => {
    const res = await apiClient.get(path, params ? { params } : {});
    return res.data?.data ?? res.data ?? {};
  };

  let url = '';
  try {
    const pack = await tryGet(`/members/${encodeURIComponent(id)}/profile`);
    url = pickAvatar(pack) || pickAvatar(pack.member) || pickAvatar(pack.avatar);
  } catch {
    /* next */
  }

  if (!url) {
    try {
      const me = await tryGet('/me/avatar');
      const mid = me.member_id || me.avatar?.member_id || me.member?.id;
      if (!mid || String(mid) === id) url = pickAvatar(me) || pickAvatar(me.avatar);
    } catch {
      /* next */
    }
  }

  if (!url) {
    try {
      const bag = await tryGet(`/media/entity/MEMBER/${encodeURIComponent(id)}`, { member_id: id });
      const rows = Array.isArray(bag) ? bag : bag.items || bag.rows || [];
      const row =
        rows.find((m) => String(m.purpose || '').toUpperCase() === 'AVATAR' && m.is_primary) ||
        rows.find((m) => String(m.purpose || '').toUpperCase() === 'AVATAR') ||
        null;
      if (row) {
        url = pickAvatar(row);
        if (!url && row.id) {
          const signed = await tryGet(`/media/${row.id}/url`, { member_id: id });
          url = pickAvatar(signed) || usable(signed.url);
        }
      }
    } catch {
      /* empty */
    }
  }

  cache.set(id, url || '');
  return url || '';
}
