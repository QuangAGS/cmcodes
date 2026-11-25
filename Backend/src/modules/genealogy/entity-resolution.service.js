/**
 * PATH       : src/modules/genealogy/entity-resolution.service.js
 * DATETIME   : 2026-11-25T15:25:00+07:00
 * VERSION    : 1.1.0-WP03-CHECKLIST-ALIGNED
 * DESCRIPTION:
 * - Service WP-03 (Entity Resolution) bám sát checklist Phase 1 và prisma/schema.prisma SSOT:
 *   1) Đọc/ghi merged_into_id, chặn self-merge (422), khóa giới tính GENDER_MISMATCH, Dual-Account Guard,
 *      acquireTopologyLock + assertNoCycle fail-closed.
 *   2) Khi (tenant_id, member_id, source_id, citation_id) bị trùng và lệch claimed_generation:
 *      Tạo bản ghi assertion mới (hoặc chuyển xung đột sang citation_id = SYS_CIT::CONFLICT_MERGE::<source_assertion_id>)
 *      với status = ACTIVE, không tự gắn DISPUTED; bản ghi đích cũ giữ nguyên claimed_generation & status.
 *      Với assertion không trùng hoặc trùng cùng claimed_generation: chuyển member_id sang targetMemberId
 *      mà không sửa claimed_generation.
 *   3) Cảnh báo mềm theo sources.root_generation_offset != 0: chỉ trả thông tin cảnh báo cho Admin Wizard,
 *      không đổi status assertion và không sửa members.generation.
 *   4) Ghi business_process_logs với process_type = ENTITY_RESOLUTION_MERGE, actor_type đúng,
 *      metadata chứa conflict_count và preserved_assertions: true.
 *   5) Hỗ trợ resolveCanonicalMemberId đệ quy tối đa 10 cấp.
 * CHANGE LOGS:
 *   - 1.0.0: Tách riêng service entity-resolution, dual-write, lock + assertNoCycle.
 *   - 1.1.0: Thêm dual-write business_process_logs cho gộp thực thể (ENTITY_RESOLUTION_MERGE).
 */

'use strict';

const { randomUUID } = require('crypto');
const { prisma } = require('../../lib/prisma.js');
const { acquireTopologyLock, assertNoCycle } = require('./topology.guard.js');
const { supersedeOldParentages, flushParentageAudit } = require('./parentage.mapper.js');

const DEFAULT_CITATION = 'SYS_CIT::DEFAULT';
const CONFLICT_CIT_PREFIX = 'SYS_CIT::CONFLICT_MERGE::';
const MAX_REDIRECT_DEPTH = 10;
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
    // Cảnh báo rõ khi caller truyền actorType không hợp lệ
    console.warn(
      '[ENTITY_RESOLUTION] actor_type fallback',
      { raw_actor_type: raw, fallback_to: 'USER' }
    );
  }
  return {
    actorType: isValid ? raw : 'USER',
    actor_type_fallback: !isValid,
    raw_actor_type: raw,
  };
}

async function resolveCanonicalMemberId(db, { tenantId, memberId, maxDepth = MAX_REDIRECT_DEPTH }) {
  if (!memberId) return { memberId: null, depth: 0, chain: [], truncated: false };

  let currentId = memberId;
  const chain = [currentId];
  const visited = new Set([currentId]);
  let depth = 0;

  while (depth < maxDepth) {
    const row = await db.members.findFirst({
      where: {
        id: currentId,
        ...(tenantId ? { tenant_id: tenantId } : {}),
      },
      select: { id: true, merged_into_id: true },
    });

    if (!row || !row.merged_into_id) {
      return { memberId: currentId, depth, chain, truncated: false };
    }

    const nextId = row.merged_into_id;
    if (visited.has(nextId)) {
      fail(
        `Phát hiện vòng lặp merged_into_id tại thành viên [${nextId}].`,
        409,
        'ENTITY_MERGE_LOOP_DETECTED',
        { chain, nextId }
      );
    }

    chain.push(nextId);
    visited.add(nextId);
    currentId = nextId;
    depth += 1;
  }

  return {
    memberId: currentId,
    depth,
    chain,
    truncated: true,
  };
}

