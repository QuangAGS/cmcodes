/**
 * PATH       : src/features/onboarding/constants/opWorkItems.js
 * DATETIME   : 2026-08-17T15:30:00+07:00
 * VERSION    : 1.0.0-FE-OP-B1-UI1
 * DESCRIPTION:
 * - Từ điển card loại công việc trên /op (config-driven).
 * - UI-1: chỉ BASE_PROFILE; mở rộng tiểu sử / thành tích sau.
 */

'use strict';

export const OP_WORK_ITEM_IDS = {
  BASE_PROFILE: 'base_profile',
};

/**
 * @typedef {object} OpWorkItem
 * @property {string} id
 * @property {string} title
 * @property {string} path
 * @property {boolean} [primary]
 */

/** Danh mục loại công việc — thứ tự hiển thị */
export const OP_WORK_ITEMS = [
  {
    id: OP_WORK_ITEM_IDS.BASE_PROFILE,
    title: 'Hoàn thiện hồ sơ cơ sở',
    path: '/op/base-profile',
    primary: true,
  },
];

export default OP_WORK_ITEMS;