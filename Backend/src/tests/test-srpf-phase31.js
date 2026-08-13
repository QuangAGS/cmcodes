/**
 * PATH       : Backend/tests/test-srpf-phase31.js  (hoặc chạy từ Backend/)
 * DATETIME   : 2026-08-11T18:15:00+07:00
 * VERSION    : 1.0.0
 * DESCRIPTION: Batch test cho SRPF Phase 3.1 — loadInstance + transaction wiring.
 *
 * Cách chạy (từ thư mục Backend):
 *   node src/tests/test-srpf-phase31.js
 *   node src/tests/test-srpf-phase31.js --case-id=<uuid>
 *
 * Biến môi trường (optional):
 *   SRPF_TEST_CASE_ID=<uuid>   // case bất kỳ (dùng cho load / not-registered)
 *   SRPF_TEST_DRAFT_ID=<uuid>  // case status DRAFT hoặc NEEDS_REVISION (để đi tới apply stub)
 *
 * Kỳ vọng Phase 3.1:
 * - load thành công / INSTANCE_NOT_FOUND
 * - PROCESS_NOT_REGISTERED
 * - INVALID_TRANSITION (terminal state)
 * - Sau register + case non-terminal → dừng ở apply hoặc bplWriter stub (đã vào TX)
 */

'use strict';

const path = require('path');

