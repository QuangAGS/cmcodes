/**
 * PATH       : src/middlewares/upload.middleware.js
 * DATETIME   : 2026-08-25T10:20:00+07:00
 * VERSION    : 1.1.0-R2
 * DESCRIPTION:
 * - Multer memoryStorage → buffer đẩy R2 trong media.service.
 * - Mở rộng MIME: ảnh + pdf + office (tenant logo: jpeg/png/webp/gif).
 */

'use strict';

const multer = require('multer');
const path = require('path');

const storage = multer.memoryStorage();

const ALLOWED_EXT =
  /jpeg|jpg|png|gif|webp|pdf|doc|docx|xls|xlsx|ppt|pptx|mp4|webm|mp3|wav/;
const ALLOWED_MIME =
  /^(image\/(jpeg|jpg|png|gif|webp)|application\/(pdf|msword|vnd\.openxmlformats.*|vnd\.ms-.*)|video\/(mp4|webm)|audio\/(mpeg|mp3|wav|x-wav))$/i;

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase().replace('.', '');
  const extOk = ALLOWED_EXT.test(ext);
  const mimeOk = ALLOWED_MIME.test(file.mimetype || '');

  if (extOk || mimeOk) {
    return cb(null, true);
  }
  cb(
    new Error(
      'Định dạng file không hỗ trợ. Cho phép: ảnh, PDF, Office, audio/video phổ biến.'
    )
  );
};

const upload = multer({
  storage,
  limits: {
    fileSize: Number(process.env.MEDIA_MAX_BYTES || 10 * 1024 * 1024), // 10MB default
    files: 1,
  },
  fileFilter,
});

module.exports = upload;
