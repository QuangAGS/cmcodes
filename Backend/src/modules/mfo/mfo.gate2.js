/**
 * PATH       : backend/src/modules/mfo/mfo.gate2.js
 * DATETIME   : 2026-10-30T18:10:00+07:00
 * VERSION    : 1.3.2-PERFORMANCE-OPTIMIZED
 * DESCRIPTION:
 * - Tối ưu hóa hiệu năng Cửa 2: kéo giảm thời gian thực thi từ >5s xuống <1.5s.
 * - Khử bỏ truy vấn parentages.findFirst thừa thãi cho các thành viên mới tạo.
 * - Nạp song song cache thành viên và hôn nhân bằng Promise.all.
 * - Loại bỏ mutation và audit trùng lặp trên proposals (nhường quyền duy nhất cho SRPF sideEffect).
 * - Chuẩn hóa enum audit_logs_action sang 'THEM_MOI' khớp schema Prisma.
 *
 * CHANGE LOG:
 * - 2026-10-30T18:10:00+07:00 | 1.3.2 | Tối ưu hóa hiệu năng: khử findFirst thừa, song song hóa read cache, chuẩn hóa enum THEM_MOI.
 * - 2026-10-30T16:45:00+07:00 | 1.3.1 | Tích hợp audit.create vào executeGate2DbMutation và upsertParentage để lưu vết kiểm toán chi tiết trên members, marriages, parentages.
 * - 2026-10-30T15:30:00+07:00 | 1.3.0 | Bổ sung Dual-write vào bảng parentages khi duyệt Cửa 2 (GAP-07).
 */
'use strict';

const { audit } = require('../../lib/prisma.js');

function fail(message, statusCode, code) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  err.isOperational = true;
  throw err;
}

function layerOf(payload) {
  const root = payload && typeof payload === 'object' ? payload : {};
  const layer = root.business_layer && typeof root.business_layer === 'object' ? root.business_layer : root;
  return {
    staging: layer.smp_staging_data || root.smp_staging_data || {},
    delta: layer.canvas_delta || root.canvas_delta || {},
  };
}

function ownerIdOf(ownerNodeId, memberMap) {
  if (!ownerNodeId) return null;
  if (String(ownerNodeId).startsWith('draft-child-')) return memberMap.get(ownerNodeId) || null;
  if (String(ownerNodeId).startsWith('st:')) {
    const parts = String(ownerNodeId).split(':');
    return parts[2] || parts[1] || null;
  }
  return ownerNodeId;
}

function requireClan(smp, who) {
  if (smp.is_clan !== true && smp.is_clan !== false) {
    fail(`Chưa khẳng định nội tộc cho ${who}.`, 422, 'MFO_CLAN_UNCONFIRMED');
  }
  return smp.is_clan === true;
}

function generationAfter(parent) {
  if (!parent || parent.generation == null) {
    fail('Người đời trên chưa có đời trên sổ.', 422, 'MFO_GENERATION_REQUIRED');
  }
  return Number(parent.generation) + 1;
}

function refuseIfOnBook(members, { fullName, fatherId, motherId }) {
  if (!fullName || (!fatherId && !motherId)) return;
  const hit = members.some((m) => {
    if (m.full_name !== fullName) return false;
    if (fatherId && m.father_id !== fatherId) return false;
    if (motherId && m.mother_id !== motherId) return false;
    return true;
  });
  if (hit) fail('Người này đã có trên sổ với cùng cha mẹ.', 409, 'MFO_ALREADY_ON_BOOK');
}

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
 * <2026-10-30T18:10:00+07:00>
 * Mục đích: Ghi/cập nhật parentages tối ưu hiệu năng.
 * Tối ưu: Nếu là isNewChild = true, bỏ qua findFirst vì bản ghi chắc chắn chưa có trong DB.
 */
