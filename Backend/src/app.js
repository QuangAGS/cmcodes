/**
 * PATH       : src/app.js
 * DATETIME   : 2026-07-20T21:17:00+07:00
 * VERSION    : 21.5.2
 * DESCRIPTION:
 * - Production Hardening: Security Headers & CORS.
 * - Patch Config Gateway:
 *   + Import securityConfig.
 *   + CORS origin đọc từ securityConfig.ALLOWED_ORIGINS.
 *   + Global Error Handler đọc NODE_ENV từ securityConfig.
 * - [21.5.2] Mount onboarding.routes (OPD v1.1.0 / Phase 1–3).
 *   + Thêm allowedHeaders: x-correlation-id.
 * - Bảo tồn toàn bộ logic cũ (Q1).
 * - Tuân thủ Q2.
 *
 * CHANGELOG:
 * - 21.5.1 (2026-07-16): Production Hardening + securityConfig gateway.
 * - 21.5.2 (2026-07-20): Add /api/onboarding + CORS header x-correlation-id.
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

const authRoutesRaw = require('./modules/auth/auth.routes');
const authRoutes = authRoutesRaw.default || authRoutesRaw;

const app = express();

// === SECURITY CONFIG - PRODUCTION READY ===
app.set('trust proxy', 1);

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

// Tenant Context
app.use(async (req, res, next) => {
  const slug = req.headers['x-tenant-slug'] || req.query.slug;

  if (!slug) return next();

  try {
    const tenant = await basePrisma.tenants.findUnique({
      where: { slug },
    });

    if (!tenant) {
      return res.status(404).json({
        error: 'Không tìm thấy dòng họ này.',
      });
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
    version: '21.5.2',
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

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('🔥 [SERVER ERROR]:', err.stack);

  res.status(500).json({
    error: 'Lỗi hệ thống nội bộ',
    message:
      securityConfig.NODE_ENV === 'production'
        ? 'Đã xảy ra lỗi'
        : err.message,
  });
});

module.exports = app;
