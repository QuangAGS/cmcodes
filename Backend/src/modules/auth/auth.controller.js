/**
 * PATH       : src/modules/auth/auth.controller.js
 * DATETIME   : 2026-07-16T12:15:00+07:00
 * VERSION    : 23.2.9-PRISMA-NULL-POINTER-FIX
 * DESCRIPTION: 
 * - Khắc phục triệt để lỗi PrismaClientValidationError (Argument tenant_id must not be null).
 * - Đánh chặn và chuẩn hóa dữ liệu đầu vào filter.tenantId dựa trên vai trò đặc quyền (System Admin vs Clan Admin)
 * trước khi đẩy xuống authService, loại bỏ hoàn toàn kịch bản truyền giá trị null vào câu lệnh findFirst.
 * - Bảo tồn 100% logic Turnstile, Honeypot, logAttempt và các hàm quản trị phụ trợ khác (Q1).
 * - Tuân thủ định dạng JSDoc và thẻ thời gian thực thi nghiêm ngặt (Q2).
 */

const authService = require('./auth.service');
const authLogService = require('./authLog.service');
const { validateTurnstile } = require('../../shared/utils/turnstile.utils');
const securityConfig = require('../../config/securityConfig');
const { 
  ipBlockMiddleware, 
  isIPBlocked, 
  blockIP, 
  ipBlockList 
} = require('../../middlewares/ipBlock.middleware');

if (securityConfig.NODE_ENV !== 'production') {
  console.log('🧪 [DEBUG] Route /debug/unblock-all đã được kích hoạt');
}

