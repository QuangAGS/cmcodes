/**
 * PATH       : src/tests/test-srpf-c6-submit-once.js
 * Run: node test-srpf-c6-submit-once.js --case-id=7ae88300-faef-468b-a8c4-874a63f7f9b4
 * 
 * Mục đích: Kiểm tra một bước SUBMIT của OP (DRAFT | NEEDS_REVISION → SUBMITTED).
    Nó kiểm tra gì:
    Load case hiện tại, bắt buộc status là DRAFT hoặc NEEDS_REVISION.
    Gọi executeAction(SUBMIT).
    Sau đó status = SUBMITTED và có correlationId (C-action mới).
    In gợi ý SQL để đối soát BPL theo correlation_id.

    Khi nào chạy: Sau khi case đã ở DRAFT (thường sau open), muốn verify SUBMIT + BPL/notif path trước khi đi tiếp review/approve.
 */
'use strict';
const path = require('path');
const srcRoot = path.resolve(__dirname, '..');
const opSrpf = require(path.join(srcRoot, 'modules/onboarding/srpf'));
const srpf = require(path.join(srcRoot, 'shared/frameworks/srpf'));

function arg(name, def = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : def;
}
const CASE_ID = arg('case-id');
const ACTOR_ID = arg('actor-id', null);

async function main() {
  if (!CASE_ID) { console.error('Need --case-id'); process.exitCode = 1; return; }
  opSrpf.registerMemberPromote();
  console.log('=== C6 SUBMIT ===', CASE_ID);
  const before = await srpf.processInstanceLoader.load(CASE_ID);
  console.log('[BEFORE]', { status: before.status, primary_member_id: before.primary_member_id, user_id: before.user_id });
  if (!['DRAFT', 'NEEDS_REVISION'].includes(before.status)) {
    console.error('Need DRAFT|NEEDS_REVISION'); process.exitCode = 1; return;
  }
  if (!before.primary_member_id) { console.error('No primary_member_id'); process.exitCode = 1; return; }

  const result = await srpf.executeAction({
    processType: 'MEMBER_PROMOTE',
    instanceId: CASE_ID,
    action: 'SUBMIT',
    payload: {},
    actorContext: {
      role: 'SYSTEM_ADMIN',
      actor_id: ACTOR_ID || before.user_id,
      actor_type: 'USER',
      tenant_id: before.tenant_id || null,
    },
  });
  console.log('[AFTER]', { status: result.instance.status, correlationId: result.correlationId });
  const after = await srpf.processInstanceLoader.load(CASE_ID);
  console.log('[RELOAD]', { status: after.status });
  if (after.status === 'SUBMITTED' && result.correlationId) {
    console.log('PASS');
    console.log(`SQL BPL: SELECT correlation_id, process_type, process_status FROM business_process_logs WHERE correlation_id = '${result.correlationId}';`);
  } else { console.error('FAIL'); process.exitCode = 1; }
}
main().catch((e) => { console.error('FAIL', e.code, e.message); process.exitCode = 1; });