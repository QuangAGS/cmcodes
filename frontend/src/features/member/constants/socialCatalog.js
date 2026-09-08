/**
 * PATH       : src/features/member/constants/socialCatalog.js
 * DATETIME   : 2026-09-08T09:10:00+07:00
 * VERSION    : 1.1.0-SOCIAL-QR
 * DESCRIPTION: Catalog MXH + parse JSON cũ {zalo,facebook,website} → items[].
 */

export const SOCIAL_KINDS = [
  { code: 'ZALO', label: 'Zalo' },
  { code: 'FACEBOOK', label: 'Facebook' },
  { code: 'WEBSITE', label: 'Website' },
  { code: 'YOUTUBE', label: 'YouTube' },
  { code: 'TIKTOK', label: 'TikTok' },
  { code: 'TELEGRAM', label: 'Telegram' },
  { code: 'INSTAGRAM', label: 'Instagram' },
  { code: 'OTHER', label: 'Khác' },
];

export const SOCIAL_VALUE_TYPES = [
  { code: 'PHONE', label: 'Số điện thoại' },
  { code: 'URL', label: 'Liên kết (URL)' },
  { code: 'ID', label: 'Tên / ID / @' },
  { code: 'QR_MEDIA', label: 'Danh thiếp / QR' },
];

const KIND_SET = new Set(SOCIAL_KINDS.map((k) => k.code));
const TYPE_SET = new Set(SOCIAL_VALUE_TYPES.map((k) => k.code));

export function emptySocialItem() {
  return { kind: 'ZALO', value_type: 'PHONE', value: '' };
}

function guessType(kind, value) {
  const v = String(value || '').trim();
  if (/^https?:\/\//i.test(v) || v.startsWith('www.')) return 'URL';
  if (kind === 'ZALO' && /^[+\d][\d\s.-]{6,}$/.test(v)) return 'PHONE';
  if (kind === 'WEBSITE') return 'URL';
  return 'ID';
}

export function parseSocialProfiles(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  if (Array.isArray(raw.items)) {
    return raw.items
      .filter((it) => it && KIND_SET.has(String(it.kind || '').toUpperCase()))
      .map((it) => ({
        kind: String(it.kind).toUpperCase(),
        value_type: TYPE_SET.has(String(it.value_type || '').toUpperCase())
          ? String(it.value_type).toUpperCase()
          : guessType(String(it.kind).toUpperCase(), it.value),
        value: String(it.value || it.url || '').trim(),
        media_id: it.media_id || null,
      }));
  }
  const items = [];
  [
    ['zalo', 'ZALO'],
    ['facebook', 'FACEBOOK'],
    ['website', 'WEBSITE'],
  ].forEach(([key, kind]) => {
    const value = String(raw[key] || '').trim();
    if (value) items.push({ kind, value_type: guessType(kind, value), value });
  });
  return items;
}

export function socialToPayload(items) {
  const list = (items || [])
    .map((it) => ({
      kind: String(it.kind || '').toUpperCase(),
      value_type: String(it.value_type || 'ID').toUpperCase(),
      value: String(it.value || '').trim().slice(0, 500),
      media_id: it.media_id || null,
    }))
    .filter((it) => KIND_SET.has(it.kind) && it.value);
  const legacy = { zalo: null, facebook: null, website: null };
  list.forEach((it) => {
    if (it.kind === 'ZALO' && !legacy.zalo) legacy.zalo = it.value;
    if (it.kind === 'FACEBOOK' && !legacy.facebook) legacy.facebook = it.value;
    if (it.kind === 'WEBSITE' && !legacy.website) legacy.website = it.value;
  });
  return { items: list, ...legacy };
}

export function kindLabel(code) {
  return (SOCIAL_KINDS.find((k) => k.code === code) || {}).label || code;
}

export function socialHref(row) {
  const v = String(row?.value || '').trim();
  if (!v) return '';
  if (row.value_type === 'URL' || row.value_type === 'QR_MEDIA') {
    if (/^https?:\/\//i.test(v)) return v;
    if (v.startsWith('www.')) return `https://${v}`;
  }
  if (row.value_type === 'PHONE') {
    const digits = v.replace(/[^\d+]/g, '');
    return digits ? `tel:${digits}` : '';
  }
  return '';
}
