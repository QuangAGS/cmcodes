/**
 * PATH       : src/middlewares/ipBlock.middleware.js
 * DATETIME   : 2026-07-16T12:15:00+07:00
 * VERSION    : 21.6.1
 * DESCRIPTION: 
 * - Middleware quản lý IP Blocking
 * - Sử dụng securityConfig.js để lấy tham số (IP_BLOCK_MINUTES, HONEYPOT_BLOCK_MINUTES,...)
 * - Hỗ trợ debug bypass
 * - Bảo tồn toàn bộ logic cũ (Q1)
 * - Tuân thủ Q2
 */

const securityConfig = require('../config/securityConfig');

// In-memory IP Block List
const ipBlockList = new Map(); // IP → { blockedUntil, reason, count }

// <2026-05-07T14:45> Helper kiểm tra IP có bị block không
const isIPBlocked = (ip) => {
  const record = ipBlockList.get(ip);
  if (!record) return false;

  if (Date.now() > record.blockedUntil) {
    ipBlockList.delete(ip);
    return false;
  }
  return true;
};

// <2026-05-07T14:45> Helper block IP với thời gian từ config
const blockIP = (ip, minutes = null, reason = 'HONEYPOT_DETECTED') => {
  const blockMinutes = minutes || securityConfig.IP_BLOCK_MINUTES;
  const blockedUntil = Date.now() + (blockMinutes * 60 * 1000);
  const current = ipBlockList.get(ip) || { count: 0 };

  ipBlockList.set(ip, {
    blockedUntil,
    reason,
    count: current.count + 1
  });

  console.log(`[BLOCK IP] ${ip} bị block ${blockMinutes} phút. Lý do: ${reason}. Tổng ${current.count + 1} lần.`);
};

// <2026-05-07T14:45> Middleware chính
const ipBlockMiddleware = (req, res, next) => {
  const ip = req.headers['cf-connecting-ip'] || 
             req.headers['x-forwarded-for']?.split(',')[0] || 
             req.ip || 
             'unknown';

  // Bypass debug mode
  const isDebug = securityConfig.DEBUG_MODE;

  if (isDebug && req.path.includes('/debug/unblock-all')) {
    return next();
  }

  if (isIPBlocked(ip)) {
    const record = ipBlockList.get(ip);
    const minutesLeft = Math.ceil((record.blockedUntil - Date.now()) / 60000);

    return res.status(403).json({
      error: `IP của bạn đang bị tạm khóa do hành vi đáng ngờ. Vui lòng thử lại sau ${minutesLeft} phút.`,
      code: 'IP_BLOCKED',
      minutesLeft
    });
  }

  req.ipInfo = { ip, isBlocked: false };
  next();
};

// Export để controller và debug route sử dụng
module.exports = {
  ipBlockMiddleware,
  isIPBlocked,
  blockIP,
  ipBlockList
};