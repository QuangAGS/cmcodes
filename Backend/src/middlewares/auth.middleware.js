/**
 * PATH       : backend/src/middlewares/authMiddleware.js
 * DATETIME   : 2026-06-18T16:10:00+07:00
 * VERSION    : 20.1.0-AUTH-CONTEXT-STABLE
 * DESCRIPTION: 
 * - Lớp xác thực thực thể người dùng toàn cục (Authentication Base Layer).
 * - Trích xuất Token, giải mã và nạp cấu trúc định danh (`req.user`) bao gồm cả trạng thái vòng đời (`status`).
 * - Kích hoạt `tenantContext` (AsyncLocalStorage) cô lập dữ liệu theo từng dòng họ.
 * - Q1-Bảo tồn: Giữ nguyên vẹn hàm `verifyToken`, `checkRole` cũ để tránh ảnh hưởng các route dùng authMiddleware cũ.
 * - Q2-Code Format: Tuân thủ đầy đủ cấu trúc định dạng tài liệu hệ thống và ghi chú học tập chi tiết.
 */

const jwt = require('jsonwebtoken');
// Import tenantContext để kích hoạt luồng cách ly dữ liệu nhiều dòng họ (Multi-tenancy)
const { tenantContext } = require('../lib/prisma'); 

/**
 * @dateTime 2026-06-18T16:12:00+07:00
 * @description Middleware kiểm tra chữ ký số của Token và khởi tạo ngữ cảnh an toàn cho Request.
 * @param {Object} req - Request object từ Express
 * @param {Object} res - Response object từ Express
 * @param {Function} next - Hàm callback chuyển tiếp sang middleware kế tiếp
 */
const verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    // Cấu trúc chuẩn Bearer Token: "Bearer <chuỗi_token>" -> Tách mảng lấy phần tử thứ 2
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: "Thiếu token xác thực. Vui lòng đăng nhập." });
    }

    try {
        // Ép buộc kiểm tra cấu hình môi trường, bảo vệ hệ thống không dùng khóa mặc định hở mạch
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            throw new Error('JWT_SECRET is not defined in environment variables. Please check your .env file.');
        }

        // Thực hiện giải mã Token bằng thư viện jsonwebtoken
        const decoded = jwt.verify(token, secret);

        /**
         * 💡 CHÚ THÍCH HỌC TẬP:
         * Ta chủ động đóng gói cả trường `decoded.status` vào `req.user`.
         * Điều này giúp các middleware phân quyền phía sau (hoặc controller) dễ dàng kiểm tra 
         * trạng thái tài khoản là 'CHO_DUYET', 'DA_DUYET' hay 'BI_KHOA' mà không cần truy vấn lại DB.
         */
        const userData = {
            userId: decoded.userId,
            email: decoded.email,
            role: decoded.role,
            tenantId: decoded.tenantId,
            status: decoded.status // Đã tích hợp phục vụ bài toán chặn rò rỉ trạng thái
        };

        // Gán vào req để Lớp Điều phối (Controller) và các Middleware sau sử dụng
        req.user = userData;

        // Kiểm tra ràng buộc Tenant (Trừ SYSTEM_ADMIN tối cao quản trị toàn sàn)
        if (userData.role !== 'SYSTEM_ADMIN' && !userData.tenantId) {
            return res.status(403).json({ error: "Lỗi bảo mật: Token không xác định được dòng họ." });
        }

        /**
         * KÍCH HOẠT CONTEXT (Luồng số 1 trong kiến trúc)
         * Sử dụng AsyncLocalStorage để mọi truy vấn Prisma phía sau trong cùng request này
         * tự động nhận diện tenantId mà không cần truyền tham số thủ công.
         */
        tenantContext.run({ tenantId: userData.tenantId }, next);

    } catch (error) {
        console.error('JWT Verify Error:', error.message);
        return res.status(403).json({ error: "Phiên làm việc hết hạn hoặc Token không hợp lệ." });
    }
};

/**
 * @dateTime 2026-04-27T16:15:00+07:00
 * @description LỚP Phân quyền cũ bên trong authMiddleware. Giữ nguyên vẹn 100% để bảo tồn (Q1)
 */
const checkRole = (allowedRoles) => {
    return (req, res, next) => {
        const { role } = req.user;

        if (role === 'SYSTEM_ADMIN') return next();

        if (Array.isArray(allowedRoles) ? allowedRoles.includes(role) : allowedRoles === role) {
            return next();
        }

        return res.status(403).json({ 
            error: `Quyền truy cập bị từ chối.` 
        });
    };
};

module.exports = {
    verifyToken,
    checkRole
};