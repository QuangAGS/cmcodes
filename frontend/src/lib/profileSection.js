/**
 * PATH       : src/lib/profileSection.js
 * DATETIME   : 2026-09-03T20:20:00+07:00
 * VERSION    : 1.0.0-M03
 * DESCRIPTION: Giữ mục đang mở trên /me/profile qua sessionStorage.
 *              Upload/địa chỉ quay lại không rơi về identity.
 */

const SECTION_KEY = 'myclan.me.profile.section';
const ACH_OPEN_KEY = 'myclan.me.profile.achOpen';
const BIO_TOPIC_KEY = 'myclan.me.profile.bioTopic';

export function readProfileSection(fallback = 'identity') {
  try {
    return sessionStorage.getItem(SECTION_KEY) || fallback;
  } catch (_) {
    return fallback;
  }
}

export function writeProfileSection(key) {
  if (!key) return;
  try {
    sessionStorage.setItem(SECTION_KEY, String(key));
  } catch (_) {
    /* ignore */
  }
}

export function readAchOpenId() {
  try {
    return sessionStorage.getItem(ACH_OPEN_KEY) || '';
  } catch (_) {
    return '';
  }
}

export function writeAchOpenId(id) {
  try {
    if (id) sessionStorage.setItem(ACH_OPEN_KEY, String(id));
    else sessionStorage.removeItem(ACH_OPEN_KEY);
  } catch (_) {
    /* ignore */
  }
}

export function readBioTopic(fallback = 'childhood_summary') {
  try {
    return sessionStorage.getItem(BIO_TOPIC_KEY) || fallback;
  } catch (_) {
    return fallback;
  }
}

export function writeBioTopic(key) {
  if (!key) return;
  try {
    sessionStorage.setItem(BIO_TOPIC_KEY, String(key));
  } catch (_) {
    /* ignore */
  }
}
