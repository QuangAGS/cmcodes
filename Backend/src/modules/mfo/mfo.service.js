/**
 * PATH       : backend/src/modules/mfo/mfo.service.js
 * DATETIME   : 2026-10-09T23:55:00+07:00
 * VERSION    : 4.6.0-AMENDMENT-20261009-PREPARE-REVIEW-PAYLOAD-FIXED
 * DESCRIPTION:
 * - Tuân thủ Q1 (Bảo tồn 100% UI/UX & hàm critical) & Q2 (Code Format & DateTime Annotation).
 * - Sửa returnPlanForRevision & approvePlan: Chỉ đóng gói Payload Bút phê, không tự ý gán status mới trước khi qua SRPF Engine.
 * - Khôi phục 100% hàm getFullMfoSet, getOriginTree, abortPlan...
 */

const crypto = require('crypto');
const { prisma, withTransaction, audit } = require('../../lib/prisma.js');
const { normalizePlanBody, fail } = require('./mfo.payload.js');
const { mfoWriteBpl, mfoSilentEmit } = require('./mfo.ledger.js');

const OPEN = ['DRAFT', 'PENDING', 'UNDER_REVIEW', 'NEEDS_REVISION'];

function actorIdOf(user) {
  return user && (user.id || user.userId);
}

function tenantIdOf(user) {
  return user && (user.tenant_id || user.tenantId || null);
}

function memberIdOf(user) {
  return user && (user.member_id || user.memberId || null);
}

function isClanOrSys(user) {
  const r = (user && user.role) || '';
  return r === 'CLAN_ADMIN' || r === 'SYSTEM_ADMIN';
}

function avatarUrlOf(memberId, row) {
  if (!memberId || !row) return null;
  const ver = row.checksum || (row.updated_at ? new Date(row.updated_at).getTime() : '1');
  return '/api/media/members/' + memberId + '/avatar?v=' + ver;
}

function assertFullSetInvariants({
  levels,
  nodes,
  targetMemberId,
  selectedCanvasDepth,
  rootCanvasDepth,
  resolvedAncestorSteps,
}) {
  const broken = (code) => {
    const correlationId = crypto.randomUUID();
    console.error('MFO_FULL_SET_INVARIANT_BROKEN', {
      correlation_id: correlationId,
      code,
      target_member_id: targetMemberId,
      selected_canvas_depth: selectedCanvasDepth,
      target_node_count: (nodes || []).filter((node) => node && node.is_target === true).length,
      resolved_ancestor_steps: resolvedAncestorSteps,
      root_canvas_depth: rootCanvasDepth,
    });
    const error = new Error(
      'Không thể dựng khung gia phả nhất quán. Vui lòng thử lại hoặc liên hệ quản trị viên.'
    );
    error.statusCode = 500;
    error.code = 'MFO_FULL_SET_INVARIANT_BROKEN';
    error.correlation_id = correlationId;
    throw error;
  };

  if (!Array.isArray(levels) || levels.length !== 5) broken('MFO_LEVEL_COUNT_INVALID');
  const levelByDepth = new Map(levels.map((level) => [Number(level && level.depth), level]));
  for (let depth = 0; depth <= 4; depth += 1) {
    const level = levelByDepth.get(depth);
    if (!level) broken('MFO_LEVEL_DEPTH_INVALID');
    for (const tree of level.standard_trees || []) {
      if (tree.depth !== depth) broken('MFO_STANDARD_TREE_DEPTH_INVALID');
      if (!tree.parent || !tree.parent.member || tree.parent.member.depth !== depth) {
        broken('MFO_STANDARD_TREE_OWNER_DEPTH_INVALID');
      }
      for (const child of tree.children || []) {
        if (depth === 4 || !child.member || child.member.depth !== depth + 1) {
          broken('MFO_STANDARD_TREE_CHILD_DEPTH_INVALID');
        }
      }
      for (const tab of tree.marriage_tabs || []) {
        for (const child of tab.children || []) {
          if (depth === 4 || !child.member || child.member.depth !== depth + 1) {
            broken('MFO_MARRIAGE_TAB_CHILD_DEPTH_INVALID');
          }
        }
      }
      if (depth === 4) {
        if ((tree.children || []).length > 0) broken('MFO_LAST_LANE_CHILDREN_FORBIDDEN');
        if ((tree.unassigned_children || []).length > 0) broken('MFO_LAST_LANE_UNASSIGNED_CHILDREN_FORBIDDEN');
        if (Number(tree.child_count || 0) !== 0) broken('MFO_LAST_LANE_CHILD_COUNT_INVALID');
        for (const tab of tree.marriage_tabs || []) {
          if ((tab.children || []).length > 0) broken('MFO_LAST_LANE_TAB_CHILDREN_FORBIDDEN');
          if (Number(tab.child_count || 0) !== 0) broken('MFO_LAST_LANE_TAB_CHILD_COUNT_INVALID');
        }
      }
    }
  }
  const targetNodes = (nodes || []).filter((node) => node && node.is_target === true);
  if (targetNodes.length !== 1) broken('MFO_TARGET_NODE_COUNT_INVALID');
  const targetNode = targetNodes[0];
  if (targetNode.role !== 'clan_member' || targetNode.is_clan === false) broken('MFO_TARGET_MUST_BE_CLAN_MEMBER');
  if (String(targetNode.id) !== String(targetMemberId)) broken('MFO_TARGET_IDENTITY_MISMATCH');
  if (targetNode.depth !== selectedCanvasDepth) broken('MFO_TARGET_DEPTH_NOT_PRESERVED');
  const targetLevel = levelByDepth.get(selectedCanvasDepth);
  const targetTrees = ((targetLevel && targetLevel.standard_trees) || []).filter(
    (tree) => tree && tree.parent && tree.parent.member && String(tree.parent.member.id) === String(targetMemberId)
  );
  if (targetTrees.length !== 1) broken('MFO_TARGET_STANDARD_TREE_COUNT_INVALID');
  if (rootCanvasDepth !== selectedCanvasDepth - resolvedAncestorSteps) broken('MFO_ROOT_DEPTH_INVARIANT_BROKEN');
}

async function ensureNoActiveProposal(tx, { tenantId, actorId, excludeId = null }) {
  const where = {
    tenant_id: tenantId,
    requester_user_id: actorId,
    ticket_type: { in: ['MFO_REVIEW', 'BRANCH_REVIEW'] },
    deleted_at: null,
    OR: [
      { status: { in: OPEN } },
      {
        status: 'APPROVED',
        payload: {
          path: ['result_ok'],
          equals: false,
        },
      },
    ],
  };
  if (excludeId) {
    where.id = { not: excludeId };
  }
  const active = await tx.proposals.findFirst({
    where,
    select: { id: true, status: true, payload: true },
  });
  if (active) {
    const isWorkbench = active.status === 'APPROVED' && !active.payload?.result_ok;
    const desc = isWorkbench ? 'đang mở Xưởng kê khai (Gate 1 Approved)' : `ở trạng thái ${active.status}`;
    fail(
      `Đang có hồ sơ #${active.id} ${desc}. Vui lòng hoàn tất hoặc rút/xóa hồ sơ này trước khi mở hồ sơ mới.`,
      409,
      'MFO_ACTIVE_PROPOSAL_EXISTS',
      { active_ticket_id: active.id, status: active.status }
    );
  }
}

function sliceReview(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.plan || raw.result) return raw;
  return { checks: raw.checks, dirNote: raw.dirNote, extra: raw.extra, note: raw.note };
}

function pickAdminReview(body, row, stage) {
  const prev = sliceReview(((row && row.payload) || {}).admin_review) || {};
  const incoming = (body && (body.admin_review || body.review)) || {};
  const piece =
    incoming.plan || incoming.result
      ? incoming[stage]
      : incoming.checks || incoming.dirNote
        ? incoming
        : null;
  const next = {
    plan: prev.plan || (prev.checks || prev.dirNote ? { checks: prev.checks, dirNote: prev.dirNote, extra: prev.extra } : null),
    result: prev.result || null,
  };
  if (stage === 'plan' && piece) next.plan = piece;
  if (stage === 'result' && piece) next.result = piece;
  return next;
}

async function resolveFounderMemberId(user) {
  const fromJwt = memberIdOf(user);
  if (fromJwt) return fromJwt;
  const uid = actorIdOf(user);
  if (!uid) return null;
  const row = await prisma.users.findUnique({
    where: { id: uid },
    select: { member_id: true },
  });
  return (row && row.member_id) || null;
}

