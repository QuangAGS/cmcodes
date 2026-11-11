/**
 * PATH       : src/modules/members/profileAccess.service.js
 * DATETIME   : 2026-11-11T13:10:00+07:00
 * VERSION    : 1.1.1-MULTIHOME-AUDIT-FALLBACK
 * DESCRIPTION:
 * - [AMEND-RP-OP-2026-02 V1.2] Lát 2/7:
 *   + Thêm console.warn khi rơi vào nhánh fallback users gốc tại resolveActorMemberId
 *     và canEditProfile để kiểm soát truy vết, không để hệ thống "im lặng" về họ gốc.
 *   + Ưu tiên roleInTenant và activeMemberId từ Context Multi-Home.
 */

'use strict';

const { prisma, basePrisma } = require('../../lib/prisma.js');

const ADMIN_ROLES = new Set([
  'SYSTEM_ADMIN',
  'CLAN_ADMIN',
  'TRUONG_HO',
  'TRUONG_TOC',
  'TRUONG_NGANH',
  'TRUONG_CHI',
]);

function actorOf(user) {
  const role = user?.roleInTenant || user?.role || null;
  return {
    userId: user?.userId || user?.id || user?.sub || null,
    tenantId: user?.activeTenantId || user?.tenantId || user?.tenant_id || null,
    role: role ? String(role).toUpperCase() : null,
    memberId: user?.activeMemberId || user?.member_id || user?.memberId || null,
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

  // Multi-Home: tra cứu user_member_links trước nếu có tenantId
  if (actor.tenantId) {
    const link = await basePrisma.user_member_links.findFirst({
      where: { user_id: actor.userId, tenant_id: actor.tenantId, deleted_at: null },
      select: { member_id: true, role_in_tenant: true },
    });
    if (link?.member_id) {
      if (!actor.role && link.role_in_tenant) actor.role = link.role_in_tenant;
      return link.member_id;
    }
  }

  // Fallback sang users qua basePrisma (ghi nhận cảnh báo tránh im lặng về họ gốc)
  console.warn(`⚠️ [resolveActorMemberId] Fallback về users gốc (không tìm thấy link trong tenant)`, {
    userId: actor.userId,
    tenantId: actor.tenantId,
  });

  const row = await basePrisma.users.findFirst({
    where: { id: actor.userId, deleted_at: null },
    select: { member_id: true, tenant_id: true, role: true },
  });
  if (row?.tenant_id && !actor.tenantId) actor.tenantId = row.tenant_id;
  if (row?.role && !actor.role) actor.role = row.role;
  return row?.member_id || null;
}

async function canEditProfile(reqUser, targetMemberId) {
  const actor = actorOf(reqUser);
  if (!actor.userId) {
    return { ok: false, code: 'UNAUTHORIZED', reason: 'Thiếu phiên.' };
  }

  if (!actor.role || !actor.tenantId || !actor.memberId) {
    if (actor.tenantId) {
      const link = await basePrisma.user_member_links.findFirst({
        where: { user_id: actor.userId, tenant_id: actor.tenantId, deleted_at: null },
        select: { role_in_tenant: true, member_id: true },
      });
      if (link) {
        actor.role = actor.role || link.role_in_tenant;
        actor.memberId = actor.memberId || link.member_id;
      }
    }
    if (!actor.role || !actor.tenantId) {
      console.warn(`⚠️ [canEditProfile] Cảnh báo: Thiếu role/tenantId từ claims và link, fallback về users gốc`, {
        userId: actor.userId,
        targetMemberId,
      });
      const u = await basePrisma.users.findFirst({
        where: { id: actor.userId, deleted_at: null },
        select: { role: true, tenant_id: true, member_id: true },
      });
      if (u) {
        actor.role = actor.role || u.role;
        actor.tenantId = actor.tenantId || u.tenant_id;
        actor.memberId = actor.memberId || u.member_id;
      }
    }
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

  // Hỗ trợ đầy đủ tập vai trò Admin trong dòng họ
  if (ADMIN_ROLES.has(actor.role) && actor.tenantId === member.tenant_id) {
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
