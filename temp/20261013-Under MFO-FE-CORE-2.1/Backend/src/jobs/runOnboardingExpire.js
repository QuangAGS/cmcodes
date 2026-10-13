/**
 * PATH       : src/jobs/runOnboardingExpire.js
 * DATETIME   : 2026-07-27T18:30:00+07:00
 * VERSION    : 1.0.0-W5
 * USAGE      : node src/jobs/runOnboardingExpire.js
 */

'use strict';

require('dotenv').config();
const { runOnce } = require('./onboardingExpire.worker');
const { prisma } = require('../lib/prisma.js');

async function main() {
  try {
    const out = await runOnce({ batchSize: 100, expireDays: 30 });
    console.log('[onboardingExpire] done', JSON.stringify(out));
  } catch (err) {
    console.error('[onboardingExpire] fatal', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();