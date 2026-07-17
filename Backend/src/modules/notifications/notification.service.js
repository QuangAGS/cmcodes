/**
 * PATH: backend/src/services/notificationService.js
 * DATETIME: 2026-06-21T22:25:00+07:00
 * VERSION: 1.1.2
 * DESCRIPTION: Quản lý thông báo người dùng.
 * - Tích hợp Multi-tenant cô lập dữ liệu thông báo, chặn đứng rủi ro rò rỉ dữ liệu chéo giữa các dòng họ.
 * - Rà soát và loại bỏ/comment toàn bộ việc sinh khóa chính (PK) thủ công `id: uuidv4()` ở tầng Backend.
 * SỬA LỖI: Cập nhật đường dẫn import ../lib/prisma chính xác.
 */

const { basePrisma } = require('../lib/prisma');
//const { v4: uuidv4 } = require('uuid');

const notificationService = {
  // Tạo thông báo khi Approve/Reject
  create: async (userId, title, content, type = 'HE_THONG') => {
    return await basePrisma.notifications.create({
      data: {
        // id: uuidv4(), // 🚫 ĐÃ COMMENT: DB PostgreSQL tự động chạy hàm gen_random_uuid() cho trường này
        user_id: userId,
        tenant_id: tenantId, // 🟢 ÉP GHI DỮ LIỆU CÔ LẬP DÒNG HỌ
        type,
        title,
        content,
        is_read: false
      }
    });
  },


  // Lấy thông báo theo người dùng
  getByUser: async (userId, tenantId) => {
    return await basePrisma.notifications.findMany({
      where: { 
        user_id: userId, 
        tenant_id: tenantId, // 🟢 CHỐT CHẶN AN NINH: Chỉ lấy thông tin thuộc dòng họ của mình
        deleted_at: null 
      },
      orderBy: { created_at: 'desc' }
    });
  },

  // Đánh dấu đã đọc
  markAsRead: async (id) => {
    return await basePrisma.notifications.update({
      where: { id },
      data: { is_read: true }
    });
  }
};

module.exports = notificationService;