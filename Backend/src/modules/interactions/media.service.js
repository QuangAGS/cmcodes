/**
 * PATH       : src/modules/interactions/media.service.js
 * DATETIME   : 2026-08-25T15:05:00+07:00
 * VERSION    : 2.0.0-R2-SCHEMA
 * DESCRIPTION:
 * - Media theo schema mới: purpose, mime_type, file_ext, storage_provider enum,
 *   storage_key SSOT (R2 private), file_url optional.
 * - Upload: multer buffer → R2 key {tenantId}/{uuid}{ext} → prisma.media.
 */

'use strict';

const { prisma } = require('../../lib/prisma.js');
const auditService = require('../../services/audit.service');
const r2Storage = require('../../shared/storage/r2.storage.service');

const PURPOSES = new Set([
  'LOGO',
  'AVATAR',
  'DOCUMENT',
  'CERTIFICATE',
  'GALLERY',
  'ONBOARDING',
  'OTHER',
  'VIDEO',
]);

function actorOf(currentUser) {
  return {
    userId:
      currentUser?.userId ||
      currentUser?.id ||
      currentUser?.sub ||
      null,
    tenantId:
      currentUser?.tenantId ||
      currentUser?.tenant_id ||
      currentUser?.tenant?.id ||
      null,
    role: currentUser?.role || null,
  };
}

function normalizePurpose(raw) {
  const p = String(raw || 'OTHER')
    .trim()
    .toUpperCase();
  return PURPOSES.has(p) ? p : 'OTHER';
}

function normalizeEntityType(raw) {
  return String(raw || 'MISC')
    .trim()
    .toUpperCase()
    .slice(0, 50);
}

