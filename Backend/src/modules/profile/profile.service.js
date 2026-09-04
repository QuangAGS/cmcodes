/**
 * PATH       : src/modules/profile/profile.service.js
 * DATETIME   : 2026-09-01T17:10:00+07:00
 * VERSION    : 1.4.0-BFA-222-AUDIT
 * DESCRIPTION: A01 audit_logs cùng TX + correlation với BPL. Unwrap body. A01_DEBUG.
 */

'use strict';
const { prisma, correlation } = require('../../lib/prisma.js');
const { writeBpl } = require('../../services/bpl.service.js');
const { logAction } = require('../../services/audit.service.js');
const { a01Log } = require('./a01Debug.js');

async function writeAudit(tx, {
  action, tableName, recordId, oldData, newData, actorId, tenantId, correlationId, reason,
}) {
  const row = await logAction(
    action,
    tableName,
    recordId,
    oldData,
    newData,
    actorId,
    reason,
    tenantId,
    correlationId,
    tx
  );
  if (!row) {
    deny('AUDIT_FAILED', `Không ghi được audit_logs (${tableName}).`, 500);
  }
  return row;
}

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
  'blood_group',
  'blood_note',
  'health_flags',
  'health_summary',
  'health_none',
  'congenital_flags',
  'congenital_summary',
  'congenital_none',
];

const BLOOD_GROUPS = new Set([
  'A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'AB_POS', 'AB_NEG', 'O_POS', 'O_NEG', 'UNKNOWN',
]);
const HEALTH_FLAG_SET = new Set([
  'CARDIO', 'DIABETES', 'CANCER', 'RESPIRATORY', 'NEURO', 'JOINT', 'ALLERGY', 'OTHER',
]);
const CONGENITAL_FLAG_SET = new Set([
  'HEART', 'CLEFT', 'HEARING_VISION', 'LIMB_SPINE', 'NEURO', 'SYNDROME', 'OTHER',
]);

function asFlagList(raw, allowed) {
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map((x) => String(x || '').trim().toUpperCase()).filter((x) => allowed.has(x));
}

function normalizeBioPatch(raw) {
  const out = { ...raw };
  if (out.blood_group !== undefined) {
    let g = String(out.blood_group || '').trim().toUpperCase();
    g = g.replace(/\+$/, '_POS').replace(/-$/, '_NEG');
    if (g === 'A+') g = 'A_POS';
    if (g === 'A-') g = 'A_NEG';
    if (!g) out.blood_group = null;
    else if (!BLOOD_GROUPS.has(g)) deny('BAD_REQUEST', 'Nhóm máu không hợp lệ.', 400);
    else out.blood_group = g;
  }
  if (out.blood_note !== undefined) {
    out.blood_note = String(out.blood_note || '').trim().slice(0, 255) || null;
  }
  if (out.health_flags !== undefined) out.health_flags = asFlagList(out.health_flags, HEALTH_FLAG_SET);
  if (out.health_summary !== undefined) {
    out.health_summary = String(out.health_summary || '').trim() || null;
  }
  if (out.health_none !== undefined) {
    out.health_none = !!out.health_none;
    if (out.health_none) {
      out.health_flags = [];
      out.health_summary = null;
    }
  }
  if (out.congenital_flags !== undefined) {
    out.congenital_flags = asFlagList(out.congenital_flags, CONGENITAL_FLAG_SET);
  }
  if (out.congenital_summary !== undefined) {
    out.congenital_summary = String(out.congenital_summary || '').trim() || null;
  }
  if (out.congenital_none !== undefined) {
    out.congenital_none = !!out.congenital_none;
    if (out.congenital_none) {
      out.congenital_flags = [];
      out.congenital_summary = null;
    }
  }
  return out;
}

const SOCIAL_KEYS = new Set(['zalo', 'facebook', 'website']);
const PRIVACY_GROUPS = new Set([
  'CONTACT',
  'BIRTH_DATE',
  'ADDRESS',
  'BIO',
  'ACHIEVEMENT',
  'HEALTH',
  'DOCS',
]);
const PRIVACY_VIS = new Set(['SELF', 'TENANT']);
const PRIVACY_DEFAULT = {
  CONTACT: 'TENANT',
  BIRTH_DATE: 'TENANT',
  ADDRESS: 'TENANT',
  BIO: 'TENANT',
  ACHIEVEMENT: 'TENANT',
  HEALTH: 'SELF',
  DOCS: 'SELF',
};