async function validateMergePreconditions(tx, { tenantId, sourceMemberId, targetMemberId }) {
  if (!tenantId || !sourceMemberId || !targetMemberId) {
    fail('Thiếu tenantId, sourceMemberId hoặc targetMemberId.', 422, 'ER_INVALID_PARAMS');
  }

  if (sourceMemberId === targetMemberId) {
    fail('Không thể tự gộp một thực thể vào chính nó (self-merge).', 422, 'ER_SELF_MERGE_FORBIDDEN', {
      sourceMemberId,
      targetMemberId,
    });
  }

  const [sourceMember, targetMember] = await Promise.all([
    tx.members.findFirst({
      where: { id: sourceMemberId, tenant_id: tenantId },
    }),
    tx.members.findFirst({
      where: { id: targetMemberId, tenant_id: tenantId },
    }),
  ]);

  if (!sourceMember) {
    fail(`Không tìm thấy thành viên nguồn [${sourceMemberId}].`, 404, 'ER_SOURCE_NOT_FOUND');
  }
  if (!targetMember) {
    fail(`Không tìm thấy thành viên đích [${targetMemberId}].`, 404, 'ER_TARGET_NOT_FOUND');
  }
  if (sourceMember.merged_into_id) {
    fail(
      `Thành viên nguồn [${sourceMemberId}] đã được gộp vào [${sourceMember.merged_into_id}].`,
      409,
      'ER_SOURCE_ALREADY_MERGED'
    );
  }
  if (targetMember.merged_into_id) {
    fail(
      `Thành viên đích [${targetMemberId}] đã được gộp vào [${targetMember.merged_into_id}].`,
      409,
      'ER_TARGET_ALREADY_MERGED'
    );
  }

  if (
    sourceMember.gender &&
    targetMember.gender &&
    sourceMember.gender !== targetMember.gender
  ) {
    fail(
      `Xung đột giới tính (GENDER_MISMATCH): [${sourceMember.gender}] không khớp [${targetMember.gender}].`,
      422,
      'GENDER_MISMATCH',
      {
        sourceGender: sourceMember.gender,
        targetGender: targetMember.gender,
      }
    );
  }

  const [sourceUsers, targetUsers, sourceLinks, targetLinks] = await Promise.all([
    tx.users.findMany({
      where: { member_id: sourceMemberId, deleted_at: null },
      select: { id: true },
    }),
    tx.users.findMany({
      where: { member_id: targetMemberId, deleted_at: null },
      select: { id: true },
    }),
    typeof tx.user_member_links?.findMany === 'function'
      ? tx.user_member_links.findMany({
          where: { tenant_id: tenantId, member_id: sourceMemberId, deleted_at: null },
          select: { id: true, user_id: true },
        })
      : Promise.resolve([]),
    typeof tx.user_member_links?.findMany === 'function'
      ? tx.user_member_links.findMany({
          where: { tenant_id: tenantId, member_id: targetMemberId, deleted_at: null },
          select: { id: true, user_id: true },
        })
      : Promise.resolve([]),
  ]);

  const sourceUserIds = new Set([
    ...sourceUsers.map((u) => u.id),
    ...sourceLinks.map((l) => l.user_id),
  ]);
  const targetUserIds = new Set([
    ...targetUsers.map((u) => u.id),
    ...targetLinks.map((l) => l.user_id),
  ]);

  if (sourceUserIds.size > 0 && targetUserIds.size > 0) {
    const distinctUsers = new Set([...sourceUserIds, ...targetUserIds]);
    if (distinctUsers.size > 1) {
      fail(
        'Cả hai bản ghi đều gắn với tài khoản người dùng khác nhau; chặn gộp tự động.',
        409,
        'ER_DUAL_ACCOUNT_CONFLICT',
        {
          sourceUserIds: Array.from(sourceUserIds),
          targetUserIds: Array.from(targetUserIds),
        }
      );
    }
  }

  return {
    sourceMember,
    targetMember,
  };
}

/**
 * Cảnh báo mềm (SOFT_WARNING) khi sources.root_generation_offset != 0 hoặc lệch Calibrated_Gen.
 * Chỉ phục vụ hiển thị cảnh báo trên Admin Wizard; không đổi status assertion và không sửa members.generation.
 */
