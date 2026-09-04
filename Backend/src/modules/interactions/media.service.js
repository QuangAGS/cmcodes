/**
 * PATH       : src/modules/interactions/media.service.js
 * DATETIME   : 2026-09-03T19:17:00+07:00
 * VERSION    : 2.3.0-S0-STREAM-DOWNLOAD
 * DESCRIPTION:
 * - Upload R2 + prisma.media trong ALS tenant đích.
 * - SYS logo: tenant = meta.tenant_id hoặc entity_id khi entity_type=TENANT.
 * - LOGO / AVATAR: soft-delete bản cũ + xóa R2.
 * - streamDownload: findFirst (không inject tenant vào unique) + stream R2.
 */

'use strict';

const { prisma, runWithTenantContext } = require('../../lib/prisma.js');
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

const SINGLETON_PURPOSES = new Set(['LOGO', 'AVATAR']);

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

function resolveTargetTenant(meta, entityType, entityId, actorTenantId) {
  return (
    meta?.tenant_id ||
    meta?.tenantId ||
    (entityType === 'TENANT' ? entityId : null) ||
    actorTenantId ||
    null
  );
}

async function retirePreviousMedia({
  tenantId,
  entity_type,
  entity_id,
  purpose,
  keepId,
  userId,
}) {
  const prev = await prisma.media.findMany({
    where: {
      tenant_id: tenantId,
      entity_type,
      entity_id,
      purpose,
      deleted_at: null,
      ...(keepId ? { id: { not: keepId } } : {}),
    },
    select: {
      id: true,
      storage_key: true,
      storage_provider: true,
      file_name: true,
    },
  });

  if (!prev.length) return 0;

  const now = new Date();
  await prisma.media.updateMany({
    where: {
      id: { in: prev.map((r) => r.id) },
      tenant_id: tenantId,
      deleted_at: null,
    },
    data: {
      deleted_at: now,
      is_primary: false,
      changed_by: userId || null,
      updated_at: now,
    },
  });

  for (const row of prev) {
    if (!row.storage_key) continue;
    try {
      await r2Storage.deleteObject(row.storage_key);
    } catch (e) {
      console.error(
        '[media.retirePreviousMedia][R2]',
        row.id,
        row.storage_key,
        e.message || e
      );
    }
  }

  return prev.length;
}

