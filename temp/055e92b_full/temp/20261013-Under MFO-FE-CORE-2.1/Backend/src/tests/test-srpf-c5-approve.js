'use strict';
const path = require('path');
const srcRoot = path.resolve(__dirname, '..');
const srpf = require(path.join(srcRoot, 'shared/frameworks/srpf'));

const CASE_ID = process.argv.find(a => a.startsWith('--case-id='))?.split('=')[1]
  || '44c8736e-5eeb-4a0e-b7c5-ad043fe8819a';

// UUID user SYSTEM_ADMIN / CLAN_ADMIN thật trên DB của bạn
const ACTOR_ID = process.argv.find(a => a.startsWith('--actor-id='))?.split('=')[1]
  || '1f5f6437-5453-4cd3-bbc7-29ec98c8e800'; // đổi nếu cần

async function main() {
  const before = await srpf.processInstanceLoader.load(CASE_ID);
  console.log('[BEFORE]', {
    status: before.status,
    member: before.primary_member_id,
    tenant: before.tenant_id,
  });

  const actor = {
    role: 'SYSTEM_ADMIN',
    actor_id: ACTOR_ID,
    actor_type: 'USER',
    tenant_id: before.tenant_id,
  };

  if (before.status === 'SUBMITTED') {
    const r1 = await srpf.executeAction({
      processType: 'MEMBER_PROMOTE',
      instanceId: CASE_ID,
      action: 'START_REVIEW',
      payload: {},
      actorContext: actor,
    });
    console.log('[AFTER START_REVIEW]', {
      status: r1.instance.status,
      correlationId: r1.correlationId,
    });
  }

  const mid = await srpf.processInstanceLoader.load(CASE_ID);
  if (mid.status !== 'UNDER_REVIEW') {
    console.error('ABORT: need UNDER_REVIEW, got', mid.status);
    process.exitCode = 1;
    return;
  }

  const r2 = await srpf.executeAction({
    processType: 'MEMBER_PROMOTE',
    instanceId: CASE_ID,
    action: 'APPROVE',
    payload: {}, // optional: { role: 'THANH_VIEN' }
    actorContext: actor,
  });

  console.log('[AFTER APPROVE]', {
    status: r2.instance.status,
    correlationId: r2.correlationId,
  });

  const after = await srpf.processInstanceLoader.load(CASE_ID);
  console.log('[RELOAD case]', { status: after.status });

  // Kiểm tra member — dùng prisma qua require app
  const { prisma } = require(path.join(srcRoot, 'lib/prisma.js'));
  const member = await prisma.members.findUnique({
    where: { id: after.primary_member_id },
    select: { id: true, status: true, full_name: true },
  });
  console.log('[MEMBER]', member);

  if (after.status === 'APPROVED' && member?.status === 'CHINH_THUC') {
    console.log('PASS — case APPROVED + member CHINH_THUC');
  } else {
    console.error('FAIL — expected APPROVED + CHINH_THUC');
    process.exitCode = 1;
  }

  await prisma.$disconnect?.();
}

main().catch((e) => {
  console.error('FAIL', e.code || '', e.message);
  process.exitCode = 1;
});