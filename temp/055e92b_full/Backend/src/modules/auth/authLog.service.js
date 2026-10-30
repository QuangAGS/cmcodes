/**
 * PATH       : src/modules/auth/authLog.service.js
 * VERSION    : 22.2.0-ACCOUNT-LOCK
 * - PR-SEC: LOGIN lock theo user (mọi phone/email liên kết), không chỉ chuỗi đang gõ.
 */

const { basePrisma } = require('../../lib/prisma.js');
const { cleanInput } = require('../../shared/utils/slug.utils');

const LOCK_CONFIG = {
  MAX_ATTEMPTS: 5,
  WINDOW_MINUTES: 10,
  LOCK_DURATION_MINUTES: 10,
};

const DEFAULT_ACTION_TYPE = 'LOGIN';

/**
 * Resolve mọi identifier đăng nhập của cùng một user.
 * Không có user → chỉ trả identifier gốc.
 */
async function resolveLinkedIdentifiers(identifier) {
  const raw = String(identifier || '').trim();
  if (!raw || raw === 'unknown') return [raw || 'unknown'];

  const keys = new Set([raw]);

  let phone = null;
  let email = null;
  try {
    phone = cleanInput(raw, 'phone');
  } catch (_) {
    /* ignore */
  }
  try {
    email = cleanInput(raw, 'email');
  } catch (_) {
    /* ignore */
  }

  const or = [];
  if (phone) or.push({ phone });
  if (email) or.push({ email });
  // raw có thể đã là phone/email chuẩn
  or.push({ phone: raw }, { email: raw });

  try {
    const user = await basePrisma.users.findFirst({
      where: {
        deleted_at: null,
        OR: or,
      },
      select: { phone: true, email: true },
    });
    if (user?.phone) keys.add(String(user.phone).trim());
    if (user?.email) keys.add(String(user.email).trim());
  } catch (e) {
    console.error('[authLog][resolveLinkedIdentifiers]', e.message || e);
  }

  return [...keys].filter(Boolean);
}

