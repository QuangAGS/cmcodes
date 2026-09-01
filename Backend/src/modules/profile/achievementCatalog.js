/**
 * PATH       : src/modules/profile/achievementCatalog.js
 * DATETIME   : 2026-09-01T08:00:00+07:00
 * VERSION    : 1.0.0-ACH-SUBCAT
 */

'use strict';

const CATEGORIES = new Set([
  'KHOA_BANG',
  'QUAN_SU',
  'CHINH_TRI',
  'KINH_DOANH',
  'TON_GIAO',
  'DONG_GOP_XA_HOI',
  'KHAC',
]);

const SUBS = {
  KHOA_BANG: ['GIAO_SU', 'PHO_GIAO_SU', 'TIEN_SI', 'THAC_SI', 'DAI_HOC', 'CAO_DANG', 'GIAI_THUONG', 'KHAC'],
  QUAN_SU: ['SI_QUAN', 'HA_SI_QUAN', 'HUAN_CHUONG', 'CHIEN_CONG', 'KHAC'],
  CHINH_TRI: ['LANH_DAO', 'CONG_CHUC', 'DAN_CU', 'KHAC'],
  KINH_DOANH: ['DOANH_NHAN', 'NGHE_DANH', 'GIAI_THUONG', 'KHAC'],
  TON_GIAO: ['CHUC_SAC', 'TU_SI', 'KHAC'],
  DONG_GOP_XA_HOI: ['TU_THIEN', 'VAN_HOA', 'DANH_HIEU', 'KHAC'],
  KHAC: ['LOẠI_KHAC'],
};

function isValidCategory(code) {
  return CATEGORIES.has(String(code || ''));
}

function isValidSub(category, sub) {
  if (sub == null || sub === '') return true;
  const list = SUBS[category] || [];
  return list.includes(String(sub));
}

module.exports = { CATEGORIES, SUBS, isValidCategory, isValidSub };
