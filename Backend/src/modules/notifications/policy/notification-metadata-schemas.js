/**
 * PATH: src/modules/notifications/policy/notification-metadata-schemas.js
 * DATETIME: 2026-06-17 10:00:00
 * VERSION: 1.0.0
 * DESCRIPTION:
 * Registry chuẩn hóa metadata của notifications.
 *
 * Mục tiêu:
 * - Ép kiểu dữ liệu đầu vào
 * - Loại bỏ field rác
 * - Chuẩn hóa payload cho từng notification_event
 * - Đồng nhất với doctrine BusinessLogSchemas
 */

const NotificationMetadataSchemas = {

  // ============================================================
  // USER EVENTS
  // ============================================================

  USER_REGISTERED: (payload) => {
    return {
      email: payload.email || null,
      phone: payload.phone || null,
      registered_via: payload.registered_via || 'WEB',
      full_name: payload.full_name || null
    };
  },

  USER_APPROVAL_PENDING: (payload) => {
    return {
      submitted_at: payload.submitted_at || null,
      note: payload.note || null
    };
  },

  USER_APPROVED: (payload) => {
    return {
      approved_role: payload.approved_role || 'USER',
      approver_note: payload.approver_note || 'Tài khoản đã được phê duyệt',
      tenant_id: payload.tenant_id || null,
      attempt_no: parseInt(payload.attempt_no, 10) || 1 // 🟢 VÁ: Chấp nhận số lượt duyệt
    };
  },

  USER_REJECTED: (payload) => {
    if (!payload.reason) throw new Error('USER_REJECTED requires reason');
    return {
      reason: payload.reason,
      approver_note: payload.approver_note || null,
      tenant_id: payload.tenant_id || null,
      attempt_no: parseInt(payload.attempt_no, 10) || 1 // 🟢 VÁ: Chấp nhận số lượt duyệt
    };
  },

  PASSWORD_RESET_REQUESTED: (payload) => {
    return {
      identifier: payload.identifier || null,
      ip_address: payload.ip_address || null
    };
  },

  PASSWORD_CHANGED: () => {
    return {};
  },

  LOGIN_SUCCESS: (payload) => {
    return {
      ip_address: payload.ip_address || null,
      device: payload.device || null
    };
  },

  SUSPICIOUS_LOGIN: (payload) => {
    return {
      ip_address: payload.ip_address || null,
      location: payload.location || null
    };
  },

  ACCOUNT_LOCKED: (payload) => {
    return {
      reason: payload.reason || null,
      duration_minutes:
        payload.duration_minutes || null
    };
  },

  SECURITY_ALERT: (payload) => {
    return {
      alert_code: payload.alert_code || null,
      details: payload.details || null
    };
  },

  // ============================================================
  // MEMBERSHIP / CLAN EVENTS
  // ============================================================

  CLAN_JOIN_REQUEST: (payload) => {

    if (!payload.clan_id) {
      throw new Error(
        'CLAN_JOIN_REQUEST requires clan_id'
      );
    }

    return {
      clan_id: payload.clan_id,
      relationship_claimed:
        payload.relationship_claimed || null
    };
  },

  MEMBERSHIP_APPROVED: (payload) => {
    return {
      clan_id: payload.clan_id || null,
      approved_role:
        payload.approved_role || 'USER'
    };
  },

  MEMBERSHIP_REJECTED: (payload) => {

    if (!payload.reason) {
      throw new Error(
        'MEMBERSHIP_REJECTED requires reason'
      );
    }

    return {
      clan_id: payload.clan_id || null,
      reason: payload.reason
    };
  },

  ROLE_CHANGED: (payload) => {

    if (!payload.new_role) {
      throw new Error(
        'ROLE_CHANGED requires new_role'
      );
    }

    return {
      old_role: payload.old_role || null,
      new_role: payload.new_role
    };
  }

};

module.exports = {
  NotificationMetadataSchemas
};