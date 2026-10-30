/**
 * PATH       : src/tests/test-srpf-submit-once.js
 * DATETIME   : 2026-08-13T08:55:00+07:00
 * VERSION    : 1.0.0
 * DESCRIPTION: One-shot SRPF SUBMIT test.
 *              Giả định bạn đã SQL-reset case (status=NEEDS_REVISION, primary_member_id, user DA_DUYET).
 *
 * Chạy (từ src/tests):
 *   node test-srpf-submit-once.js --case-id=f3a37e78-01f4-4858-ae46-0857c08c5124
 *
 * Env:
 *   SRPF_TEST_CASE_ID=<uuid>
 */

'use strict';

const path = require('path');

const srcRoot = path.resolve(__dirname, '..');
const srpf = require(path.join(srcRoot, 'shared/frameworks/srpf'));

function getArg(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

const CASE_ID =
  getArg('case-id') ||
  process.env.SRPF_TEST_CASE_ID ||
  'f3a37e78-01f4-4858-ae46-0857c08c5124';

async function main() {
  console.log('=== SRPF one-shot SUBMIT ===');
  console.log('case-id:', CASE_ID);

  const before = await srpf.processInstanceLoader.load(CASE_ID);
  console.log('[BEFORE]', {
    status: before.status,
    case_type: before.case_type,
    primary_member_id: before.primary_member_id,
    user_id: before.user_id,
    tenant_id: before.tenant_id,
  });

  if (before.status !== 'NEEDS_REVISION' && before.status !== 'DRAFT') {
    console.error(
      `ABORT: case.status=${before.status} (cần NEEDS_REVISION hoặc DRAFT). Hãy SQL update trước.`
    );
    process.exitCode = 1;
    return;
  }

  if (!before.primary_member_id) {
    console.error('ABORT: primary_member_id is null. Hãy SQL gắn member DU_BI trước.');
    process.exitCode = 1;
    return;
  }

  const result = await srpf.executeAction({
    processType: 'MEMBER_PROMOTE',
    instanceId: CASE_ID,
    action: 'SUBMIT',
    payload: {},
    actorContext: {
      role: 'SYSTEM_ADMIN',
      actor_id: 'test-submit-once',
      actor_type: 'USER',
      tenant_id: before.tenant_id || null,
    },
  });

  console.log('[AFTER executeAction]', {
    status: result.instance.status,
    currentState: result.instance.currentState,
    correlationId: result.correlationId,
    submitted_at: result.instance.submitted_at,
    changed_by: result.instance.changed_by,
  });

  const after = await srpf.processInstanceLoader.load(CASE_ID);
  console.log('[RELOAD DB]', {
    status: after.status,
    submitted_at: after.submitted_at,
    primary_member_id: after.primary_member_id,
  });

  if (after.status === 'SUBMITTED' && result.correlationId) {
    console.log('PASS — SUBMITTED + correlationId');
    console.log(
      `SQL BPL: SELECT correlation_id, process_type, actor_id, process_status FROM business_process_logs WHERE correlation_id = '${result.correlationId}';`
    );
  } else {
    console.error('FAIL — unexpected status or missing correlationId');
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('FAIL:', e.message);
  if (e.code) console.error('code:', e.code);
  process.exitCode = 1;
});
