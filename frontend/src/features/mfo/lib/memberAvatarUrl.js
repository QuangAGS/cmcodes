/**
 * PATH       : frontend/src/features/mfo/lib/memberAvatarUrl.js
 * DATETIME   : 2026-10-27T08:20:00+07:00
 * VERSION    : 1.1.2-MOT-ANH
 * DESCRIPTION: Cùng kênh /me/profile — profile pack + media AVATAR.
 * CHANGE LOG:
 * - 2026-10-26T09:55:00+07:00 | 1.1.1 | Bỏ gọi lại hồ sơ thành viên. Giữ: ảnh riêng và media. Lý do: hồ sơ đã được trang gọi trước.
 * - 2026-10-27T08:20:00+07:00 | 1.1.2 | Thêm: khoá ảnh đang lấy. Bỏ: gọi đôi. Giữ: đường ảnh. Lý do: trang mở hỏi ảnh hai lần.
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
const flight = new Map();

async function loadAvatar(memberId) {
  const id = String(memberId || '').trim();
  if (!id) return '';

  const tryGet = async (path, params) => {
    const res = await apiClient.get(path, params ? { params } : {});
    return res.data?.data ?? res.data ?? {};
  };

  // <2026-10-26T09:55:00+07:00> Mục đích: Không gọi lại hồ sơ. Lý do: trang đã có hồ sơ, lần này chỉ tìm ảnh.
  let url = '';
  if (!url) {
    try {
      const me = await tryGet('/me/avatar');
      const mid = me.member_id || me.avatar?.member_id || me.member?.id;
      if (mid && String(mid) === id) url = pickAvatar(me) || pickAvatar(me.avatar);
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

export async function memberAvatarUrl(memberId) {
  const id = String(memberId || '').trim();
  if (!id) return '';
  if (cache.has(id)) return cache.get(id);
  if (flight.has(id)) return flight.get(id);
  const job = loadAvatar(id).finally(() => flight.delete(id));
  // <2026-10-27T08:20:00+07:00> Mục đích: Khoá ảnh đang lấy. Lý do: hai lần mở cùng hỏi.
  flight.set(id, job);
  return job;
}

export function clearMemberAvatarCache(memberId) {
  if (memberId) cache.delete(String(memberId));
  else cache.clear();
}