// Cho phép chạy từ Backend/ hoặc từ repo root
/*
const backendRoot = process.cwd().endsWith('Backend')
  ? process.cwd()
  : path.join(process.cwd(), 'Backend');

process.chdir(backendRoot);
*/
const loader = require('../shared/frameworks/srpf/storage/ProcessInstanceLoader');
const srpf = require('../shared/frameworks/srpf');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function getArg(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

const CASE_ID =
  getArg('case-id') ||
  process.env.SRPF_TEST_CASE_ID ||
  '162adbdb-3957-4dc3-bccf-eb49cbdc4a3c';

const DRAFT_ID =
  getArg('draft-id') ||
  process.env.SRPF_TEST_DRAFT_ID ||
  null;

const FAKE_ID = '00000000-0000-0000-0000-000000000000';

// ---------------------------------------------------------------------------
// Tiny assert helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const results = [];

function ok(name, detail) {
  passed += 1;
  results.push({ status: 'PASS', name, detail: detail || '' });
  console.log(`  ✅ PASS  ${name}${detail ? ' — ' + detail : ''}`);
}

function fail(name, detail) {
  failed += 1;
  results.push({ status: 'FAIL', name, detail: detail || '' });
  console.log(`  ❌ FAIL  ${name}${detail ? ' — ' + detail : ''}`);
}

async function expectThrow(name, fn, predicate) {
  try {
    await fn();
    fail(name, 'expected throw, but resolved');
  } catch (e) {
    const msg = e && (e.message || String(e));
    const code = e && e.code;
    if (predicate(e, msg, code)) {
      ok(name, msg);
    } else {
      fail(name, `unexpected error: ${msg} (code=${code})`);
    }
  }
}

async function expectOk(name, fn, predicate) {
  try {
    const value = await fn();
    if (predicate(value)) {
      ok(name, typeof value === 'object' && value.id ? `id=${value.id}` : '');
      return value;
    }
    fail(name, 'predicate returned false');
  } catch (e) {
    fail(name, e.message || String(e));
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function test1_loadSuccess() {
  console.log('\n[1] ProcessInstanceLoader.load — success');
  await expectOk(
    'load existing case',
    () => loader.load(CASE_ID),
    (inst) =>
      inst &&
      inst.id === CASE_ID &&
      inst.currentState &&
      inst._storage === 'onboarding_cases' &&
      inst.hasOwnProperty('_raw') &&
      !!inst._raw
  );
}

async function test2_loadNotFound() {
  console.log('\n[2] ProcessInstanceLoader.load — not found');
  await expectThrow(
    'load fake id → INSTANCE_NOT_FOUND',
    () => loader.load(FAKE_ID),
    (e, msg, code) =>
      code === 'SRPF.INSTANCE_NOT_FOUND' ||
      (msg && msg.includes('INSTANCE_NOT_FOUND'))
  );
}

async function test3_loadInvalidId() {
  console.log('\n[3] ProcessInstanceLoader.load — invalid id');
  await expectThrow(
    'load empty/invalid id',
    () => loader.load(''),
    (e, msg) => msg && msg.includes('INSTANCE_NOT_FOUND')
  );
}

async function test4_processNotRegistered() {
  console.log('\n[4] executeAction — process not registered');
  // Ensure clean registry for this process type if previously registered in same process
  // (Registry is in-memory Map; clear only this key if API existed — we just use a unique name)
  await expectThrow(
    'MEMBER_PROMOTE_UNREG not registered',
    () =>
      srpf.executeAction({
        processType: 'MEMBER_PROMOTE_UNREG',
        instanceId: CASE_ID,
        action: 'SUBMIT',
        actorContext: { role: 'SYSTEM_ADMIN', actor_id: 'test-actor' },
      }),
    (e, msg) => msg && msg.includes('PROCESS_NOT_REGISTERED')
  );
}

async function test5_registerAndInvalidTransition() {
  console.log('\n[5] executeAction — registered + terminal state → INVALID_TRANSITION');

  srpf.registry.register('MEMBER_PROMOTE', {
    processType: 'MEMBER_PROMOTE',
    revisionSupported: true,
    supportedStates: [
      'DRAFT',
      'SUBMITTED',
      'UNDER_REVIEW',
      'NEEDS_REVISION',
      'APPROVED',
      'REJECTED',
      'CANCELLED',
    ],
    contextGuards: {
      SUBMIT: ['ANY', 'SYSTEM_ADMIN', 'CLAN_ADMIN', 'MEMBER'],
      APPROVE: ['ANY', 'SYSTEM_ADMIN'],
      SAVE_DRAFT: ['ANY'],
    },
  });

  // CASE_ID from user test was APPROVED → SUBMIT must be invalid
  await expectThrow(
    'APPROVED + SUBMIT → INVALID_TRANSITION (or stop before if state differs)',
    () =>
      srpf.executeAction({
        processType: 'MEMBER_PROMOTE',
        instanceId: CASE_ID,
        action: 'SUBMIT',
        actorContext: { role: 'SYSTEM_ADMIN', actor_id: 'test-actor' },
      }),
    (e, msg) => {
      // Accept INVALID_TRANSITION (terminal) OR stub apply/bpl if case is non-terminal
      return (
        (msg && msg.includes('INVALID_TRANSITION')) ||
        (msg && msg.includes('not implemented'))
      );
    }
  );
}

async function test6_forbiddenRole() {
  console.log('\n[6] executeAction — ContextGuard forbidden role');

  // Re-register with strict roles (no ANY)
  srpf.registry.register('MEMBER_PROMOTE_STRICT', {
    processType: 'MEMBER_PROMOTE_STRICT',
    revisionSupported: true,
    supportedStates: ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'],
    contextGuards: {
      SUBMIT: ['CLAN_ADMIN'], // only CLAN_ADMIN
    },
  });

  await expectThrow(
    'role MEMBER not allowed for SUBMIT',
    () =>
      srpf.executeAction({
        processType: 'MEMBER_PROMOTE_STRICT',
        instanceId: CASE_ID,
        action: 'SUBMIT',
        actorContext: { role: 'MEMBER', actor_id: 'test-member' },
      }),
    (e, msg) => msg && (msg.includes('Forbidden') || msg.includes('FORBIDDEN'))
  );
}

async function test7_nonTerminalTowardStub() {
  console.log('\n[7] executeAction — non-terminal case → expect apply/BPL stub (entered TX path)');

  if (!DRAFT_ID) {
    console.log('  ⚠️  SKIP  set SRPF_TEST_DRAFT_ID or --draft-id=<uuid> (status DRAFT/NEEDS_REVISION/SUBMITTED)');
    results.push({
      status: 'SKIP',
      name: 'non-terminal toward stub',
      detail: 'no DRAFT_ID provided',
    });
    return;
  }

  // Ensure definition exists
  if (!srpf.registry.has('MEMBER_PROMOTE')) {
    srpf.registry.register('MEMBER_PROMOTE', {
      processType: 'MEMBER_PROMOTE',
      revisionSupported: true,
      supportedStates: [
        'DRAFT',
        'SUBMITTED',
        'UNDER_REVIEW',
        'NEEDS_REVISION',
        'APPROVED',
        'REJECTED',
        'CANCELLED',
      ],
      contextGuards: {
        SUBMIT: ['ANY'],
        START_REVIEW: ['ANY'],
        SAVE_DRAFT: ['ANY'],
      },
    });
  }

  const inst = await loader.load(DRAFT_ID);
  const state = inst.currentState || inst.status;

  // Pick a likely valid action for default transition table
  let action = 'SUBMIT';
  if (state === 'SUBMITTED') action = 'START_REVIEW';
  if (state === 'UNDER_REVIEW') action = 'APPROVE';
  if (state === 'NEEDS_REVISION') action = 'SUBMIT';
  if (state === 'DRAFT') action = 'SUBMIT';

  console.log(`  → using draft-id status=${state}, action=${action}`);

  await expectThrow(
    'reach skeleton apply or bplWriter inside/after TX start',
    () =>
      srpf.executeAction({
        processType: 'MEMBER_PROMOTE',
        instanceId: DRAFT_ID,
        action,
        actorContext: { role: 'SYSTEM_ADMIN', actor_id: 'test-actor' },
      }),
    (e, msg) =>
      (msg && msg.includes('not implemented')) ||
      (msg && msg.includes('INVALID_TRANSITION'))
  );
}

async function test8_saveDraftNoCorrelationPath() {
  console.log('\n[8] requiresCorrelation(SAVE_DRAFT) === false');
  const { requiresCorrelation, SRPF_ACTIONS } = srpf;
  if (requiresCorrelation(SRPF_ACTIONS.SAVE_DRAFT) === false) {
    ok('SAVE_DRAFT does not require correlation');
  } else {
    fail('SAVE_DRAFT does not require correlation', 'requiresCorrelation returned true');
  }
  if (requiresCorrelation(SRPF_ACTIONS.SUBMIT) === true) {
    ok('SUBMIT requires correlation');
  } else {
    fail('SUBMIT requires correlation', 'requiresCorrelation returned false');
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('====================================================');
  console.log(' SRPF Phase 3.1 — Batch Test');
  console.log(' CASE_ID  =', CASE_ID);
  console.log(' DRAFT_ID =', DRAFT_ID || '(not set — test 7 may skip)');
  console.log(' cwd      =', process.cwd());
  console.log('====================================================');

  await test1_loadSuccess();
  await test2_loadNotFound();
  await test3_loadInvalidId();
  await test4_processNotRegistered();
  await test5_registerAndInvalidTransition();
  await test6_forbiddenRole();
  await test7_nonTerminalTowardStub();
  await test8_saveDraftNoCorrelationPath();

  console.log('\n====================================================');
  console.log(` Result: ${passed} passed, ${failed} failed, ${results.filter((r) => r.status === 'SKIP').length} skipped`);
  console.log('====================================================');

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exitCode = 1;
});
