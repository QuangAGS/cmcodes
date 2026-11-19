/**
 * ============================================================================
 * PATH       : src/services/logicRateLimiter.service.js
 * DATETIME   : 2026-11-19T14:00:00+07:00
 * VERSION    : 1.0.0-AMEND-RP-OP-2026-03-SPRINT3
 * DESCRIPTION:
 * - [AMEND-RP-OP-2026-03-BASELINE v7.0 - Sprint 3 / Task 3.1 - NFR-02]
 *   Logic-Tier Rate-Limiter nguyên tử trên Redis bằng Lua Script (INCR + EXPIRE)
 *   kèm 2 chế độ xử lý sự cố (Fallback Policy) khi Redis mất kết nối (down):
 *   1. PUBLIC_FAIL_CLOSED (Public Search):
 *      - Tuyệt đối không Fail-open khi Redis down.
 *      - Bắt buộc 100% request xác thực qua Cloudflare Turnstile (validateTurnstile).
 *   2. IN_APP_LRU_DEGRADE (In-App Search):
 *      - Hạ cấp mượt (graceful degradation) sang BoundedLRUCache trong bộ nhớ RAM.
 * ============================================================================
 * CHANGELOGS:
 * - 2026-11-19T14:00:00+07:00 (v1.0.0-AMEND-RP-OP-2026-03-SPRINT3):
 *   + Khởi tạo BoundedLRUCache, Lua script INCR+EXPIRE nguyên tử, LogicRateLimiterService
 *     và 2 Express middlewares createPublicSearchGuard, createInAppSearchGuard.
 * ============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

'use strict';

const { AppError } = require('../shared/errors');
const { validateTurnstile } = require('../shared/utils/turnstile.utils');

/**
 * Lua script đảm bảo tăng bộ đếm và đặt TTL nguyên tử trên Redis (tránh key mồ hôi không TTL).
 */
