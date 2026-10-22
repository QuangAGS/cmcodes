/**
 * PATH       : backend/src/modules/mfo/mfo.gate2.js
 * DATETIME   : 2026-10-19T11:45:00+07:00
 * VERSION    : 1.2.5-E4-ALIAS
 * DESCRIPTION: Ghi sổ lúc duyệt Cửa 2. Đời lấy từ sổ. is_clan lấy từ khẳng định. status = CHINH_THUC. Tối ưu hoá Transaction chống timeout P2028 & Ghi nhận branch_id + alias.
 *
 * CHANGE LOG:
 * - 2026-10-12T17:30:00+07:00 | 1.2.0 | Đời lấy từ sổ. Nội tộc lấy từ khẳng định.
 * - 2026-10-17T14:18:00+07:00 | 1.2.1 | Đọc sibling_seq. Cập nhật con có sẵn, không tạo người mới.
 * - 2026-10-17T15:04:00+07:00 | 1.2.2 | Con mới tìm hôn nhân bằng mã hai người.
 * - 2026-10-18T22:35:00+07:00 | 1.2.3 | Tối ưu hóa Interactive Transaction Cửa 2 bằng Map caching, triệt tiêu lỗi Timeout P2028 tại tx.members.update.
 * - 2026-10-19T07:25:00+07:00 | 1.2.4 | Ghi nhận trường branch_id từ staging vào bảng members.
 * - 2026-10-19T11:45:00+07:00 | 1.2.5 | Ghi nhận trường alias (Tên khác) từ staging vào bảng members (E4 FIX).
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

function requireClan(smp, who) {
  if (smp.is_clan !== true && smp.is_clan !== false) {
    fail(`Chưa khẳng định nội tộc cho ${who}.`, 422, 'MFO_CLAN_UNCONFIRMED');
  }
  return smp.is_clan === true;
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

  const existingMembers = await tx.members.findMany({
    where: { tenant_id: tenantId, deleted_at: null },
    select: { id: true, full_name: true, gender: true, generation: true, father_id: true, mother_id: true }
  });
  const existingMarriages = await tx.marriages.findMany({
    where: { tenant_id: tenantId, deleted_at: null },
    select: { id: true, husband_id: true, wife_id: true }
  });

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
    if (!parent || parent.generation == null) {
      fail('Người đời trên chưa có đời trên sổ.', 422, 'MFO_GENERATION_REQUIRED');
    }
    const generation = Number(parent.generation) + 1;

    const fatherId = parent.gender !== 'NU' ? parentId : null;
    const motherId = parent.gender === 'NU' ? parentId : null;

    if (smp.full_name && (fatherId || motherId)) {
      const isDuplicate = existingMembers.some(
        (m) => m.full_name === smp.full_name && ((fatherId && m.father_id === fatherId) || (motherId && m.mother_id === motherId))
      );
      if (isDuplicate) fail('Người này đã có trên sổ với cùng cha mẹ.', 409, 'MFO_ALREADY_ON_BOOK');
    }

    const created = await tx.members.create({
      data: {
        tenant_id: tenantId,
        full_name: smp.full_name,
        alias: smp.alias || null, // <2026-10-19T11:45:00+07:00> E4: Ghi nhận Tên khác
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
  }

  // 2. Tạo các Thành viên hôn phối mới
  for (const spouse of spouses) {
    const smp = staging[spouse.union_id] || {};
    const created = await tx.members.create({
      data: {
        tenant_id: tenantId,
        full_name: smp.full_name || smp.partner_full_name,
        alias: smp.alias || null, // <2026-10-19T11:45:00+07:00> E4: Ghi nhận Tên khác
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
  }

  // 4. Cập nhật quan hệ Cha/Mẹ & Parent Union cho Con mới
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

    await tx.members.update({
      where: { id: childId },
      data: {
        parent_union_id: unionId,
        father_id: fatherId,
        mother_id: motherId,
        sibling_seq: child.sibling_seq != null ? Number(child.sibling_seq) : null,
        changed_by: actorId,
      },
    });
  }

  // 5. Cập nhật con đã có trên sổ vào lần mới
  const assigned = Array.isArray(delta.assigned_children) ? delta.assigned_children : [];
  for (const row of assigned) {
    const unionId = marriageMap.get(row.union_id) || null;
    if (!row.member_id || !unionId) continue;
    const marriage = marriageCache.get(unionId);
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