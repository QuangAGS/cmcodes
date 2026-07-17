/**
 * PATH: src/middlewares/correlation.middleware.js
 * DATETIME: 2026-06-15 15:53:00
 * VERSION: 1.0.0
 * DESCRIPTION: Middleware gán mã liên vết Correlation ID tự động cho mọi Request đi vào hệ thống.
 * Đóng vai trò là điểm khởi đầu cho chuỗi kết vết Audit Log của toàn bộ dự án.
 */

const correlationService = require('../services/correlation.service');

/**
 * @dateTime 2026-06-15 15:54:00
 * @description Middleware chèn mã liên vết vào ngữ cảnh request (req) và đính kèm vào Header phản hồi (res).
 * Giúp đồng bộ mã vết từ lúc Client bấm nút cho tới khi ghi nhận sâu xuống ổ đĩa cứng Database.
 */
function correlationMiddleware(req, res, next) {
  // Ưu tiên lấy mã từ Gateway/Client truyền lên (nếu có), nếu không có sẽ tự sinh mới một chuỗi UUIDv4 độc bản
  const correlationId = req.headers['x-correlation-id'] || correlationService.generate();
  
  // Gắn chặt mã liên vết vào đối tượng request để tất cả các Service phía sau dễ dàng trích xuất
  req.correlationId = correlationId;
  
  // Trả ngược lại header cho Client để phục vụ việc phối hợp tra cứu vết khi có sự cố xảy ra
  res.setHeader('X-Correlation-ID', correlationId);
  
  next();
}

module.exports = correlationMiddleware;