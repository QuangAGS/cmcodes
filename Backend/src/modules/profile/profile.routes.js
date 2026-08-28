/**
 * PATH       : src/modules/profile/profile.routes.js
 * VERSION    : 1.0.0-A01
 */

'use strict';

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../../middlewares/auth.middleware');
const { asyncHandler } = require('../../shared/errors');
const profileService = require('./profile.service');

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

module.exports = router;
