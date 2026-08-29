/**
 * PATH       : src/modules/profile/profile.service.js
 * DATETIME   : 2026-08-29T16:40:00+07:00
 * VERSION    : 1.2.0-A01-ADDR2
 * DESCRIPTION: Compose full_address. VN locality null. Search chỉ chỗ gắn member.
 *  A01-ADDR: Generate full_address từ phần. Cấm chỉ gửi chuỗi. Không inject tenant vào findUnique.
 *  A01 self-profile. Cấm users.phone/email. Cấm gender/is_alive/cây.
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

function normalizeCountry(raw) {
  const c = String(raw || 'VN').trim().toUpperCase();
  if (c === 'VIETNAM' || c === 'VIET NAM') return 'VN';
  return c.slice(0, 2) || 'VN';
}

function normalizeAddressKey(raw) {
  return String(raw || '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[.,;:/\\_|-]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
/** 
async function upsertAddress(tx, tenantId, actorId, payload) {
  if (!payload || typeof payload !== 'object') return null;

  if (payload.address_id) {
    const existing = await tx.addresses.findFirst({
      where: {
        id: String(payload.address_id),
        tenant_id: tenantId,
        deleted_at: null,
      },
      select: { id: true },
    });
    if (!existing) deny('FORBIDDEN', 'address_id không thuộc dòng họ này.', 403);
    return existing;
  }

  const full_address = String(payload.full_address || '').trim().slice(0, 500);
  if (!full_address) return null;
  const country_code = normalizeCountry(payload.country_code || payload.country);
  const key = normalizeAddressKey(full_address);

  const sameCountry = await tx.addresses.findMany({
    where: { tenant_id: tenantId, country_code, deleted_at: null },
    select: { id: true, full_address: true },
    take: 500,
  });
  const found = sameCountry.find(
    (row) => normalizeAddressKey(row.full_address) === key
  );
  if (found) return { id: found.id };

  return tx.addresses.create({
    data: {
      tenant_id: tenantId,
      country_code,
      postal_code: payload.postal_code
        ? String(payload.postal_code).slice(0, 20)
        : null,
      admin_area: payload.admin_area
        ? String(payload.admin_area).slice(0, 100)
        : payload.province_name
          ? String(payload.province_name).slice(0, 100)
          : null,
      locality: payload.locality
        ? String(payload.locality).slice(0, 100)
        : payload.district_name
          ? String(payload.district_name).slice(0, 100)
          : null,
      sub_locality: payload.sub_locality
        ? String(payload.sub_locality).slice(0, 100)
        : payload.ward_name
          ? String(payload.ward_name).slice(0, 100)
          : null,
      line1: payload.line1 ? String(payload.line1).slice(0, 255) : null,
      line2: payload.line2 ? String(payload.line2).slice(0, 255) : null,
      full_address,
      changed_by: actorId,
    },
    select: { id: true },
  });
}
**************** */

/**
 * PATH       : snippet profile.service.js — ADDR-2
 * DATETIME   : 2026-08-29T16:40:00+07:00
 * VERSION    : 1.2.0-A01-ADDR2
 * DESCRIPTION: Compose full_address. VN locality null. Search chỉ chỗ gắn member.
 */

function composeFullAddress(payload, country_code) {
  const parts = [
    payload.line1,
    payload.line2,
    payload.sub_locality,
    country_code === 'VN' ? null : payload.locality,
    payload.admin_area,
    payload.postal_code,
    country_code,
  ]
    .map((v) => String(v || '').trim())
    .filter(Boolean);
  return parts.join(', ').slice(0, 500);
}

function pickPart(payload, key, max) {
  if (payload[key] == null || payload[key] === '') return null;
  return String(payload[key]).trim().slice(0, max) || null;
}

