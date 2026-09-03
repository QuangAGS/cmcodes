/**
 * PATH       : src/shared/storage/r2.client.js
 * DATETIME   : 2026-09-03T14:35:00+07:00
 * VERSION    : 1.1.0-R2-CHECKSUM
 * DESCRIPTION:
 * - Singleton S3Client → Cloudflare R2.
 * - Tắt checksum mặc định AWS SDK v3 (R2 SignatureDoesNotMatch).
 */

'use strict';

const { S3Client } = require('@aws-sdk/client-s3');
const { loadR2Config } = require('../../config/r2.config');

let _client = null;
let _cfg = null;

function getR2Client() {
  if (_client && _cfg) {
    return { client: _client, config: _cfg };
  }

  _cfg = loadR2Config();
  _client = new S3Client({
    region: _cfg.region,
    endpoint: _cfg.endpoint,
    credentials: {
      accessKeyId: String(_cfg.accessKeyId || '').trim(),
      secretAccessKey: String(_cfg.secretAccessKey || '').trim(),
    },
    forcePathStyle: true,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });

  return { client: _client, config: _cfg };
}

function resetR2Client() {
  _client = null;
  _cfg = null;
}

module.exports = {
  getR2Client,
  resetR2Client,
};
