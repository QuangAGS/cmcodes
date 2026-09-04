/**
 * PATH       : src/modules/profile/profile.routes.js
 * DATETIME   : 2026-09-02T14:05:00+07:00
 * VERSION    : 1.3.0-A01-PROOF-P0
 * DESCRIPTION: /me/profile + achievements + avatar + proof P0.
 */

'use strict';

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../../middlewares/auth.middleware');
const { asyncHandler } = require('../../shared/errors');
const upload = require('../../middlewares/upload.middleware');
const profileService = require('./profile.service');
const achievementsService = require('./achievements.service.js');
const avatarService = require('./avatar.service.js');
const documentsService = require('./documents.service.js');
const biographyFilesService = require('./biographyFiles.service.js');

function actorFromReq(req) {
  const u = req.user || {};
  return {
    ...u,
    id: u.id || u.userId,
    userId: u.userId || u.id,
    tenantId: u.tenantId || u.tenant_id || req.tenantId || null,
    tenant_id: u.tenant_id || u.tenantId || req.tenantId || null,
  };
}

router.get(
  '/profile',
  verifyToken,
  asyncHandler(async (req, res) => {
    const data = await profileService.getMyProfile(req.user);
    res.status(200).json({ success: true, status: 'success', data });
  })
);

router.patch(
  '/profile',
  verifyToken,
  asyncHandler(async (req, res) => {
    const data = await profileService.patchMyProfile(req.user, req.body || {});
    res.status(200).json({
      success: true,
      status: 'success',
      message: 'Đã lưu hồ sơ dòng họ.',
      data,
    });
  })
);

router.get(
  '/addresses',
  verifyToken,
  asyncHandler(async (req, res) => {
    const data = await profileService.searchMyAddresses(req.user, req.query || {});
    res.status(200).json({ success: true, status: 'success', data });
  })
);

router.get(
  '/avatar',
  verifyToken,
  asyncHandler(async (req, res) => {
    const data = await avatarService.getMine(actorFromReq(req));
    res.status(200).json({ success: true, status: 'success', data });
  })
);

router.post(
  '/avatar',
  verifyToken,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const data = await avatarService.uploadMine(actorFromReq(req), req.file);
    res.status(201).json({
      success: true,
      status: 'success',
      message: 'Đã cập nhật ảnh đại diện.',
      data,
    });
  })
);

router.delete(
  '/avatar',
  verifyToken,
  asyncHandler(async (req, res) => {
    const data = await avatarService.removeMine(actorFromReq(req));
    res.status(200).json({
      success: true,
      status: 'success',
      message: 'Đã xóa ảnh đại diện.',
      data,
    });
  })
);

router.get(
  '/achievements',
  verifyToken,
  asyncHandler(async (req, res) => {
    const data = await achievementsService.listMine(req.user);
    res.status(200).json({ success: true, status: 'success', data });
  })
);

router.post(
  '/achievements',
  verifyToken,
  asyncHandler(async (req, res) => {
    const data = await achievementsService.createMine(req.user, req.body || {});
    res.status(201).json({ success: true, status: 'success', message: 'Đã thêm thành tích.', data });
  })
);

router.patch(
  '/achievements/:id',
  verifyToken,
  asyncHandler(async (req, res) => {
    const data = await achievementsService.updateMine(req.user, req.params.id, req.body || {});
    res.status(200).json({ success: true, status: 'success', message: 'Đã lưu thành tích.', data });
  })
);

router.delete(
  '/achievements/:id',
  verifyToken,
  asyncHandler(async (req, res) => {
    const data = await achievementsService.removeMine(req.user, req.params.id);
    res.status(200).json({ success: true, status: 'success', message: 'Đã xóa thành tích.', data });
  })
);

router.post(
  '/achievements/:id/proofs',
  verifyToken,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const data = await achievementsService.addProof(
      actorFromReq(req),
      req.params.id,
      req.file,
      req.body || {}
    );
    res.status(201).json({
      success: true,
      status: 'success',
      message: 'Đã thêm minh chứng.',
      data,
    });
  })
);

router.delete(
  '/achievements/:id/proofs/:mediaId',
  verifyToken,
  asyncHandler(async (req, res) => {
    const data = await achievementsService.removeProof(
      actorFromReq(req),
      req.params.id,
      req.params.mediaId
    );
    res.status(200).json({
      success: true,
      status: 'success',
      message: 'Đã xóa minh chứng.',
      data,
    });
  })
);

router.get(
  '/documents',
  verifyToken,
  asyncHandler(async (req, res) => {
    const data = await documentsService.listMine(actorFromReq(req));
    res.status(200).json({ success: true, status: 'success', data });
  })
);

router.post(
  '/documents',
  verifyToken,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const data = await documentsService.addMine(actorFromReq(req), req.file, req.body || {});
    res.status(201).json({
      success: true,
      status: 'success',
      message: 'Đã lưu tài liệu.',
      data,
    });
  })
);

router.delete(
  '/documents/:mediaId',
  verifyToken,
  asyncHandler(async (req, res) => {
    const data = await documentsService.removeMine(actorFromReq(req), req.params.mediaId);
    res.status(200).json({
      success: true,
      status: 'success',
      message: 'Đã xóa tài liệu.',
      data,
    });
  })
);

router.get(
  '/biography/files',
  verifyToken,
  asyncHandler(async (req, res) => {
    const data = await biographyFilesService.listMine(actorFromReq(req));
    res.status(200).json({ success: true, status: 'success', data });
  })
);

router.post(
  '/biography/:topic/files',
  verifyToken,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const data = await biographyFilesService.addMine(
      actorFromReq(req),
      req.params.topic,
      req.file,
      req.body || {}
    );
    res.status(201).json({
      success: true,
      status: 'success',
      message: 'Đã lưu tư liệu tiểu sử.',
      data,
    });
  })
);

router.delete(
  '/biography/:topic/files/:mediaId',
  verifyToken,
  asyncHandler(async (req, res) => {
    const data = await biographyFilesService.removeMine(
      actorFromReq(req),
      req.params.topic,
      req.params.mediaId
    );
    res.status(200).json({
      success: true,
      status: 'success',
      message: 'Đã xóa tư liệu tiểu sử.',
      data,
    });
  })
);

module.exports = router;
