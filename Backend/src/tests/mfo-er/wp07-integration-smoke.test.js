/**
 * PATH       : src/tests/mfo-er/wp07-integration-smoke.test.js
 * DATETIME   : 2026-11-25T22:10:00+07:00
 * VERSION    : 1.6.0-WP07-DB-REGRESSION-GATE
 * DESCRIPTION:
 * - Smoke / Integration test chạy với Prisma client thật trên môi trường DB thực tế (WP-01 ... WP-06).
 * - Bao gồm:
 *   + Smoke 1: DB ping, pg_advisory_xact_lock & cycle guard fail-closed inside real transaction.
 *   + Smoke 2: Preview potential_conflicts + soft_warning & dryRun merge on real DB.
 *   + Regression 3: Real merge (dryRun: false) sets merged_into_id & creates CONFLICT_MERGE assertion.
 *   + Regression 4: Small Tree create + merge with USER_CONTRIBUTION & citation_id = small_tree_id.
 *
 * Cách chạy:
 *   TEST_TENANT_ID="<uuid>" RUN_DB_INTEGRATION=1 DATABASE_URL="postgresql://..." \
 *     node --test src/tests/mfo-er/wp07-integration-smoke.test.js
 */

'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('crypto');

const ROOT_SYSTEM_TENANT_ID = '00000000-0000-0000-0000-000000000000';
const shouldRunDbIntegration =
  process.env.RUN_DB_INTEGRATION === '1' && Boolean(process.env.DATABASE_URL);

const { prisma, tenantContext } = require('../../lib/prisma.js');
const {
  acquireTopologyLock,
  assertNoCycle,
} = require('../../modules/genealogy/topology.guard.js');
const {
  resolveCanonicalMemberId,
  previewDuplicateEntityResolution,
  resolveDuplicateEntity,
  CONFLICT_CIT_PREFIX,
} = require('../../modules/genealogy/entity-resolution.service.js');
const {
  createSmallTree,
  mergeSmallTree,
} = require('../../modules/small-trees/small-trees.service.js');

const RUN_TAG = `WP07_SMOKE_${Date.now()}`;
const createdIds = {
  assertionIds: [],
  sourceIds: [],
  parentageIds: [],
  memberIds: [],
  smallTreeIds: [],
  bplIds: [],
  auditIds: [],
  tenantId: null,
  actorUserId: null,
};

async function cleanupTestData() {
  if (!shouldRunDbIntegration) return;

  const tenantId = createdIds.tenantId;
  if (!tenantId) {
    console.warn('[WP07_CLEANUP] Bỏ qua cleanup vì thiếu tenantId.');
    return;
  }

  const deletedCounts = {
    assertions: 0,
    parentages: 0,
    members: 0,
    sources: 0,
    smallTrees: 0,
    businessProcessLogs: 0,
    auditLogs: 0,
  };

  try {
    await tenantContext.run({ tenantId, allowUnscoped: true }, async () => {
      await prisma.$transaction(async (tx) => {
        if (createdIds.memberIds.length > 0 && tx.member_generation_assertions?.deleteMany) {
          const res = await tx.member_generation_assertions.deleteMany({
            where: {
              tenant_id: tenantId,
              member_id: { in: createdIds.memberIds },
            },
          });
          deletedCounts.assertions += Number(res?.count || 0);
        }

        if (createdIds.assertionIds.length > 0 && tx.member_generation_assertions?.deleteMany) {
          const res = await tx.member_generation_assertions.deleteMany({
            where: {
              tenant_id: tenantId,
              id: { in: createdIds.assertionIds },
            },
          });
          deletedCounts.assertions += Number(res?.count || 0);
        }

        if (createdIds.parentageIds.length > 0 && tx.parentages?.deleteMany) {
          const res = await tx.parentages.deleteMany({
            where: {
              tenant_id: tenantId,
              id: { in: createdIds.parentageIds },
            },
          });
          deletedCounts.parentages = Number(res?.count || 0);
        }

        if (createdIds.smallTreeIds.length > 0 && tx.small_trees?.deleteMany) {
          const res = await tx.small_trees.deleteMany({
            where: {
              tenant_id: tenantId,
              id: { in: createdIds.smallTreeIds },
            },
          });
          deletedCounts.smallTrees = Number(res?.count || 0);
        }

        if (createdIds.memberIds.length > 0 && tx.members?.deleteMany) {
          const res = await tx.members.deleteMany({
            where: {
              tenant_id: tenantId,
              id: { in: createdIds.memberIds },
            },
          });
          deletedCounts.members = Number(res?.count || 0);
        }

        if (createdIds.sourceIds.length > 0 && tx.sources?.deleteMany) {
          const res = await tx.sources.deleteMany({
            where: {
              tenant_id: tenantId,
              id: { in: createdIds.sourceIds },
            },
          });
          deletedCounts.sources = Number(res?.count || 0);
        }

        if (createdIds.bplIds.length > 0 && tx.business_process_logs?.deleteMany) {
          const res = await tx.business_process_logs.deleteMany({
            where: {
              tenant_id: tenantId,
              id: { in: createdIds.bplIds },
            },
          });
          deletedCounts.businessProcessLogs = Number(res?.count || 0);
        }

        if (createdIds.auditIds.length > 0 && tx.audit_logs?.deleteMany) {
          const res = await tx.audit_logs.deleteMany({
            where: {
              tenant_id: tenantId,
              id: { in: createdIds.auditIds },
            },
          });
          deletedCounts.auditLogs = Number(res?.count || 0);
        }
      });
    });

    console.info('[WP07_CLEANUP]', {
      tenantId,
      runTag: RUN_TAG,
      members: deletedCounts.members,
      assertions: deletedCounts.assertions,
      sources: deletedCounts.sources,
      parentages: deletedCounts.parentages,
      smallTrees: deletedCounts.smallTrees,
      tracked: {
        members: createdIds.memberIds.length,
        assertions: createdIds.assertionIds.length,
        sources: createdIds.sourceIds.length,
        parentages: createdIds.parentageIds.length,
        smallTrees: createdIds.smallTreeIds.length,
      },
    });
  } catch (cleanupErr) {
    console.error('[WP07_CLEANUP_WARNING]', cleanupErr.message || cleanupErr);
  }
}

