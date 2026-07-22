/**
 * PATH       : src/middlewares/role.middleware.js
 * DATETIME   : 2026-07-22T10:05:00+07:00
 * VERSION    : 20.2.0-W1
 * MỤC ĐÍCH   : Phân quyền quản trị nghiệp vụ nâng cao (RBAC) kết hợp chốt chặn trạng thái an ninh.
 * DESCRIPTION:
 * - VÁ LỖ HỔNG LEO THANG ĐẶC QUYỀN (Privilege Escalation): Đảm bảo các tài khoản có vai trò Admin
 *   như `CLAN_ADMIN` nhưng trạng thái đang ở mức 'CHO_DUYET' tuyệt đối không thể thực thi API nghiệp vụ quản trị.
 * - [20.2.0-W1] Wave 1 PR-4: Thêm SYSTEM_ADMIN bypass + trở thành single source of truth.
 * - Q1-Bảo tồn: Giữ nguyên vẹn tên hàm `checkRole`, định dạng tham số rest (`...allowedRoles`), và cấu trúc phản hồi JSON cũ (`success: false`).
 * - Q2-Code Format: Tuân thủ cấu trúc định dạng chuẩn kèm chú thích giải trình cơ chế hoạt động.
 *
 * CHANGELOG:
 * - 20.1.0-SECURITY-STATUS-PATCH: Thêm check status DA_DUYET.
 * - 20.2.0-W1 (2026-07-22): SYSTEM_ADMIN bypass + single source (re-export từ auth.middleware).
 */

'use strict';

/**
 * @dateTime 2026-06-18T16:22:00+07:00
 * @description Hàm kiểm tra quyền hạn kết hợp rà soát trạng thái hoạt động chính thức của tài khoản.
 * @param {...string} allowedRoles - Danh sách các vai trò được phép truy cập (dạng mảng động)
 */
const checkRole = (...allowedRoles) => {
  return (req, res, next) => {
    // req.user bắt buộc phải được gán thành công từ authMiddleware.verifyToken chạy trước đó
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Không tìm thấy thông tin xác thực.',
      });
    }

    const { role, status } = req.user;

    // ────────────────────────────────────────────────
    // [20.2.0-W1] SYSTEM_ADMIN bypass toàn bộ check
    // ────────────────────────────────────────────────
    if (role === 'SYSTEM_ADMIN') {
      return next();
    }

    /**
     * 💡 CHÚ THÍCH HỌC TẬP (VÁ LỖ HỔNG AN NINH):
     * Tại phiên bản cũ, hệ thống chỉ lấy trường `role` ra so sánh với `allowedRoles`.
     * Do đó, một CLAN_ADMIN vừa đăng ký dòng họ mới, trạng thái dù vẫn là 'CHO_DUYET'
     * vẫn vượt rào gọi được API Admin.
     *
     * Giải pháp: Trích xuất thêm trường `status` từ `req.user`. Nếu `status !== 'DA_DUYET'`,
     * ta chặn đứng ngay lập tức tại đây và trả về mã lỗi 403 Forbidden.
     */
    if (status !== 'DA_DUYET') {
      return res.status(403).json({
        success: false,
        code: 'ADMIN_ACCOUNT_NOT_ACTIVATED',
        message: `Tài khoản quản trị của bác hiện tại đang ở trạng thái chờ duyệt [${status || 'CHO_DUYET'}]. Vui lòng chờ Ban quản trị cấp cao phê duyệt kích hoạt tài khoản trước khi truy cập.`,
      });
    }

    // Tiến hành kiểm tra xem vai trò hiện tại của user có nằm trong danh sách các quyền được phép không
    const hasRole = allowedRoles.includes(role);

    if (!hasRole) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền truy cập vào chức năng này.',
      });
    }

    // Thỏa mãn cả 2 điều kiện: Đã kích hoạt (DA_DUYET) VÀ Đúng vai trò quản trị -> Cho phép đi tiếp vào Controller
    next();
  };
};

module.exports = { checkRole };