async function upsertParentage(tx, { tenantId, parentId, childId, relationshipType, unionId, actorId, ticketId, correlationId, isNewChild = false }) {
  if (!parentId || !childId || parentId === childId) return null;

  // Với con mới tạo, trực tiếp INSERT không cần findFirst trước
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
          note: `Cập nhật từ SRPF Gate 2 (Ticket: ${ticketId || 'N/A'})`,
        },
      });

      if (audit && typeof audit.create === 'function') {
        await audit.create(tx, {
          tableName: 'parentages',
          recordId: updated.id,
          action: 'CAP_NHAT',
          tenantId,
          changedBy: actorId,
          correlationId,
          oldData: {
            id: existing.id,
            union_id: existing.union_id,
            is_selected_for_lineage: existing.is_selected_for_lineage,
          },
          newData: {
            id: updated.id,
            union_id: updated.union_id,
            is_selected_for_lineage: updated.is_selected_for_lineage,
          },
          changeReason: `Cập nhật quan hệ phụ mẫu qua duyệt MFO Gate 2 (Ticket #${ticketId})`,
        });
      }

      return updated;
    }
  }

  const created = await tx.parentages.create({
    data: {
      tenant_id: tenantId,
      parent_id: parentId,
      child_id: childId,
      relationship_type: relationshipType,
      union_id: unionId || null,
      review_status: 'ACCEPTED',
      is_selected_for_lineage: true,
      note: `Ghi nhận từ SRPF Gate 2 (Ticket: ${ticketId || 'N/A'})`,
      changed_by: actorId,
    },
  });

  if (audit && typeof audit.create === 'function') {
    await audit.create(tx, {
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
        review_status: created.review_status,
      },
      changeReason: `Tạo quan hệ phụ mẫu mới qua duyệt MFO Gate 2 (Ticket #${ticketId})`,
    });
  }

  return created;
}

