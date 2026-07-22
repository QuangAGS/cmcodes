/**
 * PATH       : src/middlewares/auth.middleware.js
 * DATETIME   : 2026-07-22T10:05:00+07:00
 * VERSION    : 20.2.0-W1
 * DESCRIPTION: 
 * - Fix tenantContext undefined sau refactor Prisma
 * - Thêm safe-guard để tránh crash
 * - [20.2.0-W1] Wave 1 PR-3: Chuẩn hóa dual req.user fields (id + userId, tenant_id + tenantId)
 * - [20.2.0-W1] Wave 1 PR-4: checkRole re-export từ role.middleware (single source)
 * - Bảo toàn 100% logic cũ (Q1)
 *
 * CHANGELOG:
 * - 20.1.1-AUTH-TENANT-FIX: Fix tenantContext + safe-guard
 * - 20.2.0-W1 (2026-07-22): Dual fields + re-export checkRole từ role.middleware
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

        // ────────────────────────────────────────────────
        // [20.2.0-W1] Dual fields (Q1 backward + chuẩn hóa mới)
        // id / tenant_id = alias mới
        // userId / tenantId = giữ nguyên field cũ
        // ────────────────────────────────────────────────
        userData.id = userData.userId;
        userData.tenant_id = userData.tenantId;

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

// ────────────────────────────────────────────────
// [20.2.0-W1] Re-export checkRole từ role.middleware (single source of truth)
// ────────────────────────────────────────────────
const { checkRole } = require('./role.middleware');

module.exports = {
    verifyToken,
    checkRole
};