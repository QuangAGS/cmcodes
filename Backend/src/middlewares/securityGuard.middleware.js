/**
 * PATH       : src/middlewares/securityGuard.middleware.js
 * DATETIME   : 2026-06-16T11:25:00+07:00
 * VERSION    : 1.0.0
 * DESCRIPTION: Bộ lọc cấu hình động (Factory Middleware) bọc ở tầng Route.
 * Tiếp nhận cấu hình cấu trúc ngưỡng chặn riêng biệt cho từng Business Process (BP) khác nhau.
 */

const securityGuardService = require('../services/securityGuard.service');
const { ipBlockList } = require('./ipBlockMiddleware'); // 🚀 BẢO TỒN: Nạp Map bộ nhớ đệm chứa danh sách IP bị khóa

/**
 * @dateTime 2026-06-16T11:26:30+07:00
 * @description Hàm khởi tạo Middleware bọc chặn có cấu hình tùy biến.
 * @param {Object} config - Cấu hình an ninh cho API
 * @param {number} config.maxThreshold - Số lần tối đa được thao tác trong window
 * @param {number} config.windowMinutes - Số phút giới hạn khung quét kiểm tra
 * @param {string} config.reasonCode - Mã định danh lỗi an ninh đặc thù của riêng BP đó
 * @returns {Function} Express Middleware (req, res, next)
 */
const restrictSuspiciousActivity = ({ maxThreshold, windowMinutes, reasonCode }) => {
  return async (req, res, next) => {
    try {
      // Trích xuất IP an toàn tương thích với hạ tầng Cloudflare của bạn
      const ip = req.headers['cf-connecting-ip'] || req.ip || 'unknown';
      const userAgent = req.headers['user-agent'] || 'unknown';
      
      // Lấy định danh người dùng linh hoạt: Ưu tiên token Admin đăng nhập, sau đó đến form body đầu vào
      const identifier = req.user?.email || req.body?.identifier || req.body?.phone || 'guest_user';

      /**
       * @dateTime 2026-06-16T11:28:00+07:00
       * @description Gọi luồng tính toán kiểm soát từ Shared Service dùng chung.
       */
      const guard = await securityGuardService.verifySafety({
        ip,
        userAgent,
        identifier,
        maxThreshold,
        windowMinutes,
        reasonCode
      });

      // Nếu hệ thống phân tích báo động nguy hiểm (Không an toàn)
      if (!guard.isSafe) {
        // Lấy thông tin thời gian còn lại của IP bị khóa trong bộ nhớ cache để phản hồi chính xác ra giao diện
        const record = ipBlockList.get(ip);
        const minutesLeft = record ? Math.ceil((record.blockedUntil - Date.now()) / 60000) : 15;
        
        return res.status(403).json({
          status: 'error',
          code: 'SECURITY_GUARD_DENIED',
          message: `Thao tác bị từ chối do hệ thống bảo an phát hiện hành vi đáng ngờ. Vui lòng thử lại sau ${minutesLeft} phút.`
        });
      }

      /**
       * @dateTime 2026-06-16T11:29:15+07:00
       * Nếu vượt qua lưới lọc an toàn, cho phép request đi tiếp thẳng vào Controller/Service xử lý nghiệp vụ vật lý phía sau.
       */
      next();

    } catch (error) {
      // Van an toàn (Fault Tolerance): Nếu hệ thống log an ninh xảy ra sự cố nghẽn mạng, 
      // không làm chết hay crash ứng dụng, cho phép request đi tiếp để giữ trải nghiệm người dùng
      console.error('⚠️ [Security Guard Middleware Exception]:', error);
      next();
    }
  };
};

module.exports = { restrictSuspiciousActivity };