async function computeSoftWarnings(tx, { tenantId, sourceMemberId, targetMemberId }) {
  const assertions = typeof tx.member_generation_assertions?.findMany === 'function'
    ? await tx.member_generation_assertions.findMany({
        where: {
          tenant_id: tenantId,
          member_id: { in: [sourceMemberId, targetMemberId] },
          deleted_at: null,
        },
        include: {
          sources: {
            select: {
              id: true,
              title: true,
              source_type: true,
              root_generation_offset: true,
            },
          },
        },
      })
    : [];

  const entries = assertions.map((a) => {
    const offset = Number(a.sources?.root_generation_offset ?? 0);
    const calibratedGen = Number(a.claimed_generation) + offset;
    return {
      assertion_id: a.id,
      member_id: a.member_id,
      source_id: a.source_id,
      source_title: a.sources?.title || null,
      citation_id: a.citation_id,
      claimed_generation: Number(a.claimed_generation),
      root_generation_offset: offset,
      calibrated_generation: calibratedGen,
      status: a.status,
    };
  });

  const warnings = [];
  for (const e of entries) {
    if (e.root_generation_offset !== 0) {
      warnings.push({
        code: 'SOFT_WARNING_NON_ZERO_OFFSET',
        severity: 'SOFT_WARNING',
        auto_disputed: false,
        affects_canonical_generation: false,
        member_id: e.member_id,
        assertion_id: e.assertion_id,
        source_id: e.source_id,
        source_title: e.source_title,
        root_generation_offset: e.root_generation_offset,
        claimed_generation: e.claimed_generation,
        calibrated_generation: e.calibrated_generation,
        message: `Nguồn [${e.source_title || e.source_id}] có root_generation_offset = ${e.root_generation_offset} (Calibrated_Gen = ${e.calibrated_generation}). Chỉ cảnh báo mềm trên Admin Wizard.`,
      });
    }
  }

  const sourceEntries = entries.filter((e) => e.member_id === sourceMemberId);
  const targetEntries = entries.filter((e) => e.member_id === targetMemberId);

  for (const s of sourceEntries) {
    for (const t of targetEntries) {
      if (s.calibrated_generation !== t.calibrated_generation) {
        warnings.push({
          code: 'SOFT_WARNING_CALIBRATED_GEN_MISMATCH',
          severity: 'SOFT_WARNING',
          auto_disputed: false,
          affects_canonical_generation: false,
          source_assertion_id: s.assertion_id,
          target_assertion_id: t.assertion_id,
          source_calibrated_gen: s.calibrated_generation,
          target_calibrated_gen: t.calibrated_generation,
          source_offset: s.root_generation_offset,
          target_offset: t.root_generation_offset,
          message: `Lệch mốc đời quy chiếu (Calibrated_Gen: ${s.calibrated_generation} vs ${t.calibrated_generation}). Chỉ cảnh báo mềm trên Admin Wizard.`,
        });
      }
    }
  }

  return {
    has_soft_warning: warnings.length > 0,
    warnings,
    entries,
  };
}

/**
 * Di dời & xử lý trùng (tenant_id, member_id, source_id, citation_id) trên member_generation_assertions:
 * - Bản ghi đích cũ giữ nguyên claimed_generation và status.
 * - Không sửa claimed_generation của bất kỳ bản ghi nào.
 * - Khi trùng khóa (tenant_id, targetMemberId, source_id, citation_id) và khác claimed_generation:
 *   tạo bản ghi assertion mới với citation_id = SYS_CIT::CONFLICT_MERGE::<source_assertion_id>,
 *   status = 'ACTIVE' và không tự gắn 'DISPUTED'.
 */
