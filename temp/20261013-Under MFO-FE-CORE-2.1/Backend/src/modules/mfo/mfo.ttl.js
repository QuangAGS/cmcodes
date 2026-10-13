/**
 * PATH       : src/modules/mfo/mfo.ttl.js
 * DATETIME   : 2026-10-10T21:10:00+07:00
 * VERSION    : 1.0.0-AMENDMENT3-TTL
 * DESCRIPTION: Năm TTL hệ thống của Amendment 3. Chung mọi tenant.
 *              Lát 1 chỉ đọc .env và tính expires_at. Chưa ghi tập, chưa kiểm giao nhau.
 */
'use strict';

const HOUR_MS = 60 * 60 * 1000;

const TTL_KEYS = Object.freeze({
  DRAFT: 'MFO_TTL_MAX_HOURS',
  PENDING: 'MFO_TTL_PENDING_HOURS',
  UNDER_REVIEW: 'MFO_TTL_UNDER_REVIEW_HOURS',
  NEEDS_REVISION: 'MFO_TTL_NEEDS_REVISION_HOURS',
  APPROVED: 'MFO_TTL_APPROVED_HOURS',
});

const TTL_DEFAULTS = Object.freeze({
  DRAFT: 72,
  PENDING: 72,
  UNDER_REVIEW: 72,
  NEEDS_REVISION: 72,
  APPROVED: 168,
});

function hoursFor(gate) {
  const key = TTL_KEYS[gate];
  const fallback = TTL_DEFAULTS[gate];
  if (!key || !fallback) return null;
  const raw = Number(process.env[key]);
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return raw;
}

function expiresAtFor(gate, from = new Date()) {
  const hours = hoursFor(gate);
  if (!hours) return null;
  const base = from instanceof Date ? from : new Date(from);
  return new Date(base.getTime() + hours * HOUR_MS);
}

module.exports = {
  TTL_KEYS,
  TTL_DEFAULTS,
  hoursFor,
  expiresAtFor,
};