function mergePrivacyRules(rows) {
  const map = { ...PRIVACY_DEFAULT };
  for (const r of rows || []) {
    if (r && PRIVACY_GROUPS.has(r.field_group) && PRIVACY_VIS.has(r.visibility)) {
      map[r.field_group] = r.visibility;
    }
  }
  return Object.keys(PRIVACY_DEFAULT).map((field_group) => ({
    field_group,
    visibility: map[field_group],
  }));
}

function deny(code, message, statusCode = 403) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  err.isOperational = true;
  throw err;
}

function unwrapBody(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  let src = raw;
  if (src.data && typeof src.data === 'object' && !Array.isArray(src.data) && src.full_name === undefined) {
    src = {
      ...src.data,
      origin_address: raw.origin_address || src.data.origin_address,
      current_address: raw.current_address || src.data.current_address,
      privacy: raw.privacy || src.data.privacy,
      biography: raw.biography || src.data.biography,
    };
  }
  if (src.member && typeof src.member === 'object' && src.full_name === undefined) {
    return {
      ...src.member,
      biography: src.biography || src.member.biography,
      origin_address: src.origin_address,
      current_address: src.current_address,
      privacy: src.privacy,
    };
  }
  return src;
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

function pickAddrPart(payload, key, max) {
  if (payload[key] == null || payload[key] === '') return null;
  return String(payload[key]).trim().slice(0, max) || null;
}

function composeAddressFields(payload) {
  const country_code = normalizeCountry(payload.country_code || payload.country);
  const isVn = country_code === 'VN';
  const admin_area = pickAddrPart(payload, 'admin_area', 100) || pickAddrPart(payload, 'province_name', 100);
  const locality = isVn ? null : (pickAddrPart(payload, 'locality', 100) || pickAddrPart(payload, 'district_name', 100));
  const sub_locality = pickAddrPart(payload, 'sub_locality', 100) || pickAddrPart(payload, 'ward_name', 100);
  const line1 = pickAddrPart(payload, 'line1', 255);
  const line2 = pickAddrPart(payload, 'line2', 255);
  const postal_code = pickAddrPart(payload, 'postal_code', 20);
  const notes = pickAddrPart(payload, 'notes', 255);
  const composed = [line1, line2, sub_locality, locality, admin_area, postal_code, country_code]
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .join(', ')
    .slice(0, 500);
  const full_address = composed || String(payload.full_address || '').trim().slice(0, 500);
  return { country_code, admin_area, locality, sub_locality, line1, line2, postal_code, notes, full_address };
}

async function upsertAddress(tx, tenantId, actorId, payload) {
  if (!payload || typeof payload !== 'object') return null;
  const fields = composeAddressFields(payload);

  if (payload.address_id) {
    const existing = await tx.addresses.findFirst({
      where: { id: String(payload.address_id), tenant_id: tenantId, deleted_at: null },
      select: { id: true },
    });
    if (!existing) deny('FORBIDDEN', 'address_id không thuộc dòng họ này.', 403);

    await tx.addresses.updateMany({
      where: { id: existing.id, tenant_id: tenantId, deleted_at: null },
      data: {
        country_code: fields.country_code,
        admin_area: fields.admin_area,
        locality: fields.locality,
        sub_locality: fields.sub_locality,
        line1: fields.line1,
        line2: fields.line2,
        postal_code: fields.postal_code,
        notes: fields.notes,
        full_address: fields.full_address || undefined,
        changed_by: actorId,
        updated_at: new Date(),
      },
    });
    return existing;
  }

  if (!fields.full_address) return null;

  const key = normalizeAddressKey(fields.full_address);
  const sameCountry = await tx.addresses.findMany({
    where: { tenant_id: tenantId, country_code: fields.country_code, deleted_at: null },
    select: { id: true, full_address: true },
    take: 80,
  });
  const found = sameCountry.find((row) => normalizeAddressKey(row.full_address) === key);
  if (found) {
    await tx.addresses.updateMany({
      where: { id: found.id, tenant_id: tenantId, deleted_at: null },
      data: {
        notes: fields.notes,
        postal_code: fields.postal_code,
        line1: fields.line1,
        line2: fields.line2,
        changed_by: actorId,
        updated_at: new Date(),
      },
    });
    return { id: found.id };
  }

  return tx.addresses.create({
    data: {
      tenant_id: tenantId,
      country_code: fields.country_code,
      postal_code: fields.postal_code,
      admin_area: fields.admin_area,
      locality: fields.locality,
      sub_locality: fields.sub_locality,
      line1: fields.line1,
      line2: fields.line2,
      notes: fields.notes,
      full_address: fields.full_address,
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

  const privacyRows = await prisma.member_privacy_rules.findMany({
    where: { member_id: member.id, tenant_id: member.tenant_id, deleted_at: null },
    select: { field_group: true, visibility: true },
  });
  const privacy = mergePrivacyRules(privacyRows);

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
      generation: row.generation,
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

async function patchMyProfile(reqUser, rawBody = {}) {
  const { user, member } = await resolveMemberActor(reqUser);
  const actorId = user.id;
  const tenantId = member.tenant_id;
  const body = unwrapBody(rawBody);

  a01Log('incoming', {
    rawKeys: rawBody && typeof rawBody === 'object' ? Object.keys(rawBody) : [],
    bodyKeys: Object.keys(body),
  });

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

  const bioPatch = normalizeBioPatch(pick(body.biography || body, BIO_PATCH));
  a01Log('pick', { memberPatch, bioPatch });

  const hasAddr = !!(body.origin_address || body.current_address);
  const hasPrivacy = Array.isArray(body.privacy) && body.privacy.length > 0;
  if (!Object.keys(memberPatch).length && !Object.keys(bioPatch).length && !hasAddr && !hasPrivacy) {
    deny('EMPTY_PATCH', 'Không nhận được trường hồ sơ. Kiểm tra Request Payload (Network).', 400);
  }

  return prisma.$transaction(async (tx) => {
    const correlationId = correlation.create();
    const actorCtx = {
      actor_id: actorId,
      actor_type: 'USER',
      tenant_id: tenantId,
      correlation_id: correlationId,
    };
    let attempt = 1;

    const oldMember = await tx.members.findFirst({
      where: { id: member.id, tenant_id: tenantId, deleted_at: null },
    });
    const oldBio = await tx.biographies.findFirst({
      where: { member_id: member.id, tenant_id: tenantId, deleted_at: null },
    });

    if (Object.keys(memberPatch).length) {
      const upd = await tx.members.updateMany({
        where: { id: member.id, tenant_id: tenantId, deleted_at: null },
        data: { ...memberPatch, changed_by: actorId, updated_at: new Date() },
      });
      if (upd.count !== 1) deny('MEMBER_NOT_FOUND', 'Không cập nhật được hồ sơ.', 404);
      await writeAudit(tx, {
        action: 'CAP_NHAT',
        tableName: 'members',
        recordId: member.id,
        oldData: oldMember,
        newData: { ...(oldMember || {}), ...memberPatch },
        actorId,
        tenantId,
        correlationId,
        reason: 'A01 PATCH /me/profile',
      });
    }

    if (Object.keys(bioPatch).length) {
      const existing = oldBio;
      if (existing) {
        await tx.biographies.updateMany({
          where: { id: existing.id, tenant_id: tenantId, deleted_at: null },
          data: { ...bioPatch, changed_by: actorId, updated_at: new Date() },
        });
        await writeAudit(tx, {
          action: 'CAP_NHAT',
          tableName: 'biographies',
          recordId: existing.id,
          oldData: existing,
          newData: { ...existing, ...bioPatch },
          actorId,
          tenantId,
          correlationId,
          reason: 'A01 PATCH /me/profile biography',
        });
      } else {
        const created = await tx.biographies.create({
          data: {
            member_id: member.id,
            tenant_id: tenantId,
            changed_by: actorId,
            ...bioPatch,
          },
        });
        await writeAudit(tx, {
          action: 'THEM_MOI',
          tableName: 'biographies',
          recordId: created.id,
          oldData: null,
          newData: created,
          actorId,
          tenantId,
          correlationId,
          reason: 'A01 PATCH /me/profile biography',
        });
      }
    }

    let originAddrId = null;
    let currentAddrId = null;

    if (body.origin_address) {
      const addr = await upsertAddress(tx, tenantId, actorId, body.origin_address);
      if (addr) {
        originAddrId = addr.id;
        await tx.members.updateMany({
          where: { id: member.id, tenant_id: tenantId, deleted_at: null },
          data: { origin_address_id: addr.id, changed_by: actorId },
        });
        await writeAudit(tx, {
          action: 'CAP_NHAT',
          tableName: 'members',
          recordId: member.id,
          oldData: { origin_address_id: oldMember && oldMember.origin_address_id },
          newData: { origin_address_id: addr.id },
          actorId,
          tenantId,
          correlationId,
          reason: 'A01 link origin address',
        });
      }
    }
    if (body.current_address) {
      const addr = await upsertAddress(tx, tenantId, actorId, body.current_address);
      if (addr) {
        currentAddrId = addr.id;
        await tx.members.updateMany({
          where: { id: member.id, tenant_id: tenantId, deleted_at: null },
          data: { current_address_id: addr.id, changed_by: actorId },
        });
        await writeAudit(tx, {
          action: 'CAP_NHAT',
          tableName: 'members',
          recordId: member.id,
          oldData: { current_address_id: oldMember && oldMember.current_address_id },
          newData: { current_address_id: addr.id },
          actorId,
          tenantId,
          correlationId,
          reason: 'A01 link current address',
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
          await writeAudit(tx, {
            action: 'CAP_NHAT',
            tableName: 'member_privacy_rules',
            recordId: found.id,
            oldData: found,
            newData: { ...found, visibility: rule.visibility },
            actorId,
            tenantId,
            correlationId,
            reason: 'A01 PATCH privacy',
          });
        } else {
          const created = await tx.member_privacy_rules.create({
            data: {
              tenant_id: tenantId,
              member_id: member.id,
              field_group: rule.field_group,
              visibility: rule.visibility,
              changed_by: actorId,
            },
          });
          await writeAudit(tx, {
            action: 'THEM_MOI',
            tableName: 'member_privacy_rules',
            recordId: created.id,
            oldData: null,
            newData: created,
            actorId,
            tenantId,
            correlationId,
            reason: 'A01 PATCH privacy',
          });
        }
      }
    }

    if (Object.keys(memberPatch).length || Object.keys(bioPatch).length) {
      a01Log('writeBpl.MEMBER_PROFILE_PATCH', {
        correlationId,
        payload: { member_id: member.id, member: memberPatch, biography: bioPatch },
      });
      await writeBpl({
        processType: 'MEMBER_PROFILE_PATCH',
        actorContext: actorCtx,
        attemptNo: attempt++,
        context: { target_id: member.id, target_name: memberPatch.full_name || null },
        payload: {
          member_id: member.id,
          action: 'PATCH',
          fields: Object.keys(memberPatch).concat(Object.keys(bioPatch)),
          member: memberPatch,
          biography: bioPatch,
        },
        tx,
      });
    }

    if (originAddrId) {
      await writeBpl({
        processType: 'MEMBER_ADDRESS_LINK',
        actorContext: actorCtx,
        attemptNo: attempt++,
        context: { target_id: member.id, target_name: null },
        payload: { member_id: member.id, usage: 'ORIGIN', address_id: originAddrId },
        tx,
      });
    }
    if (currentAddrId) {
      await writeBpl({
        processType: 'MEMBER_ADDRESS_LINK',
        actorContext: actorCtx,
        attemptNo: attempt++,
        context: { target_id: member.id, target_name: null },
        payload: { member_id: member.id, usage: 'CURRENT', address_id: currentAddrId },
        tx,
      });
    }

    return true;
  }).then(() => getMyProfile(reqUser));
}

async function searchMyAddresses(reqUser, query = {}) {
  const { member } = await resolveMemberActor(reqUser);
  const q = String(query.q || '').trim();
  const id = query.id ? String(query.id).trim() : '';
  const country_code = query.country_code
    ? String(query.country_code).trim().toUpperCase().slice(0, 2)
    : null;

  const where = {
    tenant_id: member.tenant_id,
    deleted_at: null,
  };
  if (id) where.id = id;
  if (country_code && !id) where.country_code = country_code;
  if (q) {
    where.OR = [
      { full_address: { contains: q, mode: 'insensitive' } },
      { line1: { contains: q, mode: 'insensitive' } },
      { line2: { contains: q, mode: 'insensitive' } },
      { sub_locality: { contains: q, mode: 'insensitive' } },
      { locality: { contains: q, mode: 'insensitive' } },
      { admin_area: { contains: q, mode: 'insensitive' } },
      { notes: { contains: q, mode: 'insensitive' } },
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
      line2: true,
      postal_code: true,
      notes: true,
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
