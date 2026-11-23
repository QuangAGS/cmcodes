/**
 * ============================================================================
 * PATH       : src/jobs/sandboxLifecycle.worker.js
 * DATETIME   : 2026-11-22T23:10:00+07:00
 * VERSION    : 1.0.0-ISO29148-UAT-IMP6-SANDBOX
 * DESCRIPTION:
 * - Tác vụ định kỳ kiểm tra vòng đời Sandbox 30 ngày + 30 ngày đệm TAM_NGUNG:
 *   + Nhắc hạn trước 7 ngày & 3 ngày.
 *   + Quá 30 ngày Sandbox -> chuyển TAM_NGUNG (+30 ngày đệm).
 *   + Quá 30 ngày đệm TAM_NGUNG -> chuyển NGUNG_HAN & xóa cứng dữ liệu dùng thử.
 * ============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

'use strict';

const {
  runSandboxLifecycleSweep,
  SANDBOX_TRIAL_DAYS,
  SANDBOX_BUFFER_DAYS,
} = require('../modules/tenants/sandboxLifecycle.service');

const DEFAULTS = {
  batchSize: 200,
  trialDays: SANDBOX_TRIAL_DAYS,
  bufferDays: SANDBOX_BUFFER_DAYS,
};

async function runOnce(options = {}) {
  const out = await runSandboxLifecycleSweep({
    batchSize: options.batchSize || DEFAULTS.batchSize,
    now: options.now || new Date(),
  });
  console.log(
    `[sandboxLifecycleWorker] scanned=${out.scanned} processed=${out.results.length}`
  );
  return out;
}

module.exports = {
  runOnce,
  DEFAULTS,
};