async function bumpAttemptForKey(tx, {
  identifier,
  safeIp,
  action_type,
  tenMinsAgo,
}) {
  const existing = await tx.user_attempt_number.findUnique({
    where: {
      idx_user_attempt_action: {
        identifier,
        ip_address: safeIp,
        action_type,
      },
    },
  });

  const isWithinWindow = existing && existing.last_failed_at >= tenMinsAgo;

  if (isWithinWindow) {
    const updated = await tx.user_attempt_number.update({
      where: { id: existing.id },
      data: {
        attempt_count: { increment: 1 },
        last_failed_at: new Date(),
      },
    });
    return updated.attempt_count;
  }

  const createdOrUpdated = await tx.user_attempt_number.upsert({
    where: {
      idx_user_attempt_action: {
        identifier,
        ip_address: safeIp,
        action_type,
      },
    },
    update: { attempt_count: 1, last_failed_at: new Date() },
    create: {
      identifier,
      ip_address: safeIp,
      action_type,
      attempt_count: 1,
      last_failed_at: new Date(),
    },
  });
  return createdOrUpdated.attempt_count;
}

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
      action_type: inputActionType,
    } = data;

    const status =
      String(rawStatusInput || 'THAT_BAI').trim().toUpperCase() === 'THANH_CONG'
        ? 'THANH_CONG'
        : 'THAT_BAI';

    const action_type = String(
      inputActionType || DEFAULT_ACTION_TYPE
    )
      .trim()
      .toUpperCase();
    const safeIdentifier = String(identifier || 'unknown').trim();
    const safeIp = String(ip_address || '0.0.0.0').trim();

    console.log(
      `[authLogService] START logAttempt → identifier: ${safeIdentifier}, status: ${status}, action: ${action_type}`
    );

    try {
      // LOGIN: đồng bộ mọi alias; action khác: chỉ key gửi lên
      const linkedIds =
        action_type === DEFAULT_ACTION_TYPE
          ? await resolveLinkedIdentifiers(safeIdentifier)
          : [safeIdentifier];

      const result = await basePrisma.$transaction(async (tx) => {
        let currentAttemptCount = 0;
        const tenMinsAgo = new Date(
          Date.now() - LOCK_CONFIG.WINDOW_MINUTES * 60 * 1000
        );

        if (status === 'THAT_BAI') {
          let maxCount = 0;
          for (const idKey of linkedIds) {
            const count = await bumpAttemptForKey(tx, {
              identifier: idKey,
              safeIp,
              action_type,
              tenMinsAgo,
            });
            if (count > maxCount) maxCount = count;
          }
          currentAttemptCount = maxCount;
        } else {
          // Thành công → reset mọi alias (cùng IP + action)
          await tx.user_attempt_number.deleteMany({
            where: {
              identifier: { in: linkedIds },
              ip_address: safeIp,
              action_type,
            },
          });
          currentAttemptCount = 0;
        }

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
            created_at: new Date(),
          },
        });

        return { logEntry, currentAttemptCount };
      });

      console.log(
        `[authLogService] SUCCESS → attempts = ${result.currentAttemptCount} | keys=${linkedIds.join(',')}`
      );
      return result.logEntry;
    } catch (err) {
      console.error('[authLogService] ❌ LỖI logAttempt:', err.message);
      console.error(err.stack);
      return null;
    }
  },

  /**
   * Aggregate attempt_count trên mọi phone/email của cùng user (LOGIN).
   */
  getLockoutMetadata: async (identifier) => {
    const safeIdentifier = String(identifier || 'unknown').trim();
    const tenMinsAgo = new Date(
      Date.now() - LOCK_CONFIG.WINDOW_MINUTES * 60 * 1000
    );

    const linkedIds = await resolveLinkedIdentifiers(safeIdentifier);

    const records = await basePrisma.user_attempt_number.findMany({
      where: {
        identifier: { in: linkedIds },
        action_type: DEFAULT_ACTION_TYPE,
        last_failed_at: { gte: tenMinsAgo },
      },
    });

    const attemptCount = records.reduce(
      (max, r) => Math.max(max, r.attempt_count || 0),
      0
    );

    return {
      attemptCount,
      maxAttempts: LOCK_CONFIG.MAX_ATTEMPTS,
      remainingAttempts: Math.max(0, LOCK_CONFIG.MAX_ATTEMPTS - attemptCount),
      lockDurationMinutes: LOCK_CONFIG.LOCK_DURATION_MINUTES,
      linkedIdentifiers: linkedIds,
    };
  },

  checkLockStatus: async (identifier) => {
    const user = await basePrisma.users.findFirst({
      where: {
        OR: [{ email: identifier }, { phone: identifier }],
        deleted_at: null,
      },
    });
    return (
      user?.status === 'BI_KHOA' &&
      user.locked_until &&
      user.locked_until > new Date()
    );
  },

  getAll: async (limit = 1000) => {
    return await basePrisma.auth_logs.findMany({
      orderBy: { created_at: 'desc' },
      take: limit,
    });
  },

  getSuspiciousAttempts: async (ip, timeWindowMinutes = 30) => {
    const since = new Date(Date.now() - timeWindowMinutes * 60 * 1000);
    const attempts = await basePrisma.auth_logs.findMany({
      where: {
        ip_address: ip,
        created_at: { gte: since },
        status: 'THAT_BAI',
      },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        identifier: true,
        failure_reason: true,
        created_at: true,
        user_agent: true,
      },
    });

    const summary = {
      total: attempts.length,
      honeypot: attempts.filter((a) =>
        a.failure_reason?.includes('HONEYPOT')
      ).length,
      turnstile: attempts.filter((a) =>
        a.failure_reason?.includes('TURNSTILE')
      ).length,
      wrong_password: attempts.filter(
        (a) =>
          a.failure_reason === 'WRONG_PASSWORD' ||
          a.failure_reason === 'INVALID_AUTH'
      ).length,
      latestAttempt: attempts[0]?.created_at || null,
    };

    return {
      ip,
      timeWindowMinutes,
      attempts,
      summary,
      isSuspicious:
        summary.total >= 5 ||
        summary.honeypot >= 2 ||
        summary.turnstile >= 3,
    };
  },
};

module.exports = authLogService;