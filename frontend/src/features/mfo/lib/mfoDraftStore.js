/**
 * PATH       : frontend/src/features/mfo/lib/mfoDraftStore.js
 * DATETIME   : 2026-09-22T10:30:00+07:00
 * VERSION    : 1.0.0-DRAFT
 * DESCRIPTION: Nháp tờ 5L trên máy — hiện trong «Tờ khai 5 đời của tôi».
 */

const KEY = 'mfo.lotDrafts.v1';
const ACTIVE = 'mfo.lotDraftActive';

function readAll() {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeAll(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 20)));
  } catch {
    /* ignore */
  }
}

export function listLotDrafts(userId) {
  const uid = String(userId || '');
  return readAll()
    .filter((d) => !uid || !d.owner_user_id || String(d.owner_user_id) === uid)
    .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
}

export function getLotDraft(id, userId) {
  const row = readAll().find((d) => d.id === id) || null;
  if (!row) return null;
  const uid = String(userId || '');
  if (uid && row.owner_user_id && String(row.owner_user_id) !== uid) return null;
  return row;
}

export function getActiveDraftId() {
  try {
    return localStorage.getItem(ACTIVE) || '';
  } catch {
    return '';
  }
}

export function setActiveDraftId(id) {
  try {
    if (id) localStorage.setItem(ACTIVE, id);
    else localStorage.removeItem(ACTIVE);
  } catch {
    /* ignore */
  }
}

export function saveLotDraft(draft) {
  if (!draft?.id) return draft;
  const next = {
    ...draft,
    owner_user_id: draft.owner_user_id || draft.user_id || null,
    updated_at: new Date().toISOString(),
    kind: 'DRAFT',
  };
  const list = readAll().filter((d) => d.id !== next.id);
  list.unshift(next);
  writeAll(list);
  setActiveDraftId(next.id);
  return next;
}

export function deleteLotDraft(id) {
  writeAll(readAll().filter((d) => d.id !== id));
  if (getActiveDraftId() === id) setActiveDraftId('');
}

export function newDraftId() {
  return `draft-${Date.now()}`;
}

export function clearMfoClientOnLogin() {
  clearPickCache();
  try {
    localStorage.removeItem(ACTIVE);
  } catch {
    /* ignore */
  }
}

export function clearPickCache() {
  [
    'mfo.originPick',
    'mfo.linePick',
    'mfo.spousePick',
    'mfo.siblingPick',
    'mfo.assignLine',
    'mfo.pickRole',
    'mfo.siblingIndex',
    'mfo.planDraft',
    'mfo.memberBook',
  ].forEach((k) => {
    try {
      sessionStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  });
}
