/**
 * PATH       : src/modules/interactions/media.controller.js
 * DATETIME   : 2026-09-03T19:17:00+07:00
 * VERSION    : 1.3.0-S0-STREAM-DOWNLOAD
 * DESCRIPTION:
 * - HTTP adapter: upload (multipart) → mediaService.uploadAndRegister.
 * - GET /:id/download stream R2, header do BE set (tên tiếng Việt).
 */

'use strict';

const { pipeline } = require('stream/promises');
const mediaService = require('./media.service');
const r2Storage = require('../../shared/storage/r2.storage.service');

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

  presignPut: async (req, res) => {
    try {
      const data = await mediaService.presignPut(req.body || {}, pickUser(req));
      return res.status(200).json({ success: true, status: 'success', data });
    } catch (error) {
      console.error('[media.presignPut]', error.message || error);
      return sendError(res, error);
    }
  },

  confirmPresign: async (req, res) => {
    try {
      const data = await mediaService.confirmPresign(req.body || {}, pickUser(req));
      return res.status(201).json({ success: true, status: 'success', data });
    } catch (error) {
      console.error('[media.confirmPresign]', error.message || error);
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

  downloadFile: async (req, res) => {
    try {
      const { id } = req.params;
      const pack = await mediaService.streamDownload(id, pickUser(req));
      res.setHeader(
        'Content-Type',
        pack.mime_type || 'application/octet-stream'
      );
      res.setHeader(
        'Content-Disposition',
        r2Storage.contentDisposition(pack.file_name || 'file', 'attachment')
      );
      res.setHeader('Cache-Control', 'private, no-store');
      if (pack.file_size) {
        res.setHeader('Content-Length', String(pack.file_size));
      }
      await pipeline(pack.stream, res);
    } catch (error) {
      console.error('[media.downloadFile]', error.message || error);
      if (res.headersSent) {
        try {
          res.end();
        } catch (_) {
          /* ignore */
        }
        return;
      }
      return sendError(res, error);
    }
  },
};

module.exports = mediaController;
