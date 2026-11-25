/**
 * PATH       : src/modules/small-trees/small-trees.service.js
 * DATETIME   : 2026-11-25T16:03:00+07:00
 * VERSION    : 1.0.0-WP04-PHASE1
 * DESCRIPTION:
 * - Service cho WP-04 (Small Trees / Path B) bám sát prisma/schema.prisma và các service SSOT hiện hành:
 *   1) CRUD small_trees: tạo cây nhỏ (status = CHO_GHEP, gán created_by_member_id nội bộ),
 *      đọc/danh sách/cập nhật, chuyển trạng thái CHO_GHEP -> DA_GHEP / HUY.
 *   2) Khi duyệt ghép (mergeSmallTree): tạo nguồn USER_CONTRIBUTION riêng cho lần ghép,
 *      tạo/ghi member_generation_assertions với citation_id = small_tree_id (status = ACTIVE,
 *      không tự gắn DISPUTED), chuyển trạng thái small_trees -> DA_GHEP.
 *   3) Tái sử dụng logic Entity Resolution (WP-03) khi phát hiện thực thể trùng lúc ghép
 *      (duplicateMappings / resolveDuplicateEntity).
 *   4) Ghi business_process_logs với MFO_SMALL_TREE_CREATE và sự kiện ghép (ENTITY_RESOLUTION_MERGE).
 *   5) Không phá Tầng 1 / Tầng 2: không đụng assertion của các lần ghép khác; root_generation_offset
 *      chỉ trả thông tin cảnh báo mềm (SOFT_WARNING), không tự gắn DISPUTED.
 * CHANGE LOGS:
 *   - 1.0.0: Tạo service WP-04 (Small Trees).
 */

'use strict';

const { randomUUID } = require('crypto');
const { prisma } = require('../../lib/prisma.js');
const { acquireTopologyLock, assertNoCycle } = require('../genealogy/topology.guard.js');
const { upsertParentage, flushParentageAudit } = require('../genealogy/parentage.mapper.js');
const {
  resolveDuplicateEntity,
  computeSoftWarnings,
} = require('../genealogy/entity-resolution.service.js');

const DEFAULT_CITATION = 'SYS_CIT::DEFAULT';
const SYSTEM_ACTOR_ID = process.env.SYSTEM_JOB_ACTOR_ID || '00000000-0000-0000-0000-000000000000';

function fail(message, statusCode, code, details = null) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  err.isOperational = true;
  if (details) err.details = details;
  throw err;
}

function normalizeActorType(actorType) {
  const allowed = new Set(['USER', 'SYSTEM', 'JOB_RUNNER', 'CRON', 'IMPORT_TOOL']);
  const raw = actorType == null ? null : String(actorType);
  const isValid = raw && allowed.has(raw);
  if (!isValid) {
    console.warn(
      '[SMALL_TREES] actor_type fallback',
      { raw_actor_type: raw, fallback_to: 'USER' }
    );
  }
  return {
    actorType: isValid ? raw : 'USER',
    actor_type_fallback: !isValid,
    raw_actor_type: raw,
  };
}

async function resolveCreatorMemberId(tx, { tenantId, userId, explicitMemberId = null }) {
  if (explicitMemberId) return explicitMemberId;
  if (!userId) return null;

  if (typeof tx.user_member_links?.findFirst === 'function') {
    const link = await tx.user_member_links.findFirst({
      where: {
        tenant_id: tenantId,
        user_id: userId,
        deleted_at: null,
      },
      orderBy: [{ is_default: 'desc' }, { created_at: 'asc' }],
      select: { member_id: true },
    });
    if (link?.member_id) return link.member_id;
  }

  if (typeof tx.users?.findUnique === 'function') {
    const user = await tx.users.findUnique({
      where: { id: userId },
      select: { member_id: true },
    });
    if (user?.member_id) return user.member_id;
  }

  return null;
}

