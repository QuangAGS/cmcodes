/**
 * PATH       : src/modules/profile/profile.service.js
 * DATETIME   : 2026-08-27T22:20:00+07:00
 * VERSION    : 1.0.0-A01
 * DESCRIPTION: A01 self-profile. Cấm users.phone/email. Cấm gender/is_alive/cây.
 */

'use strict';

const { prisma } = require('../../lib/prisma.js');

const MEMBER_PATCH = [
  'full_name',
  'alias',
  'note',
  'birth_year',
  'birth_month',
  'birth_day',
  'is_birth_lunar',
  'birth_note',
  'phone_number',
  'email',
  'social_profiles',
];

const BIO_PATCH = [
  'childhood_summary',
  'education_history',
  'career_history',
  'later_life_summary',
  'personality_traits',
  'notable_quotes',
];

const SOCIAL_KEYS = new Set(['zalo', 'facebook', 'website']);
const PRIVACY_GROUPS = new Set(['CONTACT', 'ACHIEVEMENT', 'BIRTH_DATE']);
const PRIVACY_VIS = new Set(['SELF', 'TENANT']);

function deny(code, message, statusCode = 403) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  err.isOperational = true;
  throw err;
}

async function resolveMemberActor(reqUser) {
  const userId = reqUser?.userId || reqUser?.id;
  if (!userId) deny('UNAUTHORIZED', 'Thiếu phiên đăng nhập.', 401);

  const user = await prisma.users.findFirst({
    where: { id: userId, deleted_at: null },
    select: {
      id: true,
      role: true,
      status: true,
      tenant_id: true,
      member_id: true,
    },
  });
  if (!user) deny('UNAUTHORIZED', 'Không tìm thấy tài khoản.', 401);
  if (user.status !== 'DA_DUYET') {
    deny('FORBIDDEN', 'Tài khoản chưa được duyệt.', 403);
  }
  if (!user.member_id || !user.tenant_id) {
    deny('NOT_MEMBER_ACTOR', 'Tài khoản chưa gắn thành viên dòng họ.', 403);
  }

  const member = await prisma.members.findFirst({
    where: { id: user.member_id, tenant_id: user.tenant_id, deleted_at: null },
    select: { id: true, tenant_id: true, status: true },
  });
  if (!member || member.status !== 'CHINH_THUC') {
    deny('NOT_MEMBER_ACTOR', 'Thành viên chưa chính thức.', 403);
  }

  const tenant = await prisma.tenants.findFirst({
    where: { id: user.tenant_id, deleted_at: null },
    select: { id: true, status: true },
  });
  if (!tenant || tenant.status !== 'HOAT_DONG') {
    deny('TENANT_INACTIVE', 'Dòng họ chưa hoạt động.', 403);
  }

  return { user, member, tenant };
}

function pick(src, keys) {
  const out = {};
  if (!src || typeof src !== 'object') return out;
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(src, k)) out[k] = src[k];
  }
  return out;
}

function normalizeSocial(input) {
  if (input == null) return undefined;
  if (typeof input !== 'object' || Array.isArray(input)) {
    deny('BAD_REQUEST', 'social_profiles không hợp lệ.', 400);
  }
  const out = {};
  for (const [k, v] of Object.entries(input)) {
    if (!SOCIAL_KEYS.has(k)) continue;
    out[k] = v == null ? null : String(v).trim().slice(0, 255) || null;
  }
  return out;
}

async function upsertAddress(tx, tenantId, actorId, payload) {
  if (!payload || typeof payload !== 'object') return null;
  const full_address = String(payload.full_address || '').trim();
  if (!full_address) return null;
  return tx.addresses.create({
    data: {
      tenant_id: tenantId,
      full_address: full_address.slice(0, 255),
      ward_name: payload.ward_name ? String(payload.ward_name).slice(0, 100) : null,
      district_name: payload.district_name
        ? String(payload.district_name).slice(0, 100)
        : null,
      province_name: payload.province_name
        ? String(payload.province_name).slice(0, 100)
        : null,
      changed_by: actorId,
    },
    select: { id: true },
  });
}

async function getMyProfile(reqUser) {
  const { user, member } = await resolveMemberActor(reqUser);

  const row = await prisma.members.findFirst({
    where: { id: member.id, tenant_id: member.tenant_id, deleted_at: null },
    include: {
      currentAddress: true,
      originAddress: true,
    },
  });

  const biography = await prisma.biographies.findFirst({
    where: { member_id: member.id, tenant_id: member.tenant_id, deleted_at: null },
    orderBy: { updated_at: 'desc' },
  });

  const privacy = await prisma.member_privacy_rules.findMany({
    where: { member_id: member.id, tenant_id: member.tenant_id, deleted_at: null },
    select: { field_group: true, visibility: true },
  });

  return {
    member: {
      id: row.id,
      full_name: row.full_name,
      alias: row.alias,
      gender: row.gender,
      note: row.note,
      birth_year: row.birth_year,
      birth_month: row.birth_month,
      birth_day: row.birth_day,
      is_birth_lunar: row.is_birth_lunar,
      birth_note: row.birth_note,
      phone_number: row.phone_number,
      email: row.email,
      social_profiles: row.social_profiles || {},
      is_alive: row.is_alive,
    },
    biography: biography || null,
    origin_address: row.originAddress || null,
    current_address: row.currentAddress || null,
    privacy,
    login_contact_hint:
      !row.phone_number
        ? 'Thêm số liên lạc vào hồ sơ dòng họ (không dùng số đăng nhập trừ khi bạn chọn).'
        : null,
    actor: { user_id: user.id, member_id: member.id },
  };
}