async function migrateGenerationAssertions(tx, {
  tenantId,
  sourceMemberId,
  targetMemberId,
  auditQueue,
}) {
  if (typeof tx.member_generation_assertions?.findMany !== 'function') {
    return { movedCount: 0, conflictCount: 0, conflictItems: [], migratedItems: [] };
  }

  const sourceAssertions = await tx.member_generation_assertions.findMany({
    where: {
      tenant_id: tenantId,
      member_id: sourceMemberId,
      deleted_at: null,
    },
  });

  if (sourceAssertions.length === 0) {
    return { movedCount: 0, conflictCount: 0, conflictItems: [], migratedItems: [] };
  }

  const targetAssertions = await tx.member_generation_assertions.findMany({
    where: {
      tenant_id: tenantId,
      member_id: targetMemberId,
      deleted_at: null,
    },
  });

  const targetByKey = new Map(
    targetAssertions.map((a) => [`${a.source_id}::${a.citation_id}`, a])
  );

  let movedCount = 0;
  let conflictCount = 0;
  const conflictItems = [];
  const migratedItems = [];

  for (const srcA of sourceAssertions) {
    const baseCitation = srcA.citation_id || DEFAULT_CITATION;
    const key = `${srcA.source_id}::${baseCitation}`;
    const existingTarget = targetByKey.get(key);

    if (existingTarget && Number(existingTarget.claimed_generation) !== Number(srcA.claimed_generation)) {
      const conflictCitationId = `${CONFLICT_CIT_PREFIX}${srcA.id}`;
      const origCit = baseCitation;
      const conflictNote = `ER_CONFLICT_MERGE;SOURCE_ASSERTION=${srcA.id};ORIG_CIT=${origCit};SRC_GEN=${srcA.claimed_generation};TGT_GEN=${existingTarget.claimed_generation}`;

      const conflictAssertion = await tx.member_generation_assertions.create({
        data: {
          tenant_id: tenantId,
          member_id: targetMemberId,
          source_id: srcA.source_id,
          citation_id: conflictCitationId,
          claimed_generation: Number(srcA.claimed_generation),
          status: 'ACTIVE',
          note: srcA.note ? `${srcA.note} | ${conflictNote}` : conflictNote,
        },
      });

      await tx.member_generation_assertions.update({
        where: { id: srcA.id },
        data: {
          deleted_at: new Date(),
          note: srcA.note
            ? `${srcA.note} | MIGRATED_TO_CONFLICT_ASSERTION=${conflictAssertion.id}`
            : `MIGRATED_TO_CONFLICT_ASSERTION=${conflictAssertion.id}`,
        },
      });

      conflictCount += 1;
      movedCount += 1;
      targetByKey.set(`${conflictAssertion.source_id}::${conflictAssertion.citation_id}`, conflictAssertion);

      const conflictRecord = {
        source_assertion_id: srcA.id,
        conflict_assertion_id: conflictAssertion.id,
        target_assertion_id: existingTarget.id,
        member_id: targetMemberId,
        source_id: srcA.source_id,
        original_citation_id: origCit,
        citation_id: conflictAssertion.citation_id,
        claimed_generation: Number(conflictAssertion.claimed_generation),
        target_claimed_generation: Number(existingTarget.claimed_generation),
        status: conflictAssertion.status,
      };
      conflictItems.push(conflictRecord);
      migratedItems.push(conflictRecord);

      auditQueue.push({
        tableName: 'member_generation_assertions',
        recordId: conflictAssertion.id,
        action: 'THEM_MOI',
        tenantId,
        changedBy: null,
        correlationId: null,
        oldData: {
          source_assertion_id: srcA.id,
          target_assertion_id: existingTarget.id,
          target_claimed_generation: existingTarget.claimed_generation,
          target_status: existingTarget.status,
        },
        newData: {
          id: conflictAssertion.id,
          member_id: targetMemberId,
          source_id: srcA.source_id,
          citation_id: conflictAssertion.citation_id,
          claimed_generation: conflictAssertion.claimed_generation,
          status: 'ACTIVE',
        },
        changeReason: `Tạo assertion conflict (${conflictAssertion.citation_id}) khi gộp thực thể`,
      });
      continue;
    }

    const relocated = await tx.member_generation_assertions.update({
      where: { id: srcA.id },
      data: {
        member_id: targetMemberId,
        citation_id: baseCitation,
      },
    });

    movedCount += 1;
    targetByKey.set(`${relocated.source_id}::${relocated.citation_id}`, relocated);
    migratedItems.push({
      assertion_id: relocated.id,
      from_member_id: sourceMemberId,
      to_member_id: targetMemberId,
      source_id: relocated.source_id,
      citation_id: relocated.citation_id,
      claimed_generation: Number(relocated.claimed_generation),
      status: relocated.status,
      is_conflict: false,
    });
  }

  return {
    movedCount,
    conflictCount,
    conflictItems,
    migratedItems,
  };
}

