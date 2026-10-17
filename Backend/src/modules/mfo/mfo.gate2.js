/**
 * PATH       : backend/src/modules/mfo/mfo.gate2.js
 * DATETIME   : 2026-10-17T14:18:00+07:00
 * VERSION    : 1.2.1-WRITE-RELATIONS
 * DESCRIPTION: Ghi sổ lúc duyệt Cửa 2. Đời lấy từ sổ. is_clan lấy từ khẳng định. status = CHINH_THUC.
 *
 * CHANGE LOG:
 * - 2026-10-12T17:30:00+07:00 | 1.2.0 | Đời lấy từ sổ. Nội tộc lấy từ khẳng định.
 * - 2026-10-17T14:18:00+07:00 | 1.2.1 | Đọc sibling_seq. Cập nhật con có sẵn, không tạo người mới.
 */
'use strict';

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

async function generationAfter(tx, parentId) {
  if (!parentId) fail('Thiếu người đời trên để tính đời.', 422, 'MFO_GENERATION_REQUIRED');
  const parent = await tx.members.findUnique({
    where: { id: parentId },
    select: { generation: true },
  });
  if (!parent || parent.generation == null) {
    fail('Người đời trên chưa có đời trên sổ.', 422, 'MFO_GENERATION_REQUIRED');
  }
  return Number(parent.generation) + 1;
}

function requireClan(smp, who) {
  if (smp.is_clan !== true && smp.is_clan !== false) {
    fail(`Chưa khẳng định nội tộc cho ${who}.`, 422, 'MFO_CLAN_UNCONFIRMED');
  }
  return smp.is_clan === true;
}

async function refuseIfOnBook(tx, tenantId, { fullName, fatherId, motherId }) {
  if (!fullName || (!fatherId && !motherId)) return;
  const where = {
    tenant_id: tenantId,
    deleted_at: null,
    full_name: fullName,
  };
  if (fatherId) where.father_id = fatherId;
  if (motherId) where.mother_id = motherId;
  const existing = await tx.members.findFirst({ where, select: { id: true } });
  if (existing) fail('Người này đã có trên sổ với cùng cha mẹ.', 409, 'MFO_ALREADY_ON_BOOK');
}

async function executeGate2DbMutation(tx, { tenantId, actorId, proposal }) {
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

  const memberMap = new Map();
  const marriageMap = new Map();

  for (const child of children) {
    const smp = staging[child.id] || {};
    const parentId = ownerIdOf(child.parent_node_id, memberMap);
    const generation = await generationAfter(tx, parentId);
    const parent = parentId
      ? await tx.members.findUnique({ where: { id: parentId }, select: { gender: true } })
      : null;
    const fatherId = parent && parent.gender !== 'NU' ? parentId : null;
    const motherId = parent && parent.gender === 'NU' ? parentId : null;
    await refuseIfOnBook(tx, tenantId, { fullName: smp.full_name, fatherId, motherId });
    const created = await tx.members.create({
      data: {
        tenant_id: tenantId,
        full_name: smp.full_name,
        gender: smp.gender,
        generation,
        is_clan: requireClan(smp, 'người con'),
        status: 'CHINH_THUC',
        is_alive: smp.is_alive !== false,
        child_type: smp.child_type || 'CON_DE',
        birth_day: smp.birth_day || null,
        birth_month: smp.birth_month || null,
        birth_year: smp.birth_year || null,
        // <2026-10-17T14:18:00+07:00> Mục đích: Đọc đúng trường cửa 1. Lý do: payload gửi sibling_seq, không gửi child_order.
        sibling_seq: child.sibling_seq != null ? Number(child.sibling_seq) : null,
        note: smp.is_anonymous ? '[UM] Khuyết danh tạo bởi MFO 5L' : (smp.note || null),
        changed_by: actorId,
      },
    });
    memberMap.set(child.id, created.id);
  }

  for (const spouse of spouses) {
    const smp = staging[spouse.union_id] || {};
    const created = await tx.members.create({
      data: {
        tenant_id: tenantId,
        full_name: smp.full_name || smp.partner_full_name,
        gender: smp.gender || smp.partner_gender || 'NU',
        is_clan: requireClan(smp, 'người hôn phối'),
        status: 'CHINH_THUC',
        is_alive: smp.is_alive !== false,
        birth_year: smp.birth_year || smp.partner_birth_year || null,
        changed_by: actorId,
      },
    });
    memberMap.set('spouse:' + spouse.union_id, created.id);
  }

  for (const spouse of spouses) {
    const ownerId = ownerIdOf(spouse.owner_node_id, memberMap);
    const spouseId = memberMap.get('spouse:' + spouse.union_id);
    if (!ownerId || !spouseId) continue;
    const owner = await tx.members.findUnique({ where: { id: ownerId }, select: { gender: true } });
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
  }

  for (const child of children) {
    const childId = memberMap.get(child.id);
    if (!childId) continue;
    const link = String(child.link || '');
    const unionKey = link.startsWith('union:') ? link.split(':')[1] : null;
    const unionId = unionKey ? marriageMap.get(unionKey) || null : null;
    let fatherId = null;
    let motherId = null;
    if (unionId) {
      const marriage = await tx.marriages.findUnique({
        where: { id: unionId },
        select: { husband_id: true, wife_id: true },
      });
      fatherId = marriage && marriage.husband_id;
      motherId = marriage && marriage.wife_id;
    } else if (child.parent_node_id) {
      const parentId = ownerIdOf(child.parent_node_id, memberMap);
      if (parentId) {
        const parent = await tx.members.findUnique({ where: { id: parentId }, select: { gender: true } });
        if (parent && parent.gender === 'NU') motherId = parentId;
        else fatherId = parentId;
      }
    }
    await tx.members.update({
      where: { id: childId },
      data: {
        parent_union_id: unionId,
        father_id: fatherId,
        mother_id: motherId,
        changed_by: actorId,
      },
    });
  }

  // <2026-10-17T14:18:00+07:00> Mục đích: Gắn con đã có trên sổ vào lần mới. Lý do: con này không nằm trong draft_children.
  const assigned = Array.isArray(delta.assigned_children) ? delta.assigned_children : [];
  for (const row of assigned) {
    const unionId = marriageMap.get(row.union_id) || null;
    if (!row.member_id || !unionId) continue;
    const marriage = await tx.marriages.findUnique({ where: { id: unionId }, select: { husband_id: true, wife_id: true } });
    await tx.members.update({
      where: { id: row.member_id },
      data: {
        parent_union_id: unionId,
        father_id: marriage && marriage.husband_id,
        mother_id: marriage && marriage.wife_id,
        sibling_seq: row.sibling_seq != null ? Number(row.sibling_seq) : null,
        changed_by: actorId,
      },
    });
  }

  return {
    created_member_ids: Array.from(memberMap.values()),
    created_marriage_ids: Array.from(marriageMap.values()),
  };
}

module.exports = { executeGate2DbMutation };
