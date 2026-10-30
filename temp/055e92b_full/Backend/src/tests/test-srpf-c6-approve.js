/**
 * PATH       : src/tests/test-srpf-c6-approve.js
 * Run: node test-srpf-c6-approve.js --case-id=... --actor-id=<Admin UUID>
 * 
 * Mục đích: Kiểm tra đường phê duyệt cuối (SUBMITTED → START_REVIEW → APPROVE) + side-effect members.status = CHINH_THUC.
    Nó kiểm tra gì:
    Nếu case đang SUBMITTED → tự gọi START_REVIEW trước.
    Bắt buộc status = UNDER_REVIEW rồi mới APPROVE.
    Sau APPROVE: case = APPROVED và member = CHINH_THUC.
    Cần --actor-id (Admin UUID) vì Context Guard yêu cầu role admin.

    Khi nào chạy: Kiểm tra cuối cùng của OP-A (DU_BI → CHINH_THUC). Chỉ chạy khi Base Profile đã đủ (nếu thiếu birth_* / generation CLAN_SETUP sẽ fail đúng theo BP hard gate).
 */
'use strict';
const path = require('path');
const srcRoot = path.resolve(__dirname, '..');
const opSrpf = require(path.join(srcRoot, 'modules/onboarding/srpf'));
const srpf = require(path.join(srcRoot, 'shared/frameworks/srpf'));
const { prisma } = require(path.join(srcRoot, 'lib/prisma.js'));

function arg(name, def = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : def;
}
const CASE_ID = arg('case-id');
const ACTOR_ID = arg('actor-id');

async function main() {
  if (!CASE_ID || !ACTOR_ID) { console.error('Need --case-id --actor-id'); process.exitCode = 1; return; }
  opSrpf.registerMemberPromote();
  const before = await srpf.processInstanceLoader.load(CASE_ID);
  console.log('[BEFORE]', { status: before.status, member: before.primary_member_id });
  const actor = { role: 'SYSTEM_ADMIN', actor_id: ACTOR_ID, actor_type: 'USER', tenant_id: before.tenant_id };

  if (before.status === 'SUBMITTED') {
    const r1 = await srpf.executeAction({
      processType: 'MEMBER_PROMOTE', instanceId: CASE_ID, action: 'START_REVIEW', payload: {}, actorContext: actor,
    });
    console.log('[START_REVIEW]', { status: r1.instance.status, correlationId: r1.correlationId });
  }
  const mid = await srpf.processInstanceLoader.load(CASE_ID);
  if (mid.status !== 'UNDER_REVIEW') { console.error('Need UNDER_REVIEW', mid.status); process.exitCode = 1; return; }

  const r2 = await srpf.executeAction({
    processType: 'MEMBER_PROMOTE', instanceId: CASE_ID, action: 'APPROVE', payload: {}, actorContext: actor,
  });
  console.log('[APPROVE]', { status: r2.instance.status, correlationId: r2.correlationId });
  const after = await srpf.processInstanceLoader.load(CASE_ID);
  const member = await prisma.members.findUnique({
    where: { id: after.primary_member_id },
    select: { id: true, status: true, full_name: true },
  });
  console.log('[MEMBER]', member);
  if (after.status === 'APPROVED' && member?.status === 'CHINH_THUC') console.log('PASS');
  else { console.error('FAIL'); process.exitCode = 1; }
  if (prisma.$disconnect) await prisma.$disconnect();
}
main().catch((e) => { console.error('FAIL', e.code, e.message); process.exitCode = 1; });