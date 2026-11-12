/**
 * PATH       : src/modules/auth/auth.controller.js
 * DATETIME   : 2026-11-12T11:30:00+07:00
 * VERSION    : 23.7.0-MULTIHOME-AMEND02-V15-LAT0
 * DESCRIPTION:
 * - [AMEND-RP-OP-2026-02 V1.2] Lát 1/7 Multi-Home Controller hoàn chỉnh:
 *   + getAvailableClans: Gọi authService.getAvailableClans(userId).
 *   + switchContext: Truyền req.headers.authorization làm tham số thứ 3 vào authService.switchContext
 *     để thực thi resolveSwitchExpiresIn, kế thừa chính xác exp token gốc (trần 12h, chống kéo dài vô hạn).
 * - 23.4.0 - MULTIHOME - PHASE2-[SEC-02]: Bổ sung API POST /api/auth/switch-context.
 * - [23.3.1-OP1a] Register: truyền correlationId vào extraData (CED / notifications).
 * - [23.3.0-W4] Turnstile theo TURNSTILE_REQUIRED; Q1 honeypot, Assert Order login.
 */

'use strict';

const authService = require('./auth.service');
const authLogService = require('./authLog.service');
const { validateTurnstile } = require('../../shared/utils/turnstile.utils');
const securityConfig = require('../../config/securityConfig');
const {
  isIPBlocked,
  blockIP,
  ipBlockList,
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
      const {
        turnstileToken,
        hp_field,
        isRevision,
        ...payload
      } = req.body;

      const ip = req.headers['cf-connecting-ip'] || req.ip || 'unknown';
      const userAgent = req.headers['user-agent'] || 'unknown';

      if (isIPBlocked(ip)) {
        const record = ipBlockList.get(ip);
        const minutesLeft = Math.ceil((record.blockedUntil - Date.now()) / 60000);
        return res.status(403).json({
          error: `IP của bạn đang bị tạm khóa. Vui lòng thử lại sau ${minutesLeft} phút.`,
        });
      }

      if (hp_field && hp_field.trim().length > 0) {
        blockIP(ip, securityConfig.HONEYPOT_BLOCK_MINUTES, 'HONEYPOT_DETECTED');
        await authLogService.logAttempt({
          identifier: payload.phone || payload.email || 'unknown',
          ip_address: ip,
          user_agent: userAgent,
          status: 'THAT_BAI',
          failure_reason: 'HONEYPOT_DETECTED',
        });
        return res.status(403).json({ error: 'Hành vi đáng ngờ. Vui lòng thử lại sau.' });
      }

      if (securityConfig.TURNSTILE_REQUIRED) {
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
            failure_reason: `TURNSTILE_FAILED_${turnstileResult.errors?.join(',') || 'unknown'}`,
          });
          return res.status(403).json({
            error: turnstileResult.message || 'CAPTCHA không hợp lệ. Vui lòng thử lại.',
          });
        }
      }

      const suspicious = await authLogService.getSuspiciousAttempts(
        ip,
        securityConfig.SUSPICIOUS_TIME_WINDOW_MINUTES
      );
      if (suspicious.attempts >= securityConfig.SUSPICIOUS_ATTEMPTS_THRESHOLD) {
        blockIP(ip, securityConfig.IP_BLOCK_MINUTES, 'REPEATED_SUSPICIOUS_ACTIVITY');
      }

      const extraData = {
        ip_address: ip,
        user_agent: userAgent,
        correlationId:
          req.correlationId ||
          req.headers['x-correlation-id'] ||
          null,
      };

      if (isRevision === true) {
        const result = await authService.submitRegistrationRevision(
          { ...payload, isRevision: true },
          extraData
        );
        return res.status(200).json({
          status: 'success',
          data: result,
          message:
            'Hồ sơ bổ sung đã được gửi lại và đang chờ Ban Quản trị xem xét.',
        });
      }

      const result = await authService.registerUser(payload, extraData);
      return res.status(201).json({
        status: 'success',
        data: result,
        message: 'Hồ sơ đăng ký đã được gửi thành công và đang chờ phê duyệt.',
      });
    } catch (error) {
      console.error('[Register Error]:', error);
      if (error.message === 'DENIED') {
        return res.status(403).json({
          status: 'error',
          code: error.code || 'DENIED',
          message: 'Không thể chỉnh sửa hồ sơ ở trạng thái hiện tại.',
        });
      }
      return res.status(error.status || 500).json({
        status: 'error',
        code: error.code || 'REGISTER_FAILED',
        message: error.message || 'Không thể hoàn tất đăng ký',
      });
    }
  },

  login: async (req, res) => {
    try {
      const { identifier, password, turnstileToken, hp_field } = req.body;
      const ip = req.headers['cf-connecting-ip'] || req.ip || 'unknown';
      const userAgent = req.headers['user-agent'] || 'unknown';

      const lockMetadata = await authLogService.getLockoutMetadata(identifier);
      const isLocked = await authLogService.checkLockStatus(identifier);

      if (isLocked || lockMetadata.attemptCount >= securityConfig.MAX_LOGIN_ATTEMPTS) {
        const minutesLeft = Math.ceil(securityConfig.LOCKOUT_MINUTES);
        return res.status(423).json({
          status: 'error',
          code: 'ACCOUNT_LOCKED',
          message: `Tài khoản tạm khóa do thử sai quá ${securityConfig.MAX_LOGIN_ATTEMPTS} lần. Vui lòng thử lại sau ${minutesLeft} phút.`,
          minutesLeft,
          remainingAttempts: 0,
          lockType: 'ATTEMPT_LIMIT',
        });
      }

      console.log('[login lock]', {
        identifier,
        attemptCount: lockMetadata.attemptCount,
        linked: lockMetadata.linkedIdentifiers,
      });

      if (isIPBlocked(ip)) {
        const record = ipBlockList.get(ip);
        const minutesLeft = Math.ceil((record.blockedUntil - Date.now()) / 60000);
        return res.status(403).json({
          error: `IP của bạn đang bị tạm khóa. Vui lòng thử lại sau ${minutesLeft} phút.`,
        });
      }

      if (hp_field && hp_field.trim().length > 0) {
        blockIP(ip, securityConfig.HONEYPOT_BLOCK_MINUTES, 'HONEYPOT_DETECTED');
        await authLogService.logAttempt({
          identifier: identifier || 'unknown',
          ip_address: ip,
          user_agent: userAgent,
          status: 'THAT_BAI',
          failure_reason: 'HONEYPOT_DETECTED',
        });
        return res.status(403).json({ error: 'Hành vi đáng ngờ.' });
      }

      if (securityConfig.TURNSTILE_REQUIRED) {
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
            failure_reason: `TURNSTILE_FAILED_${turnstileResult.errors?.join(',') || 'unknown'}`,
          });
          return res.status(403).json({ error: 'CAPTCHA không hợp lệ.' });
        }
      }

      const suspicious = await authLogService.getSuspiciousAttempts(
        ip,
        securityConfig.SUSPICIOUS_TIME_WINDOW_MINUTES
      );
      if (suspicious.summary.total >= securityConfig.SUSPICIOUS_ATTEMPTS_THRESHOLD) {
        blockIP(ip, securityConfig.IP_BLOCK_MINUTES, 'REPEATED_SUSPICIOUS_ACTIVITY');
      }

      const extraData = { ip_address: ip, user_agent: userAgent };
      const result = await authService.loginUser(identifier, password, extraData);

      await authLogService.logAttempt({
        identifier: identifier || result?.user?.email || result?.user?.phone || 'unknown',
        ip_address: ip,
        user_agent: userAgent,
        status: 'THANH_CONG',
        failure_reason: 'LOGIN_SUCCESS',
      });

      return res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      const ip = req.headers['cf-connecting-ip'] || req.ip || 'unknown';
      const userAgent = req.headers['user-agent'] || 'unknown';
      const errStatus = error.status || error.response?.status || 500;
      const errCode = error.code || '';
      const errMessage = error.message || '';

      if (
        errStatus === 401 ||
        errCode === 'INVALID_AUTH' ||
        errCode === 'INVALID_CREDENTIALS' ||
        errMessage.toLowerCase().includes('không chính xác')
      ) {
        await authLogService.logAttempt({
          identifier: req.body.identifier || 'unknown',
          ip_address: ip,
          user_agent: userAgent,
          status: 'THAT_BAI',
          failure_reason: 'WRONG_PASSWORD',
        });
        return res.status(401).json({
          status: 'error',
          code: 'INVALID_AUTH',
          message: 'Thông tin đăng nhập không chính xác.',
          remainingAttempts: error.metadata?.remainingAttempts || 0,
        });
      }

      if (errCode === 'ACCOUNT_CHO_DUYET') {
        await authLogService.logAttempt({
          identifier: req.body.identifier || 'unknown',
          ip_address: ip,
          user_agent: userAgent,
          status: 'THAT_BAI',
          failure_reason: 'LOGIN_REJECTED_ACCOUNT_CHO_DUYET',
        });
        return res.status(423).json({
          status: 'error',
          code: 'ACCOUNT_CHO_DUYET',
          message: error.message,
          reviewNote: error.reviewNote ?? null,
          canEdit: error.canEdit === true,
          caseStatus: error.caseStatus ?? null,
          caseId: error.caseId ?? null,
          caseMetadata: error.caseMetadata ?? null,
          tempSnapshot: error.tempSnapshot ?? null,
        });
      }

      if (
        errStatus === 423 ||
        errCode === 'TENANT_PENDING_ACTIVATION' ||
        errCode === 'TENANT_CHO_DUYET' ||
        errCode === 'ACCOUNT_LOCKED' ||
        errCode === 'ACCOUNT_BANNED' ||
        errMessage.includes('chờ Ban Quản trị') ||
        errMessage.includes('chờ Hệ thống Trung tâm')
      ) {
        await authLogService.logAttempt({
          identifier: req.body.identifier || 'unknown',
          ip_address: ip,
          user_agent: userAgent,
          status: 'THAT_BAI',
          failure_reason: `LOGIN_REJECTED_${errCode || 'PENDING_OR_LOCKED'}`,
        });
        return res.status(423).json({
          status: 'error',
          code: errCode || 'ACCOUNT_LOCKED',
          message: error.message,
          minutesLeft: error.minutesLeft || undefined,
          isPermanent: error.isPermanent || undefined,
          lockType: error.lockType || undefined,
          reasonCode: error.reasonCode || undefined,
        });
      }

      if (errCode === 'ACCOUNT_PERMANENTLY_REJECTED') {
        await authLogService.logAttempt({
          identifier: req.body.identifier || 'unknown',
          ip_address: ip,
          user_agent: userAgent,
          status: 'THAT_BAI',
          failure_reason: 'LOGIN_REJECTED_ACCOUNT_PERMANENTLY_REJECTED',
        });
        return res.status(403).json({
          status: 'error',
          code: 'ACCOUNT_PERMANENTLY_REJECTED',
          canEdit: false,
          message:
            error.message ||
            'Hồ sơ đăng ký của bạn đã bị từ chối vĩnh viễn và không thể nộp lại.',
        });
      }

      if (
        errStatus === 403 ||
        errCode === 'USER_REJECTED' ||
        errCode === 'ACCOUNT_DISABLED' ||
        errCode === 'TENANT_DISABLED' ||
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
          failure_reason: `LOGIN_REJECTED_STATUS_${errCode || 'DISABLED'}`,
        });
        return res.status(403).json({
          status: 'error',
          code: 'ACCOUNT_DISABLED',
          message:
            'Tài khoản bị Từ chối hoặc Tạm khoá hoặc Bị cấm. Xin vui lòng liên hệ với Quản trị viên để được hỗ trợ trực tiếp.',
        });
      }

      console.error('[Login Error]:', error);
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Lỗi server.',
      });
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
      timestamp: new Date().toISOString(),
    });
  },

  forgotPassword: async (req, res) => {
    try {
      const { identifier, turnstileToken, hp_field } = req.body;
      const ip = req.headers['cf-connecting-ip'] || req.ip || 'unknown';
      const userAgent = req.headers['user-agent'] || 'unknown';

      if (isIPBlocked(ip)) {
        const record = ipBlockList.get(ip);
        const minutesLeft = Math.ceil((record.blockedUntil - Date.now()) / 60000);
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

      if (securityConfig.TURNSTILE_REQUIRED) {
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
          message: 'Hành vi đáng ngờ. Vui lòng thử lại sau.',
        });
      }

      if (securityConfig.TURNSTILE_REQUIRED) {
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
          'verify-reset-code'
        );
        if (!turnstileResult.success) {
          return res.status(403).json({
            status: 'error',
            code: 'TURNSTILE_FAILED',
            message: 'Yêu cầu không hợp lệ',
          });
        }
      }

      const result = await authService.verifyResetCode(identifier, otp, {
        ip_address: ip,
        user_agent: userAgent,
      });
      return res.status(200).json({
        status: 'success',
        data: result,
        message: 'Mã xác nhận hợp lệ.',
      });
    } catch (error) {
      console.error('[VerifyResetCode Error]:', error);
      return res.status(error.status || 400).json({
        status: 'error',
        code: error.code || 'VERIFY_RESET_CODE_FAILED',
        message: error.message || 'Mã xác nhận không hợp lệ hoặc đã hết hạn.',
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
          message: 'Hành vi đáng ngờ. Vui lòng thử lại sau.',
        });
      }

      await authService.changePasswordAfterReset(identifier, resetToken, newPassword);
      return res.status(200).json({
        status: 'success',
        message: 'Mật khẩu đã được cập nhật thành công.',
      });
    } catch (error) {
      console.error('[ChangePasswordAfterReset Error]:', error);
      return res.status(error.status || 400).json({
        status: 'error',
        code: error.code || 'CHANGE_PASSWORD_AFTER_RESET_FAILED',
        message: error.message || 'Không thể đặt lại mật khẩu. Vui lòng thử lại.',
      });
    }
  },

  resetPassword: async (req, res) => {
    try {
      const { email, otp, newPassword } = req.body;
      await authService.resetPassword(email, otp, newPassword);
      res.status(200).json({
        status: 'success',
        message: 'Mật khẩu đã được cập nhật thành công.',
      });
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
          message: 'Không có quyền truy cập',
        });
      }

      const users = await authService.getPendingUsers(actorRole, actorTenantId);
      res.status(200).json({
        status: 'success',
        data: users,
        count: users.length,
        message: `Tìm thấy ${users.length} user chờ duyệt`,
      });
    } catch (error) {
      console.error('[getPendingUsers Error]:', error);
      res.status(500).json({
        status: 'error',
        message: error.message || 'Lỗi server khi lấy danh sách chờ duyệt',
      });
    }
  },

  processApproval: async (req, res) => {
    try {
      const { userId, newStatus, adminNote, isFinalRejection, targetMemberId } = req.body;
      const actorId = req.user.userId;
      const { role, tenantId: actorTenantId } = req.user;
      const correlationId = req.correlationId;

      if (!userId || !newStatus) {
        return res.status(400).json({
          status: 'error',
          message: 'Thiếu dữ liệu đầu vào bắt buộc.',
        });
      }

      const result = await authService.processUserApproval({
        userId,
        newStatus,
        adminNote,
        actorId,
        role,
        actorTenantId,
        actorStatus: req.user.status,
        correlation_id: correlationId,
        targetMemberId: targetMemberId || undefined,
        isFinalRejection:
          isFinalRejection === true ||
          isFinalRejection === 'true' ||
          isFinalRejection === 1,
      });

      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      console.error('[processApproval Error]:', error);
      if (error.message === 'DENIED') {
        return res.status(403).json({
          status: 'error',
          code: 'DENIED',
          message: 'Bạn không có quyền thao tác trên hồ sơ này.',
        });
      }
      if (error.status === 400 || error.status === 409) {
        return res.status(error.status).json({
          status: 'error',
          code: error.code || 'APPROVAL_VALIDATION_ERROR',
          message: error.message,
        });
      }
      res.status(error.status || 500).json({
        status: 'error',
        code: error.code || 'APPROVAL_FAILED',
        message: error.message || 'Lỗi xử lý phê duyệt đơn.',
      });
    }
  },

  returnForRevision: async (req, res) => {
    try {
      const { userId, adminNote } = req.body;
      const actorId = req.user.userId;
      const { role, tenantId: actorTenantId } = req.user;
      const correlationId = req.correlationId;

      if (!userId || !adminNote) {
        return res.status(400).json({
          status: 'error',
          message: 'Thiếu userId hoặc adminNote.',
        });
      }

      const result = await authService.returnForRevision({
        userId,
        adminNote,
        actorId,
        role,
        actorTenantId,
        actorStatus: req.user.status,
        correlation_id: correlationId,
      });

      return res.status(200).json({
        status: 'success',
        data: result,
        message: 'Đã yêu cầu bổ sung hồ sơ (trả về sửa).',
      });
    } catch (error) {
      console.error('[returnForRevision Error]:', error);
      if (error.message === 'DENIED') {
        return res.status(403).json({
          status: 'error',
          message: 'Bạn không có quyền thao tác trên hồ sơ này.',
        });
      }
      if (error.status === 400) {
        return res.status(400).json({
          status: 'error',
          message: error.message,
        });
      }
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Lỗi yêu cầu bổ sung hồ sơ.',
      });
    }
  },

  queryReviewableUsers: async (req, res) => {
    try {
      const filters = req.body || {};
      const actorRole = req.user?.role;
      const actorTenantId = req.user?.tenantId || req.user?.tenant_id;

      const rawResults = await authService.queryReviewableUsers(
        filters,
        actorRole,
        actorTenantId
      );
      const usersArray = Array.isArray(rawResults)
        ? rawResults
        : rawResults?.data || [];

      const aggregatedCollection = usersArray.map((user) => {
        if (!user) return user;
        const actualUser = user.userData || user;
        const snapshot = actualUser.temp_snapshot || user.temp_snapshot || {};
        const actualTenant = actualUser.tenant || user.tenant || null;
        const actualMember = actualUser.member_profile || user.member_profile || null;

        return {
          id: actualUser.id || user.id,
          name: actualUser.name || user.name || '',
          temp_full_name:
            snapshot.full_name || user.temp_full_name || actualUser.name || 'Thành viên chưa đặt tên',
          phone: actualUser.phone || user.phone || 'Chưa có số',
          email: actualUser.email || user.email || 'Chưa có email',
          status: actualUser.status || user.status || 'CHO_DUYET',
          role: actualUser.role || user.role || 'MEMBER',
          userData: { ...actualUser },
          tenantData: actualTenant
            ? {
                id: actualTenant.id,
                clan_name: actualTenant.name || 'Dòng họ chưa đặt tên',
                status: actualTenant.status || 'CHO_DUYET',
                ...actualTenant,
              }
            : null,
          memberData: actualMember
            ? {
                id: actualMember.id,
                branch_name:
                  actualMember.branch_name || snapshot.branch_name || 'Chi cành mặc định',
                generation: actualMember.generation || 1,
                ...actualMember,
              }
            : null,
          createdAt: actualUser.created_at || user.createdAt || new Date().toISOString(),
        };
      });

      return res.status(200).json({
        status: 'success',
        data: {
          data: aggregatedCollection,
          pagination: rawResults.pagination || {
            total_records: aggregatedCollection.length,
            current_page: 1,
            total_pages: 1,
          },
        },
      });
    } catch (error) {
      console.error('❌ [authController queryReviewableUsers Error]:', error);
      return res.status(400).json({ status: 'error', message: error.message });
    }
  },

  reopenRejectedUser: async (req, res) => {
    try {
      const { userId, adminNote } = req.body;
      const actorId = req.user.userId;
      const { role, tenantId: actorTenantId, status: actorStatus } = req.user;
      const correlationId = req.correlationId;

      if (!userId || !adminNote) {
        return res.status(400).json({
          status: 'error',
          message: 'Thiếu userId hoặc adminNote.',
        });
      }

      const result = await authService.reopenRejectedUser({
        userId,
        adminNote,
        actorId,
        role,
        actorTenantId,
        actorStatus: actorStatus || req.user.status,
        correlation_id: correlationId,
      });

      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      console.error('[reopenRejectedUser Error]:', error);

      if (error.code === 'FINAL_REJECTION') {
        return res.status(403).json({
          status: 'error',
          code: 'FINAL_REJECTION',
          message:
            error.message ||
            'Hồ sơ đã bị từ chối lần cuối. Không thể mở lại.',
        });
      }

      if (error.message === 'DENIED') {
        return res.status(403).json({
          status: 'error',
          message: 'Bạn không có quyền thao tác trên hồ sơ này.',
        });
      }

      if (error.status === 400) {
        return res.status(400).json({
          status: 'error',
          message: error.message,
        });
      }

      res.status(error.status || 500).json({
        status: 'error',
        message: error.message || 'Lỗi mở lại hồ sơ bị từ chối.',
      });
    }
  },

  getAvailableClans: async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.id || req.user?.sub;

      if (!userId) {
        return res.status(401).json({
          status: 'error',
          code: 'UNAUTHORIZED',
          message: 'Phiên làm việc không hợp lệ.',
        });
      }

      const result = await authService.getAvailableClans(userId);

      return res.status(200).json({
        status: 'success',
        data: result,
        message: 'Lấy danh sách dòng họ liên kết thành công.',
      });
    } catch (error) {
      console.error('[getAvailableClans Error]:', error);
      return res.status(error.status || 500).json({
        status: 'error',
        code: error.code || 'GET_AVAILABLE_CLANS_FAILED',
        message: error.message || 'Không thể lấy danh sách dòng họ.',
      });
    }
  },

  switchContext: async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.id;
      const { targetTenantId } = req.body;
      const authHeader = req.headers.authorization;

      if (!userId) {
        return res.status(401).json({
          status: 'error',
          code: 'UNAUTHORIZED',
          message: 'Phiên làm việc không hợp lệ.',
        });
      }

      // Truyền authHeader sang authService để kế thừa TTL exp của token cũ
      const result = await authService.switchContext(userId, targetTenantId, authHeader);

      return res.status(200).json({
        status: 'success',
        data: result,
        message: 'Chuyển đổi ngữ cảnh dòng họ thành công.',
      });
    } catch (error) {
      console.error('[switchContext Error]:', error);
      return res.status(error.status || 500).json({
        status: 'error',
        code: error.code || 'SWITCH_CONTEXT_FAILED',
        message: error.message || 'Không thể chuyển đổi dòng họ.',
      });
    }
  },
};

module.exports = authController;
