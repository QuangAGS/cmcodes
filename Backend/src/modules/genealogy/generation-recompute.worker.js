/**
 * PATH       : src/modules/genealogy/generation-recompute.worker.js
 * DATETIME   : 2026-11-25T13:47:00+07:00
 * VERSION    : 1.0.0-BRANCH-ISOLATED-RETRY3
 * DESCRIPTION:
 * - Worker GenerationRecomputation độc lập theo nhánh/cạnh hạ lưu bị tác động.
 * - Chỉ lan xuống hạ lưu theo các cạnh ACCEPTED (deleted_at IS NULL) từ điểm neo/cạnh bị tác động,
 *   cập nhật members.generation (Tầng 1 SSOT) và parentages.metadata.relative_level.
 * - Giữ độc lập các cạnh ACCEPTED khác không thuộc nhánh hạ lưu bị tác động (Multiple Occurrences).
 * - Tuyệt đối KHÔNG tự tạo hoặc sửa member_generation_assertions (Tầng 2).
 * - Hỗ trợ retry tối đa 3 lần và ghi log GENERATION_RECOMPUTE / GENERATION_RECOMPUTE_FAILED
 *   vào business_process_logs.
 *CHANGE LOGS:
 *   - 1.0.0: Tách riêng worker recompute theo nhánh/cạnh hạ lưu bị tác động, retry 3 lần.
 */

'use strict';

const { randomUUID } = require('crypto');
const { prisma } = require('../../lib/prisma.js');
const { acquireTopologyLock } = require('./topology.guard.js');

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BACKOFF_MS = 200;
const SYSTEM_ACTOR_ID = process.env.SYSTEM_JOB_ACTOR_ID || '00000000-0000-0000-0000-000000000000';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeMetadata(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return { ...raw };
  }
  return {};
}

async function recomputeBranchOnce(tx, {
  tenantId,
  anchorMemberIds = [],
  anchorEdges = [],
  actorId = SYSTEM_ACTOR_ID,
  maxDepth = 100,
}) {
  await acquireTopologyLock(tx, tenantId);

  const memberIdsSet = new Set((anchorMemberIds || []).filter(Boolean));
  for (const e of anchorEdges || []) {
    if (e.parentId) memberIdsSet.add(e.parentId);
    if (e.childId) memberIdsSet.add(e.childId);
  }

  const seedMembers = memberIdsSet.size > 0
    ? await tx.members.findMany({
        where: {
          tenant_id: tenantId,
          id: { in: Array.from(memberIdsSet) },
          deleted_at: null,
        },
        select: { id: true, generation: true },
      })
    : [];

  const generationByMember = new Map();
  for (const m of seedMembers) {
    if (m.generation != null) {
      generationByMember.set(m.id, Number(m.generation));
    }
  }
  for (const e of anchorEdges || []) {
    if (e.parentId && e.baseGeneration != null && !generationByMember.has(e.parentId)) {
      generationByMember.set(e.parentId, Number(e.baseGeneration));
    }
  }

  const acceptedEdges = await tx.parentages.findMany({
    where: {
      tenant_id: tenantId,
      review_status: 'ACCEPTED',
      deleted_at: null,
    },
    select: {
      id: true,
      parent_id: true,
      child_id: true,
      metadata: true,
    },
  });

  const childrenByParent = new Map();
  for (const edge of acceptedEdges) {
    if (!childrenByParent.has(edge.parent_id)) {
      childrenByParent.set(edge.parent_id, []);
    }
    childrenByParent.get(edge.parent_id).push(edge);
  }

  const impactedEdgeKeys = new Set();
  for (const e of anchorEdges || []) {
    if (e.parentId && e.childId) {
      impactedEdgeKeys.add(`${e.parentId}->${e.childId}`);
    }
  }

  const queue = [];
  const visitedEdges = new Set();

  for (const e of anchorEdges || []) {
    if (!e.parentId || !e.childId) continue;
    const parentGen = generationByMember.get(e.parentId);
    const matchingEdges = (childrenByParent.get(e.parentId) || []).filter((c) => c.child_id === e.childId);
    for (const edge of matchingEdges) {
      const visitKey = `${edge.id}:1`;
      if (!visitedEdges.has(visitKey)) {
        visitedEdges.add(visitKey);
        queue.push({ edge, parentGeneration: parentGen, depth: 1 });
      }
    }
  }

  for (const [memberId, gen] of generationByMember.entries()) {
    const outEdges = childrenByParent.get(memberId) || [];
    for (const edge of outEdges) {
      if (impactedEdgeKeys.size > 0 && !impactedEdgeKeys.has(`${edge.parent_id}->${edge.child_id}`)) {
        continue;
      }
      const visitKey = `${edge.id}:1`;
      if (!visitedEdges.has(visitKey)) {
        visitedEdges.add(visitKey);
        queue.push({ edge, parentGeneration: gen, depth: 1 });
      }
    }
  }

  let updatedMembersCount = 0;
  let updatedEdgesCount = 0;

  while (queue.length > 0) {
    const { edge, parentGeneration, depth } = queue.shift();
    if (depth > maxDepth) continue;

    const nextGen = parentGeneration != null ? Number(parentGeneration) + 1 : null;
    if (nextGen != null) {
      generationByMember.set(edge.child_id, nextGen);
      await tx.members.update({
        where: { id: edge.child_id },
        data: {
          generation: nextGen,
          changed_by: actorId,
        },
      });
      updatedMembersCount += 1;
    }

    const nextMeta = normalizeMetadata(edge.metadata);
    nextMeta.relative_level = depth;
    await tx.parentages.update({
      where: { id: edge.id },
      data: {
        metadata: nextMeta,
        changed_by: actorId,
      },
    });
    updatedEdgesCount += 1;

    const downstreamEdges = childrenByParent.get(edge.child_id) || [];
    for (const downEdge of downstreamEdges) {
      const visitKey = `${downEdge.id}:${depth + 1}`;
      if (!visitedEdges.has(visitKey)) {
        visitedEdges.add(visitKey);
        queue.push({
          edge: downEdge,
          parentGeneration: nextGen,
          depth: depth + 1,
        });
      }
    }
  }

  return {
    updatedMembersCount,
    updatedEdgesCount,
    impactedEdgeKeys: Array.from(impactedEdgeKeys),
  };
}

