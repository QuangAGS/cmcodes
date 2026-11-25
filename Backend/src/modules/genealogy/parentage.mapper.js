/**
 * PATH       : src/modules/genealogy/parentage.mapper.js
 * DATETIME   : 2026-11-25T13:47:00+07:00
 * VERSION    : 1.2.0-SUPERSEDED-SAFE-DUAL-WRITE
 * DESCRIPTION:
 * - Service Mapper dùng chung cho dual-write parentages bảo vệ OP/RP.
 * - Tự động acquireTopologyLock + assertNoCycle (bao phủ Multiple Occurrences).
 * - Xử lý SUPERSEDED an toàn trong 1 transaction, tránh đụng unique constraint
 *   uq_parentage_assertion (tenant_id, parent_id, child_id, relationship_type, review_status).
 * - Hỗ trợ metadata.relative_level trên cạnh parentages; không đụng member_generation_assertions.
 * CHANGE LOGS:
 *   - 1.0.0: Tách riêng mapper parentages, dual-write, lock + assertNoCycle.
 *   - 1.1.0: Thêm metadata.relative_level trên cạnh parentages.
 *   - 1.2.0: Thêm dual-write audit_logs cho parentages (CAP_NHAT / THEM_MOI).
 */

'use strict';

const { acquireTopologyLock, assertNoCycle } = require('./topology.guard.js');

function mapChildTypeToParentageType(childType) {
  switch (childType) {
    case 'CON_NUOI':
      return 'ADOPTIVE';
    case 'CON_DO_DAU':
      return 'FOSTER';
    case 'CON_RIENG':
      return 'STEPCHILD';
    case 'KHAC':
      return 'OTHER';
    case 'CON_DE':
    default:
      return 'BIOLOGICAL';
  }
}

async function supersedeOldParentages(tx, {
  tenantId,
  childId,
  keepParentIds = [],
  actorId,
  correlationId,
  ticketId,
  auditQueue,
}) {
  const keepSet = new Set((keepParentIds || []).filter(Boolean));

  const olds = await tx.parentages.findMany({
    where: {
      tenant_id: tenantId,
      child_id: childId,
      review_status: 'ACCEPTED',
      deleted_at: null,
    },
    select: {
      id: true,
      parent_id: true,
      relationship_type: true,
      union_id: true,
      review_status: true,
      is_selected_for_lineage: true,
      metadata: true,
    },
  });

  const targets = olds.filter((p) => !keepSet.has(p.parent_id));
  if (targets.length === 0) return [];

  const supersededRows = [];

  for (const old of targets) {
    const existingSuperseded = await tx.parentages.findFirst({
      where: {
        tenant_id: tenantId,
        parent_id: old.parent_id,
        child_id: childId,
        relationship_type: old.relationship_type,
        review_status: 'SUPERSEDED',
      },
      select: { id: true },
    });

    if (existingSuperseded) {
      const retired = await tx.parentages.update({
        where: { id: old.id },
        data: {
          is_selected_for_lineage: false,
          deleted_at: new Date(),
          changed_by: actorId || null,
          note: `Thay thế bởi quan hệ mới; bản ghi SUPERSEDED đã tồn tại (${ticketId || 'OP'})`,
        },
      });
      supersededRows.push(retired);

      auditQueue.push({
        tableName: 'parentages',
        recordId: retired.id,
        action: 'CAP_NHAT',
        tenantId,
        changedBy: actorId || null,
        correlationId: correlationId || null,
        oldData: {
          id: old.id,
          parent_id: old.parent_id,
          review_status: old.review_status,
          is_selected_for_lineage: old.is_selected_for_lineage,
        },
        newData: {
          id: retired.id,
          parent_id: retired.parent_id,
          review_status: old.review_status,
          is_selected_for_lineage: false,
          superseded_by_existing_id: existingSuperseded.id,
        },
        changeReason: `Chuyển tiếp SUPERSEDED an toàn (Context: ${ticketId || 'OP'})`,
      });
      continue;
    }

    const updated = await tx.parentages.update({
      where: { id: old.id },
      data: {
        review_status: 'SUPERSEDED',
        is_selected_for_lineage: false,
        changed_by: actorId || null,
        note: `Đánh dấu SUPERSEDED khi cập nhật quan hệ phụ mẫu (Context: ${ticketId || 'OP'})`,
      },
    });
    supersededRows.push(updated);

    auditQueue.push({
      tableName: 'parentages',
      recordId: updated.id,
      action: 'CAP_NHAT',
      tenantId,
      changedBy: actorId || null,
      correlationId: correlationId || null,
      oldData: {
        id: old.id,
        parent_id: old.parent_id,
        review_status: old.review_status,
        is_selected_for_lineage: old.is_selected_for_lineage,
      },
      newData: {
        id: updated.id,
        parent_id: updated.parent_id,
        review_status: 'SUPERSEDED',
        is_selected_for_lineage: false,
      },
      changeReason: `Đánh dấu SUPERSEDED cạnh cũ (Context: ${ticketId || 'OP'})`,
    });
  }

  return supersededRows;
}

async function lowerOldParentages(tx, params) {
  return supersedeOldParentages(tx, params);
}

function buildEdgeMetadata(existingMetadata, relativeLevel, extra = {}) {
  const base =
    existingMetadata && typeof existingMetadata === 'object' && !Array.isArray(existingMetadata)
      ? { ...existingMetadata }
      : {};
  if (relativeLevel != null) {
    base.relative_level = Number(relativeLevel);
  }
  return { ...base, ...extra };
}