async function patchMyProfile(reqUser, body = {}) {
  const { user, member } = await resolveMemberActor(reqUser);
  const actorId = user.id;
  const tenantId = member.tenant_id;

  if (body.gender !== undefined) {
    deny('FIELD_LOCKED', 'Giới tính không tự sửa sau OP. Dùng đề xuất (G01).', 400);
  }
  if (body.is_alive !== undefined || body.death_year !== undefined) {
    deny('FIELD_LOCKED', 'Tình trạng sống không thuộc A01.', 400);
  }
  if (body.users || body.user_phone || body.user_email) {
    deny('FIELD_LOCKED', 'Không sửa số/email đăng nhập qua hồ sơ dòng họ.', 400);
  }

  const memberPatch = pick(body, MEMBER_PATCH);
  if (memberPatch.social_profiles !== undefined) {
    memberPatch.social_profiles = normalizeSocial(memberPatch.social_profiles);
  }
  for (const k of ['birth_year', 'birth_month', 'birth_day']) {
    if (memberPatch[k] === '' || memberPatch[k] === undefined) continue;
    if (memberPatch[k] == null) {
      memberPatch[k] = null;
    } else {
      const n = Number(memberPatch[k]);
      memberPatch[k] = Number.isFinite(n) ? n : null;
    }
  }
  if (typeof memberPatch.phone_number === 'string') {
    memberPatch.phone_number = memberPatch.phone_number.trim().slice(0, 20) || null;
  }
  if (typeof memberPatch.email === 'string') {
    memberPatch.email = memberPatch.email.trim().slice(0, 100) || null;
  }

  const bioPatch = pick(body.biography || body, BIO_PATCH);

  return prisma.$transaction(async (tx) => {
    if (Object.keys(memberPatch).length) {
      const upd = await tx.members.updateMany({
        where: { id: member.id, tenant_id: tenantId, deleted_at: null },
        data: { ...memberPatch, changed_by: actorId, updated_at: new Date() },
      });
      if (upd.count !== 1) deny('MEMBER_NOT_FOUND', 'Không cập nhật được hồ sơ.', 404);
    }

    if (Object.keys(bioPatch).length) {
      const existing = await tx.biographies.findFirst({
        where: { member_id: member.id, tenant_id: tenantId, deleted_at: null },
        select: { id: true },
      });
      if (existing) {
        await tx.biographies.updateMany({
          where: { id: existing.id, tenant_id: tenantId, deleted_at: null },
          data: { ...bioPatch, changed_by: actorId, updated_at: new Date() },
        });
      } else {
        await tx.biographies.create({
          data: {
            member_id: member.id,
            tenant_id: tenantId,
            changed_by: actorId,
            ...bioPatch,
          },
        });
      }
    }

    if (body.origin_address) {
      const addr = await upsertAddress(tx, tenantId, actorId, body.origin_address);
      if (addr) {
        await tx.members.updateMany({
          where: { id: member.id, tenant_id: tenantId, deleted_at: null },
          data: { origin_address_id: addr.id, changed_by: actorId },
        });
      }
    }
    if (body.current_address) {
      const addr = await upsertAddress(tx, tenantId, actorId, body.current_address);
      if (addr) {
        await tx.members.updateMany({
          where: { id: member.id, tenant_id: tenantId, deleted_at: null },
          data: { current_address_id: addr.id, changed_by: actorId },
        });
      }
    }

    if (Array.isArray(body.privacy)) {
      for (const rule of body.privacy) {
        if (!PRIVACY_GROUPS.has(rule.field_group) || !PRIVACY_VIS.has(rule.visibility)) {
          deny('BAD_REQUEST', 'privacy rule không hợp lệ.', 400);
        }
        const found = await tx.member_privacy_rules.findFirst({
          where: {
            member_id: member.id,
            field_group: rule.field_group,
            deleted_at: null,
          },
        });
        if (found) {
          await tx.member_privacy_rules.updateMany({
            where: {
              id: found.id,
              tenant_id: tenantId,
              deleted_at: null,
            },
            data: {
              visibility: rule.visibility,
              changed_by: actorId,
              updated_at: new Date(),
            },
          });
        } else {
          await tx.member_privacy_rules.create({
            data: {
              tenant_id: tenantId,
              member_id: member.id,
              field_group: rule.field_group,
              visibility: rule.visibility,
              changed_by: actorId,
            },
          });
        }
      }
    }

    return true;
  }).then(() => getMyProfile(reqUser));
}

module.exports = {
  resolveMemberActor,
  getMyProfile,
  patchMyProfile,
};
