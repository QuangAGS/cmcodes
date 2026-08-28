/**
 * ============================================================================
 * PATH: src/lib/initialSetup.js
 * VERSION: EGAL-25.2.5-BOOTSTRAP-AUDIT-FK
 * DATETIME: 2026-08-28T08:58:00+07:00
 * ============================================================================
 * DESCRIPTION:
 * Khởi tạo môi trường gốc. Audit chỉ ghi changed_by sau khi user tồn tại.
 * ============================================================================
 */

const prisma = require('./prisma.js');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const SYSTEM_GLOBAL_ID = '00000000-0000-0000-0000-000000000000';

const createAdmin = async () => {
  const systemContextInput = {
    correlationId: prisma.correlation.create(),
    actorId: null,
    actorType: 'SYSTEM',
    tenantId: SYSTEM_GLOBAL_ID,
    allowUnscoped: true,
  };

  try {
    await prisma.withTransaction(systemContextInput, async (tx, context) => {
      const tenantExists = await tx.tenants.findFirst({
        where: { id: SYSTEM_GLOBAL_ID },
      });

      if (!tenantExists) {
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
            status: 'NGUNG_HAN',
            slogan: null,
          },
        });

        await prisma.audit.create(tx, {
          tableName: 'tenants',
          recordId: SYSTEM_GLOBAL_ID,
          action: 'THEM_MOI',
          oldData: null,
          newData: {
            id: SYSTEM_GLOBAL_ID,
            slug: '2026000000',
            status: 'NGUNG_HAN',
          },
          tenantId: SYSTEM_GLOBAL_ID,
          changeReason:
            'Hệ thống tự động khởi tạo Global System Tenant làm neo khóa ngoại',
          changedBy: null,
          correlationId: context.correlationId,
        });

        console.log('🚀 [Bootstrap]: Đã khởi tạo đặc khu Tenant Hệ thống thành công.');
      } else {
        console.log('✅ [Bootstrap]: Đặc khu Tenant Hệ thống đã tồn tại.');
      }

      const adminExists = await tx.users.findFirst({
        where: { role: 'SYSTEM_ADMIN', deleted_at: null },
      });

      if (adminExists) {
        console.log('✅ [Bootstrap]: Tài khoản SYSTEM_ADMIN đã tồn tại. Bỏ qua khởi tạo.');
        return;
      }

      const adminEmail = process.env.ADMIN_EMAIL || 'admin@giapha.vn';
      const adminPassword = process.env.ADMIN_INITIAL_PASSWORD || 'Admin@2026';
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      const rootAdminId = crypto.randomUUID();

      await tx.users.create({
        data: {
          id: rootAdminId,
          email: adminEmail,
          name: 'Root Administrator',
          password: hashedPassword,
          role: 'SYSTEM_ADMIN',
          status: 'DA_DUYET',
          phone: process.env.ADMIN_SUPPORT_PHONE || '0913233531',
          tenant_id: SYSTEM_GLOBAL_ID,
          changed_by: null,
        },
      });

      await prisma.audit.create(tx, {
        tableName: 'users',
        recordId: rootAdminId,
        action: 'THEM_MOI',
        oldData: null,
        newData: {
          id: rootAdminId,
          email: adminEmail,
          role: 'SYSTEM_ADMIN',
          status: 'DA_DUYET',
        },
        tenantId: SYSTEM_GLOBAL_ID,
        changeReason:
          'Hệ thống tự động khởi tạo tài khoản Quản trị viên tối cao gắn kèm Global Tenant',
        changedBy: rootAdminId,
        correlationId: context.correlationId,
      });

      console.log(`🚀 [Bootstrap]: Đã khởi tạo Quản trị viên gốc thành công: ${adminEmail}`);
    });
  } catch (error) {
    console.error(
      '❌ [Bootstrap Critical Error]: Gãy luồng khởi tạo hệ thống gốc:',
      error.message
    );
  }
};

module.exports = { createAdmin };
