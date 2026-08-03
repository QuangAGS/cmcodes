/**
 * PATH: src/services/correlation.service.js
 * DATETIME: 2026-07-16T12:15:00+07:00
 * VERSION: 1.0.0
 * DESCRIPTION: Dịch vụ quản lý và sinh mã liên vết (Correlation ID) tập trung cho toàn hệ thống.
 * Đảm bảo mọi chuỗi hành vi trong cùng một phiên request của người dùng dùng chung một mã định danh.
 */

const { v4: uuidv4 } = require('uuid'); // Giả định dự án dùng thư viện uuid tiêu chuẩn

class CorrelationService {

  /**
   * @dateTime 2026-06-15 15:40:30
   * @description Sinh một mã liên vết ngẫu nhiên đạt chuẩn UUID v4.
   * @note Được gọi tại tầng Middleware khi request vừa chạm vào hệ thống để thiết lập vòng đời liên vết.
   * @returns {string} Chuỗi UUID định danh duy nhất (độ dài 36 ký tự) cho một phiên làm việc (request).
   */
  generate() {
    return uuidv4();
  }
}

module.exports = new CorrelationService();