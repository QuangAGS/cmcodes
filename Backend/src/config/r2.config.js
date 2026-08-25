/**
 * PATH       : src/config/r2.config.js
 * DATETIME   : 2026-08-25T10:30:00+07:00
 * VERSION    : 1.1.0-R2
 * DESCRIPTION:
 * - Map cấu hình R2 từ securityConfig (không đọc process.env trực tiếp).
 * - securityConfig: R2_ACCOUNT_ID <- CLOUDFLARE_ACCOUNT_ID, R2_BUCKET, keys, R2_ENDPOINT.
 */

'use strict';

const securityConfig = require('./securityConfig');

function loadR2Config() {
  const accountId = String(securityConfig.R2_ACCOUNT_ID || '').trim();
  const accessKeyId = String(securityConfig.R2_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = String(
    securityConfig.R2_SECRET_ACCESS_KEY || ''
  ).trim();
  const bucket = String(
    securityConfig.R2_BUCKET || securityConfig.R2_BUCKET_NAME || ''
  ).trim();

  const missing = [];
  if (!accountId) missing.push('R2_ACCOUNT_ID (CLOUDFLARE_ACCOUNT_ID)');
  if (!accessKeyId) missing.push('R2_ACCESS_KEY_ID');
  if (!secretAccessKey) missing.push('R2_SECRET_ACCESS_KEY');
  if (!bucket) missing.push('R2_BUCKET');

  if (missing.length) {
    const err = new Error(
      `[R2] Thiếu cấu hình trong securityConfig: ${missing.join(', ')}`
    );
    err.code = 'R2_CONFIG_MISSING';
    throw err;
  }

  let endpoint = String(securityConfig.R2_ENDPOINT || '').trim();
  if (!endpoint) {
    endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  }
  endpoint = endpoint.replace(/\/$/, '');
  try {
    const u = new URL(endpoint);
    // Endpoint API S3 không kèm path bucket
    if (u.pathname && u.pathname !== '/') {
      endpoint = u.origin;
    }
  } catch (_) {
    /* keep */
  }

  const publicBaseUrl = String(
    securityConfig.R2_PUBLIC_BASE_URL || ''
  ).trim();
  const region = String(securityConfig.R2_REGION || 'auto').trim() || 'auto';

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    endpoint,
    region,
    publicBaseUrl: publicBaseUrl ? publicBaseUrl.replace(/\/$/, '') : null,
  };
}

function checkR2Config() {
  const keys = [
    ['R2_ACCOUNT_ID', securityConfig.R2_ACCOUNT_ID],
    ['R2_ACCESS_KEY_ID', securityConfig.R2_ACCESS_KEY_ID],
    ['R2_SECRET_ACCESS_KEY', securityConfig.R2_SECRET_ACCESS_KEY],
    ['R2_BUCKET', securityConfig.R2_BUCKET || securityConfig.R2_BUCKET_NAME],
  ];
  const missing = keys
    .filter(([, v]) => !v || !String(v).trim())
    .map(([k]) => k);
  return { ok: missing.length === 0, missing };
}

module.exports = {
  loadR2Config,
  checkR2Config,
};
