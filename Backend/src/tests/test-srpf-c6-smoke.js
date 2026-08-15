/**
 * PATH       : src/tests/test-srpf-c6-smoke.js
 * VERSION    : 1.0.0-C6
 * Run: node test-srpf-c6-smoke.js [--case-id=...]
 */
'use strict';
const path = require('path');
const srcRoot = path.resolve(__dirname, '..');
const opSrpf = require(path.join(srcRoot, 'modules/onboarding/srpf'));
const srpf = require(path.join(srcRoot, 'shared/frameworks/srpf'));

function arg(name, def = null) {
  const p = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(p));
  return hit ? hit.slice(p.length) : def;
}
const CASE_ID = arg('case-id', '7ae88300-faef-468b-a8c4-874a63f7f9b4');
let passed = 0, failed = 0;
function ok(label, cond, detail = '') {
  if (cond) { console.log('  ✅ PASS', label, detail || ''); passed++; }
  else { console.log('  ❌ FAIL', label, detail || ''); failed++; }
}

async function main() {
  console.log('=== SRPF C6 Smoke ===', CASE_ID);
  opSrpf.registerMemberPromote();
  opSrpf.registerMemberPromote();
  const def = srpf.registry.get('MEMBER_PROMOTE');
  ok('MEMBER_PROMOTE registered', !!def);
  ok('entryCondition', typeof def?.entryCondition === 'function');
  ok('openMemberPromoteInstance', typeof opSrpf.openMemberPromoteInstance === 'function');
  ok('PROCESS_TYPE', opSrpf.PROCESS_TYPE === 'MEMBER_PROMOTE');

  try {
    await srpf.executeAction({
      processType: 'NOT_A_REAL_PROCESS',
      instanceId: CASE_ID,
      action: 'SUBMIT',
      actorContext: { role: 'SYSTEM_ADMIN', actor_id: '00000000-0000-0000-0000-000000000001' },
    });
    ok('unknown process throws', false);
  } catch (e) {
    ok('unknown process throws', /NOT_REGISTERED|not registered/i.test(e.code + e.message), e.code || e.message);
  }

  try {
    const inst = await srpf.processInstanceLoader.load(CASE_ID);
    ok('load case', !!inst?.id, `status=${inst.status}`);
  } catch (e) { ok('load case', false, e.message); }

  try {
    await srpf.processInstanceLoader.load('00000000-0000-0000-0000-000000000000');
    ok('not found', false);
  } catch (e) {
    ok('not found', /NOT_FOUND|not found/i.test(e.code + e.message), e.code || e.message);
  }

  ok('SAVE_DRAFT no C', srpf.requiresCorrelation('SAVE_DRAFT') === false);
  ok('SUBMIT needs C', srpf.requiresCorrelation('SUBMIT') === true);
  console.log(`Result: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}
main().catch((e) => { console.error(e); process.exitCode = 1; });