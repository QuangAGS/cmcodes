/**
 * PATH       : src/modules/profile/documents.service.js
 * DATETIME   : 2026-09-03T16:15:00+07:00
 * VERSION    : 1.0.0-A01-DOCS
 * DESCRIPTION: Tài liệu khác của member. media DOCUMENT, không singleton.
 *              Quota 30MB. MIME rộng. Xóa = R2 + soft media.
 */

'use strict';

const { runWithTenantContext } = require('../../lib/prisma.js');
const { resolveMemberActor } = require('./profile.service.js');
const mediaService = require('../interactions/media.service.js');
const r2Storage = require('../../shared/storage/r2.storage.service.js');

const QUOTA = 30 * 1024 * 1024;
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/json',
  'application/zip',
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

function mediaActor(user, member) {
  return {
    ...user,
    id: user.id,
    userId: user.id,
    tenantId: member.tenant_id,
    tenant_id: member.tenant_id,
  };
}

function mapDoc(row) {
  if (!row) return null;
  return {
    id: row.id,
    file_name: row.file_name || null,
    mime_type: row.mime_type || null,
    file_size: row.file_size || 0,
    url: row.read_url || row.file_url || null,
    caption: row.caption || null,
  };
}

async function loadDocs(actor, memberId) {
  const rows = await mediaService.getByEntity('MEMBER', memberId, actor, {
    purpose: 'DOCUMENT',
    tenant_id: actor.tenantId,
  });
  const out = [];
  for (const row of rows || []) {
    let url = row.read_url || row.file_url || null;
    if (row.storage_key && row.file_name) {
      try {
        const signed = await r2Storage.getPresignedGetUrl(row.storage_key, 3600, row.file_name);
        url = signed.url;
      } catch (_) {
        /* giữ url cũ */
      }
    }
    out.push(mapDoc({ ...row, read_url: url }));
  }
  return out.filter(Boolean);
}

async function listMine(reqUser) {
  return withAls(reqUser, async () => {
    const { user, member } = await resolveMemberActor(reqUser);
    const items = await loadDocs(mediaActor(user, member), member.id);
    const used = items.reduce((s, x) => s + Number(x.file_size || 0), 0);
    return { items, used_bytes: used, quota_bytes: QUOTA };
  });
}

async function addMine(reqUser, file, body = {}) {
  return withAls(reqUser, async () => {
    const { user, member } = await resolveMemberActor(reqUser);
    if (!file || !file.buffer) deny('MEDIA_NO_FILE', 'Chưa chọn file.', 400);
    const mime = String(file.mimetype || '').toLowerCase();
    if (!ALLOWED.has(mime)) deny('MEDIA_TYPE', 'Định dạng tài liệu không hỗ trợ.', 400);
    if (file.size > MAX_BYTES || file.buffer.length > MAX_BYTES) {
      deny('MEDIA_TOO_LARGE', 'Mỗi file không quá 10MB.', 400);
    }
    const caption = String(body.caption || '').trim().slice(0, 255);
    if (!caption) deny('BAD_REQUEST', 'Cần mô tả ngắn cho tài liệu.', 400);

    const actor = mediaActor(user, member);
    const items = await loadDocs(actor, member.id);
    const used = items.reduce((s, x) => s + Number(x.file_size || 0), 0);
    if (used + file.buffer.length > QUOTA) {
      deny('MEDIA_QUOTA', 'Tổng tài liệu khác không quá 30MB.', 400);
    }

    await mediaService.uploadAndRegister(
      file,
      {
        entity_type: 'MEMBER',
        entity_id: member.id,
        purpose: 'DOCUMENT',
        is_primary: false,
        tenant_id: member.tenant_id,
        change_reason: 'A01 tài liệu khác',
        caption,
      },
      actor
    );
    return listMine(reqUser);
  });
}

async function removeMine(reqUser, mediaId) {
  return withAls(reqUser, async () => {
    const { user, member } = await resolveMemberActor(reqUser);
    const actor = mediaActor(user, member);
    const items = await loadDocs(actor, member.id);
    const hit = items.find((p) => p.id === String(mediaId));
    if (!hit) deny('NOT_FOUND', 'Không tìm thấy tài liệu.', 404);
    await mediaService.deleteMedia(hit.id, actor, 'A01 xóa tài liệu khác');
    return listMine(reqUser);
  });
}

module.exports = { listMine, addMine, removeMine };
