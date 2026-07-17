/**
 * PATH       : src/config/securityConfig.js
 * DATETIME   : 2026-07-16T11:15:20+07:00
 * VERSION    : 22.3.0-CONSOLIDATED
 * DESCRIPTION:
 * - Centralized Configuration & Validation Gateway.
 * - HỢP NHẤT HOÀN TOÀN: Nuốt trọn file validateEnv.js cũ để tránh dư thừa mã nguồn Tức là bỏ validateEnv.js).
 * - QUY TẮC Q1: Bảo tồn hoàn toàn 100% logic nạp biến, các helper check kiểu và thuộc tính cũ.
 * - QUY TẮC Q2: Đồng bộ hóa Documentation Header chuẩn hệ thống.
 * - NÂNG CẤP BẢO MẬT: 
 *   + [Nguyên tắc 1]: Sử dụng Zod để Validate cấu hình sau nạp (Fail-Fast), kiểm tra độ mạnh JWT (>=32 chars).
 *   + [Nguyên tắc 2]: Thực thi đóng băng Object (Object.freeze) ngăn chặn đột biến runtime.
 */

const z = require('zod');

// =========================================================
// HELPERS (Bảo tồn 100% logic cũ - Q1)
// =========================================================
const intEnv = (key, fallback) => {
  const value = Number(process.env[key]);

  return Number.isFinite(value) && value > 0
    ? value
    : fallback;
};

const boolEnv = (key, fallback = false) => {
  const value = process.env[key];

  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  return String(value).toLowerCase() === 'true';
};

const stringEnv = (key, fallback = '') => {
  const value = process.env[key];

  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  return String(value);
};

