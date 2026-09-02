/**
 * PATH       : src/modules/profile/a01Debug.js
 * DATETIME   : 2026-09-02T08:45:00+07:00
 * VERSION    : 1.0.0-A01-SMOKE
 * DESCRIPTION: Log A01 khi A01_DEBUG=1. Không dùng trên prod mặc định.
 */

'use strict';

function a01On() {
  return process.env.A01_DEBUG === '1' || process.env.A01_DEBUG === 'true';
}

function a01Log(step, data) {
  if (!a01On()) return;
  const slim = data && typeof data === 'object'
    ? JSON.stringify(data, null, 2).slice(0, 4000)
    : String(data);
  console.log(`[A01_DEBUG] ${step}\n${slim}`);
}

module.exports = { a01On, a01Log };
