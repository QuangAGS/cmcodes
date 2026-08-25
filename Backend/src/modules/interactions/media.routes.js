/**
 * PATH       : src/modules/interactions/media.routes.js
 * DATETIME   : 2026-08-25T10:20:00+07:00
 * VERSION    : 1.1.0-R2
 * DESCRIPTION:
 * - POST   /api/media/upload              multipart field "file"
 * - GET    /api/media/entity/:type/:id
 * - GET    /api/media/:id/url
 * - DELETE /api/media/:id
 * - FE không gọi R2; mọi upload qua BE.
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

router.delete('/:id', verifyToken, mediaController.remove);

module.exports = router;
