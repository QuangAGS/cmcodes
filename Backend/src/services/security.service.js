/**
 * PATH       : src/services/securityGuard.service.js
 * DATETIME   : 2026-06-16T11:15:00+07:00
 * VERSION    : 1.0.0
 * DESCRIPTION: Dịch vụ bảo an hệ thống dùng chung (Shared Security Guard). 
 * Chuyên phân tích tần suất hành vi dựa trên lịch sử dữ liệu an ninh auth_logs để chủ động phát lệnh khóa IP.
 */

const authLogService = require('./authLogService'); // 🚀 BẢO TỒN: Sử dụng dịch vụ log an ninh sẵn có
const { isIPBlocked, blockIP } = require('../middlewares/ipBlockMiddleware'); // 🚀 BẢO TỒN: Tận dụng bộ nhớ đệm và hàm khóa IP cũ
const securityConfig = require('../config/securityConfig'); // 🚀 BẢO TỒN: Nạp cấu hình an ninh tập trung

class SecurityGuardService {

  /**
   * @dateTime 2026-06-16T11:16:30+07:00
   * @description Hàm trung tâm phân tích tần suất request. Nếu phát hiện hành vi spam cào dữ liệu vượt ngưỡng nhạy cảm,
   * hệ thống sẽ tự động khóa IP vật lý đó ngay lập tức trước khi chạm vào dữ liệu thật.
   * @param {Object} params
   * @param {string} params.ip - Địa chỉ IP mạng của request truyền lên
   * @param {string} params.userAgent - Tên thiết bị/trình duyệt thực thi
   * @param {string} [params.identifier='unknown'] - Định danh tài khoản (Email, Phone) đang thao tác
   * @param {number} params.maxThreshold - Ngưỡng chặn tối đa cho phép (Ví dụ: 5 lần, 50 lần...)
   * @param {number} params.windowMinutes - Khung thời gian quét lịch sử tính bằng phút
   * @param {string} params.reasonCode - Mã định danh lý do khóa để phục vụ điều tra vết
   * @returns {Promise<Object>} Object chứa trạng thái { isSafe: boolean, reason: string|null }
   */
  async verifySafety({ ip, userAgent, identifier = 'unknown', maxThreshold, windowMinutes, reasonCode }) {
    
    /**
     * @dateTime 2026-06-16T11:18:00+07:00
     * @description [CHỐT CHẶN TRƯỚC VÀO - PRE-CHECK]: Kiểm tra xem IP này đã nằm trong danh sách đen từ các request trước chưa.
     */
    if (isIPBlocked(ip)) {
      return { isSafe: false, reason: 'IP_ALREADY_BLOCKED' };
    }

    /**
     * @dateTime 2026-06-16T11:19:15+07:00
     * @description [PHÂN TÍCH TẦN SUẤT - RATE MONITOR]: Quét ngược bảng auth_logs để đếm tổng số lần thao tác của IP này.
     */
    const suspicious = await authLogService.getSuspiciousAttempts(ip, windowMinutes); //
    
    // Đồng bộ cấu trúc dữ liệu trả về từ authLogService tùy theo phiên bản (summary hoặc đếm thô attempts)
    const totalAttempts = suspicious?.summary?.total || suspicious?.attempts || 0;

    /**
     * @dateTime 2026-06-16T11:21:00+07:00
     * @description [KÍCH HOẠT TƯỜNG LỬA CHỦ ĐỘNG - ACTIVE DEFENSE FIREWALL]
     * Nếu số lần thử vượt ngưỡng chịu tải an ninh quy định riêng cho từng Business Process (BP).
     */
    if (totalAttempts >= maxThreshold) {
      
      // Tính toán thời gian khóa: Ưu tiên lấy từ config chung, mặc định là 15 phút nếu không cấu hình
      const blockMinutes = securityConfig.IP_BLOCK_MINUTES || 15;
      
      // Phát lệnh đưa IP này vào danh sách đóng băng cứng tại chỗ
      blockIP(ip, blockMinutes, reasonCode);

      // Ghi nhận một bản ghi log TRẠNG THÁI THẤT BẠI sâu vào sổ cái an ninh phục vụ cho việc điều tra vết sau này
      await authLogService.logAttempt({
        identifier,
        ip_address: ip,
        user_agent: userAgent,
        status: 'THAT_BAI',
        failure_reason: `SECURITY_GUARD_AUTO_BLOCKED: ${reasonCode}`
      });

      return { isSafe: false, reason: 'THRESHOLD_EXCEEDED' };
    }

    // Nếu hành vi hoàn toàn nằm trong khung tải an toàn
    return { isSafe: true, reason: null };
  }
}

module.exports = new SecurityGuardService();