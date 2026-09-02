/**
 * PATH       : src/modules/profile/profile.routes.js
 * DATETIME   : 2026-09-02T14:05:00+07:00
 * VERSION    : 1.2.0-A01-AVATAR-P0
 * DESCRIPTION: /me/profile + achievements + avatar P0.
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
    const data = await avatarService.getMine(req.user);
    res.status(200).json({ success: true, status: 'success', data });
  })
);

router.post(
  '/avatar',
  verifyToken,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const data = await avatarService.uploadMine(req.user, req.file);
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
    const data = await avatarService.removeMine(req.user);
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

module.exports = router;