async function createSmallTree({
  tenantId,
  ownerUserId,
  rootMemberId,
  createdByMemberId = null,
  isAdminOwned = false,
  actorId = null,
  actorType = 'USER',
  correlationId = null,
  dbClient = prisma,
}) {
  if (!tenantId || !ownerUserId || !rootMemberId) {
    fail('Thiếu tenantId, ownerUserId hoặc rootMemberId khi tạo cây nhỏ.', 422, 'ST_INVALID_PARAMS');
  }

  const corrId = correlationId || randomUUID();
  const effectiveActorId = actorId || ownerUserId || SYSTEM_ACTOR_ID;
  const actorNorm = normalizeActorType(actorType);
  const normalizedActorType = actorNorm.actorType;

  return dbClient.$transaction(async (tx) => {
    await acquireTopologyLock(tx, tenantId);

    const rootMember = await tx.members.findFirst({
      where: { id: rootMemberId, tenant_id: tenantId, deleted_at: null },
      select: { id: true, generation: true, full_name: true },
    });
    if (!rootMember) {
      fail(`Không tìm thấy root_member [${rootMemberId}] trong tenant.`, 404, 'ST_ROOT_MEMBER_NOT_FOUND');
    }

    const resolvedCreatorMemberId = await resolveCreatorMemberId(tx, {
      tenantId,
      userId: effectiveActorId,
      explicitMemberId: createdByMemberId,
    });

    const created = await tx.small_trees.create({
      data: {
        tenant_id: tenantId,
        owner_user_id: ownerUserId,
        created_by_member_id: resolvedCreatorMemberId,
        root_member_id: rootMemberId,
        is_admin_owned: Boolean(isAdminOwned),
        status: 'CHO_GHEP',
      },
    });

    if (typeof tx.business_process_logs?.create === 'function') {
      await tx.business_process_logs.create({
        data: {
          id: randomUUID(),
          correlation_id: corrId,
          attempt_no: 1,
          process_type: 'MFO_SMALL_TREE_CREATE',
          actor_type: normalizedActorType,
          actor_id: effectiveActorId,
          tenant_id: tenantId,
          process_status: 'SUCCESS',
          metadata: {
            stage: 'MFO_SMALL_TREE_CREATE',
            small_tree_id: created.id,
            owner_user_id: created.owner_user_id,
            created_by_member_id: created.created_by_member_id,
            root_member_id: created.root_member_id,
            is_admin_owned: created.is_admin_owned,
            status: created.status,
            actor_type_fallback: actorNorm.actor_type_fallback,
            raw_actor_type: actorNorm.raw_actor_type,
          },
        },
      });
    }

    return {
      ...created,
      correlation_id: corrId,
    };
  });
}

async function listSmallTrees({ tenantId, status = null, ownerUserId = null, dbClient = prisma }) {
  if (!tenantId) {
    fail('Thiếu tenantId khi truy vấn danh sách cây nhỏ.', 422, 'ST_MISSING_TENANT');
  }

  return dbClient.small_trees.findMany({
    where: {
      tenant_id: tenantId,
      deleted_at: null,
      ...(status ? { status } : {}),
      ...(ownerUserId ? { owner_user_id: ownerUserId } : {}),
    },
    orderBy: [{ created_at: 'desc' }],
  });
}

async function getSmallTreeById({ tenantId, smallTreeId, dbClient = prisma }) {
  if (!tenantId || !smallTreeId) {
    fail('Thiếu tenantId hoặc smallTreeId.', 422, 'ST_INVALID_PARAMS');
  }

  const tree = await dbClient.small_trees.findFirst({
    where: {
      id: smallTreeId,
      tenant_id: tenantId,
      deleted_at: null,
    },
  });

  if (!tree) {
    fail(`Không tìm thấy cây nhỏ [${smallTreeId}].`, 404, 'ST_NOT_FOUND');
  }

  return tree;
}

