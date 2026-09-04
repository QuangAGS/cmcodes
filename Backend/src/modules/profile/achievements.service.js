/**
 * PATH       : src/modules/profile/achievements.service.js
 * DATETIME   : 2026-09-03T14:25:00+07:00
 * VERSION    : 1.2.1-A01-PROOF-ALS
 * DESCRIPTION: Thành tích + proof CERTIFICATE. ALS trước resolveMemberActor.
 */

'use strict';

const { prisma, correlation, runWithTenantContext } = require('../../lib/prisma.js');
const { writeBpl } = require('../../services/bpl.service.js');
const { logAction } = require('../../services/audit.service.js');
const { isValidCategory, isValidSub } = require('./achievementCatalog.js');
const { resolveMemberActor } = require('./profile.service.js');
const mediaService = require('../interactions/media.service.js');

const MAX_PROOFS = 5;
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
]);

function deny(code, message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  err.isOperational = true;
  throw err;
}

function pickTenant(reqUser) {
  return reqUser?.tenantId || reqUser?.tenant_id || null;
}

function withAls(reqUser, fn) {
  const tenantId = pickTenant(reqUser);
  if (!tenantId) deny('S0_TENANT', 'Thiếu tenant trên phiên đăng nhập.', 401);
  return runWithTenantContext(
    { tenantId, userId: reqUser.id || reqUser.userId || null },
    fn
  );
}

function toInt(v, name, { required = false, min = 1, max = 31 } = {}) {
  if (v === '' || v == null) {
    if (required) deny('BAD_REQUEST', `${name} bắt buộc.`, 400);
    return null;
  }
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) deny('BAD_REQUEST', `${name} không hợp lệ.`, 400);
  return n;
}

function parseBody(body = {}, { partial = false } = {}) {
  const out = {};
  if (!partial || body.category !== undefined) {
    const category = String(body.category || '').trim();
    if (!isValidCategory(category)) deny('BAD_REQUEST', 'category không hợp lệ.', 400);
    out.category = category;
  }
  if (!partial || body.sub_category !== undefined) {
    const sub = body.sub_category == null || body.sub_category === '' ? null : String(body.sub_category).trim();
    const cat = out.category || body.category;
    if (cat && !isValidSub(cat, sub)) deny('BAD_REQUEST', 'sub_category không thuộc category.', 400);
    out.sub_category = sub;
  }
  if (!partial || body.title !== undefined) {
    const title = String(body.title || '').trim().slice(0, 255);
    if (!title) deny('BAD_REQUEST', 'title bắt buộc.', 400);
    out.title = title;
  }
  if (!partial || body.issued_by !== undefined) {
    out.issued_by = body.issued_by == null || body.issued_by === ''
      ? null
      : String(body.issued_by).trim().slice(0, 255);
  }
  if (!partial || body.achieved_year !== undefined) {
    out.achieved_year = toInt(body.achieved_year, 'achieved_year', { required: !partial, min: 1000, max: 2100 });
  }
  if (!partial || body.achieved_month !== undefined) {
    out.achieved_month = toInt(body.achieved_month, 'achieved_month', { min: 1, max: 12 });
  }
  if (!partial || body.achieved_day !== undefined) {
    out.achieved_day = toInt(body.achieved_day, 'achieved_day', { min: 1, max: 31 });
  }
  if (!partial || body.is_lunar !== undefined) {
    out.is_lunar = !!body.is_lunar;
  }
  if (!partial || body.ended_year !== undefined) {
    out.ended_year = toInt(body.ended_year, 'ended_year', { min: 1000, max: 2100 });
  }
  if (!partial || body.ended_month !== undefined) {
    out.ended_month = toInt(body.ended_month, 'ended_month', { min: 1, max: 12 });
  }
  if (!partial || body.ended_day !== undefined) {
    out.ended_day = toInt(body.ended_day, 'ended_day', { min: 1, max: 31 });
  }
  if (!partial || body.is_current !== undefined) {
    out.is_current = !!body.is_current;
  }
  if (!partial || body.description !== undefined) {
    out.description = body.description == null || body.description === ''
      ? null
      : String(body.description).trim();
  }
  if (!partial || body.sort_order !== undefined) {
    out.sort_order = body.sort_order == null || body.sort_order === '' ? 0 : Number(body.sort_order) || 0;
  }
  return out;
}

