/**
 * ============================================================================
 * PATH: src/lib/initialSetup.js
 * VERSION: EGAL-25.2.4-BOOTSTRAP-TENANT-FIRST
 * DATETIME: 2026-07-16T12:15:00+07:00
 * ============================================================================
 * DESCRIPTION: 
 * Khởi tạo môi trường gốc cho Hệ thống EGAL theo quy trình an toàn khóa ngoại.
 * * THỨ TỰ THỰC THI CHUẨN DOCTRINE:
 * 1. Khởi tạo Global System Tenant (Nếu chưa tồn tại).
 * 2. Khởi tạo Quản trị viên tối cao SYSTEM_ADMIN gắn vào Tenant đặc biệt trên.
 * 3. Ghi song song 2 vết biến động vật lý vào Sổ cái Audit Trail.
 * ============================================================================
 */

const prisma = require('./prisma.js'); // Điểm truy cập chuẩn độc nhất
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const createAdmin = async () => {
  // Định danh tĩnh cho các thực thể tối cao của Hệ thống
  const SYSTEM_GLOBAL_ID = '00000000-0000-0000-0000-000000000000';

  const systemContextInput = {
    correlationId: prisma.correlation.create(),
    actorId: SYSTEM_GLOBAL_ID, 
    actorType: 'SYSTEM',
    tenantId: null // Ngữ cảnh chạy global không bị cô lập ban đầu
  };

  try {
    // Thực thi toàn bộ luồng cô lập trong một Transaction nguyên tử bảo toàn dữ liệu
    await prisma.withTransaction(systemContextInput, async (tx, context) => {
      
      // ======================================================================
      // BƯỚC 1: KIỂM TRA & KHỞI TẠO GLOBAL SYSTEM TENANT (BẮT BUỘC CHẠY TRƯỚC)
      // ======================================================================
      const tenantExists = await tx.tenants.findFirst({
        where: { id: SYSTEM_GLOBAL_ID }
      });

      if (!tenantExists) {
        // Tạo Tenant đặc biệt theo đúng payload bác chỉ định
        await tx.tenants.create({
          data: {
            id: SYSTEM_GLOBAL_ID,
            name: 'Họ dành riêng cho Quản trị viên hệ thống (SYSTEM_ADMIN)',
            slug: '2026000000',
            description: 'Chỉ dành riêng cho Hệ thống để kiểm định',
            logo_url: null,
            theme_color: null,
            created_at: new Date('2026-06-22T09:50:54Z'),
            updated_at: new Date('2026-06-22T09:51:20.801Z'),
            changed_by: null,
            deleted_at: null,
            social_configs: {},
            status: 'NGUNG_HAN', // Chế độ đóng băng cô lập kiểm định
            slogan: null
          }
        });

        // Ghi vết Sổ cái Audit cho việc khởi tạo Tenant
        await prisma.audit.create(tx, {
          tableName: 'tenants',
          recordId: SYSTEM_GLOBAL_ID,
          action: 'THEM_MOI', // Khớp chuẩn Enum vật lý
          oldData: null,
          newData: { id: SYSTEM_GLOBAL_ID, slug: '2026000000', status: 'NGUNG_HAN' },
          tenantId: SYSTEM_GLOBAL_ID,
          changeReason: 'Hệ thống tự động khởi tạo Global System Tenant làm neo khóa ngoại',
          changedBy: context.actorId,
          correlationId: context.correlationId
        });

        console.log("🚀 [Bootstrap]: Đã khởi tạo đặc khu Tenant Hệ thống thành công.");
      } else {
        console.log("✅ [Bootstrap]: Đặc khu Tenant Hệ thống đã tồn tại.");
      }

      // ======================================================================
      // BƯỚC 2: KIỂM TRA & KHỞI TẠO SYSTEM_ADMIN (GẮN VÀO TENANT GỐC)
      // ======================================================================
      const adminExists = await tx.users.findFirst({
        where: { role: 'SYSTEM_ADMIN' }
      });

      if (adminExists) {
        console.log("✅ [Bootstrap]: Tài khoản SYSTEM_ADMIN đã tồn tại. Bỏ qua khởi tạo.");
        return; 
      }

      // Chuẩn bị DTO tài khoản
      const adminEmail = process.env.ADMIN_EMAIL || "admin@giapha.vn";
      const adminPassword = process.env.ADMIN_INITIAL_PASSWORD || "Admin@2026";
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      const rootAdminId = crypto.randomUUID();

      // Ghi bản ghi User vật lý xuống DB
      await tx.users.create({
        data: {
          id: rootAdminId,
          email: adminEmail,
          name: 'Root Administrator',
          password: hashedPassword,
          role: 'SYSTEM_ADMIN',
          status: 'DA_DUYET',
          phone: process.env.ADMIN_SUPPORT_PHONE || '0913233531',
          tenant_id: SYSTEM_GLOBAL_ID // 🎯 ĐÃ GẮN CHẶT CHẼ: Neo chuẩn xác vào khóa ngoại vừa tạo ở Bước 1
        },
      });

      // Ghi vết Sổ cái Audit cho việc khởi tạo User
      await prisma.audit.create(tx, {
        tableName: 'users',
        recordId: rootAdminId,
        action: 'THEM_MOI', //
        oldData: null,
        newData: { id: rootAdminId, email: adminEmail, role: 'SYSTEM_ADMIN', status: 'DA_DUYET' },
        tenantId: SYSTEM_GLOBAL_ID,
        changeReason: 'Hệ thống tự động khởi tạo tài khoản Quản trị viên tối cao gắn kèm Global Tenant',
        changedBy: context.actorId,
        correlationId: context.correlationId
      });

      console.log(`🚀 [Bootstrap]: Đã khởi tạo Quản trị viên gốc thành công: ${adminEmail}`);
    });

  } catch (error) {
    console.error("❌ [Bootstrap Critical Error]: Gãy luồng khởi tạo hệ thống gốc:", error.message);
  }
};

module.exports = { createAdmin };