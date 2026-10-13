/**
 * PATH       : src/jobs/runMfoExpire.js
 * DATETIME   : 2026-10-10T21:32:00+07:00
 * USAGE      : node src/jobs/runMfoExpire.js
 */
'use strict';

require('dotenv').config();
const { runOnce } = require('./mfoExpire.worker');
const { prisma } = require('../lib/prisma.js');

async function main() {
  try {
    const out = await runOnce({ batchSize: 100 });
    console.log('[mfoExpire] done', JSON.stringify(out));
  } catch (err) {
    console.error('[mfoExpire] fatal', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