const SELECT = {
  id: true,
  category: true,
  sub_category: true,
  title: true,
  issued_by: true,
  achieved_year: true,
  achieved_month: true,
  achieved_day: true,
  is_lunar: true,
  ended_year: true,
  ended_month: true,
  ended_day: true,
  is_current: true,
  description: true,
  sort_order: true,
  created_at: true,
  updated_at: true,
};

function actorCtx(user, member, correlationId) {
  return {
    actor_id: user.id,
    actor_type: 'USER',
    tenant_id: member.tenant_id,
    correlation_id: correlationId,
  };
}

function mediaActor(user, member) {
  return {
    ...user,
    id: user.id,
    userId: user.id,
    tenantId: member.tenant_id,
    tenant_id: member.tenant_id,
  };
}

function mapProof(row) {
  if (!row) return null;
  return {
    id: row.id,
    file_name: row.file_name || null,
    mime_type: row.mime_type || null,
    file_ext: row.file_ext || null,
    file_size: row.file_size || null,
    url: row.read_url || row.file_url || null,
    caption: row.caption || null,
  };
}

async function loadProofs(actor, achievementId) {
  try {
    const rows = await mediaService.getByEntity('ACHIEVEMENT', achievementId, actor, {
      purpose: 'CERTIFICATE',
      tenant_id: actor.tenantId,
    });
    return (rows || []).map((row) => mapProof(row)).filter(Boolean);
  } catch (_) {
    return [];
  }
}

async function writeAudit(tx, args) {
  const row = await logAction(
    args.action,
    args.tableName,
    args.recordId,
    args.oldData,
    args.newData,
    args.actorId,
    args.reason,
    args.tenantId,
    args.correlationId,
    tx
  );
  if (!row) {
    deny('AUDIT_FAILED', `Không ghi được audit_logs (${args.tableName}).`, 500);
  }
}

async function listMine(reqUser) {
  return withAls(reqUser, async () => {
    const { user, member } = await resolveMemberActor(reqUser);
    const items = await prisma.achievements.findMany({
      where: { member_id: member.id, tenant_id: member.tenant_id, deleted_at: null },
      orderBy: [{ achieved_year: 'desc' }, { sort_order: 'asc' }, { created_at: 'desc' }],
      select: SELECT,
    });
    const actor = mediaActor(user, member);
    const out = [];
    for (const row of items) {
      out.push({ ...row, proofs: await loadProofs(actor, row.id) });
    }
    return { items: out };
  });
}

async function createMine(reqUser, body) {
  return withAls(reqUser, async () => {
    const { user, member } = await resolveMemberActor(reqUser);
    const data = parseBody(body, { partial: false });
    return prisma.$transaction(async (tx) => {
      const correlationId = correlation.create();
      const row = await tx.achievements.create({
        data: {
          ...data,
          tenant_id: member.tenant_id,
          member_id: member.id,
          changed_by: user.id,
        },
        select: SELECT,
      });
      await writeAudit(tx, {
        action: 'THEM_MOI',
        tableName: 'achievements',
        recordId: row.id,
        oldData: null,
        newData: row,
        actorId: user.id,
        tenantId: member.tenant_id,
        correlationId,
        reason: 'A01 POST /me/achievements',
      });
      await writeBpl({
        processType: 'ACHIEVEMENT_UPSERT',
        actorContext: actorCtx(user, member, correlationId),
        context: { target_id: member.id, target_name: row.title },
        payload: {
          member_id: member.id,
          achievement_id: row.id,
          op: 'CREATE',
          category: row.category,
          sub_category: row.sub_category,
          title: row.title,
          achieved_year: row.achieved_year,
        },
        tx,
      });
      return { item: { ...row, proofs: [] } };
    });
  });
}