async function rewireDirectAndSatelliteRecords(tx, {
  tenantId,
  sourceMemberId,
  targetMemberId,
  actorId,
  correlationId,
  auditQueue,
  pendingEdges,
}) {
  const asParentEdges = await tx.parentages.findMany({
    where: {
      tenant_id: tenantId,
      parent_id: sourceMemberId,
      deleted_at: null,
    },
  });

  for (const edge of asParentEdges) {
    if (edge.child_id === targetMemberId) {
      await tx.parentages.update({
        where: { id: edge.id },
        data: {
          review_status: 'SUPERSEDED',
          is_selected_for_lineage: false,
          changed_by: actorId || null,
          note: `SUPERSEDED do gộp [${sourceMemberId}] -> [${targetMemberId}]`,
        },
      });
      continue;
    }

    await assertNoCycle(tx, {
      tenantId,
      parentId: targetMemberId,
      childId: edge.child_id,
      pendingEdges,
      isNewChild: false,
    });

    const dupEdge = await tx.parentages.findFirst({
      where: {
        tenant_id: tenantId,
        parent_id: targetMemberId,
        child_id: edge.child_id,
        relationship_type: edge.relationship_type,
        review_status: edge.review_status,
        deleted_at: null,
      },
    });

    if (dupEdge) {
      await tx.parentages.update({
        where: { id: edge.id },
        data: {
          review_status: 'SUPERSEDED',
          is_selected_for_lineage: false,
          changed_by: actorId || null,
          note: `Deduplicate SUPERSEDED khi gộp [${sourceMemberId}] -> [${targetMemberId}]`,
        },
      });
    } else {
      await tx.parentages.update({
        where: { id: edge.id },
        data: {
          parent_id: targetMemberId,
          changed_by: actorId || null,
          note: `Re-wire parent_id từ [${sourceMemberId}] -> [${targetMemberId}]`,
        },
      });
      pendingEdges.push({ parentId: targetMemberId, childId: edge.child_id });
    }
  }

  const asChildEdges = await tx.parentages.findMany({
    where: {
      tenant_id: tenantId,
      child_id: sourceMemberId,
      review_status: 'ACCEPTED',
      deleted_at: null,
    },
  });

  const keepParents = [];
  for (const edge of asChildEdges) {
    if (edge.parent_id === targetMemberId) {
      await tx.parentages.update({
        where: { id: edge.id },
        data: {
          review_status: 'SUPERSEDED',
          is_selected_for_lineage: false,
          changed_by: actorId || null,
        },
      });
      continue;
    }

    await assertNoCycle(tx, {
      tenantId,
      parentId: edge.parent_id,
      childId: targetMemberId,
      pendingEdges,
      isNewChild: false,
    });

    const existingTargetEdge = await tx.parentages.findFirst({
      where: {
        tenant_id: tenantId,
        parent_id: edge.parent_id,
        child_id: targetMemberId,
        relationship_type: edge.relationship_type,
        review_status: 'ACCEPTED',
        deleted_at: null,
      },
    });

    if (existingTargetEdge) {
      await tx.parentages.update({
        where: { id: edge.id },
        data: {
          review_status: 'SUPERSEDED',
          is_selected_for_lineage: false,
          changed_by: actorId || null,
        },
      });
    } else {
      await tx.parentages.update({
        where: { id: edge.id },
        data: {
          child_id: targetMemberId,
          changed_by: actorId || null,
        },
      });
      keepParents.push(edge.parent_id);
      pendingEdges.push({ parentId: edge.parent_id, childId: targetMemberId });
    }
  }

  if (keepParents.length > 0) {
    await supersedeOldParentages(tx, {
      tenantId,
      childId: targetMemberId,
      keepParentIds: keepParents,
      actorId,
      correlationId,
      ticketId: `ER_${sourceMemberId}_${targetMemberId}`,
      auditQueue,
    });
  }

  await tx.marriages.updateMany({
    where: { tenant_id: tenantId, husband_id: sourceMemberId, deleted_at: null },
    data: { husband_id: targetMemberId, changed_by: actorId || null },
  });
  await tx.marriages.updateMany({
    where: { tenant_id: tenantId, wife_id: sourceMemberId, deleted_at: null },
    data: { wife_id: targetMemberId, changed_by: actorId || null },
  });

  await tx.members.updateMany({
    where: { tenant_id: tenantId, father_id: sourceMemberId, deleted_at: null },
    data: { father_id: targetMemberId, changed_by: actorId || null },
  });
  await tx.members.updateMany({
    where: { tenant_id: tenantId, mother_id: sourceMemberId, deleted_at: null },
    data: { mother_id: targetMemberId, changed_by: actorId || null },
  });

  const satelliteModels = [
    'achievements',
    'biographies',
    'fund_transactions',
    'member_privacy_rules',
    'member_residences',
  ];

  for (const modelName of satelliteModels) {
    if (typeof tx[modelName]?.updateMany === 'function') {
      await tx[modelName].updateMany({
        where: { tenant_id: tenantId, member_id: sourceMemberId, deleted_at: null },
        data: { member_id: targetMemberId, changed_by: actorId || null },
      });
    }
  }

  for (const modelName of satelliteModels) {
    if (typeof tx[modelName]?.updateMany === 'function') {
      await tx[modelName].updateMany({
        where: { tenant_id: tenantId, member_id: sourceMemberId, deleted_at: null },
        data: { member_id: targetMemberId, changed_by: actorId || null },
      });
    }
  }
}

