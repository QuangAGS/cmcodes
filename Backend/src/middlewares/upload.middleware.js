/**
 * PATH: src/middlewares/upload.middleware.js
 * VERSION: 1.0.0
 * DESCRIPTION: Cấu hình Multer để lọc và tiếp nhận file Multimedia.
 */
const multer = require('multer');
const path = require('path');

// 1. Cấu hình lưu trữ vào bộ nhớ (Memory) để xử lý tiếp bằng Cloud SDK
const storage = multer.memoryStorage();

// 2. Bộ lọc File: src/middlewares/upload.middleware.js bảo chỉ nhận các định dạng cho phép
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  } else {
    cb(new Error('Định dạng file không hỗ trợ! (Chỉ nhận ảnh và tài liệu văn phòng)'));
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Giới hạn 5MB mỗi file
  fileFilter: fileFilter
});

module.exports = upload;