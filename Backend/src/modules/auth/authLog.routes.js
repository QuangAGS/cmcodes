/**
 * PATH: src/modules/auth/authLog.routes.js
 * DATETIME: 2026-07-16T12:15:00+07:00
 * VERSION: 1.1.0
 * DESCRIPTION: Định tuyến log bảo mật. Chỉ dành cho SYSTEM_ADMIN.
 */

const express = require('express');
const router = express.Router();
const authLogController = require('./authLog.controller');

// Import Middleware từ đúng thư mục src
const { verifyToken, checkRole } = require('../../middlewares/auth.middleware');

/**
 * TRUY VẤN NHẬT KÝ XÁC THỰC
 * Bảo vệ 2 lớp: Token hợp lệ + Role SYSTEM_ADMIN
 */
router.get(
    '/', 
    verifyToken, 
    checkRole(['SYSTEM_ADMIN']), 
    authLogController.getLogs
);

module.exports = router;