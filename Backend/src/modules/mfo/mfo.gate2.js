/**
 * PATH       : backend/src/modules/mfo/mfo.gate2.js
 * DATETIME   : 2026-10-10T00:28:00+07:00
 * VERSION    : 1.0.0-LAT2-BOOK-TX
 * DESCRIPTION: Ghi sổ chỉ khi cửa 2 đã vào side effect. Đọc business_layer.
 *              Thiếu staging của node nháp thì không ghi rỗng.
 */

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
    grantedGeneration: root.granted_generation != null ? Number(root.granted_generation) : null,
  };
}

function ownerIdOf(ownerNodeId, memberMap) {
  if (!ownerNodeId) return null;
  if (ownerNodeId.startsWith('draft-child-')) return memberMap.get(ownerNodeId) || null;
  if (ownerNodeId.startsWith('st:')) {
    const parts = ownerNodeId.split(':');
    return parts[2] || parts[1] || null;
  }
  return ownerNodeId;
}

async function executeGate2DbMutation(tx, { tenantId, actorId, proposal }) {
  const { staging, delta, grantedGeneration } = layerOf(proposal.payload);
  const children = Array.isArray(delta.draft_children) ? delta.draft_children : [];
  const spouses = Array.isArray(delta.draft_spouses) ? delta.draft_spouses : [];

  for (const child of children) {
    const smp = staging[child.id] || {};
    if (!String(smp.full_name || child.label || '').trim()) {
      fail('Con nháp chưa có họ tên trong staging.', 422, 'MFO_STAGING_INCOMPLETE');
    }
  }
  for (const spouse of spouses) {
    const smp = staging[spouse.union_id] || {};
    if (!String(smp.partner_full_name || spouse.partner_name || '').trim()) {
      fail('Hôn phối nháp chưa có tên trong staging.', 422, 'MFO_STAGING_INCOMPLETE');
    }
  }

  const memberMap = new Map();
  const marriageMap = new Map();

  for (const child of children) {
    const smp = staging[child.id] || {};
    const depth = Number(child.depth || 0);
    const created = await tx.members.create({
      data: {
        tenant_id: tenantId,
        full_name: smp.full_name || child.label,
        gender: smp.gender || 'NAM',
        generation: grantedGeneration != null ? grantedGeneration + depth : null,
        is_clan: true,
        birth_year: smp.birth_year ? Number(smp.birth_year) : null,
        sibling_seq: smp.child_order ? Number(smp.child_order) : null,
        note: smp.is_anonymous ? '[UM] Khuyết danh tạo bởi MFO 5L' : null,
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
        full_name: smp.partner_full_name || spouse.partner_name,
        gender: smp.partner_gender || 'NU',
        is_clan: false,
        birth_year: smp.partner_birth_year ? Number(smp.partner_birth_year) : null,
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
        spouse_name_literal: spouse.partner_name || null,
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
      data: { parent_union_id: unionId, father_id: fatherId, mother_id: motherId, changed_by: actorId },
    });
  }

  return {
    created_member_ids: Array.from(memberMap.values()),
    created_marriage_ids: Array.from(marriageMap.values()),
  };
}

module.exports = { executeGate2DbMutation };
