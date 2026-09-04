/**
 * PATH       : src/modules/interactions/media.routes.js
 * DATETIME   : 2026-09-04T12:05:00+07:00
 * VERSION    : 1.3.0-M10B-PRESIGN
 * DESCRIPTION:
 * - POST   /api/media/upload
 * - POST   /api/media/presign
 * - POST   /api/media/register
 * - GET    /api/media/entity/:type/:id
 * - GET    /api/media/:id/url
 * - GET    /api/media/:id/download
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

router.post('/presign', verifyToken, mediaController.presignPut);
router.post('/register', verifyToken, mediaController.confirmPresign);

router.get(
  '/entity/:type/:id',
  verifyToken,
  mediaController.listByEntity
);

router.get('/:id/url', verifyToken, mediaController.readUrl);

router.get('/:id/download', verifyToken, mediaController.downloadFile);

router.delete('/:id', verifyToken, mediaController.remove);

module.exports = router;