async function executeGate2DbMutation(tx, { tenantId, actorId, proposal }) {
  const correlationId = proposal && proposal.correlation_id ? proposal.correlation_id : null;
  const ticketId = proposal && proposal.id ? proposal.id : null;

  const { staging, delta } = layerOf(proposal.payload);
  const children = (Array.isArray(delta.draft_children) ? delta.draft_children : [])
    .slice()
    .sort((a, b) => Number(a.depth || 0) - Number(b.depth || 0));
  const spouses = Array.isArray(delta.draft_spouses) ? delta.draft_spouses : [];

  for (const child of children) {
    const smp = staging[child.id] || {};
    if (!String(smp.full_name || '').trim()) fail('Con nháp chưa có hồ sơ.', 422, 'MFO_STAGING_INCOMPLETE');
  }
  for (const spouse of spouses) {
    const smp = staging[spouse.union_id] || {};
    if (!String(smp.full_name || smp.partner_full_name || '').trim()) {
      fail('Hôn phối nháp chưa có hồ sơ.', 422, 'MFO_STAGING_INCOMPLETE');
    }
  }

  // <2026-10-30T18:10:00+07:00> Tối ưu: Nạp song song existingMembers và existingMarriages
  const [existingMembers, existingMarriages] = await Promise.all([
    tx.members.findMany({
      where: { tenant_id: tenantId, deleted_at: null },
      select: { id: true, full_name: true, gender: true, generation: true, father_id: true, mother_id: true, parent_union_id: true, sibling_seq: true }
    }),
    tx.marriages.findMany({
      where: { tenant_id: tenantId, deleted_at: null },
      select: { id: true, husband_id: true, wife_id: true }
    })
  ]);

  const memberCache = new Map(existingMembers.map((m) => [m.id, m]));
  const marriageCache = new Map(existingMarriages.map((m) => [m.id, m]));

  const memberMap = new Map();
  const marriageMap = new Map();

  // 1. Tạo các Thành viên con mới
  for (const child of children) {
    const smp = staging[child.id] || {};
    const parentId = ownerIdOf(child.parent_node_id, memberMap);
    
    if (!parentId) fail('Thiếu người đời trên để tính đời.', 422, 'MFO_GENERATION_REQUIRED');
    const parent = memberCache.get(parentId);
    const generation = generationAfter(parent);

    const fatherId = parent.gender !== 'NU' ? parentId : null;
    const motherId = parent.gender === 'NU' ? parentId : null;
    refuseIfOnBook(existingMembers, { fullName: smp.full_name, fatherId, motherId });

    const created = await tx.members.create({
      data: {
        tenant_id: tenantId,
        full_name: smp.full_name,
        alias: smp.alias || null,
        gender: smp.gender,
        generation,
        is_clan: requireClan(smp, 'người con'),
        branch_id: smp.branch_id || null,
        status: 'CHINH_THUC',
        is_alive: smp.is_alive !== false,
        child_type: smp.child_type || 'CON_DE',
        birth_day: smp.birth_day || null,
        birth_month: smp.birth_month || null,
        birth_year: smp.birth_year || null,
        sibling_seq: child.sibling_seq != null ? Number(child.sibling_seq) : null,
        note: smp.is_anonymous ? '[UM] Khuyết danh tạo bởi MFO 5L' : (smp.note || null),
        changed_by: actorId,
      },
    });
    memberMap.set(child.id, created.id);
    memberCache.set(created.id, created);

    if (audit && typeof audit.create === 'function') {
      await audit.create(tx, {
        tableName: 'members',
        recordId: created.id,
        action: 'THEM_MOI',
        tenantId,
        changedBy: actorId,
        correlationId,
        oldData: null,
        newData: {
          id: created.id,
          full_name: created.full_name,
          gender: created.gender,
          generation: created.generation,
          is_clan: created.is_clan,
          status: created.status,
          child_type: created.child_type,
          sibling_seq: created.sibling_seq,
        },
        changeReason: `Tạo thành viên mới từ duyệt MFO Gate 2 (Ticket #${ticketId})`,
      });
    }
  }

  // 2. Tạo các Thành viên hôn phối mới
  for (const spouse of spouses) {
    const smp = staging[spouse.union_id] || {};
    const created = await tx.members.create({
      data: {
        tenant_id: tenantId,
        full_name: smp.full_name || smp.partner_full_name,
        alias: smp.alias || null,
        gender: smp.gender || smp.partner_gender || 'NU',
        is_clan: requireClan(smp, 'người hôn phối'),
        branch_id: smp.branch_id || null,
        status: 'CHINH_THUC',
        is_alive: smp.is_alive !== false,
        birth_year: smp.birth_year || smp.partner_birth_year || null,
        changed_by: actorId,
      },
    });
    memberMap.set('spouse:' + spouse.union_id, created.id);
    memberCache.set(created.id, created);

    if (audit && typeof audit.create === 'function') {
      await audit.create(tx, {
        tableName: 'members',
        recordId: created.id,
        action: 'THEM_MOI',
        tenantId,
        changedBy: actorId,
        correlationId,
        oldData: null,
        newData: {
          id: created.id,
          full_name: created.full_name,
          gender: created.gender,
          is_clan: created.is_clan,
          status: created.status,
        },
        changeReason: `Tạo phối ngẫu mới từ duyệt MFO Gate 2 (Ticket #${ticketId})`,
      });
    }
  }

  // 3. Tạo quan hệ Hôn nhân (Marriages)
  for (const spouse of spouses) {
    const ownerId = ownerIdOf(spouse.owner_node_id, memberMap);
    const spouseId = memberMap.get('spouse:' + spouse.union_id);
    if (!ownerId || !spouseId) continue;
    const owner = memberCache.get(ownerId);
    const ownerMale = (owner && owner.gender) !== 'NU';
    const marriage = await tx.marriages.create({
      data: {
        tenant_id: tenantId,
        husband_id: ownerMale ? ownerId : spouseId,
        wife_id: ownerMale ? spouseId : ownerId,
        husband_marriage_order: ownerMale ? Number(spouse.owner_marriage_order || 1) : 1,
        wife_marriage_order: ownerMale ? 1 : Number(spouse.owner_marriage_order || 1),
        status: 'DANG_KET_HON',
        changed_by: actorId,
      },
    });
    marriageMap.set(spouse.union_id, marriage.id);
    marriageCache.set(marriage.id, marriage);

    if (audit && typeof audit.create === 'function') {
      await audit.create(tx, {
        tableName: 'marriages',
        recordId: marriage.id,
        action: 'THEM_MOI',
        tenantId,
        changedBy: actorId,
        correlationId,
        oldData: null,
        newData: {
          id: marriage.id,
          husband_id: marriage.husband_id,
          wife_id: marriage.wife_id,
          status: marriage.status,
        },
        changeReason: `Ghi nhận hôn nhân từ duyệt MFO Gate 2 (Ticket #${ticketId})`,
      });
    }
  }

  // 4. Cập nhật quan hệ Cha/Mẹ & Parent Union cho Con mới, đồng thời Dual-write sang parentages
  for (const child of children) {
    const childId = memberMap.get(child.id);
    if (!childId) continue;
    const link = String(child.link || '');
    const unionKey = link.startsWith('union:') ? link.split(':')[1] : null;

    const ownerId = child.parent_member_id || ownerIdOf(child.parent_node_id, memberMap);
    const spouseId = child.spouse_member_id || (unionKey ? memberMap.get('spouse:' + unionKey) : null);
    
    let marriage = null;

    if (ownerId && spouseId) {
      marriage = Array.from(marriageCache.values()).find(
        (m) => (m.husband_id === ownerId && m.wife_id === spouseId) || (m.husband_id === spouseId && m.wife_id === ownerId)
      );
    }
    if (!marriage && unionKey && marriageMap.get(unionKey)) {
      marriage = marriageCache.get(marriageMap.get(unionKey));
    }
    if (!marriage && unionKey && !String(unionKey).startsWith('union-draft-')) {
      marriage = marriageCache.get(unionKey);
    }

    const unionId = marriage ? marriage.id : null;
    let fatherId = marriage ? marriage.husband_id : null;
    let motherId = marriage ? marriage.wife_id : null;

    if (!marriage && child.parent_node_id) {
      const parentId = ownerIdOf(child.parent_node_id, memberMap);
      if (parentId) {
        const parent = memberCache.get(parentId);
        if (parent && parent.gender === 'NU') motherId = parentId;
        else fatherId = parentId;
      }
    }

    const smp = staging[child.id] || {};
    const childType = smp.child_type || 'CON_DE';
    const oldMemberData = memberCache.get(childId);

    // 4.1. Cập nhật bảng members
    const updatedMember = await tx.members.update({
      where: { id: childId },
      data: {
        parent_union_id: unionId,
        father_id: fatherId,
        mother_id: motherId,
        child_type: childType,
        sibling_seq: child.sibling_seq != null ? Number(child.sibling_seq) : null,
        changed_by: actorId,
      },
    });

    if (audit && typeof audit.create === 'function') {
      await audit.create(tx, {
        tableName: 'members',
        recordId: childId,
        action: 'CAP_NHAT',
        tenantId,
        changedBy: actorId,
        correlationId,
        oldData: {
          father_id: oldMemberData?.father_id || null,
          mother_id: oldMemberData?.mother_id || null,
          parent_union_id: oldMemberData?.parent_union_id || null,
          sibling_seq: oldMemberData?.sibling_seq || null,
        },
        newData: {
          father_id: updatedMember.father_id,
          mother_id: updatedMember.mother_id,
          parent_union_id: updatedMember.parent_union_id,
          child_type: updatedMember.child_type,
          sibling_seq: updatedMember.sibling_seq,
        },
        changeReason: `Gán liên kết phụ mẫu cho con mới qua MFO Gate 2 (Ticket #${ticketId})`,
      });
    }

    // 4.2. Dual-write sang parentages với isNewChild = true (bỏ qua findFirst để tăng tốc)
    if (!['CON_DAU', 'CON_RE'].includes(childType)) {
      const parentageType = mapChildTypeToParentageType(childType);

      if (fatherId) {
        await upsertParentage(tx, {
          tenantId,
          parentId: fatherId,
          childId,
          relationshipType: parentageType,
          unionId,
          actorId,
          ticketId,
          correlationId,
          isNewChild: true,
        });
      }

      if (motherId) {
        await upsertParentage(tx, {
          tenantId,
          parentId: motherId,
          childId,
          relationshipType: parentageType,
          unionId,
          actorId,
          ticketId,
          correlationId,
          isNewChild: true,
        });
      }
    }
  }

  // 5. Cập nhật con đã có trên sổ vào lần mới, đồng thời Dual-write sang parentages
  const assigned = Array.isArray(delta.assigned_children) ? delta.assigned_children : [];
  for (const row of assigned) {
    const unionId = marriageMap.get(row.union_id) || null;
    if (!row.member_id || !unionId) continue;
    const marriage = marriageCache.get(unionId);
    const fatherId = marriage && marriage.husband_id ? marriage.husband_id : null;
    const motherId = marriage && marriage.wife_id ? marriage.wife_id : null;
    const oldMemberData = memberCache.get(row.member_id);

    // 5.1. Cập nhật bảng members
    const updatedMember = await tx.members.update({
      where: { id: row.member_id },
      data: {
        parent_union_id: unionId,
        father_id: fatherId,
        mother_id: motherId,
        sibling_seq: row.sibling_seq != null ? Number(row.sibling_seq) : null,
        changed_by: actorId,
      },
      select: { id: true, child_type: true, father_id: true, mother_id: true, parent_union_id: true, sibling_seq: true },
    });

    if (audit && typeof audit.create === 'function') {
      await audit.create(tx, {
        tableName: 'members',
        recordId: row.member_id,
        action: 'CAP_NHAT',
        tenantId,
        changedBy: actorId,
        correlationId,
        oldData: {
          father_id: oldMemberData?.father_id || null,
          mother_id: oldMemberData?.mother_id || null,
          parent_union_id: oldMemberData?.parent_union_id || null,
          sibling_seq: oldMemberData?.sibling_seq || null,
        },
        newData: {
          father_id: updatedMember.father_id,
          mother_id: updatedMember.mother_id,
          parent_union_id: updatedMember.parent_union_id,
          sibling_seq: updatedMember.sibling_seq,
        },
        changeReason: `Cập nhật gắn con sẵn có vào hôn nhân mới qua MFO Gate 2 (Ticket #${ticketId})`,
      });
    }

    // 5.2. Dual-write sang bảng parentages (cho con gán thì isNewChild = false)
    const childType = updatedMember.child_type || 'CON_DE';
    if (!['CON_DAU', 'CON_RE'].includes(childType)) {
      const parentageType = mapChildTypeToParentageType(childType);

      if (fatherId) {
        await upsertParentage(tx, {
          tenantId,
          parentId: fatherId,
          childId: row.member_id,
          relationshipType: parentageType,
          unionId,
          actorId,
          ticketId,
          correlationId,
          isNewChild: false,
        });
      }

      if (motherId) {
        await upsertParentage(tx, {
          tenantId,
          parentId: motherId,
          childId: row.member_id,
          relationshipType: parentageType,
          unionId,
          actorId,
          ticketId,
          correlationId,
          isNewChild: false,
        });
      }
    }
  }

  // <2026-10-30T18:10:00+07:00>
  // Loại bỏ tx.proposals.update và audit.create thừa tại đây vì mfoResultProcess.definition.js
  // sẽ thực hiện cập nhật toàn diện proposals sang APPROVED kèm xóa hold_member_ids và expires_at.

  return {
    created_member_ids: Array.from(memberMap.values()),
    created_marriage_ids: Array.from(marriageMap.values()),
  };
}

module.exports = { executeGate2DbMutation };