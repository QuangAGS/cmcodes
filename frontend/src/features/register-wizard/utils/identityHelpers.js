/**
 * PATH: src/features/register-wizard/utils/identityHelpers.js
 * DATETIME: 2026-08-05T17:00:00+07:00
 * VERSION: 1.0.0 PR-OP-4
 * DESCRIPTION: PR-OP-4: identity helpers (revision lock)
 */

export const looksLikePhone = (v) => {
  const s = String(v || '').trim();
  return /^0\d{9,10}$/.test(s) || /^\+?\d{9,15}$/.test(s);
};

export const resolveRevisionPhone = (lockedIdentifier, initialData, currentPhone) => {
  if (initialData?.phone) return String(initialData.phone).trim();
  if (looksLikePhone(lockedIdentifier)) return String(lockedIdentifier).trim();
  if (currentPhone && looksLikePhone(currentPhone))
    return String(currentPhone).trim();
  return String(currentPhone || '').trim();
};

export const resolveRevisionEmail = (lockedIdentifier, initialData, currentEmail) => {
  if (initialData?.email) return String(initialData.email).trim();
  const id = String(lockedIdentifier || '').trim();
  if (id.includes('@')) return id;
  return String(currentEmail || '').trim();
};