const ATOMIC_INCR_EXPIRE_LUA = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
end
return current
`;

/**
 * Bộ đệm LRU có giới hạn dung lượng (Bounded LRU Cache) sử dụng Map thứ tự chèn của V8.
 * Dùng cho cơ chế hạ cấp mượt (Graceful Degradation) của In-App Search khi Redis down.
 */
class BoundedLRUCache {
  /**
   * @param {object} [options]
   * @param {number} [options.maxEntries=5000]
   */
  constructor({ maxEntries = 5000 } = {}) {
    this.maxEntries = Math.max(100, Number(maxEntries) || 5000);
    this.store = new Map();
  }

  /**
   * Tăng bộ đếm theo key trong cửa sổ windowSeconds.
   *
   * @param {string} key
   * @param {number} windowSeconds
   * @returns {number}
   */
  increment(key, windowSeconds) {
    const now = Date.now();
    const existing = this.store.get(key);

    if (existing && existing.expiresAt > now) {
      // Làm mới vị trí LRU bằng cách xóa và chèn lại cuối Map
      this.store.delete(key);
      existing.count += 1;
      this.store.set(key, existing);
      return existing.count;
    }

    if (existing) {
      this.store.delete(key);
    }

    // Đẩy phần tử ít dùng nhất (đầu Map) nếu vượt quá maxEntries
    if (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      }
    }

    const entry = {
      count: 1,
      expiresAt: now + windowSeconds * 1000,
    };
    this.store.set(key, entry);
    return 1;
  }

  clear() {
    this.store.clear();
  }
}

class LogicRateLimiterService {
  /**
   * @param {object} [options]
   * @param {object|null} [options.redisClient=null] - Client Redis hỗ trợ eval(script, 1, key, ttl)
   * @param {Function} [options.turnstileVerifier=validateTurnstile]
   * @param {BoundedLRUCache} [options.lruCache]
   */
  constructor({
    redisClient = null,
    turnstileVerifier = validateTurnstile,
    lruCache = new BoundedLRUCache({ maxEntries: 5000 }),
  } = {}) {
    this.redisClient = redisClient;
    this.turnstileVerifier = turnstileVerifier;
    this.lruCache = lruCache;
  }

  /**
   * Cho phép tiêm/thay thế Redis client động (dùng khi khởi tạo kết nối hoặc trong kiểm thử).
   *
   * @param {object|null} client
   */
  setRedisClient(client) {
    this.redisClient = client;
  }

  /**
   * Thực thi Lua script đếm nguyên tử trên Redis; trả về null nếu Redis down hoặc chưa cấu hình.
   *
   * @param {string} key
   * @param {number} windowSeconds
   * @returns {Promise<number|null>}
   */
  async _incrementRedisAtomic(key, windowSeconds) {
    if (!this.redisClient || typeof this.redisClient.eval !== 'function') {
      return null;
    }
    try {
      const raw = await this.redisClient.eval(
        ATOMIC_INCR_EXPIRE_LUA,
        1,
        key,
        String(windowSeconds)
      );
      const count = Number(raw);
      return Number.isFinite(count) ? count : null;
    } catch (_) {
      // Redis mất kết nối / timeout -> trả null để kích hoạt chính sách fallback tương ứng
      return null;
    }
  }

  /**
   * [NFR-02] Kiểm tra giới hạn tần suất cho Public Search:
   * - Khi Redis hoạt động: đếm nguyên tử bằng Lua script; vượt ngưỡng -> HTTP 429.
   * - Khi Redis down: FAIL-CLOSED — bắt buộc 100% request xác thực qua Cloudflare Turnstile.
   *
   * @param {object} params
   * @param {string} params.bucket
   * @param {string} params.identifier
   * @param {number} params.maxRequests
   * @param {number} params.windowSeconds
   * @param {string|null} [params.turnstileToken=null]
   * @param {string|null} [params.clientIp=null]
   */
  async consumePublicSearch({
    bucket,
    identifier,
    maxRequests,
    windowSeconds,
    turnstileToken = null,
    clientIp = null,
  }) {
    const redisKey = `rl:public:${bucket}:${identifier}`;
    const redisCount = await this._incrementRedisAtomic(redisKey, windowSeconds);

    if (redisCount !== null) {
      if (redisCount > maxRequests) {
        throw new AppError(
          'PUBLIC_SEARCH_RATE_LIMITED',
          'Quá nhiều yêu cầu tìm kiếm công khai. Vui lòng thử lại sau ít phút.',
          { statusCode: 429, details: { bucket, maxRequests, windowSeconds } }
        );
      }
      return { allowed: true, backend: 'REDIS', count: redisCount };
    }

    // Redis down -> Fail-closed: bắt buộc 100% request qua Cloudflare Turnstile [NFR-02]
    const token = turnstileToken ? String(turnstileToken).trim() : '';
    if (!token) {
      throw new AppError(
        'TURNSTILE_REQUIRED',
        'Hệ thống yêu cầu xác thực bảo mật Turnstile cho tìm kiếm công khai.',
        { statusCode: 403, details: { fallbackMode: 'PUBLIC_FAIL_CLOSED' } }
      );
    }

    const verifyRes = await this.turnstileVerifier(token, clientIp, 'public_search');
    if (!verifyRes || verifyRes.success !== true) {
      throw new AppError(
        'TURNSTILE_FAILED',
        (verifyRes && verifyRes.message) || 'Xác thực Turnstile không hợp lệ.',
        { statusCode: 403, details: { fallbackMode: 'PUBLIC_FAIL_CLOSED' } }
      );
    }

    return { allowed: true, backend: 'TURNSTILE_FAIL_CLOSED', verified: true };
  }

  /**
   * [NFR-02] Kiểm tra giới hạn tần suất cho In-App Search:
   * - Khi Redis hoạt động: đếm nguyên tử bằng Lua script.
   * - Khi Redis down: hạ cấp mượt (graceful degradation) sang BoundedLRUCache in-memory.
   *
   * @param {object} params
   * @param {string} params.bucket
   * @param {string} params.identifier
   * @param {number} params.maxRequests
   * @param {number} params.windowSeconds
   */
  async consumeInAppSearch({
    bucket,
    identifier,
    maxRequests,
    windowSeconds,
  }) {
    const redisKey = `rl:inapp:${bucket}:${identifier}`;
    const redisCount = await this._incrementRedisAtomic(redisKey, windowSeconds);

    if (redisCount !== null) {
      if (redisCount > maxRequests) {
        throw new AppError(
          'IN_APP_SEARCH_RATE_LIMITED',
          'Bạn thao tác tìm kiếm quá nhanh. Vui lòng chờ giây lát rồi thử lại.',
          { statusCode: 429, details: { backend: 'REDIS', bucket } }
        );
      }
      return { allowed: true, backend: 'REDIS', count: redisCount };
    }

    // Redis down -> Graceful degradation sang BoundedLRUCache [NFR-02]
    const lruCount = this.lruCache.increment(redisKey, windowSeconds);
    if (lruCount > maxRequests) {
      throw new AppError(
        'IN_APP_SEARCH_RATE_LIMITED',
        'Bạn thao tác tìm kiếm quá nhanh. Vui lòng chờ giây lát rồi thử lại.',
        { statusCode: 429, details: { backend: 'LRU_CACHE', bucket } }
      );
    }

    return { allowed: true, backend: 'LRU_CACHE', count: lruCount };
  }
}

const logicRateLimiterService = new LogicRateLimiterService();

function extractClientIp(req) {
  let ip =
    req.headers['cf-connecting-ip'] ||
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.ip ||
    req.socket?.remoteAddress ||
    '127.0.0.1';
  if (ip === '::1' || ip === '::ffff:127.0.0.1' || ip === ':ffff:127.0.0.1') {
    ip = '127.0.0.1';
  }
  return String(ip);
}

/**
 * Express middleware bảo vệ Public Search [NFR-02].
 */
function createPublicSearchGuard({ bucket, maxRequests = 30, windowSeconds = 60 }) {
  return async (req, res, next) => {
    try {
      const clientIp = extractClientIp(req);
      const turnstileToken =
        req.headers['x-turnstile-token'] ||
        req.query?.turnstileToken ||
        req.body?.turnstileToken ||
        null;

      await logicRateLimiterService.consumePublicSearch({
        bucket,
        identifier: clientIp,
        maxRequests,
        windowSeconds,
        turnstileToken,
        clientIp,
      });
      return next();
    } catch (err) {
      return res.status(err.statusCode || 429).json({
        status: 'error',
        code: err.code || 'PUBLIC_SEARCH_BLOCKED',
        message: err.message,
      });
    }
  };
}

/**
 * Express middleware bảo vệ In-App Search (hạ cấp sang LRUCache khi Redis down) [NFR-02].
 */
function createInAppSearchGuard({
  bucket = 'member_search',
  maxRequests = 60,
  windowSeconds = 60,
  onlyWhenQueryPresent = false,
} = {}) {
  return async (req, res, next) => {
    try {
      if (onlyWhenQueryPresent) {
        const hasQuery = Boolean(
          String(req.query?.q || req.query?.search || req.query?.keyword || '').trim()
        );
        if (!hasQuery) return next();
      }

      const actorId = req.user?.userId || req.user?.id || extractClientIp(req);
      await logicRateLimiterService.consumeInAppSearch({
        bucket,
        identifier: String(actorId),
        maxRequests,
        windowSeconds,
      });
      return next();
    } catch (err) {
      return res.status(err.statusCode || 429).json({
        status: 'error',
        code: err.code || 'IN_APP_SEARCH_RATE_LIMITED',
        message: err.message,
      });
    }
  };
}

module.exports = {
  BoundedLRUCache,
  LogicRateLimiterService,
  logicRateLimiterService,
  createPublicSearchGuard,
  createInAppSearchGuard,
  ATOMIC_INCR_EXPIRE_LUA,
};
