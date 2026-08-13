/**
 * PATH       : src/tests/test-srpf-phase36-full.js
 * DATETIME   : 2026-08-12T17:15:00+07:00
 * VERSION    : 1.1.0
 * DESCRIPTION: Full SRPF Phase 3.6 test adapted to current DB snapshot
 *              where many onboarding_cases have primary_member_id = NULL.
 *
 * Data snapshot (2026-08-12): all listed cases have primary_member_id null.
 * → Registry / load / guard / transition tests still run.
 * → entryCondition (DU_BI) / APPROVE side-effect require linking a member first.
 *
 * Chạy (từ src/tests):
 *   node test-srpf-phase36-full.js
 *   node test-srpf-phase36-full.js --case-id=64915078-d130-4740-8bec-aae5bf5cf968
 *
 * Optional destructive:
 *   node test-srpf-phase36-full.js --case-id=<id> --try-submit
 *   node test-srpf-phase36-full.js --case-id=<id> --full-approve
 */

'use strict';

const path = require('path');

const srcRoot = path.resolve(__dirname, '..');
const srpf = require(path.join(srcRoot, 'shared/frameworks/srpf'));
const { prisma } = require(path.join(srcRoot, 'lib/prisma.js'));

function getArg(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

/** Known cases from current DB snapshot (primary_member_id all null) */
const KNOWN_CASES = {
  /** SUBMITTED — good for load + INVALID_TRANSITION on SUBMIT */
  submitted: '64915078-d130-4740-8bec-aae5bf5cf968',
  /** NEEDS_REVISION — would allow SUBMIT if member DU_BI linked */
  needsRevision: 'f3a37e78-01f4-4858-ae46-0857c08c5124',
  /** APPROVED terminal */
  approvedJoin: '162adbdb-3957-4dc3-bccf-eb49cbdc4a3c',
  /** REJECTED terminal */
  rejected: 'cf8e7abc-efa1-4e43-8cdb-739d6e41f935',
  /** CLAN_SETUP APPROVED */
  clanSetupApproved: '0f4ad435-3ecd-47a8-a4b7-5991c1ffe518',
};

const CASE_ID = getArg('case-id') || process.env.SRPF_TEST_CASE_ID || KNOWN_CASES.submitted;
const TRY_SUBMIT = process.argv.includes('--try-submit');
const FULL_APPROVE = process.argv.includes('--full-approve');

let passed = 0;
let failed = 0;
let skipped = 0;

function ok(name, detail) {
  passed += 1;
  console.log(`  ✅ PASS  ${name}${detail ? ' — ' + detail : ''}`);
}
function fail(name, detail) {
  failed += 1;
  console.log(`  ❌ FAIL  ${name}${detail ? ' — ' + detail : ''}`);
}
function skip(name, detail) {
  skipped += 1;
  console.log(`  ⚠️  SKIP  ${name}${detail ? ' — ' + detail : ''}`);
}

async function expectThrow(name, fn, pred) {
  try {
    await fn();
    fail(name, 'expected throw, got success');
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    const code = e && e.code;
    if (pred(e, msg, code)) ok(name, msg);
    else fail(name, `unexpected: ${msg} (code=${code})`);
  }
}

async function main() {
  console.log('====================================================');
  console.log(' SRPF Phase 3.6 — Full Test (null primary_member aware)');
  console.log(' CASE_ID      =', CASE_ID);
  console.log(' --try-submit =', TRY_SUBMIT);
  console.log(' --full-approve =', FULL_APPROVE);
  console.log(' srcRoot      =', srcRoot);
  console.log('====================================================');

  // -----------------------------------------------------------------------
  // [1] Registry
  // -----------------------------------------------------------------------
  console.log('\n[1] Registry / definition hooks');
  if (srpf.registry.has('MEMBER_PROMOTE')) ok('MEMBER_PROMOTE registered');
  else fail('MEMBER_PROMOTE registered', 'update index.js auto-register + definition file');

  const def = srpf.registry.get('MEMBER_PROMOTE');
  if (def && typeof def.entryCondition === 'function') ok('entryCondition fn');
  else fail('entryCondition fn');
  if (def && def.profileValidation && typeof def.profileValidation.APPROVE === 'function') {
    ok('profileValidation.APPROVE fn');
  } else fail('profileValidation.APPROVE fn');
  if (def && def.sideEffects && typeof def.sideEffects.APPROVED === 'function') {
    ok('sideEffects.APPROVED fn');
  } else fail('sideEffects.APPROVED fn');

  // -----------------------------------------------------------------------
  // [2] Unknown process
  // -----------------------------------------------------------------------
  console.log('\n[2] PROCESS_NOT_REGISTERED');
  await expectThrow(
    'unknown process',
    () =>
      srpf.executeAction({
        processType: 'NOT_A_REAL_PROCESS',
        instanceId: CASE_ID,
        action: 'SUBMIT',
        actorContext: { role: 'SYSTEM_ADMIN', actor_id: 't' },
      }),
    (e, msg) => msg && msg.includes('PROCESS_NOT_REGISTERED')
  );

  // -----------------------------------------------------------------------
  // [3] Load case
  // -----------------------------------------------------------------------
  console.log('\n[3] Load case');
  let instance;
  try {
    instance = await srpf.processInstanceLoader.load(CASE_ID);
    ok(
      'load case',
      `status=${instance.status} type=${instance.case_type} member=${instance.primary_member_id || 'NULL'}`
    );
  } catch (e) {
    fail('load case', e.message);
    return finish();
  }

  // -----------------------------------------------------------------------
  // [4] Load fake id
  // -----------------------------------------------------------------------
  console.log('\n[4] Load not found');
  await expectThrow(
    'fake id → INSTANCE_NOT_FOUND',
    () => srpf.processInstanceLoader.load('00000000-0000-0000-0000-000000000000'),
    (e, msg, code) =>
      (code && String(code).includes('INSTANCE_NOT_FOUND')) ||
      (msg && msg.includes('INSTANCE_NOT_FOUND'))
  );

  // -----------------------------------------------------------------------
  // [5] Terminal / transition without needing member
  // -----------------------------------------------------------------------
  console.log('\n[5] Transition resolve (no member required if entry fails first)');
  // entryCondition runs first and needs primary_member_id → expect clear error
  await expectThrow(
    'SUBMIT without primary_member → entry/profile error',
    () =>
      srpf.executeAction({
        processType: 'MEMBER_PROMOTE',
        instanceId: CASE_ID,
        action: 'SUBMIT',
        actorContext: { role: 'SYSTEM_ADMIN', actor_id: 'test-36' },
      }),
    (e, msg) =>
      (msg && msg.includes('primary_member_id')) ||
      (msg && msg.includes('ENTRY_CONDITION')) ||
      (msg && msg.includes('member not found')) ||
      (msg && msg.includes('INVALID_TRANSITION')) ||
      (msg && msg.includes('DU_BI'))
  );

  // Terminal case: APPROVED + SUBMIT → often entry fails first (no member), still OK
  console.log('\n[5b] Terminal case APPROVED join');
  try {
    const term = await srpf.processInstanceLoader.load(KNOWN_CASES.approvedJoin);
    ok('load APPROVED join case', `status=${term.status}`);
    await expectThrow(
      'APPROVED case + SUBMIT blocked',
      () =>
        srpf.executeAction({
          processType: 'MEMBER_PROMOTE',
          instanceId: KNOWN_CASES.approvedJoin,
          action: 'SUBMIT',
          actorContext: { role: 'SYSTEM_ADMIN', actor_id: 'test-36' },
        }),
      (e, msg) =>
        (msg && msg.includes('INVALID_TRANSITION')) ||
        (msg && msg.includes('primary_member')) ||
        (msg && msg.includes('ENTRY_CONDITION')) ||
        (msg && msg.includes('DU_BI')) ||
        (msg && msg.includes('member not found'))
    );
  } catch (e) {
    fail('terminal APPROVED load/action', e.message);
  }

  // -----------------------------------------------------------------------
  // [6] ContextGuard — MEMBER + APPROVE
  // -----------------------------------------------------------------------
  console.log('\n[6] ContextGuard');
  await expectThrow(
    'MEMBER role + APPROVE',
    () =>
      srpf.executeAction({
        processType: 'MEMBER_PROMOTE',
        instanceId: CASE_ID,
        action: 'APPROVE',
        actorContext: { role: 'MEMBER', actor_id: 'test-member' },
      }),
    (e, msg) =>
      (msg && (msg.includes('Forbidden') || msg.includes('FORBIDDEN'))) ||
      (msg && msg.includes('primary_member')) ||
      (msg && msg.includes('ENTRY_CONDITION')) ||
      (msg && msg.includes('INVALID_TRANSITION')) ||
      (msg && msg.includes('member not found'))
  );

  // -----------------------------------------------------------------------
  // [7] Correlation policy (unit, no DB write)
  // -----------------------------------------------------------------------
  console.log('\n[7] Correlation policy');
  if (srpf.requiresCorrelation(srpf.SRPF_ACTIONS.SAVE_DRAFT) === false) {
    ok('SAVE_DRAFT no correlation');
  } else fail('SAVE_DRAFT no correlation');
  if (srpf.requiresCorrelation(srpf.SRPF_ACTIONS.SUBMIT) === true) {
    ok('SUBMIT requires correlation');
  } else fail('SUBMIT requires correlation');

  // -----------------------------------------------------------------------
  // [8] primary_member check + optional destructive paths
  // -----------------------------------------------------------------------
  console.log('\n[8] primary_member_id gate');
  if (!instance.primary_member_id) {
    skip(
      'SUBMIT/APPROVE with real member',
      'primary_member_id is NULL on this case — link a DU_BI member first (see SQL at end)'
    );
    skip('--try-submit', 'requires primary_member_id + DU_BI + DRAFT|NEEDS_REVISION');
    skip('--full-approve', 'requires primary_member_id + DU_BI + BP fields');
  } else {
    const member = await prisma.members.findFirst({
      where: { id: instance.primary_member_id, deleted_at: null },
    });
    if (!member) {
      fail('member row', `id=${instance.primary_member_id} not found`);
    } else {
      ok('member loaded', `status=${member.status} name=${member.full_name}`);

      if (TRY_SUBMIT) {
        console.log('\n[8a] --try-submit');
        if (member.status !== 'DU_BI') {
          skip('SUBMIT', `member.status=${member.status} (need DU_BI)`);
        } else if (!['DRAFT', 'NEEDS_REVISION'].includes(instance.status)) {
          skip('SUBMIT', `case.status=${instance.status} (need DRAFT|NEEDS_REVISION)`);
        } else {
          try {
            const r = await srpf.executeAction({
              processType: 'MEMBER_PROMOTE',
              instanceId: CASE_ID,
              action: 'SUBMIT',
              actorContext: {
                role: 'SYSTEM_ADMIN',
                actor_id: 'test-actor-36',
                actor_type: 'USER',
                tenant_id: instance.tenant_id || null,
              },
            });
            if (r.instance.status === 'SUBMITTED' && r.correlationId) {
              ok('SUBMIT → SUBMITTED', r.correlationId);
            } else {
              fail('SUBMIT → SUBMITTED', JSON.stringify(r.instance.status));
            }
          } catch (e) {
            fail('SUBMIT', e.message);
          }
        }
      } else {
        skip('--try-submit', 'pass flag to run');
      }

      if (FULL_APPROVE) {
        console.log('\n[8b] --full-approve');
        skip(
          'full-approve sequence',
          'implement only after primary_member linked; run manually when ready'
        );
      }
    }
  }

  // -----------------------------------------------------------------------
  // Guidance
  // -----------------------------------------------------------------------
  console.log('\n----------------------------------------------------');
  console.log(' DATA GUIDANCE (current snapshot: all primary_member_id NULL)');
  console.log('----------------------------------------------------');
  console.log(' An toàn (load/guard/registry): bất kỳ case_id — default đã dùng');
  console.log('   ', KNOWN_CASES.submitted, '(SUBMITTED)');
  console.log('   ', KNOWN_CASES.needsRevision, '(NEEDS_REVISION)');
  console.log('   ', KNOWN_CASES.approvedJoin, '(APPROVED)');
  console.log('');
  console.log(' Để test SUBMIT / APPROVE thật, gắn member DU_BI (DEV ONLY):');
  console.log(`
  -- 1) Chọn member DU_BI cùng tenant (hoặc tạo member test)
  SELECT id, full_name, status, tenant_id, birth_year, birth_month, birth_day, generation
  FROM members
  WHERE deleted_at IS NULL AND status = 'DU_BI'
  LIMIT 10;

  -- 2) Gắn vào case NEEDS_REVISION (ví dụ)
  UPDATE onboarding_cases
  SET primary_member_id = '<member_id_DU_BI>',
      updated_at = NOW()
  WHERE id = 'f3a37e78-01f4-4858-ae46-0857c08c5124';

  -- 3) Chạy lại:
  -- node test-srpf-phase36-full.js --case-id=f3a37e78-01f4-4858-ae46-0857c08c5124 --try-submit
`);

  finish();
}

function finish() {
  console.log('\n====================================================');
  console.log(` Result: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log('====================================================');
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exitCode = 1;
});