async function updateMine(reqUser, id, body) {
  return withAls(reqUser, async () => {
    const { user, member } = await resolveMemberActor(reqUser);
    const existing = await prisma.achievements.findFirst({
      where: { id: String(id), member_id: member.id, tenant_id: member.tenant_id, deleted_at: null },
      select: { id: true, category: true },
    });
    if (!existing) deny('NOT_FOUND', 'Không tìm thấy thành tích.', 404);
    const patch = parseBody({ category: existing.category, ...body }, { partial: true });
    return prisma.$transaction(async (tx) => {
      const correlationId = correlation.create();
      const upd = await tx.achievements.updateMany({
        where: { id: existing.id, tenant_id: member.tenant_id, deleted_at: null },
        data: { ...patch, changed_by: user.id, updated_at: new Date() },
      });
      if (upd.count !== 1) deny('NOT_FOUND', 'Không cập nhật được thành tích.', 404);
      const item = await tx.achievements.findFirst({
        where: { id: existing.id, tenant_id: member.tenant_id, deleted_at: null },
        select: SELECT,
      });
      await writeAudit(tx, {
        action: 'CAP_NHAT',
        tableName: 'achievements',
        recordId: existing.id,
        oldData: existing,
        newData: item,
        actorId: user.id,
        tenantId: member.tenant_id,
        correlationId,
        reason: 'A01 PATCH /me/achievements',
      });
      await writeBpl({
        processType: 'ACHIEVEMENT_UPSERT',
        actorContext: actorCtx(user, member, correlationId),
        context: { target_id: member.id, target_name: item && item.title },
        payload: {
          member_id: member.id,
          achievement_id: existing.id,
          op: 'UPDATE',
          category: item && item.category,
          sub_category: item && item.sub_category,
          title: item && item.title,
          achieved_year: item && item.achieved_year,
        },
        tx,
      });
      return { item: { ...item, proofs: await loadProofs(mediaActor(user, member), existing.id) } };
    });
  });
}

async function removeMine(reqUser, id) {
  return withAls(reqUser, async () => {
    const { user, member } = await resolveMemberActor(reqUser);
    const existing = await prisma.achievements.findFirst({
      where: { id: String(id), member_id: member.id, tenant_id: member.tenant_id, deleted_at: null },
      select: { id: true },
    });
    if (!existing) deny('NOT_FOUND', 'Không tìm thấy thành tích.', 404);
    const actor = mediaActor(user, member);
    const proofs = await loadProofs(actor, existing.id);
    await prisma.$transaction(async (tx) => {
      const correlationId = correlation.create();
      await tx.achievements.updateMany({
        where: { id: existing.id, tenant_id: member.tenant_id, deleted_at: null },
        data: { deleted_at: new Date(), changed_by: user.id, updated_at: new Date() },
      });
      await writeAudit(tx, {
        action: 'XOA',
        tableName: 'achievements',
        recordId: existing.id,
        oldData: existing,
        newData: { id: existing.id, deleted_at: true },
        actorId: user.id,
        tenantId: member.tenant_id,
        correlationId,
        reason: 'A01 DELETE /me/achievements',
      });
      await writeBpl({
        processType: 'ACHIEVEMENT_DELETE',
        actorContext: actorCtx(user, member, correlationId),
        context: { target_id: member.id, target_name: null },
        payload: { member_id: member.id, achievement_id: existing.id },
        tx,
      });
    });
    for (const p of proofs) {
      try {
        await mediaService.deleteMedia(p.id, actor, 'A01 xóa thành tích — dọn proof');
      } catch (_) {
        /* ignore */
      }
    }
    return { ok: true };
  });
}

