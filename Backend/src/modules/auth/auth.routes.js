/**
 * PATH       : src/modules/auth/auth.routes.js
 * DATETIME   : 2026-07-16T12:15:00+07:00
 * VERSION    : 21.7.0
 * DESCRIPTION: 
 * - Áp dụng lưới lọc bảo an chủ động dùng chung (restrictSuspiciousActivity) cho tất cả các BP nhạy cảm.
 * - Bảo tồn 100% các cấu trúc route, rate limiter cũ độc lập khác (Q1).
 * - Tuân thủ nghiêm ngặt chuẩn định dạng tài liệu hệ thống (Q2).
 */

const express = require('express');
const router = express.Router();

const authController = require('./auth.controller');
const { verifyToken, checkRole } = require('../../middlewares/auth.middleware');
const correlationMiddleware = require('../../middlewares/correlation.middleware'); // 🚀 MỚI: Nạp bộ sinh mã liên vết toàn cục
// 🚀 MỚI: Nạp bộ lọc Factory Middleware an ninh dùng chung vừa khởi tạo
const { restrictSuspiciousActivity } = require('../../middlewares/securityGuard.middleware');
const { 
  loginRateLimiter, 
  registerRateLimiter,     
  resetRateLimiter 
} = require('../../middlewares/rateLimit.middleware');

// ==================== PUBLIC ROUTES ====================
// 1. Kiểm tra định danh (Bảo tồn cũ)
router.get('/check-identity', authController.checkIdentity);

// 2. Đăng ký tài khoản mới (Bảo tồn rate limiter và logic cũ)
router.post('/register', registerRateLimiter, authController.register);

// 3. Đăng nhập hệ thống (Bảo tồn rate limiter và logic cũ)
router.post('/login', loginRateLimiter, authController.login);

// 4. Quên mật khẩu & Đặt lại mật khẩu (Bảo tồn cũ)
router.post('/forgot-password', resetRateLimiter, authController.forgotPassword);
router.post('/reset-password', resetRateLimiter, authController.resetPassword);
router.post('/verify-reset-code', resetRateLimiter, authController.verifyResetCode);

/**
 * <2026-06-16T11:33:00+07:00>
 * BẢN VÁ BẢO AN CHO ĐỔI MẬT KHẨU SAU KHÔI PHỤC
 * Ngưỡng chặn: Chỉ cho phép sai sót tối đa 5 lần trong vòng 15 phút.
 * Lý do: Chống Hacker dùng kỹ thuật đoán mò Token để cướp mật khẩu người dùng.
 */
router.post(
  '/change-password-after-reset', 
  resetRateLimiter, 
  restrictSuspiciousActivity({
    maxThreshold: 5,
    windowMinutes: 15,
    reasonCode: 'SPAM_CHANGE_PASSWORD_DETECTION'
  }),
  authController.changePasswordAfterReset
);

// ==================== DEBUG ROUTE (CHỈ DEVELOPMENT) ====================
if (process.env.NODE_ENV !== 'production') {
  console.log('🧪 [DEBUG] Route /api/auth/debug/unblock-all đã được kích hoạt');
  router.post('/debug/unblock-all', authController.debugUnblockAll);
}

// ==================== PROTECTED ROUTES ====================
// Lấy thông tin user hiện tại (Bảo tồn cũ)
router.get('/me', verifyToken, (req, res) => {
  res.status(200).json({ status: 'success', user: req.user });
});
// Lấy danh sách hồ sơ chờ duyệt (Bảo tồn cũ)
router.get(
  '/pending-users', 
  verifyToken, 
  checkRole(['CLAN_ADMIN', 'SYSTEM_ADMIN']), 
  authController.getPendingUsers
);

/**
 * <2026-06-18T12:30:00+07:00>
 * BẢN VÁ AN NINH CHỦ ĐỘNG CHO TIẾN TRÌNH TRUY VẤN SỔ CÁI ĐỘNG (HỢP NHẤT)
 * Ngưỡng chặn: Thừa hưởng restrictSuspiciousActivity bảo vệ phân hệ quản trị
 * Nhiệm vụ: Tiếp nhận bộ lọc "mối quan tâm" từ form Frontend, tích hợp mã liên vết correlationId
 * Q1-Safe: Giữ nguyên vẹn 100% khung an ninh, token, phân quyền và rate-limiters hiện có.
 */
router.post(
  '/query-reviewable-users',
  verifyToken, //[cite: 9]
  checkRole(['CLAN_ADMIN', 'SYSTEM_ADMIN']), //[cite: 9]
  correlationMiddleware, //[cite: 9]
  restrictSuspiciousActivity({ // 🚀 ĐỔI THÀNH DẠNG OBJECT KHỚP VỚI CÁC ROUTE KHÁC CỦA BẠN
    maxThreshold: 100, // Tăng ngưỡng lên vì admin tra cứu, bấm lọc nhiều lần
    windowMinutes: 5,
    reasonCode: 'SPAM_QUERY_REVIEWABLE_USERS'
  }),
  authController.queryReviewableUsers
);

/**
 * <2026-06-16T11:35:15+07:00>
 * BẢN VÁ AN NINH CHỦ ĐỘNG CHO TIẾN TRÌNH DUYỆT ĐƠN (HỢP NHẤT)
 * Ngưỡng chặn: Tối đa 50 lần thao tác liên tục trong vòng 5 phút cho một địa chỉ IP.
 * Lý do: Ngăn chặn triệt để lỗ hổng Hacker chiếm quyền Admin dùng Bot để duyệt tự động tài khoản ảo, 
 * hoặc spam dồn dập làm sập kênh API Admin (DoS Attack).
 * Q1-Safe: Giữ nguyên vẹn 100% cơ chế kiểm tra Token (verifyToken) và phân quyền cũ (checkRole).
 */
router.post(
  '/process-approval', 
  verifyToken, 
  checkRole(['CLAN_ADMIN', 'SYSTEM_ADMIN']),
  restrictSuspiciousActivity({ // 🚀 MỚI: Tường lửa chủ động chắn trước cửa Controller
    maxThreshold: 50,
    windowMinutes: 5,
    reasonCode: 'ADMIN_PRIVILEGE_ABUSE_OR_BOT_SPAM'
  }),
  correlationMiddleware, // Bộ sinh mã liên vết request phục vụ Sổ cái
  authController.processApproval
);

module.exports = router;