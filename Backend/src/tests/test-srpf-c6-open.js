/**
 * PATH       : src/tests/test-srpf-c6-open.js
 * Run: node test-srpf-c6-open.js --member-id= --user-id= --tenant-id= [--case-type=MEMBER_JOIN]
 */
'use strict';
const path = require('path');
const srcRoot = path.resolve(__dirname, '..');
const opSrpf = require(path.join(srcRoot, 'modules/onboarding/srpf'));

function arg(name, def = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : def;
}
const memberId = arg('member-id');
const userId = arg('user-id');
const tenantId = arg('tenant-id');
const caseType = arg('case-type', 'MEMBER_JOIN');

async function main() {
  if (!memberId || !userId || !tenantId) {
    console.error('Need --member-id --user-id --tenant-id');
    process.exitCode = 1;
    return;
  }
  const input = { memberId, userId, tenantId, caseType };
  console.log('=== open #1 ===');
  const r1 = await opSrpf.openMemberPromoteInstance(input);
  console.log({ created: r1.created, caseId: r1.caseId, correlationId: r1.correlationId, status: r1.instance.status });
  console.log('=== open #2 ===');
  const r2 = await opSrpf.openMemberPromoteInstance(input);
  console.log({ created: r2.created, caseId: r2.caseId, same: r1.caseId === r2.caseId });
  if (r1.caseId === r2.caseId && r2.created === false) console.log('PASS');
  else { console.error('CHECK'); process.exitCode = 1; }
}
main().catch((e) => { console.error('FAIL', e.code, e.message); process.exitCode = 1; });