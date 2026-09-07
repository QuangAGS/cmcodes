/**
 * PATH       : src/lib/profileSection.js
 * DATETIME   : 2026-09-06T22:05:00+07:00
 * VERSION    : 1.1.0-P0-3b-FE
 * DESCRIPTION: Giữ mục đang mở qua sessionStorage.
 *              Fallback rỗng = shell (chưa chọn mục). Trang con ghi mục trước khi về.
 */

const SECTION_KEY = 'myclan.me.profile.section';
const ACH_OPEN_KEY = 'myclan.me.profile.achOpen';
const BIO_TOPIC_KEY = 'myclan.me.profile.bioTopic';

export function readProfileSection(fallback = '') {
  try {
    return sessionStorage.getItem(SECTION_KEY) || fallback;
  } catch (_) {
    return fallback;
  }
}

export function writeProfileSection(key) {
  try {
    if (!key) sessionStorage.removeItem(SECTION_KEY);
    else sessionStorage.setItem(SECTION_KEY, String(key));
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
