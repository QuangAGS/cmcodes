/**
 * PATH       : scripts/smoke-a01-bpl.js
 * DATETIME   : 2026-09-02T08:45:00+07:00
 * VERSION    : 1.0.0
 * DESCRIPTION: Smoke contract BPL A01 — không cần DB.
 *   cd Backend && node scripts/smoke-a01-bpl.js
 */

'use strict';

const { BusinessLogSchemas } = require('../services/businessLogSchemas.js');

const MEMBER_PATCH = [
  'full_name', 'alias', 'note',
  'birth_year', 'birth_month', 'birth_day',
  'is_birth_lunar', 'birth_note',
  'phone_number', 'email', 'social_profiles',
];
const BIO_PATCH = [
  'childhood_summary', 'education_history', 'career_history',
  'later_life_summary', 'personality_traits', 'notable_quotes',
];

function pick(src, keys) {
  const out = {};
  if (!src || typeof src !== 'object') return out;
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(src, k)) out[k] = src[k];
  }
  return out;
}

const feBody = {
  full_name: 'Nguyễn Thuý Văn',
  alias: 'Văn',
  note: 'Nội tộc',
  birth_year: 1960,
  birth_month: 1,
  birth_day: 1,
  is_birth_lunar: false,
  biography: { childhood_summary: 'Tuổi thơ Hà Tĩnh' },
  origin_address: { admin_area: 'Tỉnh Hà Tĩnh', sub_locality: 'Kỳ Anh' },
};

const memberPatch = pick(feBody, MEMBER_PATCH);
const bioPatch = pick(feBody.biography || feBody, BIO_PATCH);

const rawPayload = {
  member_id: 'member-smoke',
  action: 'PATCH',
  fields: Object.keys(memberPatch).concat(Object.keys(bioPatch)),
  member: memberPatch,
  biography: bioPatch,
};

const sanitized = BusinessLogSchemas.MEMBER_PROFILE_PATCH(rawPayload);

console.log('--- pick memberPatch ---');
console.log(JSON.stringify(memberPatch, null, 2));
console.log('--- pick bioPatch ---');
console.log(JSON.stringify(bioPatch, null, 2));
console.log('--- sanitized BPL payload ---');
console.log(JSON.stringify(sanitized, null, 2));

const fail = [];
if (!sanitized.member || sanitized.member.full_name !== 'Nguyễn Thuý Văn') {
  fail.push('member.full_name missing after schema');
}
if (!sanitized.biography || sanitized.biography.childhood_summary !== 'Tuổi thơ Hà Tĩnh') {
  fail.push('biography snapshot missing');
}
if (sanitized.action !== 'PATCH') fail.push('action != PATCH');

if (fail.length) {
  console.error('SMOKE FAIL', fail);
  process.exit(1);
}
console.log('SMOKE PASS — schema giữ giá trị. Nếu DB vẫn trắng: hàng cũ hoặc process chưa restart.');
