/**
 * PATH       : backend/src/services/auditService.js
 * DATETIME   : 2026-06-16T09:45:00+07:00
 * VERSION    : 1.3.0
 * DESCRIPTION: Ghi nhật ký biến động chi tiết dữ liệu (Data Change Audit Trail). 
 * - Patch bổ sung hỗ trợ correlation_id nhằm đồng bộ mã vết request với business_process_logs.
 * - Bảo tồn 100% cơ chế tự động nhận diện tenant_id và xử lý lý do mặc định (Q1).
 * - Tuân thủ nghiêm ngặt chuẩn định dạng tài liệu hệ thống (Q2).
 */
const { basePrisma } = require('../lib/prisma');

/**
 * @dateTime 2026-06-16T09:46:00+07:00
 * @description Hàm ghi nhận chi tiết biến động trạng thái dữ liệu trước và sau khi thay đổi (Diff Log).
 * @param {string} action - Loại hành động: 'THEM_MOI', 'CAP_NHAT', 'XOA' (Enum công chứng DB)
 * @param {string} tableName - Tên bảng vật lý xảy ra biến động dữ liệu
 * @param {string} recordId - UUID của bản ghi cụ thể bị tác động
 * @param {Object|null} [oldData=null] - Trạng thái dữ liệu nguyên bản TRƯỚC khi tác động (Old Snapshot)
 * @param {Object|null} [newData=null] - Trạng thái dữ liệu mới SAU khi tác động (New Snapshot)
 * @param {string} userId - UUID của người thực thi hành động chỉnh sửa
 * @param {string} [reason] - Lý do thay đổi dữ liệu do người dùng hoặc admin gõ từ FE
 * @param {string} [tenantId] - UUID của dòng họ sở hữu bản ghi dữ liệu này
 * @param {string} [correlation_id] - Mã liên vết phiên làm việc kết nối đồng bộ với business_process_logs
 * @returns {Promise<Object|null>} Bản ghi audit_logs vừa tạo hoặc null nếu xảy ra ngoại lệ
 */
const logAction = async (
  action,
  tableName,
  recordId,
  oldData = null,
  newData = null,
  userId,
  reason,
  tenantId,
  correlation_id // 🚀 MỚI: Bổ sung tham số để thu nạp mã vết từ chuỗi 7 bước của BP
) => {
  try {
    
    /**
     * @dateTime 2026-06-16T09:47:15+07:00
     * @description [BẢO TỒN LOGIC BƯỚC 1]: Xác định Tenant ID an toàn.
     * Ưu tiên tham số truyền vào, sau đó phân tích sâu cấu trúc bên trong của newData hoặc oldData.
     */
    const finalTenantId = tenantId || newData?.tenant_id || oldData?.tenant_id;
    
    // Đối với bảng đặc thù 'tenants', khóa recordId chính là tenantId của hệ thống
    const effectiveTenantId = (tableName === 'tenants') ? recordId : finalTenantId;

    // Van an toàn: Nếu không thuộc SYSTEM_ADMIN và không xác định được dòng họ, từ chối ghi log rác
    if (!effectiveTenantId) {
        console.warn(`⚠️ [Audit Warning]: Không thể xác định tenantId cho bảng ${tableName}`);
        return null;
    }

    /**
     * @dateTime 2026-06-16T09:48:30+07:00
     * @description [BẢO TỒN LOGIC BƯỚC 2]: Chuẩn hóa và làm sạch lý do thay đổi (change_reason).
     * Điền các lý do nghiệp vụ mặc định nếu lập trình viên không truyền lên từ tầng giao diện.
     */
    let finalReason = reason;
    if (!finalReason || finalReason.trim() === "") {
        const defaultReasons = {
            'THEM_MOI': 'Khởi tạo dữ liệu mới',
            'CAP_NHAT': 'Cập nhật thông tin định kỳ',
            'XOA': 'Xóa dữ liệu (Soft Delete)',
            'APPROVE': 'Phê duyệt yêu cầu đăng ký',
            'REJECT': 'Từ chối yêu cầu đăng ký'
        };
        finalReason = defaultReasons[action] || 'Hệ thống tự động ghi nhận';
    }

    /**
     * @dateTime 2026-06-16T09:50:00+07:00
     * @description [BƯỚC 3: THỰC THI GHI VÀO CƠ SỞ DỮ LIỆU SUPABASE]
     * Ghi nhận dữ liệu chi tiết. Trường ID được cấu hình bỏ qua vì Postgres đã tự động sinh (gen_random_uuid()).
     * Tách biệt cấu trúc JSON cũ và mới thông qua lệnh Deep Clone JSON để tránh xung đột tham chiếu bộ nhớ.
     */
    return await basePrisma.audit_logs.create({
      data: {
        action,
        table_name: tableName,
        record_id: recordId,
        // Clone object để bảo toàn tính nguyên bản dữ liệu tuyệt đối tại thời điểm đóng băng log
        old_data: oldData ? JSON.parse(JSON.stringify(oldData)) : null,
        new_data: newData ? JSON.parse(JSON.stringify(newData)) : null,
        changed_by: userId || null,
        change_reason: finalReason,
        tenant_id: effectiveTenantId,
        correlation_id: correlation_id || null // 🚀 MỚI: Khóa chặt mắt xích liên vết request vào đây
      },
    });
  } catch (error) {
    console.error('❌ [Audit Log Error]:', error.message);
    return null;
  }
};

module.exports = { logAction };