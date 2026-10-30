/**
 * PATH       : src/shared/errors/codes/tenant.codes.js
 * DATETIME   : 2026-08-09T18:15:00+07:00
 * VERSION    : 1.1.0-OP-2
 * DESCRIPTION: Mã lỗi Tenant / Clan lifecycle (SEC điều khoản B).
 *              Pure constants only — zero business import.
 *              OP-2: bổ sung TENANT_ALREADY_ACTIVE + TENANT_NOT_ACTIVATABLE.
 *
 * CHANGELOG:
 * - 1.0.0-CED-1.1 (2026-07-21): Initial lifecycle + isolation codes.
 * - 1.1.0-OP-2   (2026-08-09): Thêm mã cho Tenant Activate.
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

  // OP-2 — Tenant Activate
  TENANT_ALREADY_ACTIVE: 'TENANT_ALREADY_ACTIVE',             // 409 — đã HOAT_DONG
  TENANT_NOT_ACTIVATABLE: 'TENANT_NOT_ACTIVATABLE',           // 409 — không ở trạng thái TAM_NGUNG

  // Isolation
  CROSS_TENANT_DENIED: 'CROSS_TENANT_DENIED',
  TENANT_MISMATCH: 'TENANT_MISMATCH',
});

module.exports = TENANT;