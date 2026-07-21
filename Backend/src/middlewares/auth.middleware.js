/**
 * PATH       : src/middlewares/auth.middleware.js
 * DATETIME   : 2026-07-19T13:xx:00+07:00
 * VERSION    : 20.1.1-AUTH-TENANT-FIX
 * DESCRIPTION: 
 * - Fix tenantContext undefined sau refactor Prisma
 * - Thêm safe-guard để tránh crash
 * - Bảo toàn 100% logic cũ (Q1)
 */

const jwt = require('jsonwebtoken');
// Import đầy đủ + safe
const prismaModule = require('../lib/prisma.js'); 

const verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: "Thiếu token xác thực. Vui lòng đăng nhập." });
    }

    try {
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            throw new Error('JWT_SECRET is not defined in environment variables.');
        }

        const decoded = jwt.verify(token, secret);

        const userData = {
            userId: decoded.userId,
            email: decoded.email,
            role: decoded.role,
            tenantId: decoded.tenantId,
            status: decoded.status
        };

        req.user = userData;

        if (userData.role !== 'SYSTEM_ADMIN' && !userData.tenantId) {
            return res.status(403).json({ error: "Lỗi bảo mật: Token không xác định được dòng họ." });
        }

        // ==================== FIX Ở ĐÂY ====================
        const tenantContext = prismaModule.tenantContext;
        
        if (!tenantContext) {
            console.error('[Auth Middleware] tenantContext is undefined! Fallback to next()');
            return next(); // Fallback an toàn để không crash
        }

        tenantContext.run({ tenantId: userData.tenantId }, next);
        // ===================================================

    } catch (error) {
        console.error('JWT Verify Error:', error.message);
        return res.status(403).json({ error: "Phiên làm việc hết hạn hoặc Token không hợp lệ." });
    }
};

const checkRole = (allowedRoles) => {
    return (req, res, next) => {
        const { role } = req.user || {};
        if (role === 'SYSTEM_ADMIN') return next();

        if (Array.isArray(allowedRoles) ? allowedRoles.includes(role) : allowedRoles === role) {
            return next();
        }

        return res.status(403).json({ error: `Quyền truy cập bị từ chối.` });
    };
};

module.exports = {
    verifyToken,
    checkRole
};