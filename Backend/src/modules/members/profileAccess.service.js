/**
 * PATH       : src/modules/members/profileAccess.service.js
 * DATETIME   : 2026-09-04T22:20:00+07:00
 * VERSION    : 1.0.0-M12AB
 * DESCRIPTION: Stamp creator lúc INSERT member + canEditProfile.
 */

'use strict';

const { prisma } = require('../../lib/prisma.js');

function actorOf(user) {
  return {
    userId: user?.userId || user?.id || user?.sub || null,
    tenantId: user?.tenantId || user?.tenant_id || null,
    role: user?.role || null,
    memberId: user?.member_id || user?.memberId || null,
  };
}

function creatorStamp(user, extra = {}) {
  const a = actorOf(user);
  return {
    created_by: extra.created_by || a.userId || null,
    created_by_member_id: extra.created_by_member_id || a.memberId || null,
  };
}

async function resolveActorMemberId(actor) {
  if (actor.memberId) return actor.memberId;
  if (!actor.userId) return null;
  const row = await prisma.users.findFirst({
    where: { id: actor.userId, deleted_at: null },
    select: { member_id: true, tenant_id: true },
  });
  if (row?.tenant_id && !actor.tenantId) actor.tenantId = row.tenant_id;
  return row?.member_id || null;
}

async function canEditProfile(reqUser, targetMemberId) {
  const actor = actorOf(reqUser);
  if (!actor.userId) {
    return { ok: false, code: 'UNAUTHORIZED', reason: 'Thiếu phiên.' };
  }
  const member = await prisma.members.findFirst({
    where: { id: String(targetMemberId), deleted_at: null },
  });
  if (!member) {
    return { ok: false, code: 'NOT_FOUND', reason: 'Không tìm thấy thành viên.' };
  }

  if (actor.role === 'SYSTEM_ADMIN') {
    return { ok: true, via: 'SYS', member };
  }
  if (actor.role === 'CLAN_ADMIN' && actor.tenantId === member.tenant_id) {
    return { ok: true, via: 'CLAN_ADMIN', member };
  }
  if (actor.tenantId && actor.tenantId !== member.tenant_id) {
    return { ok: false, code: 'FORBIDDEN', reason: 'Khác dòng họ.', member };
  }

  const actorMemberId = await resolveActorMemberId(actor);

  if (member.is_alive !== false && actorMemberId && actorMemberId === member.id) {
    return { ok: true, via: 'SELF', member };
  }
  if (member.created_by && member.created_by === actor.userId) {
    return { ok: true, via: 'CREATOR_USER', member };
  }
  if (member.created_by_member_id && actorMemberId && member.created_by_member_id === actorMemberId) {
    return { ok: true, via: 'CREATOR_MEMBER', member };
  }

  if (actorMemberId) {
    const now = new Date();
    const grants = await prisma.profile_edit_grants.findMany({
      where: {
        tenant_id: member.tenant_id,
        grantee_member_id: actorMemberId,
        status: 'HIEU_LUC',
        deleted_at: null,
        OR: [{ expires_at: null }, { expires_at: { gt: now } }],
      },
    });
    const grant = grants.find((g) => {
      if (g.scope === 'PROFILE' && g.target_member_id === member.id) return true;
      if (g.scope === 'BRANCH_PROFILE' && member.branch_id && g.target_branch_id === member.branch_id) {
        return true;
      }
      return false;
    });
    if (grant) return { ok: true, via: 'GRANT', member, grant };

    const offices = await prisma.member_offices.findMany({
      where: {
        tenant_id: member.tenant_id,
        member_id: actorMemberId,
        status: 'HIEU_LUC',
        deleted_at: null,
        OR: [{ valid_to: null }, { valid_to: { gte: now } }],
      },
    });
    for (const off of offices) {
      if (off.office === 'TRUONG_HO' || off.office === 'TRUONG_TOC') {
        return { ok: true, via: 'OFFICE_' + off.office, member, office: off };
      }
      if (
        (off.office === 'TRUONG_BRANCH' || off.office === 'TRUONG_CHI' || off.office === 'TRUONG_NGANH') &&
        off.branch_id &&
        member.branch_id &&
        off.branch_id === member.branch_id
      ) {
        return { ok: true, via: 'OFFICE_' + off.office, member, office: off };
      }
    }
  }

  return { ok: false, code: 'FORBIDDEN', reason: 'Không có quyền sửa hồ sơ này.', member };
}


async function canViewProfile(reqUser, targetMemberId) {
  const actor = actorOf(reqUser);
  if (!actor.userId) {
    return { ok: false, code: 'UNAUTHORIZED', reason: 'Thiếu phiên.' };
  }
  const member = await prisma.members.findFirst({
    where: { id: String(targetMemberId), deleted_at: null },
  });
  if (!member) {
    return { ok: false, code: 'NOT_FOUND', reason: 'Không tìm thấy thành viên.' };
  }
  if (actor.role === 'SYSTEM_ADMIN') {
    return { ok: true, via: 'SYS', member };
  }
  const tenantId = actor.tenantId;
  if (!tenantId || tenantId !== member.tenant_id) {
    return { ok: false, code: 'FORBIDDEN', reason: 'Khác dòng họ.', member };
  }
  return { ok: true, via: 'TENANT', member };
}

module.exports = { actorOf, creatorStamp, canEditProfile, canViewProfile, resolveActorMemberId };
