/**
 * PATH       : src/modules/mfo/mfo.gate2.js
 * DATETIME   : 2026-11-25T13:47:00+07:00
 * VERSION    : 1.8.0-SUPERSEDED-CREATOR-HARDENED
 * DESCRIPTION:
 * - Giữ tối ưu load_cache_ms & dual_write_new_children_ms + bảo vệ OP/RP.
 * - Gán created_by_member_id đầy đủ cho members/spouses tạo mới khi có thông tin actorMemberId.
 * - Xử lý SUPERSEDED an toàn trong cùng 1 transaction khi gán lại con sẵn có (assigned_children),
 *   tránh lỗi unique uq_parentage_assertion.
 * CHANGe LOGS:
 *   - 1.8.0: Cập nhật logic xử lý SUPERSEDED an toàn khi gán lại con sẵn có.
 */
'use strict';

const { audit } = require('../../lib/prisma.js');
const { acquireTopologyLock, assertNoCycle } = require('../genealogy/topology.guard.js');

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

async function resolveActorMemberId(tx, { tenantId, actorId, proposal }) {
  if (proposal && proposal.created_by_member_id) {
    return proposal.created_by_member_id;
  }
  if (proposal && proposal.payload && proposal.payload.created_by_member_id) {
    return proposal.payload.created_by_member_id;
  }
  if (!actorId) return null;

  if (typeof tx.user_member_links?.findFirst === 'function') {
    const link = await tx.user_member_links.findFirst({
      where: {
        tenant_id: tenantId,
        user_id: actorId,
        deleted_at: null,
      },
      orderBy: [{ is_default: 'desc' }, { created_at: 'asc' }],
      select: { member_id: true },
    });
    if (link?.member_id) return link.member_id;
  }

  if (typeof tx.users?.findUnique === 'function') {
    const user = await tx.users.findUnique({
      where: { id: actorId },
      select: { member_id: true },
    });
    if (user?.member_id) return user.member_id;
  }

  return null;
}

async function supersedeChildEdgesSafely(tx, {
  tenantId,
  childId,
  keepParentIds,
  actorId,
  ticketId,
  correlationId,
  auditQueue,
}) {
  const keepSet = new Set((keepParentIds || []).filter(Boolean));
  const oldActiveParentages = await tx.parentages.findMany({
    where: {
      tenant_id: tenantId,
      child_id: childId,
      review_status: 'ACCEPTED',
      deleted_at: null,
    },
    select: { id: true, parent_id: true, relationship_type: true, union_id: true, is_selected_for_lineage: true },
  });

  const targets = oldActiveParentages.filter((p) => !keepSet.has(p.parent_id));
  for (const oldP of targets) {
    const existingSuperseded = await tx.parentages.findFirst({
      where: {
        tenant_id: tenantId,
        parent_id: oldP.parent_id,
        child_id: childId,
        relationship_type: oldP.relationship_type,
        review_status: 'SUPERSEDED',
      },
      select: { id: true },
    });

    if (existingSuperseded) {
      await tx.parentages.update({
        where: { id: oldP.id },
        data: {
          is_selected_for_lineage: false,
          deleted_at: new Date(),
          changed_by: actorId,
          note: `Hạ cờ cạnh cũ; bản ghi SUPERSEDED đã có qua MFO Gate 2 (Ticket #${ticketId})`,
        },
      });
    } else {
      await tx.parentages.update({
        where: { id: oldP.id },
        data: {
          review_status: 'SUPERSEDED',
          is_selected_for_lineage: false,
          changed_by: actorId,
          note: `Chuyển SUPERSEDED khi gán con vào hôn phối mới qua MFO Gate 2 (Ticket #${ticketId})`,
        },
      });
    }

    auditQueue.push({
      tableName: 'parentages',
      recordId: oldP.id,
      action: 'CAP_NHAT',
      tenantId,
      changedBy: actorId,
      correlationId,
      oldData: {
        id: oldP.id,
        parent_id: oldP.parent_id,
        review_status: 'ACCEPTED',
        is_selected_for_lineage: oldP.is_selected_for_lineage,
      },
      newData: {
        id: oldP.id,
        parent_id: oldP.parent_id,
        review_status: existingSuperseded ? 'ACCEPTED' : 'SUPERSEDED',
        is_selected_for_lineage: false,
      },
      changeReason: `Hạ cờ/SUPERSEDED nhánh cũ khi gán con qua MFO Gate 2 (Ticket #${ticketId})`,
    });
  }
}

