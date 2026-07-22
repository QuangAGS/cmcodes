/**
 * PATH       : src/shared/errors/codes/tenant.codes.js
 * DATETIME   : 2026-07-21T19:05:00+07:00
 * VERSION    : 1.0.0-CED-1.1
 * DESCRIPTION: Mã lỗi Tenant / Clan lifecycle (SEC điều khoản B).
 *              Pure constants only — zero business import.
 */

'use strict';

const TENANT = Object.freeze({
  // Lifecycle (ma trận login SEC V)
  TENANT_PENDING_ACTIVATION: 'TENANT_PENDING_ACTIVATION',     // 423 — CHO_DUYET
  TENANT_ACTIVATION_REQUIRED: 'TENANT_ACTIVATION_REQUIRED',   // 423 — CHO_KICH_HOAT / holding
  TENANT_DISABLED: 'TENANT_DISABLED',                         // 403 — TAM_NGUNG / BI_KHOA
  TENANT_NOT_FOUND: 'TENANT_NOT_FOUND',
  TENANT_ALREADY_EXISTS: 'TENANT_ALREADY_EXISTS',
  TENANT_SLUG_TAKEN: 'TENANT_SLUG_TAKEN',

  // Isolation
  CROSS_TENANT_DENIED: 'CROSS_TENANT_DENIED',
  TENANT_MISMATCH: 'TENANT_MISMATCH',
});

module.exports = TENANT;