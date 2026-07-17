/**
 * PATH       : src/services/authLogService.js
 * DATETIME   : 2026-06-22T21:15:00+07:00
 * VERSION    : 22.1.1-SPEED-OPTIMIZED
 * DESCRIPTION: 
 * - Dùng user_attempt_number với đúng unique constraint "idx_user_attempt_action"
 * - Transaction atomic + sliding window đúng
 * - Debug logging mạnh hơn để dễ trace lỗi
 * - Bảo toàn 100% Q1/Q2
 */

const { basePrisma } = require('../../lib/prisma');

const LOCK_CONFIG = {
  MAX_ATTEMPTS: 5,
  WINDOW_MINUTES: 10,
  LOCK_DURATION_MINUTES: 10
};

const DEFAULT_ACTION_TYPE = 'LOGIN';

const authLogService = {

  logAttempt: async (data) => {
    const {
      identifier,
      ip_address,
      user_agent,
      status: rawStatusInput,
      failure_reason = null,
      turnstileSuccess = false,
      turnstileErrorCode = null,
      turnstileAction = 'register',
      action_type: inputActionType
    } = data;

    const status = String(rawStatusInput || 'THAT_BAI').trim().toUpperCase() === 'THANH_CONG' 
      ? 'THANH_CONG' 
      : 'THAT_BAI';

    const action_type = String(inputActionType || DEFAULT_ACTION_TYPE).trim().toUpperCase();
    const safeIdentifier = String(identifier || 'unknown').trim();
    const safeIp = String(ip_address || '0.0.0.0').trim();

    console.log(`[authLogService] START logAttempt → identifier: ${safeIdentifier}, status: ${status}, action: ${action_type}`);

    try {
      const result = await basePrisma.$transaction(async (tx) => {
        let currentAttemptCount = 0;

        if (status === 'THAT_BAI') {
          const tenMinsAgo = new Date(Date.now() - LOCK_CONFIG.WINDOW_MINUTES * 60 * 1000);

          const existing = await tx.user_attempt_number.findUnique({
            where: {
              idx_user_attempt_action: {           // ← TÊN UNIQUE ĐÚNG NHƯ BẠN KHAI BÁO
                identifier: safeIdentifier,
                ip_address: safeIp,
                action_type
              }
            }
          });

          const isWithinWindow = existing && existing.last_failed_at >= tenMinsAgo;

          if (isWithinWindow) {
            const updated = await tx.user_attempt_number.update({
              where: { id: existing.id },
              data: { attempt_count: { increment: 1 }, last_failed_at: new Date() }
            });
            currentAttemptCount = updated.attempt_count;
          } else {
            const createdOrUpdated = await tx.user_attempt_number.upsert({
              where: {
                idx_user_attempt_action: {
                  identifier: safeIdentifier,
                  ip_address: safeIp,
                  action_type
                }
              },
              update: { attempt_count: 1, last_failed_at: new Date() },
              create: {
                identifier: safeIdentifier,
                ip_address: safeIp,
                action_type,
                attempt_count: 1,
                last_failed_at: new Date()
              }
            });
            currentAttemptCount = createdOrUpdated.attempt_count;
          }
        } else {
          // Thành công → reset
          await tx.user_attempt_number.deleteMany({
            where: {
              identifier: safeIdentifier,
              ip_address: safeIp,
              action_type
            }
          });
          currentAttemptCount = 0;
        }

        // Ghi log chính
        const logEntry = await tx.auth_logs.create({
          data: {
            identifier: safeIdentifier,
            ip_address: safeIp,
            user_agent: user_agent || 'unknown',
            status,
            failure_reason,
            turnstile_success: turnstileSuccess,
            turnstile_error_code: turnstileErrorCode,
            turnstile_action: turnstileAction,
            attempt_count: currentAttemptCount,
            created_at: new Date()
          }
        });

        return { logEntry, currentAttemptCount };
      });

      console.log(`[authLogService] SUCCESS → attempts = ${result.currentAttemptCount}`);
      return result.logEntry;

    } catch (err) {
      console.error('[authLogService] ❌ LỖI logAttempt:', err.message);
      console.error(err.stack);   // ← Quan trọng để debug
      return null;
    }
  },

  getLockoutMetadata: async (identifier) => {
    const safeIdentifier = String(identifier || 'unknown').trim();
    const tenMinsAgo = new Date(Date.now() - LOCK_CONFIG.WINDOW_MINUTES * 60 * 1000);

    const record = await basePrisma.user_attempt_number.findFirst({
      where: {
        identifier: safeIdentifier,
        action_type: DEFAULT_ACTION_TYPE,
        last_failed_at: { gte: tenMinsAgo }
      }
    });

    const attemptCount = record?.attempt_count || 0;

    return {
      attemptCount,
      maxAttempts: LOCK_CONFIG.MAX_ATTEMPTS,
      remainingAttempts: Math.max(0, LOCK_CONFIG.MAX_ATTEMPTS - attemptCount),
      lockDurationMinutes: LOCK_CONFIG.LOCK_DURATION_MINUTES
    };
  },

  // Các hàm khác giữ nguyên (checkLockStatus, getAll, getSuspiciousAttempts)...
  checkLockStatus: async (identifier) => {
    const user = await basePrisma.users.findFirst({
      where: { 
        OR: [{ email: identifier }, { phone: identifier }], 
        deleted_at: null 
      }
    });
    return user?.status === 'BI_KHOA' && user.locked_until && user.locked_until > new Date();
  },

  getAll: async (limit = 1000) => {
    return await basePrisma.auth_logs.findMany({
      orderBy: { created_at: 'desc' },
      take: limit
    });
  },

  getSuspiciousAttempts: async (ip, timeWindowMinutes = 30) => {
    const since = new Date(Date.now() - timeWindowMinutes * 60 * 1000);
    const attempts = await basePrisma.auth_logs.findMany({
      where: { ip_address: ip, created_at: { gte: since }, status: 'THAT_BAI' },
      orderBy: { created_at: 'desc' },
      select: { id: true, identifier: true, failure_reason: true, created_at: true, user_agent: true }
    });

    const summary = {
      total: attempts.length,
      honeypot: attempts.filter(a => a.failure_reason?.includes('HONEYPOT')).length,
      turnstile: attempts.filter(a => a.failure_reason?.includes('TURNSTILE')).length,
      wrong_password: attempts.filter(a => 
        a.failure_reason === 'WRONG_PASSWORD' || a.failure_reason === 'INVALID_AUTH'
      ).length,
      latestAttempt: attempts[0]?.created_at || null
    };

    return { ip, timeWindowMinutes, attempts, summary, isSuspicious: summary.total >= 5 || summary.honeypot >= 2 || summary.turnstile >= 3 };
  }
};

module.exports = authLogService;