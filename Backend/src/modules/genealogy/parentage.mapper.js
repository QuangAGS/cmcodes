/**
 * PATH       : Backend/src/modules/genealogy/parentage.mapper.js
 * DATETIME   : 2026-11-02T15:10:00+07:00
 * VERSION    : 1.1.0-PRODUCTION-READY
 * DESCRIPTION:
 * - Service Mapper dùng chung cho dual-write parentages ngoài MFO.
 * - Tự động acquireTopologyLock + assertNoCycle (hỗ trợ isNewChild bỏ qua CTE SQL).
 * - Hạ cờ cạnh cũ khi reassign hoặc xóa quan hệ, upsert cạnh mới.
 * - Tối ưu hóa: Bỏ findFirst khi isNewChild === true.
 * - Thu thập auditQueue để caller flush batch trong 1 round-trip.
 */

'use strict';

const { acquireTopologyLock, assertNoCycle } = require('./topology.guard.js');

/**
 * Ánh xạ child_type → relationship_type (đồng bộ với mfo.gate2.js)
 */
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

/**
 * Hạ cờ is_selected_for_lineage của các cạnh cũ của một child.
 * Ghi audit cho từng cạnh bị hạ.
 */
async function lowerOldParentages(tx, { tenantId, childId, actorId, correlationId, ticketId, auditQueue }) {
  const olds = await tx.parentages.findMany({
    where: {
      tenant_id: tenantId,
      child_id: childId,
      is_selected_for_lineage: true,
      deleted_at: null,
    },
    select: { id: true, parent_id: true, union_id: true },
  });

  if (olds.length === 0) return;

  await tx.parentages.updateMany({
    where: { id: { in: olds.map((p) => p.id) } },
    data: {
      is_selected_for_lineage: false,
      changed_by: actorId,
    },
  });

  for (const old of olds) {
    auditQueue.push({
      tableName: 'parentages',
      recordId: old.id,
      action: 'CAP_NHAT',
      tenantId,
      changedBy: actorId,
      correlationId,
      oldData: { id: old.id, parent_id: old.parent_id, is_selected_for_lineage: true },
      newData: { id: old.id, parent_id: old.parent_id, is_selected_for_lineage: false },
      changeReason: `Hạ cờ cạnh cũ (Ticket/Context: ${ticketId || 'OP'})`,
    });
  }
}

/**
 * Upsert một cạnh parentage có tối ưu cho isNewChild.
 */
async function upsertParentage(tx, { tenantId, parentId, childId, relationshipType, unionId, actorId, correlationId, ticketId, isNewChild = false, auditQueue }) {
  if (!parentId || !childId || parentId === childId) return null;

  // Nếu không phải con mới, kiểm tra quan hệ hiện có để cập nhật
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
      select: { id: true, union_id: true, is_selected_for_lineage: true },
    });

    if (existing) {
      const updated = await tx.parentages.update({
        where: { id: existing.id },
        data: {
          union_id: unionId || null,
          is_selected_for_lineage: true,
          changed_by: actorId,
          deleted_at: null,
          note: `Cập nhật từ Mapper (Context: ${ticketId || 'OP'})`,
        },
      });

      auditQueue.push({
        tableName: 'parentages',
        recordId: updated.id,
        action: 'CAP_NHAT',
        tenantId,
        changedBy: actorId,
        correlationId,
        oldData: { id: existing.id, union_id: existing.union_id, is_selected_for_lineage: existing.is_selected_for_lineage },
        newData: { id: updated.id, union_id: updated.union_id, is_selected_for_lineage: true },
        changeReason: `Cập nhật quan hệ phụ mẫu (Context: ${ticketId || 'OP'})`,
      });

      return updated;
    }
  }

  // Con mới hoặc quan hệ chưa có: tạo mới trực tiếp
  const created = await tx.parentages.create({
    data: {
      tenant_id: tenantId,
      parent_id: parentId,
      child_id: childId,
      relationship_type: relationshipType,
      union_id: unionId || null,
      review_status: 'ACCEPTED',
      is_selected_for_lineage: true,
      note: `Ghi nhận từ Mapper (Context: ${ticketId || 'OP'})`,
      changed_by: actorId,
    },
  });

  auditQueue.push({
    tableName: 'parentages',
    recordId: created.id,
    action: 'THEM_MOI',
    tenantId,
    changedBy: actorId,
    correlationId,
    oldData: null,
    newData: {
      id: created.id,
      parent_id: created.parent_id,
      child_id: created.child_id,
      relationship_type: created.relationship_type,
      union_id: created.union_id,
      is_selected_for_lineage: true,
    },
    changeReason: `Tạo quan hệ phụ mẫu (Context: ${ticketId || 'OP'})`,
  });

  return created;
}

/**
 * Đồng bộ parentages cho một child.
 * Gọi trong transaction, sau khi đã ghi members.father_id / mother_id.
 */
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
  auditQueue = [],
  pendingEdges = [],
  ticketId = null,
}) {
  if (!tenantId || !childId) return;

  await acquireTopologyLock(tx, tenantId);

  const relationshipType = mapChildTypeToParentageType(childType);
  const skip = ['CON_DAU', 'CON_RE'].includes(childType);

  if (skip) return;

  // Nếu là reassign (không phải con mới sinh), hạ cờ cạnh cũ trước
  if (!isNewChild) {
    await lowerOldParentages(tx, { tenantId, childId, actorId, correlationId, ticketId, auditQueue });
  }

  if (fatherId) {
    // Đã truyền chính xác cờ isNewChild vào assertNoCycle
    await assertNoCycle(tx, { tenantId, parentId: fatherId, childId, pendingEdges, isNewChild });
    await upsertParentage(tx, {
      tenantId, parentId: fatherId, childId, relationshipType, unionId,
      actorId, correlationId, ticketId, isNewChild, auditQueue,
    });
    pendingEdges.push({ parentId: fatherId, childId });
  }

  if (motherId) {
    // Đã truyền chính xác cờ isNewChild vào assertNoCycle
    await assertNoCycle(tx, { tenantId, parentId: motherId, childId, pendingEdges, isNewChild });
    await upsertParentage(tx, {
      tenantId, parentId: motherId, childId, relationshipType, unionId,
      actorId, correlationId, ticketId, isNewChild, auditQueue,
    });
    pendingEdges.push({ parentId: motherId, childId });
  }
}

/**
 * Helper flush toàn bộ auditQueue của mapper trong 1 round-trip
 */
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
  lowerOldParentages,
  upsertParentage,
  syncMemberParentages,
  flushParentageAudit,
};