async function updateSmallTreeStatus({
  tenantId,
  smallTreeId,
  nextStatus,
  actorId = SYSTEM_ACTOR_ID,
  dbClient = prisma,
}) {
  if (!tenantId || !smallTreeId || !nextStatus) {
    fail('Thiếu tenantId, smallTreeId hoặc nextStatus.', 422, 'ST_INVALID_PARAMS');
  }

  const allowedTransitions = new Map([
    ['CHO_GHEP', new Set(['DA_GHEP', 'HUY'])],
    ['DA_GHEP', new Set([])],
    ['HUY', new Set([])],
  ]);

  return dbClient.$transaction(async (tx) => {
    const current = await tx.small_trees.findFirst({
      where: { id: smallTreeId, tenant_id: tenantId, deleted_at: null },
    });
    if (!current) {
      fail(`Không tìm thấy cây nhỏ [${smallTreeId}].`, 404, 'ST_NOT_FOUND');
    }

    const allowed = allowedTransitions.get(current.status) || new Set();
    if (!allowed.has(nextStatus)) {
      fail(
        `Không thể chuyển trạng thái cây nhỏ từ [${current.status}] sang [${nextStatus}].`,
        422,
        'ST_INVALID_STATUS_TRANSITION',
        { currentStatus: current.status, nextStatus }
      );
    }

    return tx.small_trees.update({
      where: { id: smallTreeId },
      data: {
        status: nextStatus,
        ...(nextStatus === 'HUY' ? { deleted_at: new Date() } : {}),
      },
    });
  });
}

