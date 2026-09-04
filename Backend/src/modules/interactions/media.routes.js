/**
 * PATH       : src/modules/interactions/media.routes.js
 * DATETIME   : 2026-09-03T19:17:00+07:00
 * VERSION    : 1.2.0-R2-STREAM-DOWNLOAD
 * DESCRIPTION:
 * - POST   /api/media/upload              multipart field "file"
 * - GET    /api/media/entity/:type/:id
 * - GET    /api/media/:id/url             presign preview
 * - GET    /api/media/:id/download        stream + Content-Disposition UTF-8
 * - DELETE /api/media/:id
 */

'use strict';

const express = require('express');
const router = express.Router();

const mediaController = require('./media.controller');
const { verifyToken } = require('../../middlewares/auth.middleware');
const upload = require('../../middlewares/upload.middleware');

router.post(
  '/upload',
  verifyToken,
  upload.single('file'),
  mediaController.uploadFile
);

router.get(
  '/entity/:type/:id',
  verifyToken,
  mediaController.listByEntity
);

router.get('/:id/url', verifyToken, mediaController.readUrl);

router.get('/:id/download', verifyToken, mediaController.downloadFile);

router.delete('/:id', verifyToken, mediaController.remove);

module.exports = router;