const mediaService = {
  uploadAndRegister: async (file, meta, currentUser) => {
    const {
      userId,
      tenantId: actorTenantId,
      role,
    } = actorOf(currentUser);

    const entity_type = normalizeEntityType(meta?.entity_type);
    const entity_id = meta?.entity_id || userId;
    const tenantId = resolveTargetTenant(
      meta,
      entity_type,
      entity_id,
      actorTenantId
    );

    if (!userId || !tenantId) {
      const err = new Error('Thiếu thông tin xác thực hoặc tenant.');
      err.statusCode = 401;
      err.code = 'AUTH_UNAUTHORIZED';
      throw err;
    }

    if (role !== 'SYSTEM_ADMIN' && actorTenantId && actorTenantId !== tenantId) {
      const err = new Error('Không được tải file sang dòng họ khác.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    if (!file?.buffer) {
      const err = new Error('Không có file nào được tải lên.');
      err.statusCode = 400;
      err.code = 'MEDIA_NO_FILE';
      throw err;
    }

    const purpose = normalizePurpose(meta?.purpose);
    const is_primary =
      meta?.is_primary === true ||
      meta?.is_primary === 'true' ||
      meta?.is_primary === '1' ||
      SINGLETON_PURPOSES.has(purpose);

    return runWithTenantContext(
      {
        tenantId,
        allowUnscoped: role === 'SYSTEM_ADMIN',
        userId,
      },
      async () => {
        const stored = await r2Storage.uploadObject({
          buffer: file.buffer,
          contentType: file.mimetype,
          originalName: file.originalname,
          tenantId,
        });

        const newMedia = await prisma.media.create({
          data: {
            tenant_id: tenantId,
            entity_id,
            entity_type,
            purpose,
            is_primary: !!is_primary,
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

        let retired = 0;
        if (SINGLETON_PURPOSES.has(purpose)) {
          try {
            retired = await retirePreviousMedia({
              tenantId,
              entity_type,
              entity_id,
              purpose,
              keepId: newMedia.id,
              userId,
            });
          } catch (e) {
            console.error('[media.uploadAndRegister][retire]', e.message || e);
          }
        } else if (is_primary) {
          try {
            await prisma.media.updateMany({
              where: {
                tenant_id: tenantId,
                entity_type,
                entity_id,
                purpose,
                is_primary: true,
                deleted_at: null,
                id: { not: newMedia.id },
              },
              data: {
                is_primary: false,
                changed_by: userId,
                updated_at: new Date(),
              },
            });
          } catch (_) {
            /* ignore */
          }
        }

        try {
          await auditService.logAction(
            'THEM_MOI',
            'media',
            newMedia.id,
            null,
            { ...newMedia, retired_previous: retired },
            userId,
            meta?.change_reason ||
              `Upload ${purpose} / ${entity_type}` +
                (retired ? ` (retire ${retired})` : ''),
            tenantId
          );
        } catch (_) {
          /* best-effort */
        }

        return { ...newMedia, retired_previous: retired };
      }
    );
  },

  registerMedia: async (fileData, currentUser) => {
    const {
      userId,
      tenantId: actorTenantId,
      role,
    } = actorOf(currentUser);
    const purpose = normalizePurpose(fileData.purpose);
    const entity_type = normalizeEntityType(fileData.entity_type);
    const tenantId = resolveTargetTenant(
      fileData,
      entity_type,
      fileData.entity_id,
      actorTenantId
    );

    if (!userId || !tenantId) {
      const err = new Error('Thiếu thông tin xác thực hoặc tenant.');
      err.statusCode = 401;
      err.code = 'AUTH_UNAUTHORIZED';
      throw err;
    }

    return runWithTenantContext(
      {
        tenantId,
        allowUnscoped: role === 'SYSTEM_ADMIN',
        userId,
      },
      async () => {
        const newMedia = await prisma.media.create({
          data: {
            tenant_id: tenantId,
            entity_id: fileData.entity_id,
            entity_type,
            purpose,
            is_primary:
              fileData.is_primary === true ||
              fileData.is_primary === 'true' ||
              SINGLETON_PURPOSES.has(purpose),
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

        if (SINGLETON_PURPOSES.has(purpose)) {
          try {
            await retirePreviousMedia({
              tenantId,
              entity_type,
              entity_id: fileData.entity_id,
              purpose,
              keepId: newMedia.id,
              userId,
            });
          } catch (e) {
            console.error('[media.registerMedia][retire]', e.message || e);
          }
        }

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
      }
    );
  },

  getByEntity: async (entityType, entityId, currentUser = null, filters = {}) => {
    const { tenantId: actorTenantId, role } = actorOf(currentUser || {});
    const entity_type = normalizeEntityType(entityType);
    const tenantId = resolveTargetTenant(
      filters,
      entity_type,
      entityId,
      actorTenantId
    );

    const where = {
      entity_type,
      entity_id: entityId,
      deleted_at: null,
    };
    if (tenantId) where.tenant_id = tenantId;
    if (filters.purpose) where.purpose = normalizePurpose(filters.purpose);

    const rows = await runWithTenantContext(
      {
        tenantId: tenantId || actorTenantId,
        allowUnscoped: role === 'SYSTEM_ADMIN',
      },
      () =>
        prisma.media.findMany({
          where,
          orderBy: [
            { is_primary: 'desc' },
            { sort_order: 'asc' },
            { created_at: 'desc' },
          ],
        })
    );

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
    const { userId, tenantId: actorTenantId, role } = actorOf(currentUser);

    return runWithTenantContext(
      {
        tenantId: actorTenantId,
        allowUnscoped: role === 'SYSTEM_ADMIN',
        userId,
      },
      async () => {
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
        const deletedRows = await prisma.media.updateMany({
          where: {
            id,
            tenant_id: oldMedia.tenant_id,
            deleted_at: null,
          },
          data: {
            deleted_at: now,
            is_primary: false,
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
            { deleted_at: now, count: deletedRows.count },
            userId,
            reason || 'Xóa tài liệu',
            actorTenantId || oldMedia.tenant_id
          );
        } catch (_) {
          /* ignore */
        }

        return { ...oldMedia, deleted_at: now };
      }
    );
  },

  getReadUrl: async (id, currentUser = null) => {
    const { tenantId: actorTenantId, role } = actorOf(currentUser || {});

    const row = await runWithTenantContext(
      {
        tenantId: actorTenantId,
        allowUnscoped: role === 'SYSTEM_ADMIN',
      },
      () =>
        prisma.media.findFirst({
          where: {
            id,
            deleted_at: null,
            ...(actorTenantId && role !== 'SYSTEM_ADMIN'
              ? { tenant_id: actorTenantId }
              : {}),
          },
        })
    );

    if (!row) {
      const err = new Error('File không tồn tại.');
      err.statusCode = 404;
      throw err;
    }
    return r2Storage.resolveReadUrl(row.storage_key, row.file_url, 3600);
  },

  streamDownload: async (id, currentUser = null) => {
    const { tenantId: actorTenantId, role } = actorOf(currentUser || {});

    const row = await runWithTenantContext(
      {
        tenantId: actorTenantId,
        allowUnscoped: role === 'SYSTEM_ADMIN',
      },
      () =>
        prisma.media.findFirst({
          where: {
            id,
            deleted_at: null,
            ...(actorTenantId && role !== 'SYSTEM_ADMIN'
              ? { tenant_id: actorTenantId }
              : {}),
          },
        })
    );

    if (!row) {
      const err = new Error('File không tồn tại.');
      err.statusCode = 404;
      err.code = 'MEDIA_NOT_FOUND';
      throw err;
    }
    if (!row.storage_key) {
      const err = new Error('File không còn trên kho lưu trữ.');
      err.statusCode = 404;
      err.code = 'MEDIA_NO_KEY';
      throw err;
    }

    const obj = await r2Storage.getObjectStream(row.storage_key);
    if (!obj.stream) {
      const err = new Error('Không đọc được nội dung file.');
      err.statusCode = 502;
      err.code = 'MEDIA_STREAM_FAILED';
      throw err;
    }

    return {
      stream: obj.stream,
      mime_type: row.mime_type || obj.contentType,
      file_name: row.file_name || 'file',
      file_size: row.file_size || obj.contentLength,
    };
  },
};

module.exports = mediaService;
