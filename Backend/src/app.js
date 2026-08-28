/**
 * PATH       : src/app.js
 * DATETIME   : 2026-07-22T09:30:00+07:00
 * VERSION    : 21.7.0-W2
 * DESCRIPTION:
 * - [21.7.0-W2] Wave 2 PR-W2-3: Early tenant 404 → next(err) dual-contract CED.
 * 
 * - Production Hardening: Security Headers & CORS.
 * - Patch Config Gateway:
 *   + Import securityConfig.
 *   + CORS origin đọc từ securityConfig.ALLOWED_ORIGINS.
 *   + Global Error Handler đọc NODE_ENV từ securityConfig.
 * - [21.5.2] Mount onboarding.routes (OPD v1.1.0 / Phase 1–3).
 *   + Thêm allowedHeaders: x-correlation-id.
 * - [21.6.0-W1] Wave 1 PR-2: Correlation FIRST + CED Global Error Handler.
 *   + Mount correlationMiddleware trước mọi middleware khác.
 *   + Thay handler 500 mù bằng createGlobalErrorHandler({ legacy: true }).
 * - Bảo tồn toàn bộ logic cũ (Q1).
 * - Tuân thủ Q2.
 *
 * CHANGELOG:
 * - 21.5.1 (2026-07-16): Production Hardening + securityConfig gateway.
 * - 21.5.2 (2026-07-20): Add /api/onboarding + CORS header x-correlation-id.
 * - 21.6.0-W1 (2026-07-22): Wave 1 PR-2 — Correlation FIRST + CED createGlobalErrorHandler({ legacy: true }).
 * - 21.6.0-W1 (2026-07-22): Correlation FIRST + CED Global Handler.
 * - 21.7.0-W2 (2026-07-25): Early tenant 404 dual-contract (PR-W2-3).
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const { basePrisma, tenantContext } = require('./lib/prisma.js');

// === PRODUCTION HARDENING: VALIDATE ENV ===
// const { validateEnv } = require('./config/validateEnv'); // đã được tích hợp vào securityConfig.js.
const securityConfig = require('./config/securityConfig');

// validateEnv(); // không sử dụng nữa.
// ==========================================

// === CED Kernel (Wave 0) ===
const { createGlobalErrorHandler } = require('./shared/errors');
const correlationMiddleware = require('./middlewares/correlation.middleware');

// IMPORT ROUTES & MIDDLEWARES
const branchRoutes = require('./modules/members/branch.routes');
const memberRoutes = require('./modules/members/member.routes');
const addressRoutes = require('./modules/interactions/address.routes');
const worshipRoutes = require('./modules/worship/worship.routes');
const tenantRoutes = require('./modules/tenants/tenant.routes');
const authLogRoutes = require('./modules/auth/authLog.routes');
const notificationRoutes = require('./modules/notifications/notification.routes');
const { loginRateLimiter } = require('./middlewares/rateLimit.middleware');
const achievementRoutes = require('./modules/tenants/achievement.routes');
const assetRoutes = require('./modules/finance/asset.routes');
const cemeteryRoutes = require('./modules/worship/cemetery.routes');
const graveRoutes = require('./modules/worship/grave.routes');
const eventRoutes = require('./modules/interactions/event.routes');
const fundRoutes = require('./modules/finance/fund.routes');
const fundTransactionRoutes = require('./modules/finance/fundTransaction.routes');
const suggestionRoutes = require('./modules/interactions/suggestion.routes');
const mediaRoutes = require('./modules/interactions/media.routes');

// [21.5.2] Onboarding module (EGAL-25.x OPD v1.1.0)
const onboardingRoutes = require('./modules/onboarding/onboarding.routes');
const profileRoutes = require('./modules/profile/profile.routes');

const authRoutesRaw = require('./modules/auth/auth.routes');
const authRoutes = authRoutesRaw.default || authRoutesRaw;

const app = express();

// === SECURITY CONFIG - PRODUCTION READY ===
app.set('trust proxy', 1);

// ─────────────────────────────────────────────────────────────
// [21.6.0-W1] CORRELATION FIRST (CED E5 + Master Plan W1)
// Phải đứng trước mọi middleware khác để mọi response lỗi đều có correlationId.
// ─────────────────────────────────────────────────────────────
app.use(correlationMiddleware);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // cần cho Turnstile
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    xFrameOptions: {
      action: 'deny',
    },
    hidePoweredBy: true,
  })
);

// CORS Production
app.use(
  cors({
    /**
     * <2026-05-13T00:00:00+07:00>
     * Config Gateway:
     * - ALLOWED_ORIGINS lấy từ .env qua securityConfig.
     * - Không hard-code domain tại app.js nữa.
     * <2026-07-20T21:17:00+07:00>
     * - Thêm x-correlation-id cho Onboarding traceability (OPD v1.1.0).
     */
    origin: securityConfig.ALLOWED_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-tenant-slug',
      'x-correlation-id',
    ],
  })
);

app.use(express.json());

// Public tenant resolve (pre-auth). Không phải authorization.
// Request đã login: verifyToken ghi đè ALS từ JWT (S0.1).
app.use(async (req, res, next) => {
  const slug = req.headers['x-tenant-slug'] || req.query.slug;

  if (!slug) return next();

  try {
    const tenant = await basePrisma.tenants.findUnique({
      where: { slug },
    });

        if (!tenant) {
          // [21.7.0-W2] PR-W2-3: Đưa vào Global Handler → dual-contract CED
          const err = new Error('Không tìm thấy dòng họ này.');
          err.code = 'TENANT_NOT_FOUND';
          err.statusCode = 404;
          err.isOperational = true;
          err.correlationId = req.correlationId;
          return next(err);
        }

    tenantContext.run({ tenantId: tenant.id }, () => next());
  } catch (err) {
    next(err);
  }
});

// ROUTES
app.get('/', (req, res) =>
  res.json({
    status: 'Online',
    app: securityConfig.APP_NAME,
    version: '21.6.0-W1',
    environment: securityConfig.NODE_ENV,
  })
);

if (typeof authRoutes === 'function') {
  app.use('/api/auth', authRoutes);
}

// Rate Limiting
app.use('/api/auth/login', loginRateLimiter);
app.use('/api/auth/register', loginRateLimiter);

// Các route khác giữ nguyên
app.use('/api/members', memberRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/worships', worshipRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/achievements', achievementRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/cemeteries', cemeteryRoutes);
app.use('/api/graves', graveRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/funds', fundRoutes);
app.use('/api/fund-transactions', fundTransactionRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/suggestions', suggestionRoutes);
app.use('/api/auth-logs', authLogRoutes);
app.use('/api/notifications', notificationRoutes);

// [21.5.2] Onboarding — EGAL-25.x OPD v1.1.0 (Phase 1–3)
// Prefix nhất quán với các module hiện tại (/api/members, /api/branches, ...)
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/me', profileRoutes);

// ─────────────────────────────────────────────────────────────
// [21.6.0-W1] 404 Catcher → chuyển thành AppError để đi vào Global Handler
// ─────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const err = new Error(`Cannot ${req.method} ${req.originalUrl}`);
  err.code = 'NOT_FOUND';
  err.statusCode = 404;
  err.isOperational = true;
  err.correlationId = req.correlationId;
  next(err);
});


// ─────────────────────────────────────────────────────────────
// [21.6.0-W1] CED Global Error Handler (legacy: true — dual-contract)
// Thay thế handler 500 mù trước đây.
// ─────────────────────────────────────────────────────────────
app.use(createGlobalErrorHandler({ legacy: true }));

module.exports = app;