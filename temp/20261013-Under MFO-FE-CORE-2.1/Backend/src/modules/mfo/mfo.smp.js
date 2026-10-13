/**
 * PATH       : src/modules/mfo/mfo.smp.js
 * DATETIME   : 2026-10-11T14:00:00+07:00
 * VERSION    : 1.0.0-AMENDMENT4-LAT2-SMP
 * DESCRIPTION: Schema SMP. Hệ thống điền is_clan. EU không gửi đời và cha mẹ.
 */
'use strict';

const { fail } = require('./mfo.payload.js');

const GENDERS = new Set(['NAM', 'NU']);
const CHILD_TYPES = new Set(['CON_DE', 'CON_RE', 'CON_DAU', 'CON_NUOI']);
const FORBIDDEN = ['generation', 'father_id', 'mother_id', 'parent_union_id', 'granted_generation', 'child_order'];

function boolOf(value) {
  if (value === true || value === false) return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

function intOf(value, min, max) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) return undefined;
  return n;
}

function textOf(value) {
  return String(value || '').trim();
}

function datePart(raw, field, min, max, out) {
  if (raw[field] == null || raw[field] === '') return;
  const n = intOf(raw[field], min, max);
  if (n === undefined) fail('SMP có ngày không hợp lệ.', 422, 'MFO_SMP_INVALID');
  out[field] = n;
}

function optionalDates(raw, out) {
  datePart(raw, 'birth_day', 1, 31, out);
  datePart(raw, 'birth_month', 1, 12, out);
  datePart(raw, 'birth_year', 1, 3000, out);
  datePart(raw, 'death_day', 1, 31, out);
  datePart(raw, 'death_month', 1, 12, out);
  datePart(raw, 'death_year', 1, 3000, out);
  const birthLunar = boolOf(raw.is_birth_lunar);
  const deathLunar = boolOf(raw.is_death_lunar);
  if (birthLunar != null) out.is_birth_lunar = birthLunar;
  if (deathLunar != null) out.is_death_lunar = deathLunar;
  if (textOf(raw.death_note)) out.death_note = textOf(raw.death_note);
  if (textOf(raw.note)) out.note = textOf(raw.note);
}

function baseSmp(raw, isClan) {
  FORBIDDEN.forEach((field) => {
    if (raw[field] != null) fail('EU không được gửi đời hoặc cha mẹ.', 422, 'MFO_SMP_FORBIDDEN');
  });
  const fullName = textOf(raw.full_name || raw.partner_full_name);
  const gender = String(raw.gender || raw.partner_gender || '').toUpperCase();
  const alive = boolOf(raw.is_alive != null ? raw.is_alive : raw.partner_is_alive);
  if (!fullName) fail('SMP thiếu họ tên.', 422, 'MFO_SMP_INVALID');
  if (!GENDERS.has(gender)) fail('SMP thiếu giới tính.', 422, 'MFO_SMP_INVALID');
  if (alive == null) fail('SMP thiếu còn sống hay đã mất.', 422, 'MFO_SMP_INVALID');
  const out = {
    full_name: fullName,
    gender,
    is_clan: isClan,
    is_alive: alive,
  };
  optionalDates(raw, out);
  if (alive === false && !out.death_year && !out.death_note) {
    out.death_note = out.death_note || null;
  }
  return out;
}

function childSmp(raw) {
  const out = baseSmp(raw, true);
  const childType = String(raw.child_type || '').toUpperCase();
  if (!CHILD_TYPES.has(childType)) fail('Con phải có child_type.', 422, 'MFO_SMP_INVALID');
  out.child_type = childType;
  const anonymous = boolOf(raw.is_anonymous);
  if (anonymous != null) out.is_anonymous = anonymous;
  return out;
}

function spouseSmp(raw) {
  return baseSmp(raw, false);
}

function indexDelta(delta) {
  const children = new Set();
  const spouses = new Set();
  (Array.isArray(delta && delta.draft_children) ? delta.draft_children : []).forEach((row) => {
    if (row && row.id) children.add(String(row.id));
  });
  (Array.isArray(delta && delta.draft_spouses) ? delta.draft_spouses : []).forEach((row) => {
    if (row && row.union_id) spouses.add(String(row.union_id));
  });
  return { children, spouses };
}

function normalizeStaging(raw, delta) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const index = indexDelta(delta);
  const out = {};
  Object.keys(source).forEach((key) => {
    const item = source[key];
    if (!item || typeof item !== 'object') fail('SMP không đúng dạng.', 422, 'MFO_SMP_INVALID');
    if (index.children.has(key)) out[key] = childSmp(item);
    else if (index.spouses.has(key)) out[key] = spouseSmp(item);
    else fail('SMP không thuộc người nháp của khung.', 422, 'MFO_SMP_UNKNOWN');
  });
  return out;
}

module.exports = {
  normalizeStaging,
};
