/**
 * PATH       : src/lib/profileSection.js
 * DATETIME   : 2026-09-06T22:05:00+07:00
 * VERSION    : 1.3.0-BIO-PICK
 * DESCRIPTION: Giữ mục đang mở qua sessionStorage.
 *              Fallback rỗng = shell (chưa chọn mục). Trang con ghi mục trước khi về.
 */

const SECTION_KEY = 'myclan.me.profile.section';
const ACH_OPEN_KEY = 'myclan.me.profile.achOpen';
const BIO_TOPIC_KEY = 'myclan.me.profile.bioTopic';
const ACH_CAT_KEY = 'myclan.me.profile.achCat';
const ACH_SUB_KEY = 'myclan.me.profile.achSub';

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

export function readBioTopic(fallback = '') {
  try {
    return sessionStorage.getItem(BIO_TOPIC_KEY) || fallback;
  } catch (_) {
    return fallback;
  }
}

export function writeBioTopic(key) {
  try {
    if (!key) sessionStorage.removeItem(BIO_TOPIC_KEY);
    else sessionStorage.setItem(BIO_TOPIC_KEY, String(key));
  } catch (_) {
    /* ignore */
  }
}

export function readAchCatalog() {
  try {
    return {
      category: sessionStorage.getItem(ACH_CAT_KEY) || '',
      sub_category: sessionStorage.getItem(ACH_SUB_KEY) ?? '',
    };
  } catch (_) {
    return { category: '', sub_category: '' };
  }
}

export function writeAchCatalog(category, sub_category) {
  try {
    if (!category) {
      sessionStorage.removeItem(ACH_CAT_KEY);
      sessionStorage.removeItem(ACH_SUB_KEY);
      return;
    }
    sessionStorage.setItem(ACH_CAT_KEY, String(category));
    sessionStorage.setItem(ACH_SUB_KEY, sub_category == null ? '' : String(sub_category));
  } catch (_) {
    /* ignore */
  }
}