const arrayEnv = (key, fallback = []) => {
  const value = process.env[key];

  if (!value || typeof value !== 'string') {
    return fallback;
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

// =========================================================
// RAW CONFIGURATION MAP (Nạp và normalize dữ liệu cũ - Q1)
// =========================================================
const rawConfig = {
  // DATABASE (Hấp thụ từ validateEnv)
  DATABASE_URL: stringEnv('DATABASE_URL'),

  // APPLICATION
  APP_NAME: stringEnv('APP_NAME', 'MyClan'),
  APP_DISPLAY_NAME: stringEnv('APP_DISPLAY_NAME', 'MyClan'),
  BACKEND_PUBLIC_URL: stringEnv('BACKEND_PUBLIC_URL', 'http://localhost:10000'),

  // FRONTEND / CORS
  FRONTEND_URL: stringEnv('FRONTEND_URL', 'http://localhost:5173'),
  ALLOWED_ORIGINS: arrayEnv('ALLOWED_ORIGINS', ['http://localhost:5173']),

  // SECURITY KEY
  JWT_SECRET: stringEnv('JWT_SECRET'),
  DEBUG_SECRET_KEY: stringEnv('DEBUG_SECRET_KEY'),
  TURNSTILE_SECRET_KEY: stringEnv('TURNSTILE_SECRET_KEY'),
  TURNSTILE_REQUIRED: boolEnv('TURNSTILE_REQUIRED', true),

  // ACCOUNT LOCKOUT
  MAX_LOGIN_ATTEMPTS: intEnv('MAX_LOGIN_ATTEMPTS', 5),
  LOCKOUT_MINUTES: intEnv('LOCKOUT_MINUTES', 10),

  // IP BLOCKING / ANTI-BOT
  IP_BLOCK_MINUTES: intEnv('IP_BLOCK_MINUTES', 30),
  HONEYPOT_BLOCK_MINUTES: intEnv('HONEYPOT_BLOCK_MINUTES', 30),
  SUSPICIOUS_ATTEMPTS_THRESHOLD: intEnv('SUSPICIOUS_ATTEMPTS_THRESHOLD', 8),
  SUSPICIOUS_TIME_WINDOW_MINUTES: intEnv('SUSPICIOUS_TIME_WINDOW_MINUTES', 30),

  // FORGOT PASSWORD SECURITY
  RESET_IDENTIFIER_NOT_FOUND_MAX_ATTEMPTS: intEnv('RESET_IDENTIFIER_NOT_FOUND_MAX_ATTEMPTS', 5),
  RESET_IDENTIFIER_NOT_FOUND_WINDOW_MINUTES: intEnv('RESET_IDENTIFIER_NOT_FOUND_WINDOW_MINUTES', 15),
  RESET_IDENTIFIER_NOT_FOUND_BLOCK_MINUTES: intEnv('RESET_IDENTIFIER_NOT_FOUND_BLOCK_MINUTES', 15),
  RESET_OTP_EXPIRES_MINUTES: intEnv('RESET_OTP_EXPIRES_MINUTES', 10),
  RESET_OTP_RESEND_COOLDOWN_SECONDS: intEnv('RESET_OTP_RESEND_COOLDOWN_SECONDS', 60),
  RESET_OTP_MAX_REQUESTS_PER_WINDOW: intEnv('RESET_OTP_MAX_REQUESTS_PER_WINDOW', 5),
  RESET_OTP_REQUEST_WINDOW_MINUTES: intEnv('RESET_OTP_REQUEST_WINDOW_MINUTES', 15),
  RESET_OTP_MAX_VERIFY_ATTEMPTS: intEnv('RESET_OTP_MAX_VERIFY_ATTEMPTS', 5),
  RESET_OTP_LOCK_MINUTES: intEnv('RESET_OTP_LOCK_MINUTES', 15),
  RESET_TOKEN_EXPIRES_MINUTES: intEnv('RESET_TOKEN_EXPIRES_MINUTES', 15),

  // BREVO EMAIL SERVICE
  BREVO_API_KEY: stringEnv('BREVO_API_KEY'),
  BREVO_FROM_EMAIL: stringEnv('BREVO_FROM_EMAIL', 'noreply@myclan.com.vn'),
  BREVO_FROM_NAME: stringEnv('BREVO_FROM_NAME', 'Thông báo từ MyClan'),

  // ADMIN INITIAL SETUP
  ADMIN_EMAIL: stringEnv('ADMIN_EMAIL'),
  ADMIN_INITIAL_PASSWORD: stringEnv('ADMIN_INITIAL_PASSWORD'),
  ADMIN_SUPPORT_PHONE: stringEnv('ADMIN_SUPPORT_PHONE'),

  // SERVER
  PORT: intEnv('PORT', 10000),
  NODE_ENV: stringEnv('NODE_ENV', 'development'),

  // DEBUG / UAT
  DEBUG_MODE:
    boolEnv('DEBUG_MODE', false) ||
    boolEnv('VITE_DEBUG_MODE', false) ||
    process.env.NODE_ENV === 'development',
};

// =========================================================
// ZOD VALIDATION SCHEMA (FAIL-FAST)
// =========================================================
const securitySchema = z.object({
  // Kiểm tra kết nối DB bắt buộc
  DATABASE_URL: z.string().min(1, "DATABASE_URL là bắt buộc để kết nối cơ sở dữ liệu"),

  APP_NAME: z.string(),
  APP_DISPLAY_NAME: z.string(),
  BACKEND_PUBLIC_URL: z.string().url(),
  FRONTEND_URL: z.string().url(),
  ALLOWED_ORIGINS: z.array(z.string()),
  
  // JWT_SECRET phải có tối thiểu 32 ký tự để đảm bảo độ mạnh (Mã hóa SHA-256)
  JWT_SECRET: z.string()
    .min(1, "JWT_SECRET là bắt buộc và phải được định nghĩa trong file .env")
    .refine((val) => val.length >= 32, {
      message: "JWT_SECRET quá yếu! Yêu cầu tối thiểu phải đạt từ 32 ký tự trở lên để tránh brute-force."
    }),
    
  DEBUG_SECRET_KEY: z.string().optional(),
  TURNSTILE_SECRET_KEY: z.string().optional(),
  TURNSTILE_REQUIRED: z.boolean(),

  MAX_LOGIN_ATTEMPTS: z.number().positive(),
  LOCKOUT_MINUTES: z.number().positive(),
  IP_BLOCK_MINUTES: z.number().positive(),
  HONEYPOT_BLOCK_MINUTES: z.number().positive(),
  SUSPICIOUS_ATTEMPTS_THRESHOLD: z.number().positive(),
  SUSPICIOUS_TIME_WINDOW_MINUTES: z.number().positive(),

  RESET_IDENTIFIER_NOT_FOUND_MAX_ATTEMPTS: z.number().positive(),
  RESET_IDENTIFIER_NOT_FOUND_WINDOW_MINUTES: z.number().positive(),
  RESET_IDENTIFIER_NOT_FOUND_BLOCK_MINUTES: z.number().positive(),
  RESET_OTP_EXPIRES_MINUTES: z.number().positive(),
  RESET_OTP_RESEND_COOLDOWN_SECONDS: z.number().positive(),
  RESET_OTP_MAX_REQUESTS_PER_WINDOW: z.number().positive(),
  RESET_OTP_REQUEST_WINDOW_MINUTES: z.number().positive(),
  RESET_OTP_MAX_VERIFY_ATTEMPTS: z.number().positive(),
  RESET_OTP_LOCK_MINUTES: z.number().positive(),
  RESET_TOKEN_EXPIRES_MINUTES: z.number().positive(),

  BREVO_API_KEY: z.string().min(1, "BREVO_API_KEY là bắt buộc để gửi mã xác thực OTP"),
  BREVO_FROM_EMAIL: z.string().email(),
  BREVO_FROM_NAME: z.string(),

  ADMIN_EMAIL: z.string().email("ADMIN_EMAIL cấu hình ban đầu chưa đúng định dạng email").optional().or(z.literal('')),
  ADMIN_INITIAL_PASSWORD: z.string().optional(),
  ADMIN_SUPPORT_PHONE: z.string().optional(),

  PORT: z.number().positive(),
  NODE_ENV: z.enum(['development', 'production', 'test']),
  DEBUG_MODE: z.boolean()
});

// Chạy xác thực dữ liệu
const parsedResult = securitySchema.safeParse(rawConfig);

if (!parsedResult.success) {
  console.error("\n❌ [CRITICAL] KHỞI ĐỘNG THẤT BẠI: LỖI CẤU HÌNH BẢO MẬT (FAIL-FAST)");
  console.error("Vui lòng kiểm tra lại cấu hình file .env của bạn:");
  
  const formattedErrors = parsedResult.error.format();
  Object.keys(formattedErrors).forEach((key) => {
    if (key !== '_errors') {
      console.error(`  👉 [${key}]: ${formattedErrors[key]._errors.join(', ')}`);
    }
  });
  console.error("\nỨng dụng buộc phải dừng hoạt động để bảo vệ an toàn dữ liệu dòng tộc.\n");
  process.exit(1);
}

// In log thông báo thành công (Hấp thụ từ validateEnv cũ)
if (parsedResult.data.NODE_ENV === 'production') {
  console.log(`✅ [securityConfig] Production Hardening hoàn tất.`);
} else {
  console.log(`✅ [securityConfig] Cấu hình môi trường '${parsedResult.data.NODE_ENV}' đã nạp thành công.`);
}
console.log(`📌 Server sẽ chạy trên PORT = ${parsedResult.data.PORT}\n`);

// =========================================================
// NGUYÊN TẮC 2: FREEZE OBJECT & EXPORT
// =========================================================
const securityConfig = Object.freeze(parsedResult.data);

module.exports = securityConfig;