/**
 * PATH: src/features/register-wizard/utils/identityHelpers.js
 * DATETIME: 2026-11-14T14:48:00+07:00
 * VERSION: 1.1.0-INTL-PHONE
 * DESCRIPTION: PR-OP-4: identity helpers (revision lock) — hỗ trợ cả SĐT Việt Nam và quốc tế E.164.
 */

export const looksLikePhone = (v) => {
  const s = String(v || '').trim().replace(/[\s().-]+/g, '');
  return /^0\d{8,10}$/.test(s) || /^\+?[1-9]\d{6,14}$/.test(s);
};

export const resolveRevisionPhone = (lockedIdentifier, initialData, currentPhone) => {
  if (initialData?.phone && looksLikePhone(initialData.phone)) {
    return String(initialData.phone).trim();
  }
  if (looksLikePhone(lockedIdentifier)) {
    return String(lockedIdentifier).trim();
  }
  if (currentPhone && looksLikePhone(currentPhone)) {
    return String(currentPhone).trim();
  }
  return '';
};

export const resolveRevisionEmail = (lockedIdentifier, initialData, currentEmail) => {
  if (initialData?.email && String(initialData.email).includes('@')) {
    return String(initialData.email).trim();
  }
  const id = String(lockedIdentifier || '').trim();
  if (id.includes('@')) return id;
  if (currentEmail && String(currentEmail).includes('@')) {
    return String(currentEmail).trim();
  }
  return '';
};
