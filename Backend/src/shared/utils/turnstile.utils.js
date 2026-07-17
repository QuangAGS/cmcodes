/**
 * PATH       : src/utils/turnstile.js
 * DATETIME   : 2026-05-06T17:10:00+07:00
 * VERSION    : 21.2.0
 * DESCRIPTION: 
 * - Bước 2 của Bản đồ V21.0.0: Tăng cường Turnstile Validation
 * - Thêm kiểm tra sâu: success, action, hostname, error-codes, score
 * - Logging chi tiết để dễ debug và audit
 * - Bảo tồn hàm validateTurnstile cũ, chỉ nâng cấp logic bên trong (Q1)
 * - Tuân thủ Q2
 */

const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET_KEY;

async function validateTurnstile(token, remoteip, action = 'register') {
  console.log(`[Turnstile DEBUG] Action=${action} | IP=${remoteip} | TokenLength=${token?.length || 0}`);

  if (!token) {
    console.log('[Turnstile] FAIL: No token provided');
    return { 
      success: false, 
      errors: ['missing_token'],
      message: 'Vui lòng hoàn thành CAPTCHA' 
    };
  }

  if (!TURNSTILE_SECRET) {
    console.error('[Turnstile] ERROR: TURNSTILE_SECRET_KEY is missing in environment');
    return { 
      success: false, 
      errors: ['server_configuration_error'],
      message: 'Lỗi cấu hình server' 
    };
  }

  const formData = new FormData();
  formData.append('secret', TURNSTILE_SECRET);
  formData.append('response', token);
  if (remoteip) formData.append('remoteip', remoteip);

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
    });

    const outcome = await res.json();

    console.log('[Turnstile Cloudflare Full Response]:', JSON.stringify(outcome, null, 2));

    // Kiểm tra sâu
    if (!outcome.success) {
      return {
        success: false,
        errors: outcome['error-codes'] || ['unknown_error'],
        hostname: outcome.hostname,
        action: outcome.action,
        message: 'CAPTCHA không hợp lệ. Vui lòng thử lại.'
      };
    }

    // Kiểm tra action khớp (an ninh cao hơn)
    if (outcome.action && outcome.action !== action) {
      console.warn(`[Turnstile] Action mismatch: expected=${action}, received=${outcome.action}`);
      return {
        success: false,
        errors: ['action_mismatch'],
        message: 'Yêu cầu không hợp lệ.'
      };
    }

    return {
      success: true,
      hostname: outcome.hostname,
      action: outcome.action,
      score: outcome.score || null,           // Nếu Cloudflare trả về score
      message: 'CAPTCHA hợp lệ'
    };

  } catch (err) {
    console.error('[Turnstile Exception]:', err);
    return { 
      success: false, 
      errors: ['internal_error'],
      message: 'Lỗi kết nối xác thực CAPTCHA' 
    };
  }
}

module.exports = { validateTurnstile };