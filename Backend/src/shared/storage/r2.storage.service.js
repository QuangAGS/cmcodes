/**
 * PATH       : src/shared/storage/r2.storage.service.js
 * DATETIME   : 2026-09-03T14:50:00+07:00
 * VERSION    : 1.3.0-R2-VN-NAME
 * DESCRIPTION:
 * - Key ổn định: {tenantId}/{uuid}{ext} — không nhét tên gốc vào Key.
 * - Tên tiếng Việt: NFC + Content-Disposition filename*=UTF-8'' (RFC 5987).
 * - Metadata S3 chỉ ASCII (encodeURIComponent) — tránh SignatureDoesNotMatch.
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

function decodeOriginalName(name) {
  let s = String(name || 'file');
  try {
    const fromLatin1 = Buffer.from(s, 'latin1').toString('utf8');
    if (fromLatin1 && /[^\u0000-\u007F]/.test(fromLatin1)) {
      s = fromLatin1;
    }
  } catch (_) {
    /* keep s */
  }
  try {
    s = s.normalize('NFC');
  } catch (_) {
    /* ignore */
  }
  return s.replace(/[\u0000-\u001F\u007F]/g, '').trim() || 'file';
}

function toNfc(name) {
  return decodeOriginalName(name);
}

function sanitizeFileName(name) {
  const base = path.basename(decodeOriginalName(name));
  return base.replace(/[/\\]/g, '_').slice(0, 255) || 'file';
}

/** RFC 5987 — Content-Disposition filename*=UTF-8''... */
function contentDisposition(safeName, mode = 'inline') {
  const nfc = toNfc(safeName);
  const encoded = encodeURIComponent(nfc).replace(/['()]/g, escape);
  const ascii = nfc.replace(/[^\x20-\x7E]/g, '_').slice(0, 80) || 'file';
  const kind = mode === 'attachment' ? 'attachment' : 'inline';
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

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

function buildPublicUrl(key, publicBaseUrl) {
  if (!publicBaseUrl) return null;
  const k = String(key).replace(/^\//, '');
  return `${publicBaseUrl.replace(/\/$/, '')}/${k}`;
}

async function uploadObject({
  buffer,
  contentType,
  originalName,
  tenantId,
  cacheControl = 'private, max-age=0',
  disposition = 'inline',
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
      ContentDisposition: contentDisposition(safeName, disposition),
      Metadata: {
        tenant_id: String(tenantId),
        original_name: encodeURIComponent(safeName).slice(0, 200),
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

async function getPresignedGetUrl(storageKey, expiresIn = 3600, downloadName = null) {
  const { client, config } = getR2Client();
  const input = {
    Bucket: config.bucket,
    Key: storageKey,
  };
  if (downloadName) {
    input.ResponseContentDisposition = contentDisposition(
      sanitizeFileName(downloadName),
      'attachment'
    );
  }
  const cmd = new GetObjectCommand(input);
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

async function resolveReadUrl(storageKey, storedFileUrl = null, expiresIn = 3600, downloadName = null) {
  if (storageKey) {
    const signed = await getPresignedGetUrl(storageKey, expiresIn, downloadName);
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
  contentDisposition,
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
