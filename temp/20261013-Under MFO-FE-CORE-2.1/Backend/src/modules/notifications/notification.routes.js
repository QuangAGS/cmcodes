/**
 * PATH: src/modules/notifications/notification.routes.js
 * DATETIME: 2026-07-16T12:15:00+07:00
 * VERSION: 1.2.0
 */
const express = require('express');
const router = express.Router();
const notificationController = require('./notification.controller');
const { verifyToken } = require('../../middlewares/auth.middleware');

// Lấy danh sách thông báo của tôi
router.get('/', verifyToken, notificationController.getMyNotifications);

// Đánh dấu đã đọc: Dùng Patch và cấu trúc rõ ràng
// Lưu ý: Đưa các route thao tác cụ thể lên trên nếu có route /:id tổng quát
router.patch('/:id/read', verifyToken, notificationController.markRead);

module.exports = router;