async function upsertAddress(tx, tenantId, actorId, payload) {
  if (!payload || typeof payload !== 'object') return null;

  if (payload.address_id) {
    const existing = await tx.addresses.findFirst({
      where: { id: String(payload.address_id), tenant_id: tenantId, deleted_at: null },
      select: { id: true },
    });
    if (!existing) deny('FORBIDDEN', 'address_id không thuộc dòng họ này.', 403);
    if (!payload.update) return existing;

    const country_code = normalizeCountry(payload.country_code || payload.country);
    const isVn = country_code === 'VN';
    const admin_area = pickPart(payload, 'admin_area', 100);
    const locality = isVn ? null : pickPart(payload, 'locality', 100);
    const sub_locality = pickPart(payload, 'sub_locality', 100);
    const line1 = pickPart(payload, 'line1', 255);
    const line2 = pickPart(payload, 'line2', 255);
    const postal_code = pickPart(payload, 'postal_code', 20);
    const notes = pickPart(payload, 'notes', 255);
    const full_address = composeFullAddress(
      { line1, line2, sub_locality, locality, admin_area, postal_code },
      country_code
    );
    await tx.addresses.updateMany({
      where: { id: existing.id, tenant_id: tenantId, deleted_at: null },
      data: {
        country_code,
        admin_area,
        locality,
        sub_locality,
        line1,
        line2,
        postal_code,
        notes,
        full_address: full_address || undefined,
        changed_by: actorId,
        updated_at: new Date(),
      },
    });
    return existing;
  }

  const country_code = normalizeCountry(payload.country_code || payload.country);
  const isVn = country_code === 'VN';
  const admin_area = pickPart(payload, 'admin_area', 100);
  const locality = isVn ? null : pickPart(payload, 'locality', 100);
  const sub_locality = pickPart(payload, 'sub_locality', 100);
  const line1 = pickPart(payload, 'line1', 255);
  const line2 = pickPart(payload, 'line2', 255);
  const postal_code = pickPart(payload, 'postal_code', 20);
  const notes = pickPart(payload, 'notes', 255);

  const hasPart = Boolean(admin_area || locality || sub_locality || line1 || line2);
  if (!hasPart) {
    deny('BAD_REQUEST', 'Địa chỉ mới cần Country và ít nhất tỉnh / xã / số nhà. Không lưu chỉ full_address.', 400);
  }

  const full_address = composeFullAddress(
    { line1, line2, sub_locality, locality, admin_area, postal_code },
    country_code
  );
  if (!full_address) return null;

  const key = normalizeAddressKey(full_address);
  const sameCountry = await tx.addresses.findMany({
    where: { tenant_id: tenantId, country_code, deleted_at: null },
    select: { id: true, full_address: true },
    take: 80,
  });
  const found = sameCountry.find((row) => normalizeAddressKey(row.full_address) === key);
  if (found) return { id: found.id };

  return tx.addresses.create({
    data: {
      tenant_id: tenantId,
      country_code,
      postal_code,
      admin_area,
      locality,
      sub_locality,
      line1,
      line2,
      notes,
      full_address,
      changed_by: actorId,
    },
    select: { id: true },
  });
}

async function searchMyAddresses(reqUser, query = {}) {
  const { member } = await resolveMemberActor(reqUser);
  const q = String(query.q || '').trim();
  const country_code = query.country_code
    ? String(query.country_code).trim().toUpperCase().slice(0, 2)
    : null;
  const memberOnly = String(query.member_only || '1') !== '0';

  const where = {
    tenant_id: member.tenant_id,
    deleted_at: null,
  };
  if (country_code) where.country_code = country_code;
  if (memberOnly) {
    where.OR = [
      { natives: { some: { tenant_id: member.tenant_id, deleted_at: null } } },
      { residents: { some: { tenant_id: member.tenant_id, deleted_at: null } } },
    ];
  }
  if (q) {
    const textOr = [
      { full_address: { contains: q, mode: 'insensitive' } },
      { line1: { contains: q, mode: 'insensitive' } },
      { line2: { contains: q, mode: 'insensitive' } },
      { sub_locality: { contains: q, mode: 'insensitive' } },
      { admin_area: { contains: q, mode: 'insensitive' } },
      { notes: { contains: q, mode: 'insensitive' } },
    ];
    if (memberOnly) {
      where.AND = [{ OR: where.OR }, { OR: textOr }];
      delete where.OR;
    } else {
      where.OR = textOr;
    }
  }

  const items = await prisma.addresses.findMany({
    where,
    orderBy: { updated_at: 'desc' },
    take: Math.min(30, Math.max(5, parseInt(query.limit, 10) || 15)),
    select: {
      id: true,
      full_address: true,
      country_code: true,
      admin_area: true,
      locality: true,
      sub_locality: true,
      line1: true,
      line2: true,
      postal_code: true,
      notes: true,
    },
  });

  return { items, total: items.length };
}