const mediaService = {
  /**
   * Upload file → R2 → insert media.
   * @param {object} file multer: buffer, originalname, mimetype, size
   * @param {object} meta entity_id, entity_type, purpose, is_primary, caption, change_reason
   * @param {object} currentUser
   */
  uploadAndRegister: async (file, meta, currentUser) => {
    const { userId, tenantId } = actorOf(currentUser);
    if (!userId || !tenantId) {
      const err = new Error('Thiếu thông tin xác thực hoặc tenant.');
      err.statusCode = 401;
      err.code = 'AUTH_UNAUTHORIZED';
      throw err;
    }
    if (!file?.buffer) {
      const err = new Error('Không có file nào được tải lên.');
      err.statusCode = 400;
      err.code = 'MEDIA_NO_FILE';
      throw err;
    }

    const entity_type = normalizeEntityType(meta?.entity_type);
    const entity_id = meta?.entity_id || userId;
    const purpose = normalizePurpose(meta?.purpose);
    const is_primary =
      meta?.is_primary === true ||
      meta?.is_primary === 'true' ||
      meta?.is_primary === '1';

    const stored = await r2Storage.uploadObject({
      buffer: file.buffer,
      contentType: file.mimetype,
      originalName: file.originalname,
      tenantId,
    });

    // Một logo/avatar primary: hạ primary cũ cùng scope (best-effort)
    if (is_primary) {
      try {
        await prisma.media.updateMany({
          where: {
            tenant_id: tenantId,
            entity_type,
            entity_id,
            purpose,
            is_primary: true,
            deleted_at: null,
          },
          data: { is_primary: false, changed_by: userId, updated_at: new Date() },
        });
      } catch (_) {
        /* ignore */
      }
    }

    const newMedia = await prisma.media.create({
      data: {
        tenant_id: tenantId,
        entity_id,
        entity_type,
        purpose,
        is_primary,
        file_name: stored.file_name,
        mime_type: stored.mime_type,
        file_ext: stored.file_ext,
        file_size: stored.file_size,
        storage_provider: 'CLOUDFLARE_R2',
        storage_key: stored.storage_key,
        file_url: stored.file_url || null,
        caption: meta?.caption ? String(meta.caption).slice(0, 500) : null,
        sort_order:
          meta?.sort_order != null && meta?.sort_order !== ''
            ? Number(meta.sort_order)
            : 0,
        uploaded_by: userId,
        changed_by: userId,
      },
    });

    try {
      await auditService.logAction(
        'THEM_MOI',
        'media',
        newMedia.id,
        null,
        newMedia,
        userId,
        meta?.change_reason || `Upload ${purpose} / ${entity_type}`,
        tenantId
      );
    } catch (_) {
      /* best-effort */
    }

    return newMedia;
  },

  /**
   * Đăng ký metadata thuần (không upload) — tương thích / import.
   */
  registerMedia: async (fileData, currentUser) => {
    const { userId, tenantId } = actorOf(currentUser);
    const purpose = normalizePurpose(fileData.purpose);
    const entity_type = normalizeEntityType(fileData.entity_type);

    const newMedia = await prisma.media.create({
      data: {
        tenant_id: tenantId,
        entity_id: fileData.entity_id,
        entity_type,
        purpose,
        is_primary:
          fileData.is_primary === true || fileData.is_primary === 'true',
        file_name: fileData.file_name || null,
        mime_type: fileData.mime_type || fileData.file_type || null,
        file_ext: fileData.file_ext || null,
        file_size:
          fileData.file_size != null ? Number(fileData.file_size) : null,
        width: fileData.width != null ? Number(fileData.width) : null,
        height: fileData.height != null ? Number(fileData.height) : null,
        checksum: fileData.checksum || null,
        storage_provider: fileData.storage_provider || 'CLOUDFLARE_R2',
        storage_key: fileData.storage_key || null,
        file_url: fileData.file_url || null,
        caption: fileData.caption || null,
        sort_order:
          fileData.sort_order != null ? Number(fileData.sort_order) : 0,
        uploaded_by: userId,
        changed_by: userId,
      },
    });

    try {
      await auditService.logAction(
        'THEM_MOI',
        'media',
        newMedia.id,
        null,
        newMedia,
        userId,
        fileData.change_reason || `Register ${purpose}`,
        tenantId
      );
    } catch (_) {
      /* ignore */
    }

    return newMedia;
  },

  getByEntity: async (entityType, entityId, currentUser = null, filters = {}) => {
    const { tenantId } = actorOf(currentUser || {});
    const where = {
      entity_type: normalizeEntityType(entityType),
      entity_id: entityId,
      deleted_at: null,
    };
    if (tenantId) where.tenant_id = tenantId;
    if (filters.purpose) where.purpose = normalizePurpose(filters.purpose);

    const rows = await prisma.media.findMany({
      where,
      orderBy: [{ is_primary: 'desc' }, { sort_order: 'asc' }, { created_at: 'desc' }],
    });

    const out = [];
    for (const row of rows) {
      let read_url = null;
      try {
        const resolved = await r2Storage.resolveReadUrl(
          row.storage_key,
          row.file_url,
          3600
        );
        read_url = resolved.url;
      } catch (_) {
        read_url = row.file_url || null;
      }
      out.push({ ...row, read_url });
    }
    return out;
  },

  deleteMedia: async (id, currentUser, reason) => {
    const { userId, tenantId, role } = actorOf(currentUser);

    const oldMedia = await prisma.media.findFirst({
      where: { id, deleted_at: null },
    });
    if (!oldMedia) {
      const err = new Error('File không tồn tại.');
      err.statusCode = 404;
      err.code = 'MEDIA_NOT_FOUND';
      throw err;
    }

    if (
      role &&
      !['SYSTEM_ADMIN', 'CLAN_ADMIN'].includes(role) &&
      oldMedia.uploaded_by !== userId
    ) {
      const err = new Error(
        'Bảo mật: Bạn không có quyền xóa tài liệu của người khác.'
      );
      err.statusCode = 403;
      err.code = 'MEDIA_FORBIDDEN';
      throw err;
    }

    const now = new Date();
    const deleted = await prisma.media.update({
      where: { id },
      data: {
        deleted_at: now,
        changed_by: userId,
        updated_at: now,
      },
    });

    if (oldMedia.storage_key) {
      try {
        await r2Storage.deleteObject(oldMedia.storage_key);
      } catch (e) {
        console.error('[media.deleteMedia][R2]', e.message || e);
      }
    }

    try {
      await auditService.logAction(
        'XOA',
        'media',
        id,
        oldMedia,
        deleted,
        userId,
        reason || 'Xóa tài liệu',
        tenantId || oldMedia.tenant_id
      );
    } catch (_) {
      /* ignore */
    }

    return deleted;
  },

  getReadUrl: async (id, currentUser = null) => {
    const { tenantId } = actorOf(currentUser || {});
    const row = await prisma.media.findFirst({
      where: {
        id,
        deleted_at: null,
        ...(tenantId ? { tenant_id: tenantId } : {}),
      },
    });
    if (!row) {
      const err = new Error('File không tồn tại.');
      err.statusCode = 404;
      throw err;
    }
    return r2Storage.resolveReadUrl(row.storage_key, row.file_url, 3600);
  },
};

module.exports = mediaService;