async function afterMfo(user, ticket, processType, event, payload) {
  if (!ticket) return;
  await withTransaction(
    {
      tenantId: ticket.tenant_id,
      actorId: actorIdOf(user),
      correlationId: ticket.correlation_id,
    },
    async (tx) =>
      mfoWriteBpl(tx, { processType, user, ticket, payload })
  );
  await mfoSilentEmit(event, ticket, {
    ...(payload || {}),
    userId: actorIdOf(user) || ticket.requester_user_id,
  });
}

async function executeGate2DbMutation(tx, { tenantId, actorId, proposal, grantedGeneration }) {
  const payload = proposal.payload || {};
  const stagingData = payload.smp_staging_data || {};
  const canvasDelta = payload.canvas_delta || {};
  const draftChildren = canvasDelta.draft_children || [];
  const draftSpouses = canvasDelta.draft_spouses || [];

  const draftToRealMemberMap = new Map();
  const draftToRealMarriageMap = new Map();

  for (const child of draftChildren) {
    const smp = stagingData[child.id] || {};
    const depth = Number(child.depth ?? 0);
    const calculatedGen = grantedGeneration != null ? grantedGeneration + depth : null;

    const createdMember = await tx.members.create({
      data: {
        tenant_id: tenantId,
        full_name: smp.full_name || child.label || 'Khuyết danh',
        gender: smp.gender || 'NAM',
        generation: calculatedGen,
        is_clan: true,
        birth_year: smp.birth_year ? Number(smp.birth_year) : null,
        sibling_seq: smp.child_order ? Number(smp.child_order) : null,
        note: smp.is_anonymous ? '[UM] Khuyết danh tạo bởi MFO 5L' : null,
        changed_by: actorId,
      },
    });
    draftToRealMemberMap.set(child.id, createdMember.id);
  }

  for (const spouse of draftSpouses) {
    const unionDraftId = spouse.union_id;
    const smp = stagingData[unionDraftId] || {};
    const partnerName = smp.partner_full_name || spouse.partner_name || 'Vợ/Chồng (Khai MFO)';

    const createdSpouseMember = await tx.members.create({
      data: {
        tenant_id: tenantId,
        full_name: partnerName,
        gender: smp.partner_gender || 'NU',
        is_clan: false,
        birth_year: smp.partner_birth_year ? Number(smp.partner_birth_year) : null,
        changed_by: actorId,
      },
    });
    draftToRealMemberMap.set(`spouse:${unionDraftId}`, createdSpouseMember.id);
  }

  for (const spouse of draftSpouses) {
    const unionDraftId = spouse.union_id;
    const ownerNodeId = spouse.owner_node_id;

    let realOwnerId = null;
    if (ownerNodeId && ownerNodeId.startsWith('draft-child-')) {
      realOwnerId = draftToRealMemberMap.get(ownerNodeId);
    } else if (ownerNodeId && ownerNodeId.startsWith('st:')) {
      const parts = ownerNodeId.split(':');
      realOwnerId = parts[2] || parts[1];
    } else {
      realOwnerId = ownerNodeId;
    }

    const realSpouseId = draftToRealMemberMap.get(`spouse:${unionDraftId}`);

    if (realOwnerId) {
      const ownerMember = await tx.members.findUnique({
        where: { id: realOwnerId },
        select: { gender: true },
      });
      const isOwnerMale = (ownerMember?.gender || 'NAM') === 'NAM';

      const createdMarriage = await tx.marriages.create({
        data: {
          tenant_id: tenantId,
          husband_id: isOwnerMale ? realOwnerId : realSpouseId,
          wife_id: isOwnerMale ? realSpouseId : realOwnerId,
          husband_marriage_order: isOwnerMale ? Number(spouse.owner_marriage_order || 1) : 1,
          wife_marriage_order: !isOwnerMale ? Number(spouse.owner_marriage_order || 1) : 1,
          status: 'DANG_KET_HON',
          spouse_name_literal: spouse.partner_name || null,
          changed_by: actorId,
        },
      });
      draftToRealMarriageMap.set(unionDraftId, createdMarriage.id);
    }
  }

  for (const child of draftChildren) {
    const realChildId = draftToRealMemberMap.get(child.id);
    if (!realChildId) continue;

    const link = child.link || '';
    let targetUnionId = null;

    if (link.startsWith('union:')) {
      const unionKey = link.split(':')[1];
      targetUnionId = draftToRealMarriageMap.get(unionKey) || null;
    }

    let fatherId = null;
    let motherId = null;

    if (targetUnionId) {
      const marriage = await tx.marriages.findUnique({
        where: { id: targetUnionId },
        select: { husband_id: true, wife_id: true },
      });
      fatherId = marriage?.husband_id || null;
      motherId = marriage?.wife_id || null;
    } else if (child.parent_node_id) {
      let realParentId = child.parent_node_id.startsWith('draft-child-')
        ? draftToRealMemberMap.get(child.parent_node_id)
        : child.parent_node_id.replace(/^st:\d+:/, '').replace(/^st:/, '');

      if (realParentId) {
        const parentMember = await tx.members.findUnique({
          where: { id: realParentId },
          select: { gender: true },
        });
        if (parentMember?.gender === 'NU') {
          motherId = realParentId;
        } else {
          fatherId = realParentId;
        }
      }
    }

    await tx.members.update({
      where: { id: realChildId },
      data: {
        parent_union_id: targetUnionId,
        father_id: fatherId,
        mother_id: motherId,
        changed_by: actorId,
      },
    });
  }

  return {
    created_member_ids: Array.from(draftToRealMemberMap.values()),
    created_marriage_ids: Array.from(draftToRealMarriageMap.values()),
  };
}

