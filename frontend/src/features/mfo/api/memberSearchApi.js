/**
 * PATH       : frontend/src/features/members/api/memberSearchApi.js
 * DATETIME   : 2026-09-21T10:10:00+07:00
 * VERSION    : 1.0.0-MS
 * DESCRIPTION: GET /members với q + limit. Cache theo câu trong phiên.
 */

import apiClient from '../../../lib/apiClient.js';

const CACHE = 'mfo.ms.v1';

export function unwrapMembers(res) {
  const d = res?.data?.data ?? res?.data ?? {};
  if (Array.isArray(d)) return d;
  if (Array.isArray(d.items)) return d.items;
  if (Array.isArray(d.members)) return d.members;
  return [];
}

export function cacheKey(params) {
  return JSON.stringify({
    q: String(params.q || '').trim().toLowerCase(),
    status: params.status || 'CHINH_THUC',
    is_clan: params.is_clan ?? '',
    gender: params.gender || '',
    is_alive: params.is_alive ?? '',
  });
}

export function readSearchCache(key) {
  try {
    const bag = JSON.parse(sessionStorage.getItem(CACHE) || '{}');
    return Array.isArray(bag[key]) ? bag[key] : null;
  } catch {
    return null;
  }
}

export function writeSearchCache(key, items) {
  try {
    const bag = JSON.parse(sessionStorage.getItem(CACHE) || '{}');
    bag[key] = items;
    sessionStorage.setItem(CACHE, JSON.stringify(bag));
  } catch {
    /* ignore */
  }
}

export function clearSearchCache(key) {
  try {
    if (!key) {
      sessionStorage.removeItem(CACHE);
      return;
    }
    const bag = JSON.parse(sessionStorage.getItem(CACHE) || '{}');
    delete bag[key];
    sessionStorage.setItem(CACHE, JSON.stringify(bag));
  } catch {
    /* ignore */
  }
}

export function searchMembers(params = {}) {
  const q = String(params.q || '').trim();
  const query = {
    status: params.status || 'CHINH_THUC',
    limit: params.limit || 20,
  };
  if (q.length >= 2) query.q = q;
  if (params.is_clan === true || params.is_clan === false) {
    query.is_clan = params.is_clan ? 'true' : 'false';
  }
  if (params.gender) query.gender = params.gender;
  if (params.is_alive === true || params.is_alive === false) {
    query.is_alive = params.is_alive ? 'true' : 'false';
  }
  return apiClient.get('/members', { params: query });
}
