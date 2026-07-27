/**
 * PATH       : src/jobs/runTempUnlock.js
 * DATETIME   : 2026-07-27T19:05:00+07:00
 * VERSION    : 1.0.0-W5
 * USAGE      : node src/jobs/runTempUnlock.js
 */

'use strict';

require('dotenv').config();
const { runOnce } = require('./tempUnlock.worker');
const { prisma } = require('../lib/prisma.js');

async function main() {
  try {
    const out = await runOnce({ batchSize: 100 });
    console.log('[tempUnlock] done', JSON.stringify(out));
  } catch (err) {
    console.error('[tempUnlock] fatal', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();