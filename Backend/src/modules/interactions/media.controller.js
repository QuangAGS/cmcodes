/**
 * PATH       : src/modules/interactions/media.controller.js
 * DATETIME   : 2026-08-28T10:35:00+07:00
 * VERSION    : 1.2.0-S0-TENANT-META
 * DESCRIPTION:
 * - HTTP adapter: upload (multipart) → mediaService.uploadAndRegister.
 * - Pass tenant_id từ body/query để SYS gắn ALS đúng họ đích.
 */

'use strict';

const mediaService = require('./media.service');

function pickUser(req) {
  const u = req.user || {};
  return {
    userId: u.userId || u.id || u.sub,
    id: u.userId || u.id || u.sub,
    tenantId: u.tenantId || u.tenant_id,
    tenant_id: u.tenantId || u.tenant_id,
    role: u.role,
    tenant: u.tenant,
  };
}

function sendError(res, error) {
  const status = error.statusCode || error.status || 500;
  return res.status(status).json({
    success: false,
    status: 'error',
    code: error.code || 'INTERNAL_ERROR',
    message: error.message || 'Đã xảy ra lỗi hệ thống.',
  });
}

const mediaController = {
  uploadFile: async (req, res) => {
    try {
      if (!req.file) {
        const err = new Error('Không có file nào được tải lên.');
        err.statusCode = 400;
        err.code = 'MEDIA_NO_FILE';
        throw err;
      }

      const result = await mediaService.uploadAndRegister(
        req.file,
        {
          entity_id: req.body.entity_id,
          entity_type: req.body.entity_type || 'MISC',
          purpose: req.body.purpose || 'OTHER',
          change_reason: req.body.change_reason,
          is_primary: req.body.is_primary,
          caption: req.body.caption,
          sort_order: req.body.sort_order,
          tenant_id: req.body.tenant_id || req.body.entity_id,
        },
        pickUser(req)
      );

      return res.status(201).json({
        success: true,
        status: 'success',
        data: result,
      });
    } catch (error) {
      console.error('[media.uploadFile]', error.message || error);
      return sendError(res, error);
    }
  },

  listByEntity: async (req, res) => {
    try {
      const { type, id } = req.params;
      const data = await mediaService.getByEntity(type, id, pickUser(req), {
        purpose: req.query.purpose,
        tenant_id: req.query.tenant_id || req.body?.tenant_id,
      });
      return res.status(200).json({ success: true, status: 'success', data });
    } catch (error) {
      return sendError(res, error);
    }
  },

  remove: async (req, res) => {
    try {
      const { id } = req.params;
      const data = await mediaService.deleteMedia(
        id,
        pickUser(req),
        req.body?.reason
      );
      return res.status(200).json({ success: true, status: 'success', data });
    } catch (error) {
      return sendError(res, error);
    }
  },

  readUrl: async (req, res) => {
    try {
      const { id } = req.params;
      const data = await mediaService.getReadUrl(id, pickUser(req));
      return res.status(200).json({ success: true, status: 'success', data });
    } catch (error) {
      return sendError(res, error);
    }
  },
};

module.exports = mediaController;
