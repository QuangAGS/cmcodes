/**
 * PATH       : src/modules/profile/biographyFiles.service.js
 * DATETIME   : 2026-09-04T06:55:00+07:00
 * VERSION    : 1.0.0-A01-BIO-FILES
 * DESCRIPTION: Tư liệu tiểu sử theo chủ đề. Mirror proof thành tích.
 *              entity_type=BIO_*, entity_id=biographies.id, purpose=GALLERY.
 *              Không singleton. Không đụng DOCUMENT / CERTIFICATE / AVATAR.
 */

'use strict';

const { prisma, runWithTenantContext } = require('../../lib/prisma.js');
const { resolveMemberActor } = require('./profile.service.js');
const mediaService = require('../interactions/media.service.js');

const MAX_FILES = 5;
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
]);

const TOPIC_ENTITY = {
  childhood_summary: 'BIO_CHILDHOOD',
  education_history: 'BIO_EDUCATION',
  career_history: 'BIO_CAREER',
  later_life_summary: 'BIO_LATER',
  personality_traits: 'BIO_PERSONALITY',
  notable_quotes: 'BIO_QUOTES',
  blood_group: 'BIO_BLOOD',
  health_summary: 'BIO_HEALTH',
  congenital_summary: 'BIO_CONGENITAL',
};

const TOPICS = Object.keys(TOPIC_ENTITY);

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

function normalizeTopic(raw) {
  const t = String(raw || '').trim();
  if (!TOPIC_ENTITY[t]) deny('BAD_REQUEST', 'Chủ đề tiểu sử không hợp lệ.', 400);
  return t;
}

function mapFile(row) {
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

async function ensureBioRow(member, actorId) {
  const existing = await prisma.biographies.findFirst({
    where: {
      member_id: member.id,
      tenant_id: member.tenant_id,
      deleted_at: null,
    },
  });
  if (existing) return existing;
  return prisma.biographies.create({
    data: {
      member_id: member.id,
      tenant_id: member.tenant_id,
      changed_by: actorId || null,
    },
  });
}

async function loadTopic(actor, bioId, topic) {
  const rows = await mediaService.getByEntity(TOPIC_ENTITY[topic], bioId, actor, {
    purpose: 'GALLERY',
    tenant_id: actor.tenantId,
  });
  return (rows || []).map(mapFile).filter(Boolean);
}

async function listMine(reqUser) {
  return withAls(reqUser, async () => {
    const { user, member } = await resolveMemberActor(reqUser);
    const actor = mediaActor(user, member);
    const bio = await prisma.biographies.findFirst({
      where: {
        member_id: member.id,
        tenant_id: member.tenant_id,
        deleted_at: null,
      },
      select: { id: true },
    });
    const out = {};
    for (const topic of TOPICS) out[topic] = [];
    if (!bio) return { items: out };
    for (const topic of TOPICS) {
      try {
        out[topic] = await loadTopic(actor, bio.id, topic);
      } catch (_) {
        out[topic] = [];
      }
    }
    return { items: out };
  });
}

async function addMine(reqUser, topicRaw, file, body = {}) {
  return withAls(reqUser, async () => {
    const topic = normalizeTopic(topicRaw);
    const { user, member } = await resolveMemberActor(reqUser);
    if (!file || !file.buffer) deny('MEDIA_NO_FILE', 'Chưa chọn file.', 400);
    const mime = String(file.mimetype || '').toLowerCase();
    if (!ALLOWED.has(mime)) deny('MEDIA_TYPE', 'Tư liệu tiểu sử chỉ nhận ảnh hoặc PDF.', 400);
    if (file.size > MAX_BYTES || file.buffer.length > MAX_BYTES) {
      deny('MEDIA_TOO_LARGE', 'File không quá 5MB.', 400);
    }
    const caption = String(body.caption || '').trim().slice(0, 255);
    if (!caption) deny('BAD_REQUEST', 'Cần mô tả ngắn cho tư liệu.', 400);

    const actor = mediaActor(user, member);
    const bio = await ensureBioRow(member, user.id);
    const existing = await loadTopic(actor, bio.id, topic);
    if (existing.length >= MAX_FILES) {
      deny('MEDIA_LIMIT', `Tối đa ${MAX_FILES} tư liệu / chủ đề.`, 400);
    }

    await mediaService.uploadAndRegister(
      file,
      {
        entity_type: TOPIC_ENTITY[topic],
        entity_id: bio.id,
        purpose: 'GALLERY',
        is_primary: existing.length === 0,
        tenant_id: member.tenant_id,
        change_reason: `A01 tư liệu tiểu sử ${topic}`,
        caption,
      },
      actor
    );
    return listMine(reqUser);
  });
}

async function removeMine(reqUser, topicRaw, mediaId) {
  return withAls(reqUser, async () => {
    const topic = normalizeTopic(topicRaw);
    const { user, member } = await resolveMemberActor(reqUser);
    const actor = mediaActor(user, member);
    const bio = await prisma.biographies.findFirst({
      where: {
        member_id: member.id,
        tenant_id: member.tenant_id,
        deleted_at: null,
      },
      select: { id: true },
    });
    if (!bio) deny('NOT_FOUND', 'Không tìm thấy tiểu sử.', 404);
    const items = await loadTopic(actor, bio.id, topic);
    const hit = items.find((p) => p.id === String(mediaId));
    if (!hit) deny('NOT_FOUND', 'Không tìm thấy tư liệu.', 404);
    await mediaService.deleteMedia(hit.id, actor, `A01 xóa tư liệu tiểu sử ${topic}`);
    return listMine(reqUser);
  });
}

module.exports = { listMine, addMine, removeMine, TOPICS, TOPIC_ENTITY };