async function previewDuplicateEntityResolution({
  tenantId,
  sourceMemberId,
  targetMemberId,
  dbClient = prisma,
}) {
  return dbClient.$transaction(async (tx) => {
    const check = await validateMergePreconditions(tx, {
      tenantId,
      sourceMemberId,
      targetMemberId,
    });

    const softWarningInfo = await computeSoftWarnings(tx, {
      tenantId,
      sourceMemberId,
      targetMemberId,
    });

    const sourceAssertions = typeof tx.member_generation_assertions?.findMany === 'function'
      ? await tx.member_generation_assertions.findMany({
          where: { tenant_id: tenantId, member_id: sourceMemberId, deleted_at: null },
        })
      : [];

    const targetAssertions = typeof tx.member_generation_assertions?.findMany === 'function'
      ? await tx.member_generation_assertions.findMany({
          where: { tenant_id: tenantId, member_id: targetMemberId, deleted_at: null },
        })
      : [];

    const targetByKey = new Map(
      targetAssertions.map((a) => [`${a.source_id}::${a.citation_id || DEFAULT_CITATION}`, a])
    );

    const potentialConflicts = [];
    for (const srcA of sourceAssertions) {
      const baseCitation = srcA.citation_id || DEFAULT_CITATION;
      const existingTarget = targetByKey.get(`${srcA.source_id}::${baseCitation}`);
      if (existingTarget && Number(existingTarget.claimed_generation) !== Number(srcA.claimed_generation)) {
        potentialConflicts.push({
          source_assertion_id: srcA.id,
          target_assertion_id: existingTarget.id,
          source_id: srcA.source_id,
          original_citation_id: baseCitation,
          projected_conflict_citation_id: `${CONFLICT_CIT_PREFIX}${srcA.id}`,
          source_claimed_generation: Number(srcA.claimed_generation),
          target_claimed_generation: Number(existingTarget.claimed_generation),
          projected_status: 'ACTIVE',
          auto_disputed: false,
        });
      }
    }

    return {
      can_merge: true,
      tenant_id: tenantId,
      source_member: {
        id: check.sourceMember.id,
        full_name: check.sourceMember.full_name,
        gender: check.sourceMember.gender,
        generation: check.sourceMember.generation,
      },
      target_member: {
        id: check.targetMember.id,
        full_name: check.targetMember.full_name,
        gender: check.targetMember.gender,
        generation: check.targetMember.generation,
      },
      source_assertions_to_migrate: sourceAssertions.length,
      potential_conflict_count: potentialConflicts.length,
      potential_conflicts: potentialConflicts,
      soft_warning: softWarningInfo,
    };
  });
}

