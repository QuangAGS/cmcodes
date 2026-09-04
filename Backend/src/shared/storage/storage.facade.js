/**
 * PATH       : src/shared/storage/storage.facade.js
 * DATETIME   : 2026-09-04T11:55:00+07:00
 * VERSION    : 1.0.0-M10
 * DESCRIPTION: Cổng duy nhất cho nghiệp vụ media. P0 = bọc R2 hiện tại.
 *              Chưa Drive. Presign PUT client = lát M-10b.
 */

'use strict';

const r2 = require('./r2.storage.service');

const PROVIDER = 'CLOUDFLARE_R2';

module.exports = {
  PROVIDER,
  sanitizeFileName: r2.sanitizeFileName,
  contentDisposition: r2.contentDisposition,
  resolveExt: r2.resolveExt,
  buildObjectKey: r2.buildObjectKey,
  buildPublicUrl: r2.buildPublicUrl,
  uploadObject: (...args) => r2.uploadObject(...args),
  deleteObject: (...args) => r2.deleteObject(...args),
  headObject: (...args) => r2.headObject(...args),
  getObjectStream: (...args) => r2.getObjectStream(...args),
  getPresignedGetUrl: (...args) => r2.getPresignedGetUrl(...args),
  getPresignedPutUrl: (...args) => r2.getPresignedPutUrl(...args),
  resolveReadUrl: (...args) => r2.resolveReadUrl(...args),
};