function pickPart(payload, key, legacyKey, max) {
  const raw = payload[key] != null && payload[key] !== ''
    ? payload[key]
    : payload[legacyKey];
  if (raw == null || raw === '') return null;
  return String(raw).trim().slice(0, max) || null;
}

async function upsertAddress(tx, tenantId, actorId, payload) {
  if (!payload || typeof payload !== 'object') return null;

  if (payload.address_id) {
    const existing = await tx.addresses.findFirst({
      where: {
        id: String(payload.address_id),
        tenant_id: tenantId,
        deleted_at: null,
      },
      select: { id: true },
    });
    if (!existing) deny('FORBIDDEN', 'address_id không thuộc dòng họ này.', 403);
    return existing;
  }

  const country_code = normalizeCountry(payload.country_code || payload.country);
  const admin_area = pickPart(payload, 'admin_area', 'province_name', 100);
  const locality = pickPart(payload, 'locality', 'district_name', 100);
  const sub_locality = pickPart(payload, 'sub_locality', 'ward_name', 100);
  const line1 = pickPart(payload, 'line1', null, 255);
  const line2 = pickPart(payload, 'line2', null, 255);
  const postal_code = pickPart(payload, 'postal_code', null, 20);

  const hasPart = Boolean(admin_area || locality || sub_locality || line1 || line2);
  if (!hasPart) {
    deny(
      'BAD_REQUEST',
      'Địa chỉ mới cần Country và ít nhất một phần cấu trúc (tỉnh / huyện / xã / số nhà). Không lưu chỉ full_address.',
      400
    );
  }

  const full_address =
    composeFullAddress(
      { line1, line2, sub_locality, locality, admin_area, postal_code },
      country_code
    ) || String(payload.full_address || '').trim().slice(0, 500);

  if (!full_address) return null;

  const key = normalizeAddressKey(full_address);
  const sameCountry = await tx.addresses.findMany({
    where: { tenant_id: tenantId, country_code, deleted_at: null },
    select: { id: true, full_address: true },
    take: 500,
  });
  const found = sameCountry.find(
    (row) => normalizeAddressKey(row.full_address) === key
  );
  if (found) return { id: found.id };

  return tx.addresses.create({
    data: {
      tenant_id: tenantId,
      country_code,
      postal_code,
      admin_area,
      locality,
      sub_locality,
      line1,
      line2,
      full_address,
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

async function searchMyAddresses(reqUser, query = {}) {
  const { member } = await resolveMemberActor(reqUser);
  const q = String(query.q || '').trim();
  const country_code = query.country_code
    ? String(query.country_code).trim().toUpperCase().slice(0, 2)
    : null;

  const where = {
    tenant_id: member.tenant_id,
    deleted_at: null,
  };
  if (country_code) where.country_code = country_code;
  if (q) {
    where.OR = [
      { full_address: { contains: q, mode: 'insensitive' } },
      { line1: { contains: q, mode: 'insensitive' } },
      { sub_locality: { contains: q, mode: 'insensitive' } },
      { locality: { contains: q, mode: 'insensitive' } },
      { admin_area: { contains: q, mode: 'insensitive' } },
    ];
  }

  const items = await prisma.addresses.findMany({
    where,
    orderBy: { updated_at: 'desc' },
    take: Math.min(30, Math.max(5, parseInt(query.limit, 10) || 15)),
    select: {
      id: true,
      full_address: true,
      country_code: true,
      admin_area: true,
      locality: true,
      sub_locality: true,
      line1: true,
      postal_code: true,
    },
  });

  return { items, total: items.length };
}

module.exports = {
  resolveMemberActor,
  getMyProfile,
  patchMyProfile,
  searchMyAddresses,
};
