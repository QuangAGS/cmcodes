/**
 * PATH       : src/modules/profile/avatar.service.js
 * DATETIME   : 2026-09-02T20:20:00+07:00
 * VERSION    : 1.1.0-A01-AVATAR-P0
 * DESCRIPTION: Facade /me. Ủy quyền media.service (cùng cửa logo tenant).
 *              Không ghi R2/retire. Không sửa members. CL = NONE.
 */

'use strict';

const { correlation, runWithTenantContext } = require('../../lib/prisma.js');
const { writeBpl } = require('../../services/bpl.service.js');
const mediaService = require('../interactions/media.service.js');

const ALLOWED = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const MAX_BYTES = 2 * 1024 * 1024;

function deny(code, message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  err.isOperational = true;
  throw err;
}

/** Cùng shape pickUser(media.controller). */
function pickActor(reqUser) {
  const u = reqUser || {};
  return {
    userId: u.userId || u.id || u.sub,
    id: u.userId || u.id || u.sub,
    tenantId: u.tenantId || u.tenant_id,
    tenant_id: u.tenantId || u.tenant_id,
    role: u.role,
    tenant: u.tenant,
  };
}

function withAls(actor, fn) {
  if (!actor.tenantId) deny('UNAUTHORIZED', 'Thiếu tenant trên phiên đăng nhập.', 401);
  return runWithTenantContext({ tenantId: actor.tenantId, userId: actor.userId }, fn);
}

function resolveActor(reqUser) {
  return require('./profile.service.js').resolveMemberActor(reqUser);
}

async function primaryFromList(actor, memberId) {
  const listed = await mediaService.getByEntity('MEMBER', memberId, actor, {
    purpose: 'AVATAR',
    tenant_id: actor.tenantId,
  });
  const items = Array.isArray(listed) ? listed : listed?.items || listed?.data || [];
  const row = items.find((x) => x.is_primary) || items[0] || null;
  if (!row) return null;
  let url = row.file_url || null;
  let expires_at = null;
  try {
    const signed = await mediaService.getReadUrl(row.id, actor);
    if (signed && typeof signed === 'object') {
      url = signed.url || url;
      expires_at = signed.expires_at || null;
    } else if (typeof signed === 'string') {
      url = signed;
    }
  } catch (_) {
    /* file_url */
  }
  return {
    id: row.id,
    url,
    expires_at,
    mime_type: row.mime_type,
    file_name: row.file_name,
  };
}

async function getMine(reqUser) {
  const actor = pickActor(reqUser);
  return withAls(actor, async () => {
    const { user, member } = await resolveActor(reqUser);
    return {
      avatar: await primaryFromList(actor, member.id),
      actor: { user_id: user.id, member_id: member.id },
    };
  });
}

async function attachToProfile(member) {
  if (!member?.id || !member.tenant_id) return null;
  const actor = { tenantId: member.tenant_id, tenant_id: member.tenant_id };
  try {
    return runWithTenantContext({ tenantId: member.tenant_id }, () =>
      primaryFromList(actor, member.id)
    );
  } catch (_) {
    return null;
  }
}

async function uploadMine(reqUser, file) {
  const actor = pickActor(reqUser);
  return withAls(actor, async () => {
    if (!file || !file.buffer) deny('MEDIA_NO_FILE', 'Chưa chọn ảnh.', 400);
    const mime = String(file.mimetype || '').toLowerCase();
    if (!ALLOWED.has(mime)) deny('MEDIA_TYPE', 'Chỉ nhận JPEG, PNG hoặc WebP.', 400);
    if (file.size > MAX_BYTES || (file.buffer && file.buffer.length > MAX_BYTES)) {
      deny('MEDIA_TOO_LARGE', 'Ảnh không quá 2MB.', 400);
    }

    const { user, member } = await resolveActor(reqUser);

    /* Cùng hợp đồng media.controller.uploadFile */
    const created = await mediaService.uploadAndRegister(
      file,
      {
        entity_type: 'MEMBER',
        entity_id: member.id,
        purpose: 'AVATAR',
        is_primary: true,
        tenant_id: member.tenant_id,
        change_reason: 'A01 P0 avatar',
        caption: 'Ảnh đại diện',
      },
      actor
    );

    const correlationId = correlation.create();
    const { prisma } = require('../../lib/prisma.js');
    await prisma.$transaction(async (tx) => {
      await writeBpl({
        processType: 'MEDIA_AVATAR_UPSERT',
        actorContext: {
          actor_id: user.id,
          actor_type: 'USER',
          tenant_id: member.tenant_id,
          correlation_id: correlationId,
        },
        action: 'UPSERT',
        attemptNo: 1,
        context: { target_id: member.id, target_name: created.file_name || null },
        payload: {
          member_id: member.id,
          media_id: created.id,
          op: 'UPSERT',
          mime_type: created.mime_type || mime,
          file_ext: created.file_ext || null,
        },
        tx,
      });
    });

    return { avatar: await primaryFromList(actor, member.id) };
  });
}

async function removeMine(reqUser) {
  const actor = pickActor(reqUser);
  return withAls(actor, async () => {
    const { user, member } = await resolveActor(reqUser);
    const current = await primaryFromList(actor, member.id);
    if (!current) deny('NOT_FOUND', 'Chưa có ảnh đại diện.', 404);

    await mediaService.deleteMedia(current.id, actor, 'A01 P0 xóa avatar');

    const correlationId = correlation.create();
    const { prisma } = require('../../lib/prisma.js');
    await prisma.$transaction(async (tx) => {
      await writeBpl({
        processType: 'MEDIA_AVATAR_DELETE',
        actorContext: {
          actor_id: user.id,
          actor_type: 'USER',
          tenant_id: member.tenant_id,
          correlation_id: correlationId,
        },
        action: 'DELETE',
        attemptNo: 1,
        context: { target_id: member.id, target_name: null },
        payload: { member_id: member.id, media_id: current.id },
        tx,
      });
    });

    return { avatar: null };
  });
}

module.exports = {
  getMine,
  attachToProfile,
  uploadMine,
  removeMine,
};