async function upsertParentageFast(tx, {
  tenantId,
  parentId,
  childId,
  relationshipType,
  unionId,
  actorId,
  ticketId,
  correlationId,
  isNewChild = false,
  relativeLevel = null,
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
      select: { id: true, union_id: true, is_selected_for_lineage: true, metadata: true },
    });

    if (existing) {
      const nextMetadata = {
        ...(existing.metadata && typeof existing.metadata === 'object' ? existing.metadata : {}),
        ...(relativeLevel != null ? { relative_level: Number(relativeLevel) } : {}),
      };
      const updated = await tx.parentages.update({
        where: { id: existing.id },
        data: {
          union_id: unionId || null,
          is_selected_for_lineage: true,
          metadata: nextMetadata,
          changed_by: actorId,
          deleted_at: null,
          note: `Cập nhật từ SRPF Gate 2 (Ticket: ${ticketId || 'N/A'})`,
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
        newData: { id: updated.id, union_id: updated.union_id, is_selected_for_lineage: true, metadata: nextMetadata },
        changeReason: `Cập nhật quan hệ phụ mẫu qua duyệt MFO Gate 2 (Ticket #${ticketId})`,
      });

      return updated;
    }
  }

  const createdMetadata = relativeLevel != null ? { relative_level: Number(relativeLevel) } : {};
  const created = await tx.parentages.create({
    data: {
      tenant_id: tenantId,
      parent_id: parentId,
      child_id: childId,
      relationship_type: relationshipType,
      union_id: unionId || null,
      review_status: 'ACCEPTED',
      is_selected_for_lineage: true,
      metadata: createdMetadata,
      note: `Ghi nhận từ SRPF Gate 2 (Ticket: ${ticketId || 'N/A'})`,
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
      metadata: createdMetadata,
    },
    changeReason: `Tạo quan hệ phụ mẫu mới qua duyệt MFO Gate 2 (Ticket #${ticketId})`,
  });

  return created;
}