async function addProof(reqUser, achievementId, file, body = {}) {
  return withAls(reqUser, async () => {
    const { user, member } = await resolveMemberActor(reqUser);
    if (!file || !file.buffer) deny('MEDIA_NO_FILE', 'Chưa chọn file.', 400);
    const mime = String(file.mimetype || '').toLowerCase();
    if (!ALLOWED.has(mime)) {
      deny('MEDIA_TYPE', 'Minh chứng thành tích chỉ nhận ảnh hoặc PDF.', 400);
    }
    if (file.size > MAX_BYTES || file.buffer.length > MAX_BYTES) {
      deny('MEDIA_TOO_LARGE', 'File không quá 5MB.', 400);
    }
    const caption = String(body.caption || '').trim().slice(0, 255);
    if (!caption) deny('BAD_REQUEST', 'Cần mô tả ngắn cho minh chứng.', 400);

    const row = await prisma.achievements.findFirst({
      where: {
        id: String(achievementId),
        member_id: member.id,
        tenant_id: member.tenant_id,
        deleted_at: null,
      },
      select: { id: true, title: true },
    });
    if (!row) deny('NOT_FOUND', 'Không tìm thấy thành tích.', 404);

    const actor = mediaActor(user, member);
    const existing = await loadProofs(actor, row.id);
    if (existing.length >= MAX_PROOFS) {
      deny('MEDIA_LIMIT', `Tối đa ${MAX_PROOFS} minh chứng / thành tích.`, 400);
    }

    try {
      await mediaService.uploadAndRegister(
        file,
        {
          entity_type: 'ACHIEVEMENT',
          entity_id: row.id,
          purpose: 'CERTIFICATE',
          is_primary: existing.length === 0,
          tenant_id: member.tenant_id,
          change_reason: 'A01 proof thành tích',
          caption,
        },
        actor
      );
    } catch (e) {
      console.error('[achievements.addProof][media]', e.message || e);
      if (e && e.isOperational) throw e;
      deny('MEDIA_UPLOAD', e.message || 'Không lưu được file minh chứng.', e.statusCode || 500);
    }

    try {
      const correlationId = correlation.create();
      await prisma.$transaction(async (tx) => {
        await writeBpl({
          processType: 'ACHIEVEMENT_UPSERT',
          actorContext: actorCtx(user, member, correlationId),
          action: 'PROOF',
          attemptNo: 1,
          context: { target_id: member.id, target_name: row.title },
          payload: {
            member_id: member.id,
            achievement_id: row.id,
            op: 'CREATE',
          },
          tx,
        });
      });
    } catch (e) {
      console.error('[achievements.addProof][BPL]', e.message || e);
    }

    return { proofs: await loadProofs(actor, row.id) };
  });
}

async function removeProof(reqUser, achievementId, mediaId) {
  return withAls(reqUser, async () => {
    const { user, member } = await resolveMemberActor(reqUser);
    const row = await prisma.achievements.findFirst({
      where: {
        id: String(achievementId),
        member_id: member.id,
        tenant_id: member.tenant_id,
        deleted_at: null,
      },
      select: { id: true },
    });
    if (!row) deny('NOT_FOUND', 'Không tìm thấy thành tích.', 404);

    const actor = mediaActor(user, member);
    const proofs = await loadProofs(actor, row.id);
    const hit = proofs.find((p) => p.id === String(mediaId));
    if (!hit) deny('NOT_FOUND', 'Không tìm thấy minh chứng.', 404);

    await mediaService.deleteMedia(hit.id, actor, 'A01 xóa proof thành tích');
    return { ok: true, proofs: await loadProofs(actor, row.id) };
  });
}

module.exports = {
  listMine,
  createMine,
  updateMine,
  removeMine,
  addProof,
  removeProof,
};