async function runGenerationRecomputation({
  tenantId,
  anchorMemberIds = [],
  anchorEdges = [],
  actorId = SYSTEM_ACTOR_ID,
  correlationId = null,
  maxRetries = DEFAULT_MAX_RETRIES,
  backoffMs = DEFAULT_BACKOFF_MS,
  dbClient = prisma,
}) {
  const corrId = correlationId || randomUUID();
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const result = await dbClient.$transaction(
        async (tx) =>
          recomputeBranchOnce(tx, {
            tenantId,
            anchorMemberIds,
            anchorEdges,
            actorId,
          }),
        { maxWait: 10000, timeout: 30000 }
      );

      await dbClient.business_process_logs.create({
        data: {
          id: randomUUID(),
          correlation_id: corrId,
          attempt_no: attempt,
          process_type: 'GENERATION_RECOMPUTE',
          actor_type: 'JOB_RUNNER',
          actor_id: actorId || SYSTEM_ACTOR_ID,
          tenant_id: tenantId,
          process_status: 'SUCCESS',
          metadata: {
            stage: 'GENERATION_RECOMPUTATION',
            attempt,
            max_retries: maxRetries,
            anchor_member_ids: anchorMemberIds,
            anchor_edges: anchorEdges,
            updated_members_count: result.updatedMembersCount,
            updated_edges_count: result.updatedEdgesCount,
            touched_assertions: false,
          },
        },
      });

      return {
        ok: true,
        correlationId: corrId,
        attempt,
        ...result,
      };
    } catch (err) {
      lastError = err;
      const isFinalAttempt = attempt >= maxRetries;

      if (isFinalAttempt) {
        try {
          await dbClient.business_process_logs.create({
            data: {
              id: randomUUID(),
              correlation_id: corrId,
              attempt_no: attempt,
              process_type: 'GENERATION_RECOMPUTE_FAILED',
              actor_type: 'JOB_RUNNER',
              actor_id: actorId || SYSTEM_ACTOR_ID,
              tenant_id: tenantId,
              process_status: 'FAILED',
              metadata: {
                stage: 'GENERATION_RECOMPUTATION',
                attempt,
                max_retries: maxRetries,
                anchor_member_ids: anchorMemberIds,
                anchor_edges: anchorEdges,
                error_code: err && err.code ? err.code : 'GENERATION_RECOMPUTE_ERROR',
                error_message: String((err && err.message) || err),
                touched_assertions: false,
              },
            },
          });
        } catch (_logErr) {
          // Không nuốt lỗi gốc nếu ghi log thất bại
        }
      } else {
        await sleep(backoffMs * attempt);
      }
    }
  }

  throw lastError;
}

module.exports = {
  DEFAULT_MAX_RETRIES,
  recomputeBranchOnce,
  runGenerationRecomputation,
};
