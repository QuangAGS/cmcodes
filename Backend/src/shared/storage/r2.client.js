/**
 * PATH       : src/shared/storage/r2.client.js
 * DATETIME   : 2026-08-25T10:15:00+07:00
 * VERSION    : 1.0.0-R2
 * DESCRIPTION:
 * - Singleton S3Client trỏ Cloudflare R2 (API S3-compatible).
 * - Hạ tầng dùng chung — không chứa logic nghiệp vụ media/DB.
 */

'use strict';

const { S3Client } = require('@aws-sdk/client-s3');
const { loadR2Config } = require('../../config/r2.config');

let _client = null;
let _cfg = null;

/**
 * @returns {{ client: import('@aws-sdk/client-s3').S3Client, config: ReturnType<typeof loadR2Config> }}
 */
function getR2Client() {
  if (_client && _cfg) {
    return { client: _client, config: _cfg };
  }

  _cfg = loadR2Config();
  _client = new S3Client({
    region: _cfg.region,
    endpoint: _cfg.endpoint,
    credentials: {
      accessKeyId: _cfg.accessKeyId,
      secretAccessKey: _cfg.secretAccessKey,
    },
    // R2: path-style ổn định hơn virtual-hosted với custom endpoint
    forcePathStyle: true,
  });

  return { client: _client, config: _cfg };
}

/** Test / hot-reload */
function resetR2Client() {
  _client = null;
  _cfg = null;
}

module.exports = {
  getR2Client,
  resetR2Client,
};