async function resolveDuplicateEntity({
  tenantId,
  sourceMemberId,
  targetMemberId,
  actorId = SYSTEM_ACTOR_ID,
  actorType = 'USER',
  correlationId = null,
  attemptNo = 1,
  dryRun = false,
  dbClient = prisma,
}) {
  const corrId = correlationId || randomUUID();
  const actorNorm = normalizeActorType(actorType);
  const normalizedActorType = actorNorm.actorType;

  return dbClient.$transaction(
    async (tx) => {
      await acquireTopologyLock(tx, tenantId);

      const check = await validateMergePreconditions(tx, {
        tenantId,
        sourceMemberId,
        targetMemberId,
      });

      const softWarningInfo = await computeSoftWarnings(tx, {
        tenantId,
        sourceMemberId,
        targetMemberId,
      });

      if (dryRun) {
        return {
          dry_run: true,
          correlation_id: corrId,
          source_member_id: sourceMemberId,
          target_member_id: targetMemberId,
          soft_warning: softWarningInfo,
        };
      }

      const auditQueue = [];
      const pendingEdges = [];

      const assertionResult = await migrateGenerationAssertions(tx, {
        tenantId,
        sourceMemberId,
        targetMemberId,
        auditQueue,
      });

      await rewireDirectAndSatelliteRecords(tx, {
        tenantId,
        sourceMemberId,
        targetMemberId,
        actorId,
        correlationId: corrId,
        auditQueue,
        pendingEdges,
      });

      const frozenAt = new Date();
      await tx.members.update({
        where: { id: sourceMemberId },
        data: {
          merged_into_id: targetMemberId,
          deleted_at: frozenAt,
          changed_by: actorId || null,
        },
      });

      auditQueue.push({
        tableName: 'members',
        recordId: sourceMemberId,
        action: 'CAP_NHAT',
        tenantId,
        changedBy: actorId || null,
        correlationId: corrId,
        oldData: {
          id: sourceMemberId,
          merged_into_id: null,
          deleted_at: check.sourceMember.deleted_at,
        },
        newData: {
          id: sourceMemberId,
          merged_into_id: targetMemberId,
          deleted_at: frozenAt,
        },
        changeReason: `Gộp thực thể [${sourceMemberId}] vào [${targetMemberId}]`,
      });

      await flushParentageAudit(tx, auditQueue);

      if (typeof tx.business_process_logs?.create === 'function') {
        await tx.business_process_logs.create({
          data: {
            id: randomUUID(),
            correlation_id: corrId,
            attempt_no: attemptNo,
            process_type: 'ENTITY_RESOLUTION_MERGE',
            actor_type: normalizedActorType,
            actor_id: actorId || SYSTEM_ACTOR_ID,
            tenant_id: tenantId,
            process_status: 'SUCCESS',
            metadata: {
              stage: 'ENTITY_RESOLUTION_MERGE',
              source_member_id: sourceMemberId,
              target_member_id: targetMemberId,
              merged_into_id: targetMemberId,
              conflict_count: assertionResult.conflictCount,
              conflicts: assertionResult.conflictItems,
              assertions_moved_count: assertionResult.movedCount,
              preserved_assertions: true,
              soft_warning: softWarningInfo,
              actor_type_fallback: actorNorm.actor_type_fallback,
              raw_actor_type: actorNorm.raw_actor_type,
            },
          },
        });
      }

      return {
        ok: true,
        correlation_id: corrId,
        source_member_id: sourceMemberId,
        target_member_id: targetMemberId,
        merged_into_id: targetMemberId,
        conflict_count: assertionResult.conflictCount,
        conflicts: assertionResult.conflictItems,
        assertions: assertionResult,
        soft_warning: softWarningInfo,
      };
    },
    { maxWait: 10000, timeout: 30000 }
  );
}

module.exports = {
  DEFAULT_CITATION,
  CONFLICT_CIT_PREFIX,
  MAX_REDIRECT_DEPTH,
  resolveCanonicalMemberId,
  validateMergePreconditions,
  computeSoftWarnings,
  migrateGenerationAssertions,
  previewDuplicateEntityResolution,
  resolveDuplicateEntity,
};