const mfoService = {
  //KHÔNG BAO GIỜ ĐƯỢC THAY ĐỔI HÀM NÀY!!!!!
  getFullMfoSet: async ({ user, targetMemberId, selectedCanvasDepth }) => {
    const tenantId = tenantIdOf(user);

    if (!targetMemberId) {
      fail('Thiếu target member ID.', 400, 'MFO_ORIGIN_REQUIRED');
    }

    if (
      selectedCanvasDepth === undefined ||
      selectedCanvasDepth === null ||
      selectedCanvasDepth === ''
    ) {
      fail('Thiếu selected canvas depth.', 400, 'MFO_INVALID_SELECTED_CANVAS_DEPTH');
    }

    const selectedDepth = Number(selectedCanvasDepth);
    if (!Number.isInteger(selectedDepth) || selectedDepth < 0 || selectedDepth > 4) {
      fail('selected_canvas_depth phải là số nguyên từ 0 đến 4.', 400, 'MFO_INVALID_SELECTED_CANVAS_DEPTH');
    }

    const targetId = targetMemberId;

    const targetMember = await prisma.members.findUnique({
      where: { id: targetId },
      select: {
        id: true,
        full_name: true,
        generation: true,
        gender: true,
        father_id: true,
        mother_id: true,
        tenant_id: true,
        deleted_at: true,
        branch_id: true,
        is_clan: true,
        child_type: true,
        sibling_seq: true,
        birth_year: true,
        note: true,
        parent_union_id: true,
      },
    });

    if (!targetMember || targetMember.deleted_at) {
      fail('Không tìm thấy thành viên trên sổ.', 404, 'MFO_ORIGIN_NOT_FOUND');
    }

    if (
      tenantId &&
      String(targetMember.tenant_id) !== String(tenantId)
    ) {
      fail('Thành viên không thuộc dòng họ này.', 403, 'TENANT_MISMATCH');
    }

    if (targetMember.is_clan === false) {
      fail(
        'Thành viên ngoại tộc không thể là M của khung MFO.',
        422,
        'MFO_TARGET_NOT_CLAN_MEMBER'
      );
    }

    const [all, unions] = await Promise.all([
      prisma.members.findMany({
        where: {
          tenant_id: targetMember.tenant_id,
          deleted_at: null,
        },
        select: {
          id: true,
          full_name: true,
          generation: true,
          gender: true,
          father_id: true,
          mother_id: true,
          branch_id: true,
          is_clan: true,
          child_type: true,
          sibling_seq: true,
          birth_year: true,
          note: true,
          parent_union_id: true,
        },
      }),

      prisma.marriages.findMany({
        where: {
          tenant_id: targetMember.tenant_id,
          deleted_at: null,
        },
        select: {
          id: true,
          husband_id: true,
          wife_id: true,
          husband_marriage_order: true,
          wife_marriage_order: true,
          status: true,
          start_date: true,
          end_date: true,
          spouse_name_literal: true,
          note: true,
        },
      }),
    ]);

    const avatarRows = await prisma.media.findMany({
      where: {
        tenant_id: targetMember.tenant_id,
        entity_type: 'MEMBER',
        entity_id: { in: all.map((member) => member.id) },
        purpose: 'AVATAR',
        is_primary: true,
        deleted_at: null,
      },
      select: {
        entity_id: true,
        checksum: true,
        updated_at: true,
      },
      orderBy: { updated_at: 'desc' },
    });
    const avatarByMemberId = new Map();
    for (const row of avatarRows) {
      if (!avatarByMemberId.has(row.entity_id)) avatarByMemberId.set(row.entity_id, row);
    }
    const unionById = new Map(unions.map((union) => [union.id, union]));

    const isClanMember = (member) => !member || member.is_clan !== false;

    const byId = new Map(all.map((member) => [member.id, member]));

    const childrenOfMap = new Map();

    const addChild = (parentId, childId) => {
      if (!parentId || !childId) return;

      if (!childrenOfMap.has(parentId)) {
        childrenOfMap.set(parentId, new Set());
      }

      childrenOfMap.get(parentId).add(childId);
    };

    for (const member of all) {
      if (!isClanMember(member)) continue;

      addChild(member.father_id, member.id);
      addChild(member.mother_id, member.id);
    }

    const partnersOf = new Map();

    const pushPartner = (ownerId, partner, meta = {}) => {
      if (!ownerId || !partner) return;
      if (partner.id && String(partner.id) === String(ownerId)) return;

      if (!partnersOf.has(ownerId)) {
        partnersOf.set(ownerId, []);
      }

      const bag = partnersOf.get(ownerId);

      const partnerIdentity = partner.id
        ? `member:${partner.id}`
        : `literal:${String(partner.full_name || '').trim().toLowerCase()}`;

      const unionIdentity = meta.unionId
        ? `union:${meta.unionId}`
        : 'union:none';

      const key = `${unionIdentity}:${partnerIdentity}`;

      if (bag.some((item) => item._key === key)) {
        return;
      }

      bag.push({
        ...partner,
        _key: key,
        _union_id: meta.unionId || null,
        _ord:
          meta.ord !== null &&
          meta.ord !== undefined
            ? Number(meta.ord)
            : 9999,
        _status: meta.status || null,
        _is_literal: !partner.id,
      });
    };

    for (const union of unions) {
      const husband = union.husband_id
        ? byId.get(union.husband_id)
        : null;

      const wife = union.wife_id
        ? byId.get(union.wife_id)
        : null;

      if (union.husband_id) {
        if (wife) {
          pushPartner(
            union.husband_id,
            wife,
            {
              unionId: union.id,
              ord: union.husband_marriage_order,
              status: union.status,
            }
          );
        } else if (union.spouse_name_literal) {
          pushPartner(
            union.husband_id,
            {
              id: null,
              full_name: union.spouse_name_literal,
              is_clan: false,
            },
            {
              unionId: union.id,
              ord: union.husband_marriage_order,
              status: union.status,
            }
          );
        }
      }

      if (union.wife_id) {
        if (husband) {
          pushPartner(
            union.wife_id,
            husband,
            {
              unionId: union.id,
              ord: union.wife_marriage_order,
              status: union.status,
            }
          );
        } else if (union.spouse_name_literal) {
          pushPartner(
            union.wife_id,
            {
              id: null,
              full_name: union.spouse_name_literal,
              is_clan: false,
            },
            {
              unionId: union.id,
              ord: union.wife_marriage_order,
              status: union.status,
            }
          );
        }
      }
    }

    const isUnknownMember = (member) => {
      const note = String(member?.note || '');
      const name = String(member?.full_name || '');

      return (
        note.includes('[UM]') ||
        /^chưa rõ/i.test(name)
      );
    };

    const packMember = (member, extra = {}) => ({
      id: member?.id || null,
      full_name: member?.full_name || null,
      is_unknown: isUnknownMember(member),
      generation:
        member?.generation !== null &&
        member?.generation !== undefined
          ? member.generation
          : null,
      gender: member?.gender || null,
      father_id: member?.father_id || null,
      mother_id: member?.mother_id || null,
      branch_id: member?.branch_id || null,
      is_clan: member?.is_clan !== false,
      child_type: member?.child_type || null,
      parent_union_id: member?.parent_union_id || null,
      avatar_url: avatarUrlOf(member?.id, avatarByMemberId.get(member?.id)),
      sibling_seq:
        member?.sibling_seq !== null &&
        member?.sibling_seq !== undefined
          ? member.sibling_seq
          : null,
      birth_year:
        member?.birth_year !== null &&
        member?.birth_year !== undefined
          ? member.birth_year
          : null,
      ...extra,
    });

    const compareSiblings = (aId, bId) => {
      const a = byId.get(aId);
      const b = byId.get(bId);

      const seqA = a?.sibling_seq ?? 999999;
      const seqB = b?.sibling_seq ?? 999999;

      if (seqA !== seqB) {
        return seqA - seqB;
      }

      const yearA = a?.birth_year ?? 999999;
      const yearB = b?.birth_year ?? 999999;

      if (yearA !== yearB) {
        return yearA - yearB;
      }

      return String(a?.full_name || '').localeCompare(
        String(b?.full_name || ''),
        'vi'
      );
    };

    const getSortedChildrenIds = (parentId) => {
      return [...(childrenOfMap.get(parentId) || new Set())]
        .filter((id) => byId.has(id))
        .sort(compareSiblings);
    };

    const getSortedPartners = (memberId, depth) => {
      return [...(partnersOf.get(memberId) || [])]
        .sort((a, b) => {
          if (a._ord !== b._ord) {
            return a._ord - b._ord;
          }

          return String(a.full_name || '').localeCompare(
            String(b.full_name || ''),
            'vi'
          );
        })
        .map((partner) =>
          packMember(partner, {
            depth,
            role: 'partner',
            source: partner.id ? 'marriage' : 'literal',
            union_id: partner._union_id,
            union_status: partner._status,
            is_literal: partner._is_literal,
            position: 'right',
            source: partner.id ? 'member' : 'literal',
          })
        );
    };

    let rootNode = targetMember;
    let actualAncestorSteps = 0;
    let rootDepth = selectedDepth;

    const ancestorPathFromRootToTarget = [targetMember.id];

    while (actualAncestorSteps < selectedDepth) {
      const parentId = [
        rootNode.father_id,
        rootNode.mother_id,
      ].find((id) => id && byId.has(id));

      if (!parentId) {
        break;
      }

      rootNode = byId.get(parentId);
      actualAncestorSteps += 1;
      rootDepth -= 1;

      ancestorPathFromRootToTarget.unshift(rootNode.id);
    }

    const levels = Array.from({ length: 5 }, (_, depth) => ({
      depth,
      is_empty: true,
      placeholder: {
        kind: 'empty_couple',
        clan_member: null,
        spouse: null,
      },
      member_ids: [],
      nodes: [],
      standard_trees: [],
    }));

    const nodes = [];
    const nodeDepthById = new Map();
    const seenNodeIds = new Set();

    let currentLevelIds = [rootNode.id];

    for (let depth = rootDepth; depth <= 4; depth += 1) {
      const nextLevelIds = [];
      const nextLevelSeen = new Set();

      for (const memberId of currentLevelIds) {
        if (seenNodeIds.has(memberId)) {
          continue;
        }

        const member = byId.get(memberId);

        if (!member || !isClanMember(member)) {
          continue;
        }

        seenNodeIds.add(memberId);
        nodeDepthById.set(memberId, depth);

        const partners = getSortedPartners(memberId, depth);

        const node = packMember(member, {
          depth,
          role: 'clan_member',
          position: 'left',
          is_origin: memberId === rootNode.id,
          is_target: memberId === targetMember.id,
          partners,
        });

        nodes.push(node);

        levels[depth].is_empty = false;
        levels[depth].member_ids.push(memberId);
        levels[depth].nodes.push(node);

        if (depth >= 4) {
          continue;
        }

        for (const childId of getSortedChildrenIds(memberId)) {
          if (
            seenNodeIds.has(childId) ||
            nextLevelSeen.has(childId)
          ) {
            continue;
          }

          nextLevelSeen.add(childId);
          nextLevelIds.push(childId);
        }
      }

      currentLevelIds = nextLevelIds;

      if (currentLevelIds.length === 0 && depth < 4) {
        currentLevelIds = [];
      }
    }

    const makeStandardTree = (ownerNode) => {
      const ownerId = ownerNode.id;
      const ownerDepth = ownerNode.depth;

      const childDepth = ownerDepth + 1;

      const childIds =
        childDepth <= 4
          ? getSortedChildrenIds(ownerId)
              .filter(
                (childId) =>
                  nodeDepthById.get(childId) === childDepth
              )
          : [];

      const children = childIds
        .map((childId) => {
          const child = byId.get(childId);

          if (!child) return null;

          return {
            member: packMember(child, {
              depth: childDepth,
              role: 'clan_member',
              position: 'left',
              is_target: child.id === targetMember.id,
            }),
            partners: getSortedPartners(child.id, childDepth),
          };
        })
        .filter(Boolean);

      const ownerUnions = unions
        .filter((u) => u.husband_id === ownerId || u.wife_id === ownerId)
        .map((u) => {
          const ownerOrder = u.husband_id === ownerId
            ? u.husband_marriage_order
            : u.wife_marriage_order;
          const canonical = !!(u.husband_id && u.wife_id);
          const partnerMember = u.husband_id === ownerId
            ? (u.wife_id ? byId.get(u.wife_id) : null)
            : (u.husband_id ? byId.get(u.husband_id) : null);
          const partner = partnerMember
            ? packMember(partnerMember, {
                depth: ownerDepth,
                role: 'partner',
                position: 'right',
                source: 'member',
              })
            : {
                id: null,
                full_name: u.spouse_name_literal || null,
                role: 'partner',
                position: 'right',
                source: 'literal',
                is_clan: false,
                parent_union_id: null,
                avatar_url: null,
              };
          return { u, ownerOrder, canonical, partner };
        })
        .sort((a, b) => {
          const oa = a.ownerOrder == null ? 999999 : a.ownerOrder;
          const ob = b.ownerOrder == null ? 999999 : b.ownerOrder;
          if (oa !== ob) return oa - ob;
          const da = a.u.start_date ? new Date(a.u.start_date).getTime() : 8640000000000000;
          const db = b.u.start_date ? new Date(b.u.start_date).getTime() : 8640000000000000;
          if (da !== db) return da - db;
          return String(a.u.id).localeCompare(String(b.u.id));
        });
      const tabChildren = new Map();
      const unassigned = [];
      for (const child of children) {
        const uid = child.member.parent_union_id;
        if (!uid) {
          unassigned.push({ ...child, reason: 'PARENT_UNION_UNSET' });
          continue;
        }
        const union = unionById.get(uid);
        if (!union) {
          unassigned.push({ ...child, reason: 'PARENT_UNION_NOT_FOUND' });
          continue;
        }
        if (!union.husband_id || !union.wife_id) {
          unassigned.push({ ...child, reason: 'PARENT_UNION_LITERAL_NOT_ASSIGNABLE' });
          continue;
        }
        if (union.husband_id !== ownerId && union.wife_id !== ownerId) {
          unassigned.push({ ...child, reason: 'PARENT_UNION_NOT_OWNED_BY_ST' });
          continue;
        }
        if (!tabChildren.has(uid)) tabChildren.set(uid, []);
        tabChildren.get(uid).push(child);
      }
      const marriage_tabs = ownerUnions.map(({ u, ownerOrder, canonical, partner }) => ({
        union_id: u.id,
        owner_marriage_order: ownerOrder == null ? null : ownerOrder,
        union_status: u.status || null,
        supports_parent_union_assignment: canonical,
        partner,
        children: tabChildren.get(u.id) || [],
        child_count: (tabChildren.get(u.id) || []).length,
      }));
      const tree = {
        id: `st:${ownerDepth}:${ownerId}`,
        depth: ownerDepth,
        kind: 'standard_tree',
        parent: {
          member: packMember(byId.get(ownerId), {
            depth: ownerDepth,
            role: 'clan_member',
            position: 'left',
            is_origin: ownerId === rootNode.id,
            is_target: ownerId === targetMember.id,
          }),
          partners: getSortedPartners(ownerId, ownerDepth),
        },
        children,
        child_count: children.length,
        marriage_tabs,
        unassigned_children: unassigned,
      };
      if (ownerDepth === 4) {
        tree.children = [];
        tree.child_count = 0;
        tree.unassigned_children = [];
        tree.marriage_tabs = marriage_tabs.map((tab) => ({
          ...tab,
          children: [],
          child_count: 0,
        }));
      }
      return tree;
    };

    for (const level of levels) {
      level.standard_trees = level.nodes.map(makeStandardTree);
    }

    const emptyAncestorDepths = [];

    for (let depth = 0; depth < rootDepth; depth += 1) {
      emptyAncestorDepths.push(depth);
    }

    const mwlId = await resolveFounderMemberId(user);

    let mwlK = null;
    let mwlReason = 'no_mwl';
    let pathFromOriginToMwl = [];

    if (mwlId) {
      const mwl = byId.get(mwlId);

      if (!mwl) {
        mwlReason = 'mwl_not_found';
      } else if (mwl.is_clan === false) {
        mwlReason = 'ngoai_toc';
      } else if (mwlId === rootNode.id) {
        mwlK = 0;
        mwlReason = 'self';
        pathFromOriginToMwl = [rootNode.id];
      } else {
        const visited = new Set([mwlId]);

        const queue = [
          {
            id: mwlId,
            steps: 0,
            trailFromMwl: [mwlId],
          },
        ];

        let hit = null;
        let cursor = 0;

        while (cursor < queue.length && !hit) {
          const current = queue[cursor];
          cursor += 1;

          if (current.steps > 32) {
            continue;
          }

          if (current.id === rootNode.id) {
            hit = current;
            break;
          }

          const currentMember = byId.get(current.id);

          if (!currentMember) {
            continue;
          }

          for (const parentId of [
            currentMember.father_id,
            currentMember.mother_id,
          ]) {
            if (!parentId || visited.has(parentId)) {
              continue;
            }

            const parent = byId.get(parentId);

            if (!parent || parent.is_clan === false) {
              continue;
            }

            visited.add(parentId);

            queue.push({
              id: parentId,
              steps: current.steps + 1,
              trailFromMwl: [
                ...current.trailFromMwl,
                parentId,
              ],
            });
          }
        }

        if (hit) {
          mwlK = hit.steps;
          mwlReason = mwlK <= 4 ? 'on_tree' : 'too_far';

          pathFromOriginToMwl = [
            ...hit.trailFromMwl,
          ].reverse();
        } else {
          mwlReason = 'not_on_tree';
        }
      }
    }

    const targetNode = nodes.find(
      (node) => node.id === targetMember.id
    );

    const resolvedRoot = {
      member_id: rootNode.id,
      full_name: rootNode.full_name,
      root_canvas_depth: rootDepth,
    };

    assertFullSetInvariants({
      levels,
      nodes,
      targetMemberId: targetMember.id,
      selectedCanvasDepth: selectedDepth,
      rootCanvasDepth: rootDepth,
      resolvedAncestorSteps: actualAncestorSteps,
    });

    return {
      request_context: {
        target_member_id: targetMember.id,
        selected_canvas_depth: selectedDepth,
      },

      resolved_root: resolvedRoot,

      origin: {
        id: rootNode.id,
        full_name: rootNode.full_name,
        generation: rootNode.generation,
        branch_id: rootNode.branch_id,
        is_clan: rootNode.is_clan !== false,
        root_canvas_depth: rootDepth,
      },

      target: {
        member_id: targetMember.id,
        id: targetMember.id,
        full_name: targetMember.full_name,
        selected_canvas_depth: selectedDepth,
        rendered_canvas_depth: selectedDepth,
        resolved_ancestor_steps: actualAncestorSteps,
        selected_depth: selectedDepth,
        actual_depth: targetNode?.depth ?? selectedDepth,
        is_position_preserved: true,
      },

      window: {
        min_depth: 0,
        max_depth: 4,
        depth_count: 5,
        selected_depth: selectedDepth,
        root_depth: rootDepth,
        actual_ancestor_steps: actualAncestorSteps,
        empty_ancestor_depths: emptyAncestorDepths,
      },

      actual_k: actualAncestorSteps,
      target_member_id: targetMember.id,
      window_depth: 4,

      rule:
        'fixed_5_levels+selected_depth_anchor+is_clan+marriages+standard_tree_clusters',

      levels,

      nodes,

      ancestor_path_from_root_to_target: ancestorPathFromRootToTarget,

      contract_version: '2.2',
      deprecated_fields: [
        'origin.id',
        'origin.root_canvas_depth',
        'target.selected_depth',
        'target.actual_depth',
        'window.selected_depth',
        'window.root_depth',
        'window.actual_ancestor_steps',
        'actual_k',
      ],
    };
  },

  saveDraft: async ({ user, body, correlationId }) => {
    const actor = actorIdOf(user);
    if (!actor) fail('Thiếu người thực hiện.', 401, 'UNAUTHENTICATED');
    const tenantId = tenantIdOf(user);
    if (!tenantId) fail('Thiếu tenant.', 400, 'TENANT_REQUIRED');

    const targetMemberId = body.target_member_id || body.origin_member_id;
    if (!targetMemberId) {
      fail('Lưu nháp bắt buộc chọn Thành viên mốc M (target_member_id).', 400, 'MFO_TARGET_REQUIRED');
    }

    const targetMember = await prisma.members.findUnique({
      where: { id: targetMemberId },
      select: { id: true, tenant_id: true, deleted_at: true },
    });

    if (!targetMember || targetMember.deleted_at) {
      fail('Thành viên mốc M không tồn tại trên sổ.', 404, 'MFO_TARGET_NOT_FOUND');
    }

    if (String(targetMember.tenant_id) !== String(tenantId)) {
      fail('Thành viên mốc M không thuộc dòng họ này.', 403, 'TENANT_MISMATCH');
    }

    const selectedCanvasDepth = Number(body.selected_canvas_depth ?? body.k ?? 0);
    const now = new Date();

    const existingDraft = await prisma.proposals.findFirst({
      where: {
        tenant_id: tenantId,
        requester_user_id: actor,
        ticket_type: 'MFO_REVIEW',
        deleted_at: null,
        status: { in: ['DRAFT', 'NEEDS_REVISION', 'APPROVED'] },
      },
      orderBy: { updated_at: 'desc' },
    });

    if (body.ticket_id || body.ticketId) {
      const targetTicketId = body.ticket_id || body.ticketId;
      const currentProposal = await prisma.proposals.findUnique({
        where: { id: targetTicketId },
        select: { id: true, status: true, payload: true, updated_at: true },
      });

      if (currentProposal) {
        const st = currentProposal.status;
        const p = currentProposal.payload || {};
        const isEditable = st === 'DRAFT' || st === 'NEEDS_REVISION' || (st === 'APPROVED' && p.plan_ok && !p.result_submitted && !p.result_ok);
        if (!isEditable) {
          fail(
            `Tờ trình đang ở trạng thái [${st}], không thể lưu sửa nháp!`,
            409,
            'MFO_PROPOSAL_LOCKED'
          );
        }
      }
    }

    const payloadToSave = {
      kind: 'PLAN',
      target_member_id: targetMemberId,
      origin_member_id: targetMemberId,
      selected_canvas_depth: selectedCanvasDepth,
      k: selectedCanvasDepth,
      lines: Array.isArray(body.lines) ? body.lines : [],
      canvas_delta: body.canvas_delta || {
        draft_children: [],
        draft_spouses: [],
        node_positions_x: {},
      },
      smp_staging_data: body.smp_staging_data || {},
      graph_snapshot: body.graph_snapshot || null,
      init_scs: body.init_scs || body.diff_summary || [],
      diff_summary: body.diff_summary || body.init_scs || [],
      plan_ok: existingDraft?.payload?.plan_ok || false,
      result_submitted: false,
      result_ok: false,
    };

    const corr = correlationId || existingDraft?.correlation_id || crypto.randomUUID();

    return await withTransaction(
      { tenantId, actorId: actor, correlationId: corr },
      async (tx) => {
        let ticket;

        if (existingDraft && existingDraft.status === 'DRAFT') {
          if (body.updated_at) {
            const clientTime = new Date(body.updated_at).getTime();
            const serverTime = new Date(existingDraft.updated_at).getTime();
            if (Math.abs(clientTime - serverTime) > 2000) {
              fail('Bản nháp đã được cập nhật từ thiết bị khác. Vui lòng nạp lại trang!', 409, 'OPTIMISTIC_LOCK_CONFLICT');
            }
          }

          ticket = await tx.proposals.update({
            where: { id: existingDraft.id },
            data: {
              target_id: targetMemberId,
              payload: payloadToSave,
              updated_at: now,
              changed_by: actor,
            },
          });
        } else {
          ticket = await tx.proposals.create({
            data: {
              tenant_id: tenantId,
              ticket_type: 'MFO_REVIEW',
              status: 'DRAFT',
              requester_user_id: actor,
              target_table: 'members',
              target_id: targetMemberId,
              payload: payloadToSave,
              payload_schema_version: 2,
              correlation_id: corr,
              changed_by: actor,
            },
          });
        }

        await mfoWriteBpl(tx, {
          processType: 'MFO_PLAN_SUBMIT',
          user,
          ticket,
          payload: {
            action: 'MFO_DRAFT_SAVED',
            ticket_id: ticket.id,
            target_member_id: targetMemberId,
            saved_at: now.toISOString(),
          },
        });

        return {
          ticket,
          updated_at: ticket.updated_at.toISOString(),
        };
      }
    );
  },

  getDraftPayload: async ({ user, ticketId }) => {
    const tenantId = tenantIdOf(user);
    if (!ticketId) fail('Thiếu Ticket ID.', 400, 'MFO_TICKET_REQUIRED');

    const proposal = await prisma.proposals.findFirst({
      where: {
        id: ticketId,
        deleted_at: null,
      },
    });

    if (!proposal) {
      fail('Không tìm thấy bản ghi Tờ trình / Bản nháp.', 404, 'MFO_LOT_NOT_FOUND');
    }

    if (tenantId && String(proposal.tenant_id) !== String(tenantId)) {
      fail('Lô không thuộc dòng họ này.', 403, 'TENANT_MISMATCH');
    }

    const payload = proposal.payload || {};

    return {
      ticket_id: proposal.id,
      tenant_id: proposal.tenant_id,
      target_member_id: proposal.target_id,
      status: proposal.status,
      ticket_type: proposal.ticket_type,
      updated_at: proposal.updated_at,
      admin_note: proposal.admin_note || payload.admin_note || payload.reject_reason || null,

      selected_canvas_depth: payload.selected_canvas_depth ?? payload.k ?? 0,
      lines: payload.lines || [],
      
      canvas_delta: payload.canvas_delta || {
        draft_children: [],
        draft_spouses: [],
        node_positions_x: {},
      },
      smp_staging_data: payload.smp_staging_data || {},
      graph_snapshot: payload.graph_snapshot || null,
      init_scs: payload.init_scs || payload.diff_summary || null,
      diff_summary: payload.diff_summary || payload.init_scs || null,
      review_scs: payload.review_scs || null,
      review_rounds: payload.review_rounds || [],
      current_attempt: payload.current_attempt || 1,

      plan_ok: Boolean(payload.plan_ok),
      result_submitted: Boolean(payload.result_submitted),
      result_ok: Boolean(payload.result_ok),
      granted_generation: payload.granted_generation ?? null,
      granted_branch_id: payload.granted_branch_id ?? null,
    };
  },

  deleteDraft: async ({ user, ticketId }) => {
    const actor = actorIdOf(user);
    if (!actor) fail('Thiếu người thực hiện.', 401, 'UNAUTHENTICATED');
    const tenantId = tenantIdOf(user);
    if (!tenantId) fail('Thiếu tenant.', 400, 'TENANT_REQUIRED');

    const proposal = await prisma.proposals.findFirst({
      where: {
        id: ticketId,
        deleted_at: null,
      },
    });

    if (!proposal) {
      fail('Không tìm thấy bản nháp/tờ trình cần xóa.', 404, 'MFO_DRAFT_NOT_FOUND');
    }

    const status = String(proposal.status).toUpperCase();
    const payload = proposal.payload || {};

    const isDraft = status === 'DRAFT';
    const isNeedsRevision = status === 'NEEDS_REVISION';
    const isGate1ApprovedOnly = status === 'APPROVED' && payload.plan_ok === true && !payload.result_submitted && !payload.result_ok;

    if (!isDraft && !isNeedsRevision && !isGate1ApprovedOnly) {
      fail(
        `Tờ trình đang ở trạng thái [${status}]. Không thể xóa hồ sơ đang trong luồng thẩm định, đã chốt sổ thật hoặc đã bị bác bỏ!`,
        409,
        'MFO_NOT_DELETABLE_STATE'
      );
    }

    if (!isClanOrSys(user) && String(proposal.requester_user_id) !== String(actor)) {
      fail('Không có quyền xóa bản nháp/tờ trình này.', 403, 'FORBIDDEN');
    }

    const now = new Date();

    return await withTransaction(
      { tenantId, actorId: actor, correlationId: proposal.correlation_id },
      async (tx) => {
        const updated = await tx.proposals.update({
          where: { id: ticketId },
          data: {
            deleted_at: now,
            changed_by: actor,
          },
        });

        await mfoWriteBpl(tx, {
          processType: 'MFO_PLAN_SUBMIT',
          user,
          ticket: updated,
          payload: {
            action: 'MFO_DRAFT_DELETED',
            ticket_id: updated.id,
            target_member_id: updated.target_id,
            deleted_from_status: proposal.status,
            deleted_at: now.toISOString(),
            deleted_by: actor,
          },
        });

        await audit.create(tx, {
          tableName: 'proposals',
          recordId: updated.id,
          action: 'XOA',
          tenantId,
          changedBy: actor,
          correlationId: proposal.correlation_id,
          oldData: {
            id: proposal.id,
            status: proposal.status,
            target_id: proposal.target_id,
            deleted_at: null,
          },
          newData: {
            id: updated.id,
            status: updated.status,
            target_id: updated.target_id,
            deleted_at: now.toISOString(),
          },
          changeReason: `Người dùng xóa tờ trình ở trạng thái [${proposal.status}] theo quy chuẩn EU Delete Matrix`,
        });

        return { id: updated.id, deleted: true, deleted_at: updated.deleted_at };
      }
    );
  },

  /**
   * <2026-10-09T23:55:00+07:00> - CHUẨN BỊ PAYLOAD TRÌNH KHUNG MFO 5L
   * (ỦY QUYỀN CHUYỂN DỊCH STATUS SANG PENDING CHO SRPF ACTION EXECUTOR)
   */
  createPlan: async ({ user, body, correlationId }) => {
    const actor = actorIdOf(user);
    if (!actor) fail('Thiếu người thực hiện.', 401, 'UNAUTHENTICATED');
    const tenantId = tenantIdOf(user);
    if (!tenantId) fail('Thiếu tenant.', 400, 'TENANT_REQUIRED');

    const founderMemberId = await resolveFounderMemberId(user);
    if (!founderMemberId && !isClanOrSys(user)) {
      fail(
        'Founder phải là MWL (users.member_id). ADMIN IT được kê hộ.',
        422,
        'MFO_FOUNDER_NOT_MWL'
      );
    }

    const payload = normalizePlanBody(body);
    const corr = correlationId || crypto.randomUUID();

    const origin = await prisma.members.findUnique({
      where: { id: payload.origin_member_id },
    });
    if (!origin || origin.deleted_at) {
      fail('Không tìm thấy Origin trên sổ.', 404, 'MFO_ORIGIN_NOT_FOUND');
    }

    payload.founder_user_id = actor;
    payload.founder_member_id = founderMemberId || null;

    const ticket = await withTransaction(
      { tenantId, actorId: actor, correlationId: corr },
      async (tx) => {
        const ticketIdFromBody = body.ticket_id || body.ticketId;
        
        await ensureNoActiveProposal(tx, { 
          tenantId, 
          actorId: actor, 
          excludeId: ticketIdFromBody || null 
        });

        let existing = null;
        if (ticketIdFromBody) {
          existing = await tx.proposals.findFirst({
            where: { id: ticketIdFromBody, tenant_id: tenantId, deleted_at: null },
          });
          if (!existing) {
            fail('Không tìm thấy bản nháp Tờ trình.', 404, 'MFO_DRAFT_NOT_FOUND');
          }
          if (existing.status !== 'DRAFT' && existing.status !== 'NEEDS_REVISION') {
            fail(`Không thể trình khung từ trạng thái ${existing.status}.`, 409, 'MFO_PLAN_STATE', {
              ticket_status: existing.status,
            });
          }
        }

        const existingPayload = (existing && existing.payload) || {};
        const mergedPayload = {
          ...existingPayload,
          ...payload,
          target_member_id: body.target_member_id || existingPayload.target_member_id || payload.origin_member_id,
          origin_member_id: payload.origin_member_id || existingPayload.origin_member_id,
          selected_canvas_depth: payload.k,
          canvas_delta: body.canvas_delta || existingPayload.canvas_delta || {
            draft_children: [],
            draft_spouses: [],
            node_positions_x: {},
          },
          smp_staging_data: body.smp_staging_data || existingPayload.smp_staging_data || {},
          graph_snapshot: body.graph_snapshot || existingPayload.graph_snapshot || null,
          init_scs: body.init_scs || body.diff_summary || existingPayload.init_scs || null,
          diff_summary: body.diff_summary || body.init_scs || existingPayload.diff_summary || null,
          review_scs: null,
          review_rounds: existingPayload.review_rounds || [],
          current_attempt:
            existing?.status === 'NEEDS_REVISION'
              ? (Number(existingPayload.current_attempt) || 1) + 1
              : Number(existingPayload.current_attempt) || 1,
          kind: 'PLAN',
          plan_ok: false,
          result_submitted: false,
          result_ok: false,
        };

        let row;
        if (ticketIdFromBody) {
          // GIỮ NGUYÊN STATUS HIỆN TẠI (DRAFT/NEEDS_REVISION) LÚC CHUẨN BỊ PAYLOAD
          // SRPF ACTION EXECUTOR SẼ CẬP NHẬT STATUS = PENDING NGUYÊN TỬ TRONG TẬP CHUYỂN DỊCH
          row = await tx.proposals.update({
            where: { id: ticketIdFromBody },
            data: {
              payload: mergedPayload,
              target_id: mergedPayload.origin_member_id,
              updated_at: new Date(),
              changed_by: actor,
            },
          });
        } else {
          row = await tx.proposals.create({
            data: {
              tenant_id: tenantId,
              ticket_type: 'MFO_REVIEW',
              status: 'DRAFT',
              requester_user_id: actor,
              target_table: 'members',
              target_id: mergedPayload.origin_member_id,
              payload: mergedPayload,
              payload_schema_version: 2,
              correlation_id: corr,
              changed_by: actor,
            },
          });
        }

        await mfoWriteBpl(tx, {
          processType: 'MFO_PLAN_SUBMIT',
          user,
          ticket: row,
          payload: {
            action: 'MFO_PLAN_SUBMIT_PREPARED',
            from_status: existing ? existing.status : 'NEW',
            attempt_no: mergedPayload.current_attempt,
            submitted_note: mergedPayload.note || null,
          },
        });

        return row;
      }
    );

    return { ticket, payload };
  },

  listPlans: async ({ user, query }) => {
    const tenantId = tenantIdOf(user);
    if (!tenantId) fail('Thiếu tenant.', 400, 'TENANT_REQUIRED');
    const q = query || {};
    const where = {
      tenant_id: tenantId,
      ticket_type: { in: ['MFO_REVIEW', 'BRANCH_REVIEW'] },
      target_table: 'members',
      deleted_at: null,
    };
    if (!isClanOrSys(user)) {
      where.requester_user_id = actorIdOf(user);
    } else if (q.mine === '1' || q.mine === 'true') {
      where.requester_user_id = actorIdOf(user);
    }
    if (q.origin_id) where.target_id = q.origin_id;
    if (q.status) where.status = q.status;

    const rows = await prisma.proposals.findMany({
      where,
      orderBy: { updated_at: 'desc' },
      take: Math.min(Number(q.limit) || 50, 100),
      select: {
        id: true,
        status: true,
        requester_user_id: true,
        target_id: true,
        payload: true,
        payload_schema_version: true,
        correlation_id: true,
        created_at: true,
        updated_at: true,
        reviewed_at: true,
        admin_note: true,
      },
    });

    return rows.map((r) => {
      const p = r.payload || {};
      const targetMemberId = r.target_id || p.target_member_id || p.origin_member_id || null;

      return {
        id: r.id,
        ticket_id: r.id,
        status: r.status,
        is_draft: r.status === 'DRAFT',
        plan_ok: !!p.plan_ok,
        result_ok: !!p.result_ok,
        result_submitted: !!p.result_submitted,
        admin_review: p.admin_review || null,
        kind: p.kind || 'PLAN',
        target_member_id: targetMemberId,
        origin_member_id: targetMemberId,
        selected_canvas_depth: p.selected_canvas_depth ?? p.k ?? 0,
        k: p.k ?? p.selected_canvas_depth ?? 0,
        granted_generation: p.granted_generation,
        requester_user_id: r.requester_user_id,
        correlation_id: r.correlation_id,
        created_at: r.created_at,
        updated_at: r.updated_at,
        reviewed_at: r.reviewed_at,
        note: p.note || r.admin_note || null,
        admin_note: r.admin_note || p.admin_note || p.reject_reason || null,
        has_delta: Boolean(p.canvas_delta),
        has_snapshot: Boolean(p.graph_snapshot),
        init_scs: p.init_scs || p.diff_summary || null,
        diff_summary: p.diff_summary || p.init_scs || null,
        review_scs: p.review_scs || null,
        review_rounds: p.review_rounds || [],
        current_attempt: p.current_attempt || 1,
      };
    });
  },

  getPlan: async ({ user, ticketId }) => {
    const tenantId = tenantIdOf(user);
    const row = await prisma.proposals.findUnique({
      where: { id: ticketId },
    });
    if (!row || row.deleted_at) fail('Không tìm thấy lô.', 404, 'MFO_LOT_NOT_FOUND');
    if (tenantId && String(row.tenant_id) !== String(tenantId)) {
      fail('Lô không thuộc dòng họ này.', 403, 'TENANT_MISMATCH');
    }
    const originId = (row.payload && row.payload.origin_member_id) || row.target_id;
    let tree = null;
    if (originId) {
      tree = await mfoService.getOriginTree({ user, originId });
    }
    return { ticket: row, tree };
  },

  assertLot: async ({ user, ticketId, expectKind }) => {
    const got = await mfoService.getPlan({ user, ticketId });
    const row = got.ticket || got;
    return row;
  },

  /**
   * <2026-10-09T23:55:00+07:00> - CHUẨN BỊ PAYLOAD PHÊ DUYỆT KHUNG 5L GATE 1
   * (ỦY QUYỀN SANG SRPF EXECUTOR CHUYỂN DỊCH STATUS SANG APPROVED)
   */
  approvePlan: async ({ user, ticketId, body }) => {
    if (!isClanOrSys(user)) {
      fail('Chỉ CLAN_ADMIN / SYSTEM_ADMIN phê PLAN.', 403, 'FORBIDDEN');
    }
    const row = await mfoService.assertLot({
      user,
      ticketId,
      expectKind: 'PLAN',
    });

    const b = body || {};
    const genRaw = b.granted_generation != null ? b.granted_generation : b.generation;
    const grantedGeneration = Number(genRaw);
    if (!Number.isFinite(grantedGeneration)) {
      fail('Phê PLAN bắt buộc granted_generation.', 422, 'MFO_GENERATION_REQUIRED');
    }

    const grantedBranchId =
      b.granted_branch_id === undefined
        ? row.payload.proposed_branch_id || null
        : b.granted_branch_id || null;

    const nextPayload = {
      ...row.payload,
      kind: 'PLAN',
      plan_ok: true,
      granted_generation: grantedGeneration,
      granted_branch_id: grantedBranchId,
      approver_note: b.note || b.admin_note || null,
      admin_review: pickAdminReview(b, row, 'plan'),
      review_scs: b.review_scs || row.payload.review_scs || null,
    };

    return { ticket: { ...row, payload: nextPayload }, plan_ok: true };
  },

  /**
   * <2026-10-09T23:55:00+07:00> - CHUẨN BỊ PAYLOAD REJECT PLAN
   */
  rejectPlan: async ({ user, ticketId, body }) => {
    if (!isClanOrSys(user)) {
      fail('Chỉ CLAN_ADMIN / SYSTEM_ADMIN từ chối PLAN.', 403, 'FORBIDDEN');
    }
    const row = await mfoService.assertLot({
      user,
      ticketId,
      expectKind: 'PLAN',
    });

    const reason = (body && (body.reason || body.note || body.admin_note)) || '';
    if (!String(reason).trim()) {
      fail('Từ chối PLAN bắt buộc reason.', 400, 'MFO_REASON_REQUIRED');
    }

    return { ticket: row, reason: String(reason).trim() };
  },

  /**
   * <2026-10-09T23:55:00+07:00> - CHUẨN BỊ PAYLOAD KHÔNG DUYỆT / TRẢ VỀ KHUNG 5L
   * (ỦY QUYỀN SANG SRPF EXECUTOR CHUYỂN DỊCH STATUS SANG NEEDS_REVISION)
   */
  returnPlanForRevision: async ({ user, ticketId, body }) => {
    if (!isClanOrSys(user)) {
      fail('Chỉ CLAN_ADMIN / SYSTEM_ADMIN có quyền yêu cầu sửa đổi.', 403, 'FORBIDDEN');
    }
    const actor = actorIdOf(user);
    const row = await mfoService.assertLot({
      user,
      ticketId,
      expectKind: 'PLAN',
    });

    if (row.status !== 'PENDING' && row.status !== 'UNDER_REVIEW') {
      fail('Chỉ trả hồ sơ đang ở trạng thái PENDING hoặc UNDER_REVIEW.', 409, 'MFO_PLAN_STATE', {
        ticket_status: row.status,
      });
    }

    const b = body || {};
    const reviewScs = b.review_scs || [];
    const globalAdminNote = String(b.note || b.admin_note || body.reason || '').trim();

    const previousRounds = Array.isArray(row.payload?.review_rounds)
      ? [...row.payload.review_rounds]
      : [];

    const closedRound = {
      attempt_no: Number(row.payload?.current_attempt) || 1,
      submitted_at: row.updated_at || row.created_at,
      requester_user_id: row.requester_user_id,
      init_scs: row.payload?.init_scs || row.payload?.diff_summary || [],
      reviewed_at: new Date().toISOString(),
      reviewer_user_id: actor,
      review_scs: reviewScs,
      global_admin_note: globalAdminNote || null,
      outcome: 'NEEDS_REVISION',
    };

    previousRounds.push(closedRound);

    const nextPayload = {
      ...row.payload,
      plan_ok: false,
      review_scs: reviewScs,
      review_rounds: previousRounds,
      admin_note: globalAdminNote || null,
      reject_reason: globalAdminNote || 'Yêu cầu hiệu chỉnh theo bút phê',
    };

    return { ticket: { ...row, payload: nextPayload }, reviewScs, globalAdminNote };
  },

  getOriginTree: async ({ user, originId }) => {
    const tenantId = tenantIdOf(user);
    if (!originId) fail('Thiếu origin id.', 400, 'MFO_ORIGIN_REQUIRED');

    const origin = await prisma.members.findUnique({
      where: { id: originId },
      select: {
        id: true,
        full_name: true,
        generation: true,
        gender: true,
        father_id: true,
        mother_id: true,
        tenant_id: true,
        deleted_at: true,
        branch_id: true,
        is_clan: true,
        child_type: true,
      },
    });
    if (!origin || origin.deleted_at) {
      fail('Không tìm thấy Origin trên sổ.', 404, 'MFO_ORIGIN_NOT_FOUND');
    }
    if (tenantId && String(origin.tenant_id) !== String(tenantId)) {
      fail('Origin không thuộc dòng họ này.', 403, 'TENANT_MISMATCH');
    }

    const all = await prisma.members.findMany({
      where: { tenant_id: origin.tenant_id, deleted_at: null },
      select: {
        id: true,
        full_name: true,
        generation: true,
        gender: true,
        father_id: true,
        mother_id: true,
        branch_id: true,
        is_clan: true,
        child_type: true,
        sibling_seq: true,
        birth_year: true,
        note: true,
      },
    });

    const unions = await prisma.marriages.findMany({
      where: {
        tenant_id: origin.tenant_id,
        deleted_at: null,
        status: { in: ['DANG_KET_HON', 'GOA'] },
      },
      select: {
        id: true,
        husband_id: true,
        wife_id: true,
        husband_marriage_order: true,
        wife_marriage_order: true,
        status: true,
        spouse_name_literal: true,
      },
    });

    const isNoi = (m) => !m || m.is_clan !== false;

    const byId = new Map(all.map((m) => [m.id, m]));
    const noiOf = new Map();
    for (const m of all) {
      if (!isNoi(m)) continue;
      for (const pid of [m.father_id, m.mother_id]) {
        if (!pid) continue;
        if (!noiOf.has(pid)) noiOf.set(pid, []);
        if (!noiOf.get(pid).includes(m.id)) noiOf.get(pid).push(m.id);
      }
    }

    const partnersOf = new Map();
    const pushPartner = (ownerId, partner, meta) => {
      if (!ownerId || !partner) return;
      if (partner.id && partner.id === ownerId) return;
      if (!partnersOf.has(ownerId)) partnersOf.set(ownerId, []);
      const bag = partnersOf.get(ownerId);
      const key = partner.id || 'lit:' + (partner.full_name || '');
      if (bag.some((p) => p._key === key)) return;
      bag.push({ ...partner, _key: key, _ord: meta.ord || 99, _status: meta.status });
    };
    for (const u of unions) {
      const hus = u.husband_id && byId.get(u.husband_id);
      const wif = u.wife_id && byId.get(u.wife_id);
      if (u.husband_id && wif) {
        pushPartner(u.husband_id, wif, {
          ord: u.husband_marriage_order,
          status: u.status,
        });
      } else if (u.husband_id && u.spouse_name_literal) {
        pushPartner(u.husband_id, { id: null, full_name: u.spouse_name_literal }, {
          ord: u.husband_marriage_order,
          status: u.status,
        });
      }
      if (u.wife_id && hus) {
        pushPartner(u.wife_id, hus, {
          ord: u.wife_marriage_order,
          status: u.status,
        });
      } else if (u.wife_id && !hus && u.spouse_name_literal) {
        pushPartner(u.wife_id, { id: null, full_name: u.spouse_name_literal }, {
          ord: u.wife_marriage_order,
          status: u.status,
        });
      }
    }

    const pack = (m, extra) => ({
      id: m.id || null,
      full_name: m.full_name,
      is_unknown: !!(
        (m.note && String(m.note).includes('[UM]')) ||
        (m.full_name && /^chưa rõ/i.test(String(m.full_name)))
      ),
      generation: m.generation != null ? m.generation : null,
      gender: m.gender || null,
      father_id: m.father_id || null,
      mother_id: m.mother_id || null,
      branch_id: m.branch_id || null,
      is_clan: m.is_clan !== false,
      child_type: m.child_type || null,
      sibling_seq: m.sibling_seq != null ? m.sibling_seq : null,
      ...extra,
    });

    const sibSort = (ids) =>
      ids
        .map((id) => byId.get(id))
        .filter(Boolean)
        .sort((a, b) => {
          const sa = a.sibling_seq == null ? 9999 : a.sibling_seq;
          const sb = b.sibling_seq == null ? 9999 : b.sibling_seq;
          if (sa !== sb) return sa - sb;
          const ya = a.birth_year == null ? 9999 : a.birth_year;
          const yb = b.birth_year == null ? 9999 : b.birth_year;
          if (ya !== yb) return ya - yb;
          return String(a.full_name || '').localeCompare(String(b.full_name || ''), 'vi');
        })
        .map((m) => m.id);

    const MAX_DEPTH = 4;
    const nodes = [];
    const seen = new Set();
    const queue = [{ id: origin.id, depth: 0 }];
    seen.add(origin.id);
    while (queue.length) {
      const cur = queue.shift();
      const m = byId.get(cur.id);
      if (!m) continue;
      const partners = (partnersOf.get(cur.id) || [])
        .sort((a, b) => (a._ord || 99) - (b._ord || 99))
        .map((p) =>
          pack(p, {
            depth: cur.depth,
            role: 'partner',
            source: p.id ? 'marriage' : 'literal',
            union_status: p._status || null,
          })
        );
      nodes.push(
        pack(m, {
          depth: cur.depth,
          is_origin: cur.depth === 0,
          partners,
        })
      );
      if (cur.depth >= MAX_DEPTH) continue;
      for (const kid of sibSort(noiOf.get(cur.id) || [])) {
        if (seen.has(kid)) continue;
        seen.add(kid);
        queue.push({ id: kid, depth: cur.depth + 1 });
      }
    }

    const mwlId = await resolveFounderMemberId(user);
    let k = null;
    let k_reason = 'no_mwl';
    const path = [];
    if (mwlId) {
      const mwl = byId.get(mwlId);
      if (mwl && mwl.is_clan === false) {
        k_reason = 'ngoai_toc';
      } else if (mwlId === origin.id) {
        k = 0;
        k_reason = 'self';
        path.push(origin.id);
      } else {
        const vis = new Set();
        const q = [{ id: mwlId, steps: 0, trail: [mwlId] }];
        vis.add(mwlId);
        let hit = null;
        while (q.length && !hit) {
          const cur = q.shift();
          if (cur.steps > 32) continue;
          if (cur.id === origin.id) {
            hit = cur;
            break;
          }
          const row = byId.get(cur.id);
          if (!row) continue;
          for (const pid of [row.father_id, row.mother_id]) {
            if (!pid || vis.has(pid)) continue;
            const parent = byId.get(pid);
            if (parent && parent.is_clan === false) continue;
            vis.add(pid);
            q.push({
              id: pid,
              steps: cur.steps + 1,
              trail: [pid, ...cur.trail],
            });
          }
        }
        if (hit) {
          k = hit.steps;
          k_reason = k > 4 ? 'too_far' : 'on_tree';
          path.push(...hit.trail);
        } else {
          k = null;
          k_reason = 'not_on_tree';
        }
      }
    }

    return {
      origin: {
        id: origin.id,
        full_name: origin.full_name,
        generation: origin.generation,
        branch_id: origin.branch_id,
        is_clan: origin.is_clan !== false,
      },
      window_depth: MAX_DEPTH,
      rule: 'is_clan+marriages',
      nodes,
      mwl: {
        member_id: mwlId,
        k,
        k_reason,
        in_window: k !== null && k <= 4,
        path_to_origin: path,
      },
    };
  },

  submitResult: async ({ user, ticketId, body }) => {
    const actor = actorIdOf(user);
    const row = await mfoService.assertLot({
      user,
      ticketId,
      expectKind: 'PLAN',
    });
    if (!isClanOrSys(user) && String(row.requester_user_id) !== String(actor)) {
      fail('Chỉ người trình hoặc ADMIN nộp RESULT.', 403, 'FORBIDDEN');
    }
    if (!row.payload || !row.payload.plan_ok) {
      fail(
        'Chỉ nộp RESULT khi PLAN đã có tem phê duyệt plan_ok.',
        409,
        'MFO_PLAN_STATE',
        { ticket_status: row.status }
      );
    }
    if (row.payload.result_ok) {
      fail('RESULT đã nghiệm thu hoàn tất.', 409, 'MFO_RESULT_DONE');
    }

    return { ticket: row };
  },

  approveResult: async ({ user, ticketId, body }) => {
    if (!isClanOrSys(user)) {
      fail('Chỉ ADMIN nghiệm thu RESULT.', 403, 'FORBIDDEN');
    }
    const actor = actorIdOf(user);
    const tenantId = tenantIdOf(user);

    const row = await mfoService.assertLot({
      user,
      ticketId,
      expectKind: 'PLAN',
    });

    if (!row.payload.result_submitted) {
      fail('Chưa nộp Tờ khai Nghiệm thu kết quả xưởng.', 409, 'MFO_RESULT_NOT_SUBMITTED');
    }

    const grantedGeneration = row.payload.granted_generation != null ? Number(row.payload.granted_generation) : null;

    return await withTransaction(
      { tenantId: row.tenant_id, actorId: actor, correlationId: row.correlation_id },
      async (tx) => {
        const mutationResult = await executeGate2DbMutation(tx, {
          tenantId: row.tenant_id,
          actorId: actor,
          proposal: row,
          grantedGeneration,
        });

        return { ticket: row, mutation: mutationResult };
      }
    );
  },

  rejectResult: async ({ user, ticketId, body }) => {
    if (!isClanOrSys(user)) {
      fail('Chỉ ADMIN trả RESULT.', 403, 'FORBIDDEN');
    }
    const row = await mfoService.assertLot({
      user,
      ticketId,
      expectKind: 'PLAN',
    });
    if (row.status === 'APPROVED' && row.payload && row.payload.result_ok) {
      fail('Tờ khai đã nghiệm thu chốt Sổ thật, không thể trả lại.', 409, 'MFO_RESULT_DONE');
    }
    const reason = (body && (body.reason || body.note || body.admin_note)) || '';
    if (!String(reason).trim()) {
      fail('Trả lại Tờ khai bắt buộc phải có bút phê lý do.', 400, 'MFO_REASON_REQUIRED');
    }

    return { ticket: row, reason: String(reason).trim() };
  },

  abortPlan: async ({ user, ticketId, body }) => {
    const actor = actorIdOf(user);
    const row = await mfoService.assertLot({
      user,
      ticketId,
      expectKind: 'PLAN',
    });
    if (!isClanOrSys(user) && String(row.requester_user_id) !== String(actor)) {
      fail('Không có quyền rút tờ trình này.', 403, 'FORBIDDEN');
    }
    if (row.payload && row.payload.result_ok) {
      fail('Tờ trình đã chốt Sổ họ, không thể rút.', 409, 'MFO_RESULT_DONE');
    }
    const st = String(row.status || '');
    const submitted = !!(row.payload && row.payload.result_submitted);
    const allowed =
      st === 'PENDING' ||
      st === 'NEEDS_REVISION' ||
      (st === 'APPROVED' && !submitted);
    if (!allowed) {
      fail('Không rút được tờ trình ở trạng thái này.', 409, 'MFO_PLAN_STATE', {
        ticket_status: row.status,
      });
    }

    const now = new Date();
    const nextPayload = {
      ...row.payload,
      aborted: true,
      aborted_at: now.toISOString(),
      aborted_by: actor,
      plan_ok: false,
      result_submitted: false,
      result_ok: false,
    };
    const ticket = await prisma.proposals.update({
      where: { id: row.id },
      data: {
        status: 'WITHDRAWN',
        payload: nextPayload,
        admin_note: (body && (body.note || body.reason)) || row.admin_note,
        changed_by: actor,
      },
    });
    await afterMfo(user, ticket, 'MFO_PLAN_ABORT', 'MFO_PLAN_ABORTED', {
      from_status: row.status,
      to_status: 'WITHDRAWN',
    });
    return { ticket, aborted: true };
  },
};

module.exports = mfoService;