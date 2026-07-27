/**
 * PATH       : src/jobs/runNotificationWorker.js
 * DATETIME   : 2026-07-27T16:40:00+07:00
 * VERSION    : 1.0.0-W4
 * DESCRIPTION: CLI một vòng claim — smoke PR-W4-3.
 * USAGE      : node src/jobs/runNotificationWorker.js
 */

'use strict';

require('dotenv').config();
const { runOnce } = require('./notificationClaim.worker');
const { prisma } = require('../lib/prisma.js');

async function main() {
  try {
    const out = await runOnce({ batchSize: 5, maxAttempts: 3, reclaimMinutes: 10 });
    console.log('[notif-worker] done', JSON.stringify(out));
  } catch (err) {
    console.error('[notif-worker] fatal', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();