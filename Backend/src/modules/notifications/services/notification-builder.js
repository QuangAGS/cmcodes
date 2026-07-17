/**
 * PATH: src/modules/notifications/services/notification-builder.js
 * DATETIME: 2026-06-21T22:15:00+07:00
 * VERSION: 1.0.1 (Vá lỗi thiếu tenant_id)
 * DESCRIPTION:
 * - Đưa tenant_id vào hợp đồng build dữ liệu để cô lập thông báo theo từng dòng họ.
 * 
 * OBJECTIVE: Builder chuẩn hóa dữ liệu Notification trước khi lưu DB.
 * Tuân thủ doctrine:
 * NotificationMetadataSchemas
 *      ↓
 * sanitize
 *      ↓
 * notifications
 */

const {
  NotificationMetadataSchemas
} = require('../policy/notification-metadata-schemas');

class NotificationBuilder {
  /**
   * Build notification payload chuẩn hóa.
   */
  build({
    user_id,
    tenant_id, // 🟢 BỔ SUNG: Tiếp nhận ID dòng họ sở hữu thông báo
    correlation_id,
    event_type,
    title,
    content,
    level = 'INFO',
    reliability = 'LOW',
    status = 'PENDING',
    context = {},
    payload = {}
  }) {
    const schemaValidator =
      NotificationMetadataSchemas[event_type];

    if (!schemaValidator) {
      throw new Error(
        `Notification event [${event_type}] has not been standardized in NotificationMetadataSchemas`
      );
    }

    const sanitizedPayload = schemaValidator(payload);

    return {
      user_id,
      tenant_id, // 🟢 BỔ SUNG: Đóng gói vào payload phẳng hạ tầng để lưu xuống bảng notifications
      title,
      content,
      event_type,
      level,
      reliability,
      status,
      correlation_id,
      metadata: {
        context: {
          target_id: context.target_id || null,
          target_name: context.target_name || null,
          tenant_id: tenant_id || null, // 🟢 ĐÓNG BĂNG VÀO CONTEXT JSON
          attempt_no: parseInt(context.attempt_no || payload.attempt_no || 1, 10) // 🟢 VÁ: Ép chui vào context JSON
        },
        payload: {
          ...sanitizedPayload,
          tenant_id: tenant_id || null, // 🟢 ĐÓNG BĂNG VÀO PAYLOAD DỮ LIỆU SẠCH
          attempt_no: parseInt(context.attempt_no || payload.attempt_no || 1, 10) // 🟢 VÁ: Ép chui vào payload JSON
        }
      }
    };
  }
}

module.exports =
  new NotificationBuilder();