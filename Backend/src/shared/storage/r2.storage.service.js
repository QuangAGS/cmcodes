/**
 * PATH       : src/shared/storage/r2.storage.service.js
 * DATETIME   : 2026-08-25T15:05:00+07:00
 * VERSION    : 1.2.0-R2
 * DESCRIPTION:
 * - R2 private: put / delete / head / presigned GET|PUT.
 * - Key: {tenantId}/{uuid}{ext}  (không sub-folder; metadata ở bảng media).
 * - Không phụ thuộc Public URL.
 */

'use strict';

const { randomUUID } = require('crypto');
const path = require('path');
const {
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const { getR2Client } = require('./r2.client');

const PROVIDER = 'CLOUDFLARE_R2';

function sanitizeFileName(name) {
  const base = path.basename(String(name || 'file'));
  return (
    base
      .replace(/[^\w.\-()+\u00C0-\u024F\u1E00-\u1EFF ]+/gi, '_')
      .replace(/\s+/g, '_')
      .slice(0, 180) || 'file'
  );
}

/**
 * Extension chuẩn: ".png" | "" 
 * @param {string} originalName
 * @param {string} [mimeType]
 */
function resolveExt(originalName, mimeType) {
  const fromName = path.extname(String(originalName || '')).toLowerCase();
  if (fromName && /^\.[a-z0-9]{1,10}$/i.test(fromName)) {
    return fromName;
  }
  const map = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'application/pdf': '.pdf',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'audio/mpeg': '.mp3',
    'audio/mp3': '.mp3',
    'audio/wav': '.wav',
  };
  return map[String(mimeType || '').toLowerCase()] || '';
}

/**
 * Key R2: {tenantId}/{uuid}{ext}
 * @param {{ tenantId: string, originalName?: string, mimeType?: string }} p
 */
function buildObjectKey({ tenantId, originalName, mimeType }) {
  if (!tenantId) {
    const err = new Error('[R2] Thiếu tenantId khi tạo storage key.');
    err.code = 'R2_KEY_INVALID';
    throw err;
  }
  const id = randomUUID();
  const ext = resolveExt(originalName, mimeType);
  return `${tenantId}/${id}${ext}`;
}

/**
 * @deprecated private bucket — luôn null nếu không cấu hình publicBaseUrl
 */
function buildPublicUrl(key, publicBaseUrl) {
  if (!publicBaseUrl) return null;
  const k = String(key).replace(/^\//, '');
  return `${publicBaseUrl.replace(/\/$/, '')}/${k}`;
}

/**
 * Upload buffer → R2.
 * @returns {Promise<{
 *   storage_provider: string,
 *   storage_key: string,
 *   file_url: string|null,
 *   file_name: string,
 *   mime_type: string,
 *   file_ext: string,
 *   file_size: number,
 *   bucket: string
 * }>}
 */
async function uploadObject({
  buffer,
  contentType,
  originalName,
  tenantId,
  cacheControl = 'private, max-age=0',
}) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    const err = new Error('[R2] buffer không hợp lệ.');
    err.code = 'R2_INVALID_BUFFER';
    throw err;
  }

  const { client, config } = getR2Client();
  const mime = contentType || 'application/octet-stream';
  const key = buildObjectKey({
    tenantId,
    originalName,
    mimeType: mime,
  });
  const ext = resolveExt(originalName, mime);
  const safeName = sanitizeFileName(originalName);

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: buffer,
      ContentType: mime,
      CacheControl: cacheControl,
      Metadata: {
        tenant_id: String(tenantId),
        original_name: safeName.slice(0, 200),
      },
    })
  );

  return {
    storage_provider: PROVIDER,
    storage_key: key,
    file_url: buildPublicUrl(key, config.publicBaseUrl),
    file_name: safeName,
    mime_type: mime,
    file_ext: ext || null,
    file_size: buffer.length,
    bucket: config.bucket,
  };
}

async function deleteObject(storageKey) {
  if (!storageKey) return { deleted: false, reason: 'empty_key' };
  const { client, config } = getR2Client();
  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: config.bucket,
        Key: storageKey,
      })
    );
    return { deleted: true, storage_key: storageKey };
  } catch (e) {
    const err = new Error(`[R2] Xóa object thất bại: ${e.message || e}`);
    err.code = 'R2_DELETE_FAILED';
    err.cause = e;
    throw err;
  }
}

async function headObject(storageKey) {
  const { client, config } = getR2Client();
  try {
    const out = await client.send(
      new HeadObjectCommand({
        Bucket: config.bucket,
        Key: storageKey,
      })
    );
    return {
      exists: true,
      contentType: out.ContentType || null,
      contentLength: out.ContentLength ?? null,
      etag: out.ETag || null,
    };
  } catch (e) {
    if (e?.$metadata?.httpStatusCode === 404 || e?.name === 'NotFound') {
      return { exists: false };
    }
    throw e;
  }
}

async function getPresignedGetUrl(storageKey, expiresIn = 3600) {
  const { client, config } = getR2Client();
  const cmd = new GetObjectCommand({
    Bucket: config.bucket,
    Key: storageKey,
  });
  const url = await getSignedUrl(client, cmd, { expiresIn });
  return { url, expiresIn, storage_key: storageKey };
}

async function getPresignedPutUrl(storageKey, contentType, expiresIn = 900) {
  const { client, config } = getR2Client();
  const cmd = new PutObjectCommand({
    Bucket: config.bucket,
    Key: storageKey,
    ContentType: contentType || 'application/octet-stream',
  });
  const url = await getSignedUrl(client, cmd, { expiresIn });
  return { url, expiresIn, storage_key: storageKey };
}

/**
 * Private bucket: luôn presign nếu có storage_key.
 * file_url legacy chỉ dùng khi không có key.
 */
async function resolveReadUrl(storageKey, storedFileUrl = null, expiresIn = 3600) {
  if (storageKey) {
    const signed = await getPresignedGetUrl(storageKey, expiresIn);
    return {
      url: signed.url,
      mode: 'presigned',
      expiresIn: signed.expiresIn,
    };
  }
  if (storedFileUrl) {
    return { url: storedFileUrl, mode: 'legacy' };
  }
  return { url: null, mode: 'none' };
}

module.exports = {
  PROVIDER,
  sanitizeFileName,
  resolveExt,
  buildObjectKey,
  buildPublicUrl,
  uploadObject,
  deleteObject,
  headObject,
  getPresignedGetUrl,
  getPresignedPutUrl,
  resolveReadUrl,
};