describe('WP-07 Real DB Integration & Smoke Suite', { skip: !shouldRunDbIntegration }, () => {
  before(async () => {
    const explicitTenantId = process.env.TEST_TENANT_ID;
    assert.ok(
      explicitTenantId,
      'Vui lòng truyền TEST_TENANT_ID hợp lệ (khác 00000000-0000-0000-0000-000000000000).'
    );
    assert.notEqual(
      explicitTenantId,
      ROOT_SYSTEM_TENANT_ID,
      'Không dùng 00000000-0000-0000-0000-000000000000 làm tenant_id thử nghiệm.'
    );

    const found = await prisma.tenants.findFirst({
      where: { id: explicitTenantId },
      select: { id: true },
    });
    assert.ok(
      found?.id,
      `Không tìm thấy TEST_TENANT_ID [${explicitTenantId}] trên bảng tenants.`
    );
    createdIds.tenantId = found.id;

    const activeUser = await prisma.users.findFirst({
      where: { deleted_at: null },
      select: { id: true },
    });
    assert.ok(
      activeUser?.id,
      'Cần ít nhất 1 user hợp lệ (deleted_at = null) trên bảng users để chạy merge & small_trees.'
    );
    createdIds.actorUserId = activeUser.id;
  });

  after(async () => {
    await cleanupTestData();
    if (typeof prisma.$disconnect === 'function') {
      await prisma.$disconnect();
    }
  });

  it('Smoke 1: DB ping, pg_advisory_xact_lock & cycle guard fail-closed inside real transaction', async () => {
    const tenantId = createdIds.tenantId;
    const parentId = randomUUID();
    const childId = randomUUID();
    const pId = randomUUID();
    createdIds.memberIds.push(parentId, childId);
    createdIds.parentageIds.push(pId);

    await tenantContext.run({ tenantId, allowUnscoped: true }, async () => {
      await prisma.$transaction(async (tx) => {
        await acquireTopologyLock(tx, tenantId);

        const m1 = await tx.members.create({
          data: {
            id: parentId,
            tenant_id: tenantId,
            full_name: `${RUN_TAG}_PARENT`,
            gender: 'NAM',
            generation: 1,
          },
        });
        const m2 = await tx.members.create({
          data: {
            id: childId,
            tenant_id: tenantId,
            full_name: `${RUN_TAG}_CHILD`,
            gender: 'NAM',
            generation: 2,
          },
        });
        assert.equal(m1.id, parentId);
        assert.equal(m2.id, childId);

        await tx.parentages.create({
          data: {
            id: pId,
            tenant_id: tenantId,
            parent_id: parentId,
            child_id: childId,
            relationship_type: 'BIOLOGICAL',
            review_status: 'ACCEPTED',
            is_selected_for_lineage: true,
          },
        });

        await assert.rejects(
          () =>
            assertNoCycle(tx, {
              tenantId,
              parentId: childId,
              childId: parentId,
              isNewChild: false,
            }),
          (err) => err.code === 'TOPOLOGY_CYCLE_DETECTED'
        );
      });
    });
  });

  it('Smoke 2: Preview potential_conflicts + soft_warning & dryRun merge on real DB', async () => {
    const tenantId = createdIds.tenantId;
    const srcId = randomUUID();
    const tgtId = randomUUID();
    const sourceId = randomUUID();
    const aSrcId = randomUUID();
    const aTgtId = randomUUID();

    createdIds.memberIds.push(srcId, tgtId);
    createdIds.sourceIds.push(sourceId);
    createdIds.assertionIds.push(aSrcId, aTgtId);

    await tenantContext.run({ tenantId, allowUnscoped: true }, async () => {
      await prisma.$transaction(async (tx) => {
        await tx.members.create({
          data: {
            id: srcId,
            tenant_id: tenantId,
            full_name: `${RUN_TAG}_SRC`,
            gender: 'NAM',
            generation: 2,
          },
        });
        await tx.members.create({
          data: {
            id: tgtId,
            tenant_id: tenantId,
            full_name: `${RUN_TAG}_TGT`,
            gender: 'NAM',
            generation: 2,
          },
        });
        await tx.sources.create({
          data: {
            id: sourceId,
            tenant_id: tenantId,
            title: `${RUN_TAG}_SOURCE_OFFSET`,
            source_type: 'GENEALOGY_BOOK',
            root_generation_offset: 1,
          },
        });
        await tx.member_generation_assertions.create({
          data: {
            id: aSrcId,
            tenant_id: tenantId,
            member_id: srcId,
            source_id: sourceId,
            citation_id: `${RUN_TAG}_CIT`,
            claimed_generation: 3,
            status: 'ACTIVE',
          },
        });
        await tx.member_generation_assertions.create({
          data: {
            id: aTgtId,
            tenant_id: tenantId,
            member_id: tgtId,
            source_id: sourceId,
            citation_id: `${RUN_TAG}_CIT`,
            claimed_generation: 2,
            status: 'ACTIVE',
          },
        });
      });

      const preview = await previewDuplicateEntityResolution({
        tenantId,
        sourceMemberId: srcId,
        targetMemberId: tgtId,
      });

      assert.equal(preview.can_merge, true);
      assert.equal(preview.potential_conflict_count, 1);
      assert.equal(preview.potential_conflicts[0].projected_status, 'ACTIVE');
      assert.equal(preview.potential_conflicts[0].auto_disputed, false);
      assert.equal(preview.soft_warning.has_soft_warning, true);

      const dry = await resolveDuplicateEntity({
        tenantId,
        sourceMemberId: srcId,
        targetMemberId: tgtId,
        actorId: createdIds.actorUserId,
        dryRun: true,
      });
      assert.equal(dry.dry_run, true);

      const canon = await resolveCanonicalMemberId(prisma, {
        tenantId,
        memberId: srcId,
        maxDepth: 10,
      });
      assert.equal(canon.memberId, srcId);
      assert.equal(canon.depth, 0);
    });
  });

  it('Regression 3: Real merge (dryRun: false) sets merged_into_id & creates CONFLICT_MERGE assertion', async () => {
    const tenantId = createdIds.tenantId;
    const srcId = randomUUID();
    const tgtId = randomUUID();
    const sourceId = randomUUID();
    const aSrcId = randomUUID();
    const aTgtId = randomUUID();

    createdIds.memberIds.push(srcId, tgtId);
    createdIds.sourceIds.push(sourceId);
    createdIds.assertionIds.push(aSrcId, aTgtId);

    await tenantContext.run({ tenantId, allowUnscoped: true }, async () => {
      await prisma.$transaction(async (tx) => {
        await tx.members.create({
          data: {
            id: srcId,
            tenant_id: tenantId,
            full_name: `${RUN_TAG}_REAL_SRC`,
            gender: 'NAM',
            generation: 2,
          },
        });
        await tx.members.create({
          data: {
            id: tgtId,
            tenant_id: tenantId,
            full_name: `${RUN_TAG}_REAL_TGT`,
            gender: 'NAM',
            generation: 2,
          },
        });
        await tx.sources.create({
          data: {
            id: sourceId,
            tenant_id: tenantId,
            title: `${RUN_TAG}_REAL_SRC_BOOK`,
            source_type: 'GENEALOGY_BOOK',
            root_generation_offset: 0,
          },
        });
        await tx.member_generation_assertions.create({
          data: {
            id: aSrcId,
            tenant_id: tenantId,
            member_id: srcId,
            source_id: sourceId,
            citation_id: `${RUN_TAG}_REAL_CIT`,
            claimed_generation: 3,
            status: 'ACTIVE',
          },
        });
        await tx.member_generation_assertions.create({
          data: {
            id: aTgtId,
            tenant_id: tenantId,
            member_id: tgtId,
            source_id: sourceId,
            citation_id: `${RUN_TAG}_REAL_CIT`,
            claimed_generation: 2,
            status: 'ACTIVE',
          },
        });
      });

      const merged = await resolveDuplicateEntity({
        tenantId,
        sourceMemberId: srcId,
        targetMemberId: tgtId,
        actorId: createdIds.actorUserId,
        actorType: 'USER',
        dryRun: false,
      });

      assert.equal(merged.ok, true);
      assert.equal(merged.merged_into_id, tgtId);
      assert.equal(merged.conflict_count, 1);

      const canonTarget = await resolveCanonicalMemberId(prisma, {
        tenantId,
        memberId: tgtId,
        maxDepth: 10,
      });
      assert.equal(canonTarget.memberId, tgtId);
      assert.equal(canonTarget.depth, 0);

      const conflictRow = await prisma.member_generation_assertions.findFirst({
        where: {
          tenant_id: tenantId,
          member_id: tgtId,
          citation_id: `${CONFLICT_CIT_PREFIX}${aSrcId}`,
        },
        select: { id: true, citation_id: true, status: true, claimed_generation: true },
      });
      assert.ok(conflictRow?.id, 'Phải tạo được conflict assertion trên targetMemberId.');
      createdIds.assertionIds.push(conflictRow.id);
      assert.equal(conflictRow.status, 'ACTIVE');
      assert.equal(Number(conflictRow.claimed_generation), 3);
      assert.ok(
        String(conflictRow.citation_id || '').includes(aSrcId),
        'citation_id của conflict assertion phải tham chiếu tới source assertion.'
      );
    });
  });

  it('Regression 4: Small Tree create + merge with USER_CONTRIBUTION & citation_id = small_tree_id', async () => {
    const tenantId = createdIds.tenantId;
    const ownerUserId = createdIds.actorUserId;
    const anchorMemberId = randomUUID();
    const candidateMemberId = randomUUID();
    createdIds.memberIds.push(anchorMemberId, candidateMemberId);

    await tenantContext.run({ tenantId, allowUnscoped: true }, async () => {
      await prisma.members.create({
        data: {
          id: anchorMemberId,
          tenant_id: tenantId,
          full_name: `${RUN_TAG}_ANCHOR`,
          gender: 'NAM',
          generation: 1,
        },
      });
      await prisma.members.create({
        data: {
          id: candidateMemberId,
          tenant_id: tenantId,
          full_name: `${RUN_TAG}_CANDIDATE`,
          gender: 'NAM',
          generation: 2,
        },
      });

      const createdTree = await createSmallTree({
        tenantId,
        ownerUserId,
        rootMemberId: anchorMemberId,
        actorId: ownerUserId,
        actorType: 'USER',
      });
      const smallTreeId = createdTree?.id || createdTree?.small_tree?.id;
      assert.ok(smallTreeId, 'Phải tạo được Small Tree hợp lệ trên DB.');
      createdIds.smallTreeIds.push(smallTreeId);

      const mergeRes = await mergeSmallTree({
        tenantId,
        smallTreeId,
        memberAssertions: [
          {
            member_id: candidateMemberId,
            claimed_generation: 2,
            note: `${RUN_TAG}_SMALL_TREE_ASSERTION`,
          },
        ],
        actorId: ownerUserId,
        actorType: 'USER',
      });
      assert.ok(mergeRes);

      const contribSources = await prisma.sources.findMany({
        where: {
          tenant_id: tenantId,
          source_type: 'USER_CONTRIBUTION',
          title: { contains: smallTreeId },
        },
        select: { id: true },
      });
      for (const s of contribSources) {
        if (s?.id && !createdIds.sourceIds.includes(s.id)) {
          createdIds.sourceIds.push(s.id);
        }
      }

      const assertionByTree = await prisma.member_generation_assertions.findFirst({
        where: {
          tenant_id: tenantId,
          citation_id: smallTreeId,
        },
        select: { id: true, citation_id: true, status: true },
      });
      assert.ok(assertionByTree?.id, 'Phải tạo assertion với citation_id = small_tree_id.');
      createdIds.assertionIds.push(assertionByTree.id);
      assert.equal(assertionByTree.citation_id, smallTreeId);
      assert.equal(assertionByTree.status, 'ACTIVE');
    });
  });
});