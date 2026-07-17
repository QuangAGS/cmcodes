/**
 * PATH       : src/config/validateEnv.js
 * DATETIME   : 2026-05-06T18:55:00+07:00
 * VERSION    : 21.5.3
 * DESCRIPTION: 
 * - Hoàn tất Bước 5: Production Hardening
 * - Backend PORT mặc định = 10000
 * - Phân biệt rõ Critical Backend và Frontend vars
 * - Kiểm tra độ mạnh JWT_SECRET
 * - Tuân thủ Q1 & Q2
 */

const criticalBackend = {
  DATABASE_URL: 'string',
  JWT_SECRET: 'string',
  TURNSTILE_SECRET_KEY: 'string',
};

const frontendVars = ['VITE_TURNSTILE_SITE_KEY'];

const recommended = {
  NODE_ENV: 'production',
  PORT: '10000',
};

function validateEnv() {
  console.log('\n🔍 [validateEnv] Đang kiểm tra biến môi trường...\n');

  let hasCriticalError = false;

  Object.keys(criticalBackend).forEach((key) => {
    if (!process.env[key]) {
      console.error(`❌ [CRITICAL] Thiếu biến backend bắt buộc: ${key}`);
      hasCriticalError = true;
    }
  });

  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    console.warn(`⚠️  [WARNING] JWT_SECRET quá yếu (${process.env.JWT_SECRET.length} ký tự). Khuyến nghị ≥ 64 ký tự.`);
  }

  frontendVars.forEach((key) => {
    if (!process.env[key]) {
      console.warn(`⚠️  [INFO] Thiếu biến frontend: ${key} (không ảnh hưởng backend)`);
    }
  });

  Object.keys(recommended).forEach((key) => {
    if (!process.env[key]) {
      console.warn(`⚠️  [WARNING] Biến ${key} chưa được thiết lập. Sử dụng mặc định: ${recommended[key]}`);
      process.env[key] = recommended[key];
    }
  });

  if (hasCriticalError) {
    console.error('\n🚨 SERVER KHÔNG THỂ KHỞI ĐỘNG vì thiếu biến backend Critical.\n');
    process.exit(1);
  }

  console.log(`✅ [validateEnv] Production Hardening hoàn tất.`);
  console.log(`📌 Server sẽ chạy trên PORT = ${process.env.PORT || '10000'}\n`);
}

module.exports = { validateEnv };