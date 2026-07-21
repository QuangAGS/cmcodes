/**
 * PATH: src/services/ledger.service.js
 * DATETIME: 2026-07-20T10:23:00+07:00
 * VERSION: 1.1.1
 * DESCRIPTION: Thay đổi cấu trúc hàm createLog để hỗ trợ truyền tham số tx (transaction) từ bên ngoài, giúp thực hiện ghi nhật ký trong một transaction duy nhất khi cần thiết.
 * Lớp dịch vụ trung tâm chịu trách nhiệm xử lý logic kiểm tra và thực thi
 * ghi dữ liệu nhật ký tiến trình nghiệp vụ xuống bảng business_process_logs.
 * Hỗ trợ toàn diện actor_type, attempt_no và đóng băng dữ liệu lịch sử.
 */

//const { PrismaClient } = require('@prisma/client'); //không sinh thêm PrismaClient vì đã khaibaso trong prisma.js
//const prisma = new PrismaClient(); // Khởi tạo ORM kết nối dữ liệu Supabase

const { basePrisma } = require('../lib/prisma.js');
const { BusinessLogSchemas } = require('./businessLogSchemas');

/*
class BusinessLoggerService {
  
  /**
   * @dateTime 2026-06-15 15:50:00
   * @description Hàm cốt lõi nhận yêu cầu từ các Service nghiệp vụ khác, kiểm tra tính hợp pháp
   * của Metadata JSON tương ứng với từng loại tiến trình rồi lưu trực tiếp xuống PostgreSQL.
   * * @param {Object} params - Gói tham số đầu vào của tiến trình nghiệp vụ
   * @param {string} params.correlation_id - Mã UUID liên vết dòng chảy phiên làm việc của một request
   * @param {number} [params.attempt_no=1] - Số lượt thực hiện (Phục vụ theo dõi retry khi gặp lỗi mạng/API)
   * @param {string} params.process_type - Tên loại tiến trình nghiệp vụ (Khớp với Enum business_process_type)
   * @param {string} [params.actor_type='USER'] - Loại tác nhân: USER, SYSTEM, CRON, JOB_RUNNER, IMPORT_TOOL
   * @param {string} params.actor_id - UUID của tác nhân thực hiện hành vi
   * @param {string} [params.tenant_id] - UUID của dòng họ sở hữu dữ liệu (Null nếu thuộc hệ thống tổng)
   * @param {string} [params.process_status='SUCCESS'] - Kết quả thực thi: SUCCESS hoặc FAILED
   * @param {import('./business-log-schemas').LogContext} params.context - Ngữ cảnh chứa thông tin đóng băng (Snapshot)
   * @param {Object} params.payload - Dữ liệu thô đặc thù của riêng tiến trình đó
   * @returns {Promise<Object>} Trả về bản ghi vừa được tạo thành công dưới Database Supabase
   * ------------------------------------
  async createLog({
    correlation_id,
    attempt_no = 1,
    process_type,
    actor_type = 'USER',
    actor_id,
    tenant_id,
    process_status = 'SUCCESS',
    context,
    payload
  }) {
    
    * SỬA LẠI
    
    /**
     * @dateTime 2026-06-15 15:51:00
     * @description [XỬ LÝ TRƯỚC LƯU - PRE-SAVE VALIDATION]
     * Trích xuất hàm kiểm tra tương ứng với mã tiến trình truyền vào. 
     * Nếu lập trình viên gọi mã lạ chưa được quy chuẩn, hệ thống sẽ quăng lỗi từ chối ngay lập tức để bảo vệ DB.
     ****************
    const schemaValidator = BusinessLogSchemas[process_type];
    if (!schemaValidator) {
      throw new Error(`Process type [${process_type}] has not been standardized in BusinessLogSchemas!`);
    }

    /**
     * @dateTime 2026-06-15 15:51:30
     * @description Ép dữ liệu payload chạy qua bộ lọc để sàng lọc sạch sẽ các trường rác hoặc sai kiểu dữ liệu.
     * *************
    const sanitizedPayload = schemaValidator(payload);

    /**
     * @dateTime 2026-06-15 15:52:00
     * @description [THỰC THI GHI VÀO CƠ SỞ DỮ LIỆU]
     * Đẩy bản ghi xuống bảng business_process_logs thông qua Prisma Client.
     * Cấu trúc metadata được đóng gói chuẩn hóa gồm context (snapshot) và payload (dữ liệu sạch).
     ***************
    
    /**
     * @dateTime 2026-06-21T21:45:00+07:00
     * @description [THỰC THI GHI VÀO CƠ SỞ DỮ LIỆU]
     * ĐÃ VÁ: Chủ động gài attempt_no vào cả context và payload trước khi nạp xuống Database Supabase.
     ****************

    if (!correlation_id) {
      throw new Error('Business log requires correlation_id');
    }

    if (!process_type) {
      throw new Error('Business log requires process_type');
    }

    if (!actor_id) {
      throw new Error('Business log requires actor_id');
    }

    const schemaValidator = BusinessLogSchemas[process_type];

    if (!schemaValidator) {
      throw new Error(
        `Process type [${process_type}] has not been standardized in BusinessLogSchemas`
      );
    }

    const sanitizedPayload = schemaValidator(payload);

    const prisma = tx || basePrisma;

    return await prisma.business_process_logs.create({
      data: {
        correlation_id,
        attempt_no: parseInt(attempt_no, 10),
        process_type,
        actor_type,
        actor_id,
        tenant_id,
        process_status,
        metadata: {
          context: {
            target_id: context.target_id,
            target_name: context.target_name, //
            attempt_no: parseInt(attempt_no, 10) // 🟢 VÁ AN TOÀN TẦNG 1 (CONTEXT)
          },
          payload: {
            ...sanitizedPayload,
            attempt_no: parseInt(attempt_no, 10) // 🟢 VÁ AN TOÀN TẦNG 2 (PAYLOAD)
          }
        }
      }
    });
  }
}
*/

//VERSION: 1.1.1 --------------------------
class BusinessLoggerService {

  async createLog({
    correlation_id,
    attempt_no = 1,
    process_type,
    actor_type = 'USER',
    actor_id,
    tenant_id,
    process_status = 'SUCCESS',
    context = {},
    payload = {}
  }, tx = null) {   // ← Thêm tham số tx

    if (!correlation_id) throw new Error('Business log requires correlation_id');
    if (!process_type) throw new Error('Business log requires process_type');
    if (!actor_id) throw new Error('Business log requires actor_id');

    const schemaValidator = BusinessLogSchemas[process_type];
    if (!schemaValidator) {
      throw new Error(`Process type [${process_type}] has not been standardized in BusinessLogSchemas`);
    }

    const sanitizedPayload = schemaValidator(payload);

    const client = tx || basePrisma;   // ← Ưu tiên tx nếu có

    return await client.business_process_logs.create({
      data: {
        correlation_id,
        attempt_no: parseInt(attempt_no, 10),
        process_type,
        actor_type,
        actor_id,
        tenant_id: tenant_id || null,
        process_status,
        metadata: {
          context: {
            target_id: context.target_id,
            target_name: context.target_name,
            attempt_no: parseInt(attempt_no, 10)
          },
          payload: {
            ...sanitizedPayload,
            attempt_no: parseInt(attempt_no, 10)
          }
        }
      } 
    });
  } catch (err) {
    console.error('[BusinessLogger Error]:', err.message);
    // Không throw để không làm hỏng transaction chính
    return null;
    }
}

// Xuất bản một thực thể Instance duy nhất theo mô hình thiết kế Singleton Pattern
module.exports = new BusinessLoggerService();