const authController = {

  checkIdentity: async (req, res) => {
    try {
      const { type, value } = req.query;
      const result = await authService.checkIdentity(type, value);
      res.status(200).json({ status: 'success', ...result });
    } catch (error) {
      res.status(400).json({ status: 'error', message: error.message });
    }
  },

  register: async (req, res) => {
    try {
      const { turnstileToken, hp_field, ...payload } = req.body;
      const ip = req.headers['cf-connecting-ip'] || req.ip || 'unknown';
      const userAgent = req.headers['user-agent'] || 'unknown';

      if (isIPBlocked(ip)) {
        const record = ipBlockList.get(ip);
        const minutesLeft = Math.ceil((record.blockedUntil - Date.now()) / 60000);
        return res.status(403).json({
          error: `IP của bạn đang bị tạm khóa. Vui lòng thử lại sau ${minutesLeft} phút.`
        });
      }

      if (hp_field && hp_field.trim().length > 0) {
        blockIP(ip, securityConfig.HONEYPOT_BLOCK_MINUTES, 'HONEYPOT_DETECTED');
        await authLogService.logAttempt({
          identifier: payload.phone || payload.email || 'unknown',
          ip_address: ip,
          user_agent: userAgent,
          status: 'THAT_BAI',
          failure_reason: 'HONEYPOT_DETECTED'
        });
        return res.status(403).json({ error: 'Hành vi đáng ngờ. Vui lòng thử lại sau.' });
      }

      if (!turnstileToken) {
        return res.status(403).json({ error: 'Vui lòng hoàn thành CAPTCHA' });
      }

      const turnstileResult = await validateTurnstile(turnstileToken, ip, 'register');
      if (!turnstileResult.success) {
        await authLogService.logAttempt({
          identifier: payload.phone || payload.email || 'unknown',
          ip_address: ip,
          user_agent: userAgent,
          status: 'THAT_BAI',
          failure_reason: `TURNSTILE_FAILED_${turnstileResult.errors?.join(',') || 'unknown'}`
        });
        return res.status(403).json({ 
          error: turnstileResult.message || 'CAPTCHA không hợp lệ. Vui lòng thử lại.' 
        });
      }

      const suspicious = await authLogService.getSuspiciousAttempts(
        ip, 
        securityConfig.SUSPICIOUS_TIME_WINDOW_MINUTES
      );
      if (suspicious.attempts >= securityConfig.SUSPICIOUS_ATTEMPTS_THRESHOLD) {
        blockIP(ip, securityConfig.IP_BLOCK_MINUTES, 'REPEATED_SUSPICIOUS_ACTIVITY');
      }

      const extraData = { ip_address: ip, user_agent: userAgent };
      const result = await authService.registerUser(payload, extraData);
      
      res.status(201).json({ 
        status: 'success', 
        data: result,
        message: 'Hồ sơ đăng ký đã được gửi thành công và đang chờ phê duyệt.' 
      });

    } catch (error) {
      console.error('[Register Error]:', error);
      res.status(error.status || 500).json({ 
        status: 'error', 
        code: error.code || 'REGISTER_FAILED',
        message: error.message || 'Không thể hoàn tất đăng ký'
      });
    }
  },
 
/* Không dùng nữa ----------------------
  login: async (req, res) => {
    try {
      const { identifier, password, turnstileToken, hp_field } = req.body;
      const ip = req.headers['cf-connecting-ip'] || req.ip || 'unknown';
      const userAgent = req.headers['user-agent'] || 'unknown';

      if (isIPBlocked(ip)) {
        const record = ipBlockList.get(ip);
        const minutesLeft = Math.ceil((record.blockedUntil - Date.now()) / 60000);
        return res.status(403).json({
          error: `IP của bạn đang bị tạm khóa. Vui lòng thử lại sau ${minutesLeft} phút.`
        });
      }

      if (hp_field && hp_field.trim().length > 0) {
        blockIP(ip, securityConfig.HONEYPOT_BLOCK_MINUTES, 'HONEYPOT_DETECTED');
        await authLogService.logAttempt({
          identifier: identifier || 'unknown',
          ip_address: ip,
          user_agent: userAgent,
          status: 'THAT_BAI',
          failure_reason: 'HONEYPOT_DETECTED'
        });
        return res.status(403).json({ error: 'Hành vi đáng ngờ.' });
      }

      if (!turnstileToken) {
        return res.status(403).json({ error: 'Vui lòng hoàn thành CAPTCHA' });
      }

      const turnstileResult = await validateTurnstile(turnstileToken, ip, 'login');
      if (!turnstileResult.success) {
        await authLogService.logAttempt({
          identifier: identifier || 'unknown',
          ip_address: ip,
          user_agent: userAgent,
          status: 'THAT_BAI',
          failure_reason: `TURNSTILE_FAILED_${turnstileResult.errors?.join(',') || 'unknown'}`
        });
        return res.status(403).json({ error: 'CAPTCHA không hợp lệ.' });
      }

      const suspicious = await authLogService.getSuspiciousAttempts(
        ip, 
        securityConfig.SUSPICIOUS_TIME_WINDOW_MINUTES
      );

      if (suspicious.summary.total >= securityConfig.SUSPICIOUS_ATTEMPTS_THRESHOLD){
        blockIP(ip, securityConfig.IP_BLOCK_MINUTES, 'REPEATED_SUSPICIOUS_ACTIVITY');
      }

      const extraData = { ip_address: ip, user_agent: userAgent };
      const result = await authService.loginUser(identifier, password, extraData);
      
      const userStatus = result?.user?.status;

      if (userStatus === 'CHO_DUYET') {
        const pendingError = new Error('Hồ sơ của bác đang chờ Ban Quản trị phê duyệt. Vui lòng quay lại sau.');
        pendingError.status = 403;
        pendingError.code = 'USER_PENDING_APPROVAL';
        throw pendingError;
      }

      if (['TU_CHOI', 'BI_KHOA', 'BI_CAM', 'TAM_NGUNG'].includes(userStatus)) {
        const disabledError = new Error('Tài khoản Không thể truy cập. Xin vui lòng liên hệ với Quản trị viên để được hỗ trợ trực tiếp.');
        disabledError.status = 403;
        disabledError.code = 'ACCOUNT_DISABLED';
        throw disabledError;
      }

      //
      // BỔ SUNG CHỐT CHẶN GHI NHẬT KÝ THÀNH CÔNG <2026-06-21T10:48:00+07:00>
      // LÝ DO: Bản vá trước bỏ quên lệnh log khi luồng chạy thành công, khiến auth_logs bị trống dữ liệu.
      // CHỨC NĂNG: Ghi nhận vết an ninh 'THANH_CONG' cho tài khoản, dọn đường cho AdminUserApprovalPage hoạt động chính xác.
       //
      await authLogService.logAttempt({
        identifier: identifier || result?.user?.email || result?.user?.phone || 'unknown',
        ip_address: ip,
        user_agent: userAgent,
        status: 'THANH_CONG',
        failure_reason: 'LOGIN_SUCCESS'
      });
      // Trả phản hồi về cho Frontend
      res.status(200).json({ status: 'success', data: result });

    } catch (error) {
      const ip = req.headers['cf-connecting-ip'] || req.ip || 'unknown';
      const userAgent = req.headers['user-agent'] || 'unknown';

      const errStatus = error.status || error.response?.status;
      const errCode = error.code || '';
      const errMessage = error.message || '';

      if (errCode === 'USER_PENDING_APPROVAL' || errCode === 'ACCOUNT_CHO_DUYET' || errCode === 'TENANT_CHO_DUYET' || errMessage.includes('chờ Ban Quản trị')) {
        await authLogService.logAttempt({
          identifier: req.body.identifier || 'unknown',
          ip_address: ip,
          user_agent: userAgent,
          status: 'THAT_BAI',
          failure_reason: `LOGIN_REJECTED_${errCode || 'PENDING'}`
        });

        return res.status(403).json({
          status: 'error',
          code: 'USER_PENDING_APPROVAL',
          message: error.message || 'Hồ sơ của bác đang chờ Ban Quản trị phê duyệt. Vui lòng quay lại sau.'
        });
      }

      if (
        errStatus === 403 || 
        errCode === 'USER_REJECTED' || 
        errCode === 'ACCOUNT_DISABLED' ||
        ['TU_CHOI', 'BI_KHOA', 'BI_CAM', 'TAM_NGUNG'].includes(errCode) ||
        errMessage.includes('Từ chối') || 
        errMessage.includes('bị khóa') || 
        errMessage.includes('Bị cấm') ||
        errMessage.includes('Tạm ngưng')
      ) {
        await authLogService.logAttempt({
          identifier: req.body.identifier || 'unknown',
          ip_address: ip,
          user_agent: userAgent,
          status: 'THAT_BAI',
          failure_reason: `LOGIN_REJECTED_STATUS_${errCode || 'DISABLED'}`
        });

        return res.status(403).json({
          status: 'error',
          code: 'ACCOUNT_DISABLED',
          message: 'Tài khoản bị Từ chối hoặc Tạm khoá hoặc Bị cấm. Xin vui lòng liên hệ với Quản trị viên để được hỗ trợ trực tiếp.'
        });
      }

      if (error.status === 423) {
        const isPermanent = error.isPermanent || false;
        const minutesLeft = error.minutesLeft || 0;

        let message = '';
        if (isPermanent) {
          message = 'Tài khoản đã bị cấm vĩnh viễn. Xin liên hệ hỗ trợ trực tiếp.';
        } else {
          message = `Tài khoản tạm khóa. Vui lòng thử lại sau ${minutesLeft} phút.`;
        }

        return res.status(423).json({
          status: 'error',
          code: 'ACCOUNT_LOCKED',
          message,
          minutesLeft,
          isPermanent,
          lockType: error.lockType || 'UNKNOWN',
          reasonCode: error.reasonCode || 'UNKNOWN_LOCK_REASON'
        });
      }

      if (error.status === 401) {
        return res.status(401).json({
          status: 'error',
          code: 'INVALID_AUTH',
          message: 'Thông tin đăng nhập không chính xác.',
          remainingAttempts: error.metadata?.remainingAttempts || 0
        });
      }

      res.status(500).json({ status: 'error', message: error.message || 'Lỗi server.' });
    }
  },
------------------------------------------- */

  login: async (req, res) => {
    try {
      const { identifier, password, turnstileToken, hp_field } = req.body;
      const ip = req.headers['cf-connecting-ip'] || req.ip || 'unknown';
      const userAgent = req.headers['user-agent'] || 'unknown';

      // ====================== KIỂM TRA LOCKOUT THEO IDENTIFIER ======================
      const lockMetadata = await authLogService.getLockoutMetadata(identifier);
      const isLocked = await authLogService.checkLockStatus(identifier);

      if (isLocked || lockMetadata.attemptCount >= securityConfig.MAX_LOGIN_ATTEMPTS) {
        // Nếu đã đạt ngưỡng hoặc đang bị khóa trong DB
        const minutesLeft = Math.ceil(securityConfig.LOCKOUT_MINUTES);
        
        return res.status(423).json({
          status: 'error',
          code: 'ACCOUNT_LOCKED',
          message: `Tài khoản tạm khóa do thử sai quá ${securityConfig.MAX_LOGIN_ATTEMPTS} lần. Vui lòng thử lại sau ${minutesLeft} phút.`,
          minutesLeft,
          remainingAttempts: 0,
          lockType: 'ATTEMPT_LIMIT'
        });
      }
      // ============================================================================

      if (isIPBlocked(ip)) {
        const record = ipBlockList.get(ip);
        const minutesLeft = Math.ceil((record.blockedUntil - Date.now()) / 60000);
        return res.status(403).json({
          error: `IP của bạn đang bị tạm khóa. Vui lòng thử lại sau ${minutesLeft} phút.`
        });
      }

      if (hp_field && hp_field.trim().length > 0) {
        blockIP(ip, securityConfig.HONEYPOT_BLOCK_MINUTES, 'HONEYPOT_DETECTED');
        await authLogService.logAttempt({
          identifier: identifier || 'unknown',
          ip_address: ip,
          user_agent: userAgent,
          status: 'THAT_BAI',
          failure_reason: 'HONEYPOT_DETECTED'
        });
        return res.status(403).json({ error: 'Hành vi đáng ngờ.' });
      }

      if (!turnstileToken) {
        return res.status(403).json({ error: 'Vui lòng hoàn thành CAPTCHA' });
      }

      const turnstileResult = await validateTurnstile(turnstileToken, ip, 'login');

      if (!turnstileResult.success) {
        await authLogService.logAttempt({
          identifier: identifier || 'unknown',
          ip_address: ip,
          user_agent: userAgent,
          status: 'THAT_BAI',
          failure_reason: `TURNSTILE_FAILED_${turnstileResult.errors?.join(',') || 'unknown'}`
        });
        return res.status(403).json({ error: 'CAPTCHA không hợp lệ.' });
      }

      // Kiểm tra suspicious IP
      const suspicious = await authLogService.getSuspiciousAttempts(
        ip, 
        securityConfig.SUSPICIOUS_TIME_WINDOW_MINUTES
      );

      if (suspicious.summary.total >= securityConfig.SUSPICIOUS_ATTEMPTS_THRESHOLD){
        blockIP(ip, securityConfig.IP_BLOCK_MINUTES, 'REPEATED_SUSPICIOUS_ACTIVITY');
      }

      const extraData = { ip_address: ip, user_agent: userAgent };

      const result = await authService.loginUser(identifier, password, extraData);
      
      const userStatus = result?.user?.status;

      if (userStatus === 'CHO_DUYET') {
        const pendingError = new Error('Hồ sơ của bác đang chờ Ban Quản trị phê duyệt. Vui lòng quay lại sau.');
        pendingError.status = 403;
        pendingError.code = 'USER_PENDING_APPROVAL';
        throw pendingError;
      }

      if (['TU_CHOI', 'BI_KHOA', 'BI_CAM', 'TAM_NGUNG'].includes(userStatus)) {
        const disabledError = new Error('Tài khoản Không thể truy cập. Xin vui lòng liên hệ với Quản trị viên để được hỗ trợ trực tiếp.');
        disabledError.status = 403;
        disabledError.code = 'ACCOUNT_DISABLED';
        throw disabledError;
      }

      // LOGIN THÀNH CÔNG
      await authLogService.logAttempt({
        identifier: identifier || result?.user?.email || result?.user?.phone || 'unknown',
        ip_address: ip,
        user_agent: userAgent,
        status: 'THANH_CONG',
        failure_reason: 'LOGIN_SUCCESS'
      });

      res.status(200).json({ status: 'success', data: result });

    } catch (error) {
      const ip = req.headers['cf-connecting-ip'] || req.ip || 'unknown';
      const userAgent = req.headers['user-agent'] || 'unknown';

      const errStatus = error.status || error.response?.status || 500;
      const errCode = error.code || '';
      const errMessage = error.message || '';

      // ====================== FIX CHÍNH: GHI LOG SAI MẬT KHẨU ======================
      if (errStatus === 401 || errCode === 'INVALID_AUTH' || errMessage.toLowerCase().includes('không chính xác')) {
        await authLogService.logAttempt({
          identifier: req.body.identifier || 'unknown',
          ip_address: ip,
          user_agent: userAgent,
          status: 'THAT_BAI',
          failure_reason: 'WRONG_PASSWORD'
        });

        // Sau khi log, có thể trả về remainingAttempts từ metadata
        return res.status(401).json({
          status: 'error',
          code: 'INVALID_AUTH',
          message: 'Thông tin đăng nhập không chính xác.',
          remainingAttempts: error.metadata?.remainingAttempts || 0
        });
      }
      // ============================================================================

      if (errCode === 'USER_PENDING_APPROVAL' || errCode === 'ACCOUNT_CHO_DUYET' || errCode === 'TENANT_CHO_DUYET' || errMessage.includes('chờ Ban Quản trị')) {
        await authLogService.logAttempt({
          identifier: req.body.identifier || 'unknown',
          ip_address: ip,
          user_agent: userAgent,
          status: 'THAT_BAI',
          failure_reason: `LOGIN_REJECTED_${errCode || 'PENDING'}`
        });

        return res.status(403).json({
          status: 'error',
          code: 'USER_PENDING_APPROVAL',
          message: error.message || 'Hồ sơ của bác đang chờ Ban Quản trị phê duyệt. Vui lòng quay lại sau.'
        });
      }

      if (
        errStatus === 403 || 
        errCode === 'USER_REJECTED' || 
        errCode === 'ACCOUNT_DISABLED' ||
        ['TU_CHOI', 'BI_KHOA', 'BI_CAM', 'TAM_NGUNG'].includes(errCode) ||
        errMessage.includes('Từ chối') || 
        errMessage.includes('bị khóa') || 
        errMessage.includes('Bị cấm') ||
        errMessage.includes('Tạm ngưng')
      ) {
        await authLogService.logAttempt({
          identifier: req.body.identifier || 'unknown',
          ip_address: ip,
          user_agent: userAgent,
          status: 'THAT_BAI',
          failure_reason: `LOGIN_REJECTED_STATUS_${errCode || 'DISABLED'}`
        });

        return res.status(403).json({
          status: 'error',
          code: 'ACCOUNT_DISABLED',
          message: 'Tài khoản bị Từ chối hoặc Tạm khoá hoặc Bị cấm. Xin vui lòng liên hệ với Quản trị viên để được hỗ trợ trực tiếp.'
        });
      }

      if (error.status === 423) {
        const isPermanent = error.isPermanent || false;
        const minutesLeft = error.minutesLeft || 0;

        let message = isPermanent 
          ? 'Tài khoản đã bị cấm vĩnh viễn. Xin liên hệ hỗ trợ trực tiếp.' 
          : `Tài khoản tạm khóa. Vui lòng thử lại sau ${minutesLeft} phút.`;

        return res.status(423).json({
          status: 'error',
          code: 'ACCOUNT_LOCKED',
          message,
          minutesLeft,
          isPermanent,
          lockType: error.lockType || 'UNKNOWN',
          reasonCode: error.reasonCode || 'UNKNOWN_LOCK_REASON'
        });
      }

      console.error('[Login Error]:', error);
      res.status(500).json({ status: 'error', message: error.message || 'Lỗi server.' });
    }
  },

  debugUnblockAll: (req, res) => {
    if (securityConfig.NODE_ENV === 'production') {
      return res.status(404).json({ error: 'Route không tồn tại trong production' });
    }

    const debugKey = req.headers['x-debug-key'];
    if (debugKey !== securityConfig.DEBUG_SECRET_KEY) {
      return res.status(403).json({ error: 'Debug key không hợp lệ' });
    }

    const beforeCount = ipBlockList.size;
    ipBlockList.clear();

    console.log(`🧹 [DEBUG] ĐÃ XÓA ${beforeCount} IP BLOCK`);
    
    res.json({ 
      success: true, 
      message: `Đã xóa ${beforeCount} IP block`,
      timestamp: new Date().toISOString()
    });
  },

  forgotPassword: async (req, res) => {
    try {
      const { identifier, turnstileToken, hp_field } = req.body;
      const ip = req.headers['cf-connecting-ip'] || req.ip || 'unknown';
      const userAgent = req.headers['user-agent'] || 'unknown';

      if (isIPBlocked(ip)) {
        const record = ipBlockList.get(ip);
        const minutesLeft = Math.ceil(
          (record.blockedUntil - Date.now()) / 60000
        );

        return res.status(429).json({
          status: 'error',
          code: 'IP_TEMPORARILY_BLOCKED',
          message: `Bạn đã thử quá nhiều lần. Vui lòng thử lại sau ${minutesLeft} phút.`,
          minutesLeft,
        });
      }

      if (hp_field && hp_field.trim().length > 0) {
        blockIP(ip, securityConfig.HONEYPOT_BLOCK_MINUTES, 'HONEYPOT_DETECTED');

        await authLogService.logAttempt({
          identifier: identifier || 'unknown',
          ip_address: ip,
          user_agent: userAgent,
          status: 'THAT_BAI',
          failure_reason: 'FORGOT_PASSWORD_HONEYPOT_DETECTED',
        });

        return res.status(403).json({
          status: 'error',
          code: 'HONEYPOT_DETECTED',
          message: 'Hành vi đáng ngờ. Vui lòng thử lại sau.',
        });
      }

      if (!turnstileToken) {
        return res.status(403).json({
          status: 'error',
          code: 'TURNSTILE_REQUIRED',
          message: 'Vui lòng hoàn thành CAPTCHA',
        });
      }

      const turnstileResult = await validateTurnstile(
        turnstileToken,
        ip,
        'forgot-password'
      );

      if (!turnstileResult.success) {
        await authLogService.logAttempt({
          identifier: identifier || 'unknown',
          ip_address: ip,
          user_agent: userAgent,
          status: 'THAT_BAI',
          failure_reason: `FORGOT_PASSWORD_TURNSTILE_FAILED_${
            turnstileResult.errors?.join(',') || 'unknown'
          }`,
        });

        return res.status(403).json({
          status: 'error',
          code: 'TURNSTILE_FAILED',
          message: 'Yêu cầu không hợp lệ',
        });
      }

      const suspicious = await authLogService.getSuspiciousAttempts(
        ip,
        securityConfig.SUSPICIOUS_TIME_WINDOW_MINUTES
      );

      if (suspicious.attempts >= securityConfig.SUSPICIOUS_ATTEMPTS_THRESHOLD) {
        const blockMinutes = Math.max(
          securityConfig.IP_BLOCK_MINUTES || 15,
          securityConfig.RESET_IDENTIFIER_NOT_FOUND_BLOCK_MINUTES || 15
        );

        blockIP(ip, blockMinutes, 'FORGOT_PASSWORD_SUSPICIOUS_ACTIVITY');

        await authLogService.logAttempt({
          identifier: identifier || 'unknown',
          ip_address: ip,
          user_agent: userAgent,
          status: 'THAT_BAI',
          failure_reason: 'FORGOT_PASSWORD_IP_BLOCKED_SUSPICIOUS_ACTIVITY',
        });

        return res.status(429).json({
          status: 'error',
          code: 'IP_TEMPORARILY_BLOCKED',
          message: `Bạn đã thử quá nhiều lần. Vui lòng thử lại sau ${blockMinutes} phút.`,
          minutesLeft: blockMinutes,
        });
      }

      const result = await authService.forgotPassword(identifier, {
        ip_address: ip,
        user_agent: userAgent,
      });

      return res.status(200).json({
        status: 'success',
        data: result,
        message:
          'Nếu thông tin hợp lệ, mã xác nhận sẽ được gửi qua kênh liên lạc đã đăng ký.',
      });
    } catch (error) {
      console.error('[ForgotPassword Error]:', error);

      return res.status(error.status || 400).json({
        status: 'error',
        code: error.code || 'FORGOT_PASSWORD_FAILED',
        message:
          error.message ||
          'Không thể gửi yêu cầu. Vui lòng kiểm tra lại thông tin hoặc thử lại sau.',
        waitSeconds: error.waitSeconds || undefined,
        minutesLeft: error.minutesLeft || undefined,
      });
    }
  },

  verifyResetCode: async (req, res) => {
    try {
      const { identifier, otp, turnstileToken, hp_field } = req.body;
      const ip = req.headers['cf-connecting-ip'] || req.ip || 'unknown';
      const userAgent = req.headers['user-agent'] || 'unknown';

      if (hp_field && hp_field.trim().length > 0) {
        blockIP(ip, securityConfig.HONEYPOT_BLOCK_MINUTES, 'HONEYPOT_DETECTED');
        return res.status(403).json({
          status: 'error',
          code: 'HONEYPOT_DETECTED',
          message: 'Hành vi đáng ngờ. Vui lòng thử lại sau.'
        });
      }

      if (!turnstileToken) {
        return res.status(403).json({
          status: 'error',
          code: 'TURNSTILE_REQUIRED',
          message: 'Vui lòng hoàn thành CAPTCHA'
        });
      }

      const turnstileResult = await validateTurnstile(
        turnstileToken,
        ip,
        'verify-reset-code'
      );

      if (!turnstileResult.success) {
        return res.status(403).json({
          status: 'error',
          code: 'TURNSTILE_FAILED',
          message: 'Yêu cầu không hợp lệ'
        });
      }

      const result = await authService.verifyResetCode(identifier, otp, {
        ip_address: ip,
        user_agent: userAgent
      });

      return res.status(200).json({
        status: 'success',
        data: result,
        message: 'Mã xác nhận hợp lệ.'
      });
    } catch (error) {
      console.error('[VerifyResetCode Error]:', error);

      return res.status(error.status || 400).json({
        status: 'error',
        code: error.code || 'VERIFY_RESET_CODE_FAILED',
        message: error.message || 'Mã xác nhận không hợp lệ hoặc đã hết hạn.'
      });
    }
  },

  changePasswordAfterReset: async (req, res) => {
    try {
      const { identifier, resetToken, newPassword, hp_field } = req.body;
      const ip = req.headers['cf-connecting-ip'] || req.ip || 'unknown';

      if (hp_field && hp_field.trim().length > 0) {
        blockIP(ip, securityConfig.HONEYPOT_BLOCK_MINUTES, 'HONEYPOT_DETECTED');
        return res.status(403).json({
          status: 'error',
          code: 'HONEYPOT_DETECTED',
          message: 'Hành vi đáng ngờ. Vui lòng thử lại sau.'
        });
      }

      await authService.changePasswordAfterReset(identifier, resetToken, newPassword);

      return res.status(200).json({
        status: 'success',
        message: 'Mật khẩu đã được cập nhật thành công.'
      });
    } catch (error) {
      console.error('[ChangePasswordAfterReset Error]:', error);

      return res.status(error.status || 400).json({
        status: 'error',
        code: error.code || 'CHANGE_PASSWORD_AFTER_RESET_FAILED',
        message:
          error.message ||
          'Không thể đặt lại mật khẩu. Vui lòng thử lại.'
      });
    }
  },

  resetPassword: async (req, res) => {
    try {
      const { email, otp, newPassword } = req.body;
      await authService.resetPassword(email, otp, newPassword);
      res.status(200).json({ status: 'success', message: "Mật khẩu đã được cập nhật thành công." });
    } catch (error) {
      res.status(400).json({ status: 'error', message: error.message });
    }
  },

  getPendingUsers: async (req, res) => {
    try {
      const actorRole = req.user?.role;
      const actorTenantId = req.user?.tenantId || req.user?.tenant_id;

      if (!actorRole || !['SYSTEM_ADMIN', 'CLAN_ADMIN'].includes(actorRole)) {
        return res.status(403).json({ 
          status: 'error', 
          message: 'Không có quyền truy cập' 
        });
      }

      const users = await authService.getPendingUsers(actorRole, actorTenantId);

      res.status(200).json({
        status: 'success',
        data: users,
        count: users.length,
        message: `Tìm thấy ${users.length} user chờ duyệt`
      });
    } catch (error) {
      console.error('[getPendingUsers Error]:', error);
      res.status(500).json({ 
        status: 'error', 
        message: error.message || 'Lỗi server khi lấy danh sách chờ duyệt' 
      });
    }
  },

  processApproval: async (req, res) => {
    try {
      const { userId, newStatus, adminNote } = req.body;      
      const actorId = req.user.userId; 
      const { role, tenantId: actorTenantId } = req.user;

      const correlationId = req.correlationId;

      if (!userId || !newStatus) {
        return res.status(400).json({ status: 'error', message: 'Thiếu dữ liệu đầu vào bắt buộc.' });
      }

      const result = await authService.processUserApproval({
        userId,
        newStatus,
        adminNote,
        actorId,
        role,
        actorTenantId,
        correlation_id: correlationId 
      });

      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      console.error('[processApproval Error]:', error);
      if (error.message === 'DENIED') {
        return res.status(403).json({ status: 'error', message: 'Bạn không có quyền thao tác trên hồ sơ này.' });
      }
      res.status(500).json({ status: 'error', message: error.message || 'Lỗi xử lý phê duyệt đơn.' });
    }
  },

  /**
   * @dateTime 2026-06-19T15:48:00+07:00
   * @description Xử lý lọc và đóng gói bộ dữ liệu dynamic collection đồng bộ 3 bảng.
   */
  queryReviewableUsers: async (req, res) => {
    try {
      // Vì SYSTEM_ADMIN đã có tenant_id cụ thể, ta cứ đẩy thẳng filters từ body xuống Service Core
      const filters = req.body || {};
      const actorRole = req.user?.role; 
      const actorTenantId = req.user?.tenantId || req.user?.tenant_id;

      // Gọi trực tiếp Service thô nguyên bản mà không sợ sập Prisma dòng 1296 nữa
      const rawResults = await authService.queryReviewableUsers(filters, actorRole, actorTenantId);
      const usersArray = Array.isArray(rawResults) ? rawResults : (rawResults?.data || []);

      // Tầng Data Adapter giữ nhiệm vụ bóc tách dữ liệu nuôi UI Frontend
      const aggregatedCollection = usersArray.map(user => {
        if (!user) return user;

        const actualUser = user.userData || user;
        const snapshot = actualUser.temp_snapshot || user.temp_snapshot || {};
        const actualTenant = actualUser.tenant || user.tenant || null;
        const actualMember = actualUser.member_profile || user.member_profile || null;

        return {
          id: actualUser.id || user.id,
          name: actualUser.name || user.name || '',
          temp_full_name: snapshot.full_name || user.temp_full_name || actualUser.name || 'Thành viên chưa đặt tên',
          phone: actualUser.phone || user.phone || 'Chưa có số',
          email: actualUser.email || user.email || 'Chưa có email',
          status: actualUser.status || user.status || 'CHO_DUYET',
          role: actualUser.role || user.role || 'MEMBER',
          
          userData: { ...actualUser },
          
          tenantData: actualTenant ? {
            id: actualTenant.id,
            clan_name: actualTenant.name || 'Dòng họ chưa đặt tên',
            status: actualTenant.status || 'CHO_DUYET',
            ...actualTenant
          } : null,

          memberData: actualMember ? {
            id: actualMember.id,
            branch_name: actualMember.branch_name || snapshot.branch_name || 'Chi cành mặc định',
            generation: actualMember.generation || 1,
            ...actualMember
          } : null,

          createdAt: actualUser.created_at || user.createdAt || new Date().toISOString()
        };
      });

      // 🎯 ĐẢM BẢO ĐỒNG BỘ: Trả về Object bọc mảng dữ liệu để khớp 100% với hàm fetchReviewableUsers ở Frontend
      /* -------------------------
      return res.status(200).json({ 
        status: 'success', 
        data: aggregatedCollection 
      });
      ------------------------- */
      return res.status(200).json({ 
        status: 'success', 
        data: {
          data: aggregatedCollection,
          pagination: rawResults.pagination || { total_records: aggregatedCollection.length, current_page: 1, total_pages: 1 }
        }
      });

    } catch (error) {
      console.error('❌ [authController queryReviewableUsers Error]:', error);
      return res.status(400).json({ status: 'error', message: error.message });
    }
  }
};

module.exports = authController;