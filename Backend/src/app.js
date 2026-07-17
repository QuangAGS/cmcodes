/**
 * PATH       : src/app.js
 * DATETIME   : 2026-05-13T00:00:00+07:00
 * VERSION    : 21.5.1
 * DESCRIPTION:
 * - Production Hardening: Security Headers & CORS.
 * - Patch Config Gateway:
 *   + Import securityConfig.
 *   + CORS origin đọc từ securityConfig.ALLOWED_ORIGINS.
 *   + Global Error Handler đọc NODE_ENV từ securityConfig.
 * - Bảo tồn toàn bộ logic cũ (Q1).
 * - Tuân thủ Q2.
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const { basePrisma, tenantContext } = require('./lib/prisma');

// === PRODUCTION HARDENING: VALIDATE ENV ===
// const { validateEnv } = require('./config/validateEnv'); // đã được tích hợp vào securityConfig.js.
const securityConfig = require('./config/securityConfig');

// validateEnv(); // không sử dụng nữa. 
// ==========================================

// IMPORT ROUTES & MIDDLEWARES
const branchRoutes = require('./routes/branchRoutes');
const memberRoutes = require('./routes/memberRoutes');
const addressRoutes = require('./routes/addressRoutes');
const worshipRoutes = require('./routes/worshipRoutes');
const tenantRoutes = require('./routes/tenantRoutes');
const authLogRoutes = require('./routes/authLogRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const { loginRateLimiter } = require('./middlewares/rateLimitMiddleware');
const achievementRoutes = require('./routes/achievementRoutes');
const assetRoutes = require('./routes/assetRoutes');
const cemeteryRoutes = require('./routes/cemeteryRoutes');
const graveRoutes = require('./routes/graveRoutes');
const eventRoutes = require('./routes/eventRoutes');
const fundRoutes = require('./routes/fundRoutes');
const fundTransactionRoutes = require('./routes/fundTransactionRoutes');
const suggestionRoutes = require('./routes/suggestionRoutes');
const mediaRoutes = require('./routes/mediaRoutes');

const authRoutesRaw = require('./routes/authRoutes');
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
     */
    origin: securityConfig.ALLOWED_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-tenant-slug'],
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
    version: '21.5.1',
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