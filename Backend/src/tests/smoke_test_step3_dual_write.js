/**
 * PATH       : src/tests/smoke_test_step3_dual_write.js
 * DATETIME   : 2026-11-02T16:10:00+07:00
 * DESCRIPTION:
 * Smoke test Bước 3 — Fix unique constraint:
 * - Address full_address unique mỗi lần chạy.
 * - correlation_id unique.
 */

'use strict';

const prismaModule = require('../lib/prisma.js');
const { prisma, basePrisma, withTransaction } = prismaModule;
const memberService = require('../modules/members/member.service.js');
const onboardingService = require('../modules/onboarding/onboarding.service.js');

const db = basePrisma || prisma;

function uid() {
  return Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

async function runSmokeTests() {
  console.log('=== BẮT ĐẦU SMOKE TEST BƯỚC 3: DUAL-WRITE PARENTAGES ===\n');

  const tenant = await db.tenants.findFirst({
    where: { deleted_at: null, status: 'HOAT_DONG' },
    select: { id: true, name: true },
  });
  if (!tenant) throw new Error('Không tìm thấy tenant.');
  const tenantId = tenant.id;
  console.log(`[SETUP] Tenant: ${tenant.name} (${tenantId})`);

  const adminUser = await db.users.findFirst({
    where: { tenant_id: tenantId, role: { in: ['CLAN_ADMIN', 'SYSTEM_ADMIN'] }, deleted_at: null },
    select: { id: true, role: true },
  });
  if (!adminUser) throw new Error('Không tìm thấy admin.');
  const actorId = adminUser.id;
  console.log(`[SETUP] Actor: ${actorId} (${adminUser.role})\n`);

  // =========================================================================
  // CASE 1
  // =========================================================================
  console.log('------------------------------------------------------------');
  console.log('TEST CASE 1: createFullMember');
  console.log('------------------------------------------------------------');

  let father = null, mother = null, createdChild = null;
  const runId = uid();

  try {
    father = await db.members.create({
      data: {
        tenant_id: tenantId,
        full_name: 'Smoke Father ' + runId,
        gender: 'NAM',
        generation: 3,
        status: 'CHINH_THUC',
        changed_by: actorId,
      },
    });
    mother = await db.members.create({
      data: {
        tenant_id: tenantId,
        full_name: 'Smoke Mother ' + runId,
        gender: 'NU',
        generation: 3,
        status: 'CHINH_THUC',
        changed_by: actorId,
      },
    });
    console.log(`[CASE 1.1] Cha #${father.id}, Mẹ #${mother.id}`);

    const childPayload = {
      memberData: {
        full_name: 'Smoke Child ' + runId,
        gender: 'NAM',
        father_id: father.id,
        mother_id: mother.id,
        child_type: 'CON_DE',
        generation: 4,
        is_clan: true,
      },
      currentAddr: { full_address: 'Smoke Address ' + runId },
      changed_by: actorId,
      change_reason: 'Smoke Test Case 1',
    };

    const t1 = Date.now();
    createdChild = await withTransaction(
      { tenantId, actorId, correlationId: 'smoke-c1-' + runId },
      async () => memberService.createFullMember(childPayload, tenantId)
    );
    console.log(`[CASE 1.2] createFullMember ${Date.now() - t1}ms. Child #${createdChild.id}`);

    const parentages = await db.parentages.findMany({
      where: { tenant_id: tenantId, child_id: createdChild.id, deleted_at: null },
    });
    const ok = parentages.length === 2 &&
      parentages.every((p) => p.is_selected_for_lineage && p.relationship_type === 'BIOLOGICAL');
    console.log(ok ? '>>> [CASE 1: SUCCESS]\n' : '>>> [CASE 1: FAILED]\n');
  } catch (err) {
    console.error('>>> [CASE 1 ERROR]:', err.message || err);
  }

  // =========================================================================
  // CASE 2
  // =========================================================================
  console.log('------------------------------------------------------------');
  console.log('TEST CASE 2: mergeProvisionalBranch');
  console.log('------------------------------------------------------------');

  let opCase = null, opBranch = null, rootMember = null, targetParent = null;
  const runId2 = uid();

  try {
    targetParent = await db.members.create({
      data: {
        tenant_id: tenantId,
        full_name: 'Smoke Target ' + runId2,
        gender: 'NAM',
        generation: 2,
        status: 'CHINH_THUC',
        changed_by: actorId,
      },
    });
    rootMember = await db.members.create({
      data: {
        tenant_id: tenantId,
        full_name: 'Smoke OP Root ' + runId2,
        gender: 'NAM',
        status: 'DU_BI',
        changed_by: actorId,
      },
    });
    opBranch = await db.branches.create({
      data: {
        tenant_id: tenantId,
        name: 'Smoke Branch ' + runId2,
        status: 'APPROVED',
        changed_by: actorId,
      },
    });
    await db.members.update({ where: { id: rootMember.id }, data: { branch_id: opBranch.id } });

    opCase = await db.onboarding_cases.create({
      data: {
        tenant_id: tenantId,
        user_id: actorId,
        status: 'APPROVED',
        case_type: 'MEMBER_JOIN',
        primary_member_id: rootMember.id,
        primary_branch_id: opBranch.id,
        correlation_id: 'smoke-op-' + runId2,
      },
    });
    console.log(`[CASE 2.1] Case #${opCase.id}`);

    const t2 = Date.now();
    const mergeResult = await withTransaction(
      { tenantId, actorId, correlationId: 'smoke-op-merge-' + runId2 },
      async () => onboardingService.mergeProvisionalBranch({
        caseId: opCase.id,
        adminId: actorId,
        correlationId: 'smoke-op-merge-' + runId2,
        targetParentMemberId: targetParent.id,
        targetRelation: 'CHILD',
        newUserRole: 'USER',
        note: 'Smoke merge',
      })
    );
    console.log(`[CASE 2.2] merge ${Date.now() - t2}ms. Status: ${mergeResult.status}`);

    const updatedRoot = await db.members.findUnique({
      where: { id: rootMember.id },
      select: { status: true, father_id: true },
    });
    const edge = await db.parentages.findFirst({
      where: { tenant_id: tenantId, parent_id: targetParent.id, child_id: rootMember.id, deleted_at: null },
    });
    const ok = updatedRoot.status === 'CHINH_THUC' && updatedRoot.father_id === targetParent.id && edge?.is_selected_for_lineage;
    console.log(ok ? '>>> [CASE 2: SUCCESS]\n' : '>>> [CASE 2: FAILED]\n');
  } catch (err) {
    console.error('>>> [CASE 2 ERROR]:', err.message || err);
  }

  // =========================================================================
  // CLEANUP
  // =========================================================================
  console.log('------------------------------------------------------------');
  console.log('[CLEANUP]');
  try {
    if (createdChild) {
      await db.parentages.deleteMany({ where: { child_id: createdChild.id } });
      await db.members.deleteMany({ where: { id: { in: [createdChild.id, father?.id, mother?.id].filter(Boolean) } } });
    }
    if (opCase) await db.onboarding_cases.delete({ where: { id: opCase.id } });
    if (rootMember) {
      await db.parentages.deleteMany({ where: { child_id: rootMember.id } });
      await db.members.deleteMany({ where: { id: { in: [rootMember.id, targetParent?.id].filter(Boolean) } } });
    }
    if (opBranch) await db.branches.delete({ where: { id: opBranch.id } });
    console.log('[CLEANUP] Done.\n');
  } catch (e) {
    console.warn('[CLEANUP WARNING]:', e.message);
  }

  console.log('=== KẾT THÚC ===');
}

runSmokeTests()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await db.$disconnect(); });