async function executeGate2DbMutation(tx, { tenantId, actorId, proposal }) {
  const tStart = Date.now();
  const timings = {};

  const correlationId = proposal && proposal.correlation_id ? proposal.correlation_id : null;
  const ticketId = proposal && proposal.id ? proposal.id : null;
  const auditQueue = [];
  const pendingEdges = [];

  const t0 = Date.now();
  await acquireTopologyLock(tx, tenantId);
  timings.lock_ms = Date.now() - t0;

  const creatorMemberId = await resolveActorMemberId(tx, { tenantId, actorId, proposal });

  const { staging, delta } = layerOf(proposal.payload);
  const children = (Array.isArray(delta.draft_children) ? delta.draft_children : [])
    .slice()
    .sort((a, b) => Number(a.depth || 0) - Number(b.depth || 0));
  const spouses = Array.isArray(delta.draft_spouses) ? delta.draft_spouses : [];
  const assigned = Array.isArray(delta.assigned_children) ? delta.assigned_children : [];

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

  const t1 = Date.now();
  const targetMemberIds = new Set();
  const targetUnionIds = new Set();

  for (const c of children) {
    const pid = ownerIdOf(c.parent_node_id, new Map());
    if (pid && !pid.startsWith('draft-child-')) targetMemberIds.add(pid);
    if (c.parent_member_id) targetMemberIds.add(c.parent_member_id);
    if (c.spouse_member_id) targetMemberIds.add(c.spouse_member_id);
    const link = String(c.link || '');
    if (link.startsWith('union:')) {
      const uKey = link.split(':')[1];
      if (uKey && !uKey.startsWith('union-draft-')) targetUnionIds.add(uKey);
    }
  }

  for (const s of spouses) {
    const oid = ownerIdOf(s.owner_node_id, new Map());
    if (oid && !oid.startsWith('draft-child-')) targetMemberIds.add(oid);
    if (s.union_id && !s.union_id.startsWith('union-draft-')) targetUnionIds.add(s.union_id);
  }

  for (const a of assigned) {
    if (a.member_id) targetMemberIds.add(a.member_id);
    if (a.union_id && !a.union_id.startsWith('union-draft-')) targetUnionIds.add(a.union_id);
  }

  const memberIdList = Array.from(targetMemberIds);
  const unionIdList = Array.from(targetUnionIds);

  const [existingMembers, existingMarriages] = await Promise.all([
    tx.members.findMany({
      where: {
        tenant_id: tenantId,
        deleted_at: null,
        ...(memberIdList.length > 0 ? { id: { in: memberIdList } } : {}),
      },
      select: { id: true, full_name: true, gender: true, generation: true, father_id: true, mother_id: true, parent_union_id: true, sibling_seq: true },
    }),
    tx.marriages.findMany({
      where: {
        tenant_id: tenantId,
        deleted_at: null,
        ...(unionIdList.length > 0 ? { id: { in: unionIdList } } : {}),
      },
      select: { id: true, husband_id: true, wife_id: true },
    }),
  ]);
  timings.load_cache_ms = Date.now() - t1;

  const memberCache = new Map(existingMembers.map((m) => [m.id, m]));
  const marriageCache = new Map(existingMarriages.map((m) => [m.id, m]));

  const memberMap = new Map();
  const marriageMap = new Map();

  const createMarriageIfReady = async (spouse) => {
    if (marriageMap.has(spouse.union_id)) return marriageCache.get(marriageMap.get(spouse.union_id));
    const ownerId = ownerIdOf(spouse.owner_node_id, memberMap);
    const spouseId = memberMap.get('spouse:' + spouse.union_id);
    if (!ownerId || !spouseId) return null;

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

    auditQueue.push({
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

    return marriage;
  };

  const t2 = Date.now();
  for (const spouse of spouses) {
    const smp = staging[spouse.union_id] || {};
    const spouseCreatorMemberId = smp.created_by_member_id || creatorMemberId || null;
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
        created_by: actorId || null,
        created_by_member_id: spouseCreatorMemberId,
        changed_by: actorId,
      },
    });
    memberMap.set('spouse:' + spouse.union_id, created.id);
    memberCache.set(created.id, created);

    auditQueue.push({
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
        created_by_member_id: created.created_by_member_id,
      },
      changeReason: `Tạo phối ngẫu mới từ duyệt MFO Gate 2 (Ticket #${ticketId})`,
    });
  }

  for (const spouse of spouses) {
    await createMarriageIfReady(spouse);
  }
  timings.create_nodes_marriages_ms = Date.now() - t2;

  const t3 = Date.now();
  for (const child of children) {
    const smp = staging[child.id] || {};
    const parentId = ownerIdOf(child.parent_node_id, memberMap);

    if (!parentId) fail('Thiếu người đời trên để tính đời.', 422, 'MFO_GENERATION_REQUIRED');
    const parent = memberCache.get(parentId);
    const generation = generationAfter(parent);

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
      if (parent && parent.gender === 'NU') motherId = parentId;
      else fatherId = parentId;
    }

    refuseIfOnBook(existingMembers, { fullName: smp.full_name, fatherId, motherId });

    const childType = smp.child_type || 'CON_DE';
    const childCreatorMemberId = smp.created_by_member_id || creatorMemberId || null;

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
        child_type: childType,
        birth_day: smp.birth_day || null,
        birth_month: smp.birth_month || null,
        birth_year: smp.birth_year || null,
        sibling_seq: child.sibling_seq != null ? Number(child.sibling_seq) : null,
        parent_union_id: unionId,
        father_id: fatherId,
        mother_id: motherId,
        note: smp.is_anonymous ? '[UM] Khuyết danh tạo bởi MFO 5L' : (smp.note || null),
        created_by: actorId || null,
        created_by_member_id: childCreatorMemberId,
        changed_by: actorId,
      },
    });

    const childId = created.id;
    memberMap.set(child.id, childId);
    memberCache.set(childId, created);

    auditQueue.push({
      tableName: 'members',
      recordId: childId,
      action: 'THEM_MOI',
      tenantId,
      changedBy: actorId,
      correlationId,
      oldData: null,
      newData: {
        id: childId,
        full_name: created.full_name,
        gender: created.gender,
        generation: created.generation,
        is_clan: created.is_clan,
        status: created.status,
        father_id: created.father_id,
        mother_id: created.mother_id,
        parent_union_id: created.parent_union_id,
        child_type: created.child_type,
        created_by_member_id: created.created_by_member_id,
      },
      changeReason: `Tạo thành viên mới từ duyệt MFO Gate 2 (Ticket #${ticketId})`,
    });

    if (!['CON_DAU', 'CON_RE'].includes(childType)) {
      const parentageType = mapChildTypeToParentageType(childType);

      if (fatherId) {
        await assertNoCycle(tx, { tenantId, parentId: fatherId, childId, pendingEdges, isNewChild: true });
        await upsertParentageFast(tx, {
          tenantId,
          parentId: fatherId,
          childId,
          relationshipType: parentageType,
          unionId,
          actorId,
          ticketId,
          correlationId,
          isNewChild: true,
          relativeLevel: child.depth != null ? Number(child.depth) : 1,
          auditQueue,
        });
        pendingEdges.push({ parentId: fatherId, childId });
      }

      if (motherId) {
        await assertNoCycle(tx, { tenantId, parentId: motherId, childId, pendingEdges, isNewChild: true });
        await upsertParentageFast(tx, {
          tenantId,
          parentId: motherId,
          childId,
          relationshipType: parentageType,
          unionId,
          actorId,
          ticketId,
          correlationId,
          isNewChild: true,
          relativeLevel: child.depth != null ? Number(child.depth) : 1,
          auditQueue,
        });
        pendingEdges.push({ parentId: motherId, childId });
      }
    }

    for (const spouse of spouses) {
      if (spouse.owner_node_id === child.id) {
        await createMarriageIfReady(spouse);
      }
    }
  }
  timings.dual_write_new_children_ms = Date.now() - t3;

  const t4 = Date.now();
  for (const row of assigned) {
    const unionId = marriageMap.get(row.union_id) || null;
    if (!row.member_id || !unionId) continue;
    const marriage = marriageCache.get(unionId);
    const fatherId = marriage && marriage.husband_id ? marriage.husband_id : null;
    const motherId = marriage && marriage.wife_id ? marriage.wife_id : null;
    const oldMemberData = memberCache.get(row.member_id);

    await supersedeChildEdgesSafely(tx, {
      tenantId,
      childId: row.member_id,
      keepParentIds: [fatherId, motherId],
      actorId,
      ticketId,
      correlationId,
      auditQueue,
    });

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

    auditQueue.push({
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
      },
      newData: {
        father_id: updatedMember.father_id,
        mother_id: updatedMember.mother_id,
        parent_union_id: updatedMember.parent_union_id,
      },
      changeReason: `Cập nhật gắn con sẵn có vào hôn nhân mới qua MFO Gate 2 (Ticket #${ticketId})`,
    });

    const childType = updatedMember.child_type || 'CON_DE';
    if (!['CON_DAU', 'CON_RE'].includes(childType)) {
      const parentageType = mapChildTypeToParentageType(childType);

      if (fatherId) {
        await assertNoCycle(tx, { tenantId, parentId: fatherId, childId: row.member_id, pendingEdges, isNewChild: false });
        await upsertParentageFast(tx, {
          tenantId,
          parentId: fatherId,
          childId: row.member_id,
          relationshipType: parentageType,
          unionId,
          actorId,
          ticketId,
          correlationId,
          isNewChild: false,
          auditQueue,
        });
        pendingEdges.push({ parentId: fatherId, childId: row.member_id });
      }

      if (motherId) {
        await assertNoCycle(tx, { tenantId, parentId: motherId, childId: row.member_id, pendingEdges, isNewChild: false });
        await upsertParentageFast(tx, {
          tenantId,
          parentId: motherId,
          childId: row.member_id,
          relationshipType: parentageType,
          unionId,
          actorId,
          ticketId,
          correlationId,
          isNewChild: false,
          auditQueue,
        });
        pendingEdges.push({ parentId: motherId, childId: row.member_id });
      }
    }
  }
  timings.assigned_children_ms = Date.now() - t4;

  const t5 = Date.now();
  if (auditQueue.length > 0) {
    if (typeof tx.audit_logs?.createMany === 'function') {
      const auditPayload = auditQueue.map((item) => ({
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

      await tx.audit_logs.createMany({
        data: auditPayload,
      });
    } else if (audit && typeof audit.create === 'function') {
      const CHUNK_SIZE = 25;
      for (let i = 0; i < auditQueue.length; i += CHUNK_SIZE) {
        const chunk = auditQueue.slice(i, i + CHUNK_SIZE);
        await Promise.all(chunk.map((item) => audit.create(tx, item)));
      }
    }
  }
  timings.audit_flush_ms = Date.now() - t5;
  timings.total_gate2_ms = Date.now() - tStart;

  console.info('[PERF_GATE2_BREAKDOWN]', {
    ticketId,
    tenantId,
    timings,
    metrics: {
      newChildrenCount: children.length,
      spousesCount: spouses.length,
      assignedCount: assigned.length,
      auditCount: auditQueue.length,
      edgesChecked: pendingEdges.length,
    },
  });

  return {
    created_member_ids: Array.from(memberMap.values()),
    created_marriage_ids: Array.from(marriageMap.values()),
  };
}

module.exports = { executeGate2DbMutation };
