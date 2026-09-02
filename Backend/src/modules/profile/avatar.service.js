/**
 * PATH       : src/modules/profile/avatar.service.js
 * DATETIME   : 2026-09-02T14:05:00+07:00
 * VERSION    : 1.0.0-A01-AVATAR-P0
 * DESCRIPTION: Ảnh đại diện /me. Gọi media.service (R2, purpose AVATAR, singleton).
 *              Không sửa members. CL = NONE.
 */

'use strict';

const path = require('path');
const { prisma, correlation } = require('../../lib/prisma.js');
const { writeBpl } = require('../../services/bpl.service.js');
const mediaService = require('../interactions/media.service.js');

function resolveActor(reqUser) {
  return require('./profile.service.js').resolveMemberActor(reqUser);
}

const ALLOWED = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const MAX_BYTES = 2 * 1024 * 1024;

function deny(code, message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  err.isOperational = true;
  throw err;
}

function extOf(file) {
  const fromName = path.extname(String(file.originalname || '')).toLowerCase();
  if (fromName === '.jpg' || fromName === '.jpeg' || fromName === '.png' || fromName === '.webp') {
    return fromName;
  }
  if (file.mimetype === 'image/png') return '.png';
  if (file.mimetype === 'image/webp') return '.webp';
  return '.jpg';
}

async function findPrimaryRow(member) {
  return prisma.media.findFirst({
    where: {
      tenant_id: member.tenant_id,
      entity_type: 'MEMBER',
      entity_id: member.id,
      purpose: 'AVATAR',
      deleted_at: null,
    },
    orderBy: [{ is_primary: 'desc' }, { created_at: 'desc' }],
  });
}

async function toDto(row) {
  if (!row) return null;
  let url = row.file_url || null;
  let expires_at = null;
  try {
    const signed = await mediaService.getReadUrl(row.id, {
      id: row.uploaded_by,
      tenantId: row.tenant_id,
    });
    if (signed && typeof signed === 'object') {
      url = signed.url || url;
      expires_at = signed.expires_at || null;
    } else if (typeof signed === 'string') {
      url = signed;
    }
  } catch (_) {
    /* giữ file_url nếu có */
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
  const { user, member } = await resolveActor(reqUser);
  const row = await findPrimaryRow(member);
  return { avatar: await toDto(row), actor: { user_id: user.id, member_id: member.id } };
}

async function attachToProfile(member) {
  try {
    const row = await findPrimaryRow(member);
    return toDto(row);
  } catch (_) {
    return null;
  }
}

async function uploadMine(reqUser, file) {
  const { user, member } = await resolveActor(reqUser);
  if (!file || !file.buffer) deny('MEDIA_NO_FILE', 'Chưa chọn ảnh.', 400);
  const mime = String(file.mimetype || '').toLowerCase();
  if (!ALLOWED.has(mime)) deny('MEDIA_TYPE', 'Chỉ nhận JPEG, PNG hoặc WebP.', 400);
  if (file.size > MAX_BYTES || (file.buffer && file.buffer.length > MAX_BYTES)) {
    deny('MEDIA_TOO_LARGE', 'Ảnh không quá 2MB.', 400);
  }

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
    { id: user.id, userId: user.id, tenantId: member.tenant_id, tenant_id: member.tenant_id, role: user.role }
  );

  const correlationId = correlation.create();
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
        file_ext: created.file_ext || extOf(file),
      },
      tx,
    });
  });

  return { avatar: await toDto(created) };
}

async function removeMine(reqUser) {
  const { user, member } = await resolveActor(reqUser);
  const row = await findPrimaryRow(member);
  if (!row) deny('NOT_FOUND', 'Chưa có ảnh đại diện.', 404);

  await mediaService.deleteMedia(row.id, {
    id: user.id,
    userId: user.id,
    tenantId: member.tenant_id,
    tenant_id: member.tenant_id,
    role: user.role,
  }, 'A01 P0 xóa avatar');

  const correlationId = correlation.create();
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
      payload: { member_id: member.id, media_id: row.id },
      tx,
    });
  });

  return { avatar: null };
}

module.exports = {
  getMine,
  attachToProfile,
  uploadMine,
  removeMine,
};