async function mergeSmallTree({
  tenantId,
  smallTreeId,
  targetAnchorMemberId = null,
  memberAssertions = [],
  duplicateMappings = [],
  actorId = SYSTEM_ACTOR_ID,
  actorType = 'USER',
  correlationId = null,
  dbClient = prisma,
}) {
  if (!tenantId || !smallTreeId) {
    fail('Thiếu tenantId hoặc smallTreeId khi ghép cây nhỏ.', 422, 'ST_INVALID_PARAMS');
  }

  const corrId = correlationId || randomUUID();
  const actorNorm = normalizeActorType(actorType);
  const normalizedActorType = actorNorm.actorType;
  const auditQueue = [];
  const pendingEdges = [];

  const txResult = await dbClient.$transaction(
    async (tx) => {
      await acquireTopologyLock(tx, tenantId);

      const tree = await tx.small_trees.findFirst({
        where: { id: smallTreeId, tenant_id: tenantId, deleted_at: null },
      });
      if (!tree) {
        fail(`Không tìm thấy cây nhỏ [${smallTreeId}].`, 404, 'ST_NOT_FOUND');
      }
      if (tree.status !== 'CHO_GHEP') {
        fail(
          `Chỉ có thể ghép cây nhỏ ở trạng thái CHO_GHEP (hiện tại: [${tree.status}]).`,
          409,
          'ST_INVALID_STATUS_FOR_MERGE',
          { status: tree.status }
        );
      }

      const contributionSource = await tx.sources.create({
        data: {
          tenant_id: tenantId,
          title: `USER_CONTRIBUTION :: SmallTree [${smallTreeId}]`,
          source_type: 'USER_CONTRIBUTION',
          description: `Nguồn đóng góp người dùng tự động tạo khi duyệt ghép cây nhỏ ${smallTreeId} (correlation_id=${corrId})`,
          created_by: actorId || tree.owner_user_id || null,
          root_generation_offset: 0,
        },
      });

      const createdAssertions = [];
      if (typeof tx.member_generation_assertions?.create === 'function') {
        for (const item of memberAssertions || []) {
          if (!item?.member_id || item?.claimed_generation == null) continue;

          const existing = await tx.member_generation_assertions.findFirst({
            where: {
              tenant_id: tenantId,
              member_id: item.member_id,
              source_id: contributionSource.id,
              citation_id: smallTreeId,
            },
            select: { id: true },
          });

          if (existing) {
            const updated = await tx.member_generation_assertions.update({
              where: { id: existing.id },
              data: {
                claimed_generation: Number(item.claimed_generation),
                status: 'ACTIVE',
                deleted_at: null,
                note: item.note || `Cập nhật assertion cho small_tree ${smallTreeId}`,
              },
            });
            createdAssertions.push(updated);
          } else {
            const created = await tx.member_generation_assertions.create({
              data: {
                tenant_id: tenantId,
                member_id: item.member_id,
                source_id: contributionSource.id,
                citation_id: smallTreeId,
                claimed_generation: Number(item.claimed_generation),
                status: 'ACTIVE',
                note: item.note || `Ghép cây nhỏ ${smallTreeId} (citation_id = small_tree_id)`,
              },
            });
            createdAssertions.push(created);
          }
        }
      }

      if (targetAnchorMemberId && targetAnchorMemberId !== tree.root_member_id) {
        const anchorMember = await tx.members.findFirst({
          where: { id: targetAnchorMemberId, tenant_id: tenantId, deleted_at: null },
          select: { id: true, gender: true },
        });
        if (anchorMember) {
          await assertNoCycle(tx, {
            tenantId,
            parentId: targetAnchorMemberId,
            childId: tree.root_member_id,
            pendingEdges,
            isNewChild: false,
          });
          await upsertParentage(tx, {
            tenantId,
            parentId: targetAnchorMemberId,
            childId: tree.root_member_id,
            relationshipType: 'BIOLOGICAL',
            unionId: null,
            actorId,
            correlationId: corrId,
            ticketId: `ST_MERGE_${smallTreeId}`,
            isNewChild: false,
            relativeLevel: 1,
            auditQueue,
          });
          pendingEdges.push({ parentId: targetAnchorMemberId, childId: tree.root_member_id });
        }
      }

      await flushParentageAudit(tx, auditQueue);

      const mergedTree = await tx.small_trees.update({
        where: { id: smallTreeId },
        data: {
          status: 'DA_GHEP',
        },
      });

      const softWarningInfo = await computeSoftWarnings(tx, {
        tenantId,
        sourceMemberId: tree.root_member_id,
        targetMemberId: targetAnchorMemberId || tree.root_member_id,
      });

      return {
        tree: mergedTree,
        contributionSource,
        createdAssertions,
        softWarningInfo,
      };
    },
    { maxWait: 10000, timeout: 30000 }
  );

  const duplicateMergeResults = [];
  for (const mapping of duplicateMappings || []) {
    const srcId = mapping?.source_member_id || mapping?.sourceMemberId;
    const tgtId = mapping?.target_member_id || mapping?.targetMemberId;
    if (!srcId || !tgtId) continue;

    const mergeRes = await resolveDuplicateEntity({
      tenantId,
      sourceMemberId: srcId,
      targetMemberId: tgtId,
      actorId,
      actorType: normalizedActorType,
      correlationId: corrId,
      dbClient,
    });
    duplicateMergeResults.push(mergeRes);
  }

  if (typeof dbClient.business_process_logs?.create === 'function') {
    await dbClient.business_process_logs.create({
      data: {
        id: randomUUID(),
        correlation_id: corrId,
        attempt_no: 2,
        process_type: 'ENTITY_RESOLUTION_MERGE',
        actor_type: normalizedActorType,
        actor_id: actorId || SYSTEM_ACTOR_ID,
        tenant_id: tenantId,
        process_status: 'SUCCESS',
        metadata: {
          stage: 'MERGE_SMALL_TREE',
          small_tree_id: smallTreeId,
          status: txResult.tree.status,
          contribution_source_id: txResult.contributionSource.id,
          source_type: txResult.contributionSource.source_type,
          citation_id: smallTreeId,
          assertions_count: txResult.createdAssertions.length,
          duplicate_merges_count: duplicateMergeResults.length,
          duplicate_merges: duplicateMergeResults,
          soft_warning: txResult.softWarningInfo,
          preserved_assertions: true,
          actor_type_fallback: actorNorm.actor_type_fallback,
          raw_actor_type: actorNorm.raw_actor_type,
        },
      },
    });
  }

  return {
    ok: true,
    correlation_id: corrId,
    small_tree: txResult.tree,
    source: txResult.contributionSource,
    citation_id: smallTreeId,
    assertions_created_count: txResult.createdAssertions.length,
    duplicate_merges: duplicateMergeResults,
    soft_warning: txResult.softWarningInfo,
  };
}

module.exports = {
  DEFAULT_CITATION,
  createSmallTree,
  listSmallTrees,
  getSmallTreeById,
  updateSmallTreeStatus,
  mergeSmallTree,
};
