/**
 * PATH: src/shared/utils/common.utils.service.js
 * DATETIME: 2026-07-16T12:15:00+07:00
 * VERSION: 2.3.7
 * DESCRIPTION: 
 * - FIX: Import exactMatchFields để giải quyết lỗi 500 khi Search. 
 * - NÂNG CẤP: Xử lý an toàn cho cả Object Search và String Search cũ. 
 * - BẢO TỒN: Giữ nguyên 100% logic create, update, delete và Ownership Check. [cite: 1]
 * - Q1: Bảo tồn chức năng. Q2: Metadata đầy đủ.
 */

// QUAN TRỌNG: Phải import exactMatchFields từ bản prisma.js 23.0.0-MERGED
const { prisma, exactMatchFields } = require('../../lib/prisma.js'); 

const { v4: uuidv4 } = require('uuid');
const auditService = require('../../services/audit.service');

const DEFAULT_ID = "00000000-0000-0000-0000-000000000000";

const commonService = {
  /**
   * CREATE: Tự động gán tenant_id và audit (Bảo tồn v2.2.0) [cite: 1]
   */
  create: async (tableName, rawData, currentUser) => {
    const { userId, tenantId } = currentUser;
    if (!tenantId && currentUser.role !== 'SYSTEM_ADMIN') {
        throw new Error(`[CommonService]: Thiếu tenantId khi CREATE trên ${tableName}`);
    }

    const { change_reason, ...data } = rawData;
    const processedData = { ...data };

    Object.keys(processedData).forEach(key => {
      if (key.endsWith('_id') && !processedData[key]) {
        processedData[key] = DEFAULT_ID;
      }
    });

    const newRecord = await prisma[tableName].create({
      data: {
        // id: uuidv4(),
        ...processedData,
        changed_by: userId
      }
    });

    await auditService.logAction('THEM_MOI', tableName, newRecord.id, null, newRecord, userId, change_reason, tenantId);
    return newRecord;
  },

  /**
   * UPDATE: Kiểm tra Ownership đối với ROLE 'USER' (Bảo tồn v2.2.0) [cite: 1]
   */
  update: async (tableName, id, rawData, currentUser) => {
    const { userId, tenantId, role } = currentUser;
    const { change_reason, ...data } = rawData;
    
    const oldData = await prisma[tableName].findUnique({ where: { id } });
    if (!oldData) throw new Error("Bản ghi không tồn tại hoặc bạn không có quyền truy cập.");

    if (role === 'USER' && oldData.changed_by !== userId) {
      throw new Error("Bảo mật: Bạn chỉ có quyền cập nhật dữ liệu do chính mình tạo ra.");
    }

    const updatedRecord = await prisma[tableName].update({
      where: { id },
      data: { ...data, changed_by: userId, updated_at: new Date() }
    });

    await auditService.logAction('CAP_NHAT', tableName, id, oldData, updatedRecord, userId, change_reason, tenantId || oldData.tenant_id);
    return updatedRecord;
  },

  /**
   * DELETE: Soft delete và Ownership Check (Bảo tồn v2.2.0) [cite: 1]
   */
  delete: async (tableName, id, currentUser, reason) => {
    const { userId, tenantId, role } = currentUser;
    const oldData = await prisma[tableName].findUnique({ where: { id } });
    if (!oldData) throw new Error("Bản ghi không tồn tại hoặc đã bị xóa.");

    if (role === 'USER' && oldData.changed_by !== userId) {
      throw new Error("Bảo mật: Bạn không có quyền xóa bản ghi này.");
    }

    const deletedRecord = await prisma[tableName].delete({ where: { id } });
    await auditService.logAction('XOA', tableName, id, oldData, null, userId, reason, tenantId || oldData.tenant_id);
    return deletedRecord;
  },

  getAll: async (tableName) => {
    return await prisma[tableName].findMany({ orderBy: { created_at: 'desc' } });
  },

  getById: async (tableName, id) => {
    return await prisma[tableName].findUnique({ where: { id } });
  },

  /**
   * SEARCH: Dynamic Search (Nâng cấp vét cạn toán tử) 
   */
  /*
  search: async (tableName, fieldOrCriteria, query = null) => {
    try {
      let whereClause = {};
      let criteria = {};

      // 1. CHUẨN HÓA ĐẦU VÀO [cite: 1]
      if (typeof fieldOrCriteria === 'object' && fieldOrCriteria !== null) {
        criteria = fieldOrCriteria;
      } else if (typeof fieldOrCriteria === 'string') {
        // Hỗ trợ cú pháp cũ search(table, field, q) [cite: 1]
        criteria[fieldOrCriteria] = query;
      }

      // 2. XỬ LÝ TOÁN TỬ DỰA TRÊN METADATA 
      Object.keys(criteria).forEach(key => {
        const val = criteria[key];
        if (val === undefined || val === null) return;

        // Phân loại: Dùng 'equals' cho Enum/ID/Boolean, dùng 'contains' cho chuỗi thường 
        const isExact = exactMatchFields.includes(key) || key.endsWith('_id');

        if (typeof val === 'string' && !isExact) {
          whereClause[key] = { contains: val, mode: 'insensitive' };
        } else {
          // Prisma mặc định là so khớp tuyệt đối 
          whereClause[key] = val;
        }
      });

      // 3. TRUY VẤN (Sử dụng prisma client mở rộng từ lib) 
      return await prisma[tableName].findMany({
        where: whereClause,
        orderBy: { created_at: 'desc' }
      });
    } catch (error) {
      console.error(`[CommonService Search Error on ${tableName}]:`, error.message);
      throw error;
    }
  }
  */

  /**
   * SEARCH: Dynamic Search (Nâng cấp xử lý Enum + ID)
   */
  search: async (tableName, fieldOrCriteria, query = null) => {
    try {
      let whereClause = {};
      let criteria = {};

      // 1. CHUẨN HÓA ĐẦU VÀO
      if (typeof fieldOrCriteria === 'object' && fieldOrCriteria !== null) {
        criteria = fieldOrCriteria;
      } else if (typeof fieldOrCriteria === 'string') {
        criteria[fieldOrCriteria] = query;
      }

      // 2. XỬ LÝ TOÁN TỬ THEO KIỂU DỮ LIỆU
      Object.keys(criteria).forEach(key => {
        const val = criteria[key];
        if (val === undefined || val === null) return;

        const isExactMatch = exactMatchFields.includes(key) || 
                            key.endsWith('_id') || 
                            key === 'status' || key === 'role' || 
                            key.endsWith('_type');   // Thêm các enum phổ biến

        if (typeof val === 'string' && !isExactMatch) {
          // Text fields → contains
          whereClause[key] = { contains: val, mode: 'insensitive' };
        } else {
          // Enum, ID, Boolean → equals
          whereClause[key] = { equals: val };
        }
      });

      // 3. TRUY VẤN
      return await prisma[tableName].findMany({
        where: whereClause,
        orderBy: { created_at: 'desc' }
      });
    } catch (error) {
      console.error(`[CommonService Search Error on ${tableName}]:`, error.message);
      throw error;
    }
  }
};

module.exports = commonService;