async function upsertParentage(tx, {
  tenantId,
  parentId,
  childId,
  relationshipType,
  unionId,
  actorId,
  correlationId,
  ticketId,
  isNewChild = false,
  relativeLevel = null,
  metadataExtra = {},
  auditQueue,
}) {
  if (!parentId || !childId || parentId === childId) return null;

  if (!isNewChild) {
    const existing = await tx.parentages.findFirst({
      where: {
        tenant_id: tenantId,
        parent_id: parentId,
        child_id: childId,
        relationship_type: relationshipType,
        review_status: 'ACCEPTED',
        deleted_at: null,
      },
      select: {
        id: true,
        union_id: true,
        is_selected_for_lineage: true,
        metadata: true,
      },
    });

    if (existing) {
      const nextMetadata = buildEdgeMetadata(existing.metadata, relativeLevel, metadataExtra);
      const updated = await tx.parentages.update({
        where: { id: existing.id },
        data: {
          union_id: unionId || null,
          review_status: 'ACCEPTED',
          is_selected_for_lineage: true,
          metadata: nextMetadata,
          changed_by: actorId || null,
          deleted_at: null,
          note: `Cập nhật từ Mapper (Context: ${ticketId || 'OP'})`,
        },
      });

      auditQueue.push({
        tableName: 'parentages',
        recordId: updated.id,
        action: 'CAP_NHAT',
        tenantId,
        changedBy: actorId || null,
        correlationId: correlationId || null,
        oldData: {
          id: existing.id,
          union_id: existing.union_id,
          is_selected_for_lineage: existing.is_selected_for_lineage,
          metadata: existing.metadata,
        },
        newData: {
          id: updated.id,
          union_id: updated.union_id,
          is_selected_for_lineage: true,
          metadata: nextMetadata,
        },
        changeReason: `Cập nhật quan hệ phụ mẫu (Context: ${ticketId || 'OP'})`,
      });

      return updated;
    }
  }

  const initialMetadata = buildEdgeMetadata({}, relativeLevel, metadataExtra);
  const created = await tx.parentages.create({
    data: {
      tenant_id: tenantId,
      parent_id: parentId,
      child_id: childId,
      relationship_type: relationshipType,
      union_id: unionId || null,
      review_status: 'ACCEPTED',
      is_selected_for_lineage: true,
      metadata: initialMetadata,
      note: `Ghi nhận từ Mapper (Context: ${ticketId || 'OP'})`,
      changed_by: actorId || null,
    },
  });

  auditQueue.push({
    tableName: 'parentages',
    recordId: created.id,
    action: 'THEM_MOI',
    tenantId,
    changedBy: actorId || null,
    correlationId: correlationId || null,
    oldData: null,
    newData: {
      id: created.id,
      parent_id: created.parent_id,
      child_id: created.child_id,
      relationship_type: created.relationship_type,
      union_id: created.union_id,
      review_status: 'ACCEPTED',
      is_selected_for_lineage: true,
      metadata: initialMetadata,
    },
    changeReason: `Tạo quan hệ phụ mẫu (Context: ${ticketId || 'OP'})`,
  });

  return created;
}

async function syncMemberParentages(tx, {
  tenantId,
  childId,
  fatherId = null,
  motherId = null,
  unionId = null,
  childType = 'CON_DE',
  actorId,
  correlationId = null,
  isNewChild = false,
  relativeLevel = null,
  metadataExtra = {},
  auditQueue = [],
  pendingEdges = [],
  ticketId = null,
}) {
  if (!tenantId || !childId) return;

  await acquireTopologyLock(tx, tenantId);

  const skip = ['CON_DAU', 'CON_RE'].includes(childType);
  if (skip) return;

  const relationshipType = mapChildTypeToParentageType(childType);
  const nextParents = [fatherId, motherId].filter(Boolean);

  if (!isNewChild) {
    await supersedeOldParentages(tx, {
      tenantId,
      childId,
      keepParentIds: nextParents,
      actorId,
      correlationId,
      ticketId,
      auditQueue,
    });
  }

  if (fatherId) {
    await assertNoCycle(tx, { tenantId, parentId: fatherId, childId, pendingEdges, isNewChild });
    await upsertParentage(tx, {
      tenantId,
      parentId: fatherId,
      childId,
      relationshipType,
      unionId,
      actorId,
      correlationId,
      ticketId,
      isNewChild,
      relativeLevel,
      metadataExtra,
      auditQueue,
    });
    pendingEdges.push({ parentId: fatherId, childId });
  }

  if (motherId) {
    await assertNoCycle(tx, { tenantId, parentId: motherId, childId, pendingEdges, isNewChild });
    await upsertParentage(tx, {
      tenantId,
      parentId: motherId,
      childId,
      relationshipType,
      unionId,
      actorId,
      correlationId,
      ticketId,
      isNewChild,
      relativeLevel,
      metadataExtra,
      auditQueue,
    });
    pendingEdges.push({ parentId: motherId, childId });
  }
}

async function flushParentageAudit(tx, auditQueue = []) {
  if (!Array.isArray(auditQueue) || auditQueue.length === 0) return;

  if (typeof tx.audit_logs?.createMany === 'function') {
    const payload = auditQueue.map((item) => ({
      tenant_id: item.tenantId,
      table_name: item.tableName,
      record_id: item.recordId,
      action: item.action,
      changed_by: item.changedBy || null,
      change_reason: item.changeReason || null,
      old_data: item.oldData || null,
      new_data: item.newData || null,
      correlation_id: item.correlationId || null,
      created_at: new Date(),
    }));
    await tx.audit_logs.createMany({ data: payload });
  }
}

module.exports = {
  mapChildTypeToParentageType,
  supersedeOldParentages,
  lowerOldParentages,
  upsertParentage,
  syncMemberParentages,
  flushParentageAudit,
};
