/**
 * PATH       : src/tests/test-srpf-phase32-35.js
 * DATETIME   : 2026-08-12T15:35:00+07:00
 * VERSION    : 1.0.0
 * DESCRIPTION: Integration test Phase 3.2 + 3.5 — apply persist + BPL write.
 *
 * Chạy từ thư mục chứa file test (src/tests):
 *   node test-srpf-phase32-35.js
 *
 * Hoặc:
 *   node test-srpf-phase32-35.js --draft-id=<uuid>
 *
 * CẢNH BÁO: Case NEEDS_REVISION sẽ chuyển thành SUBMITTED nếu thành công.
 */

'use strict';

const path = require('path');

// Resolve srpf from src/shared/... regardless of cwd under src/
const srcRoot = path.resolve(__dirname, '..');
const srpf = require(path.join(srcRoot, 'shared/frameworks/srpf'));

function getArg(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

const DRAFT_ID =
  getArg('draft-id') ||
  process.env.SRPF_TEST_DRAFT_ID ||
  '64915078-d130-4740-8bec-aae5bf5cf968';

async function main() {
  console.log('====================================================');
  console.log(' SRPF Phase 3.2 + 3.5 — Integration Test');
  console.log(' DRAFT_ID =', DRAFT_ID);
  console.log(' srcRoot  =', srcRoot);
  console.log('====================================================');

  // Register minimal definition
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
    },
  });

  // Pre-load to show before state
  const before = await srpf.processInstanceLoader.load(DRAFT_ID);
  console.log('\n[BEFORE]', {
    id: before.id,
    status: before.status,
    submitted_at: before.submitted_at,
    tenant_id: before.tenant_id,
  });

  if (before.status !== 'NEEDS_REVISION' && before.status !== 'DRAFT') {
    console.log(
      `\n⚠️  Status hiện tại là "${before.status}". Transition SUBMIT có thể INVALID_TRANSITION.`
    );
    console.log('   Nên dùng case NEEDS_REVISION hoặc DRAFT.\n');
  }

  try {
    const result = await srpf.executeAction({
      processType: 'MEMBER_PROMOTE',
      instanceId: DRAFT_ID,
      action: 'SUBMIT',
      payload: {},
      actorContext: {
        role: 'SYSTEM_ADMIN',
        actor_id: 'test-actor-phase32',
        actor_type: 'USER',
        tenant_id: before.tenant_id || null,
      },
    });

    console.log('\n[AFTER executeAction] SUCCESS');
    console.log({
      correlationId: result.correlationId,
      status: result.instance.status,
      currentState: result.instance.currentState,
      submitted_at: result.instance.submitted_at,
      changed_by: result.instance.changed_by,
    });

    // Reload from DB to confirm persist
    const after = await srpf.processInstanceLoader.load(DRAFT_ID);
    console.log('\n[RELOAD from DB]', {
      id: after.id,
      status: after.status,
      submitted_at: after.submitted_at,
      changed_by: after.changed_by,
    });

    if (after.status === 'SUBMITTED' && result.correlationId) {
      console.log('\n✅ PASS — status=SUBMITTED + correlationId present');
      console.log('   Kiểm tra thêm SQL:');
      console.log(
        `   SELECT correlation_id, process_type, actor_id, process_status FROM business_process_logs WHERE correlation_id = '${result.correlationId}';`
      );
    } else {
      console.log('\n❌ UNEXPECTED — status or correlationId missing');
      process.exitCode = 1;
    }
  } catch (e) {
    console.error('\n❌ FAIL executeAction');
    console.error(' message:', e.message);
    if (e.code) console.error(' code:', e.code);
    if (e.stack) console.error(e.stack.split('\n').slice(0, 8).join('\n'));
    process.exitCode = 1;
  }
}

main();