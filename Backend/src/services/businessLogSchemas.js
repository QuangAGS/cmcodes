/**
 * PATH: src/services/businessLogSchemas.js
 * DATETIME: 2026-09-01T15:45:00+07:00
 * VERSION: 1.2.0-BFA-222-B2
 * DESCRIPTION: Data contract metadata BPL theo process_type.
 *   PR-2: USER_APPROVAL giữ action / status_* / case_id / is_final / admin_note
 *         (trước đây whitelist quá hẹp → mọi action Admin bị ghi thành "Phê duyệt...").
 * Định nghĩa hợp đồng dữ liệu (Data Contract) và khuôn mẫu kiểm tra (Validation Schema)
 * cho cấu trúc JSON metadata của từng tiến trình nghiệp vụ (Business Process).
 * Áp đặt học thuyết "Đóng băng lịch sử" (Snapshot Doctrine) cho dữ liệu ngữ cảnh mục tiêu.
 */

/**
 * @dateTime 2026-06-15 15:41:15
 * @description Định nghĩa kiểu dữ liệu mẫu ngữ cảnh (Context) mang tính chất ĐÓNG BĂNG DỮ LIỆU (Snapshot).
 * @note [HỌC THUYẾT SNAPSHOT]: target_name phải lưu tên thực tế ngay tại thời điểm xảy ra sự kiện (quá khứ). 
 * Tuyệt đối không được cập nhật theo thời gian thực (Realtime). Nếu năm 2026 cụ tên "A" được thêm vào gia phả, 
 * sang năm 2030 con cháu đổi tên cụ thành "B", thì bản ghi log của năm 2026 vẫn phải giữ nguyên chữ "A".
 * Điều này vừa bảo toàn tính toàn vẹn của lịch sử kiểm toán, vừa giúp UI render Timeline siêu tốc không cần JOIN bảng.
 * * @typedef {Object} LogContext
 * @property {string} target_id - ID vật lý cố định của đối tượng bị tác động (User UUID, Member UUID...)
 * @property {string} target_name - TÊN SNAPSHOT tại thời điểm phát sinh sự kiện.
 */

/**
 * @dateTime 2026-06-15 15:42:00
 * @description Khối ánh xạ bộ lọc (Strategy Pattern) cho từng tiến trình.
 * Giúp ép kiểu, gạt bỏ các thuộc tính rác trước khi chạm xuống ổ đĩa cứng của Supabase.
 */
const BusinessLogSchemas = {
  
  // =========================================================================
  // KHỐI TIẾN TRÌNH: QUẢN LÝ TÀI KHOẢN NGƯỜI DÙNG (USER PROCESSES)
  // =========================================================================

  /**
   * @dateTime 2026-06-15 15:42:15
   * @description Chuẩn hóa dữ liệu khi người dùng đăng ký tài khoản mới.
   * @note Cho phép linh hoạt email hoặc phone nhưng bắt buộc lưu vết phương thức đăng ký để phục vụ analytics.
   */
  USER_REGISTER: (payload) => {
    return {
      email: payload.email || null,
      phone: payload.phone || null,
      registered_via: payload.registered_via || 'WEB', // Chấp nhận: WEB, MOBILE, ZALO...
      temp_full_name: payload.temp_full_name || null
    };
  },

  /**
   * @dateTime 2026-06-15 15:42:40
   * @description Chuẩn hóa dữ liệu khi phê duyệt và cấp quyền tài khoản người dùng vào dòng họ.
   * PR2: Mở rộng contract USER_APPROVAL
   */
  /**
   * USER_APPROVAL — RP identity actions (Approve / Reject / Return / Reopen / Revision submit).
   * PR-2: giữ đủ semantic; map admin_note → approver_note.
   * action: APPROVE | REJECT | FINAL_REJECT | RETURN_FOR_REVISION | REOPEN_REJECTED | REVISION_SUBMIT
   */
  USER_APPROVAL: (payload = {}) => {
    const action = payload.action || 'APPROVE';
    const noteFromCaller =
      (payload.approver_note && String(payload.approver_note).trim()) ||
      (payload.admin_note && String(payload.admin_note).trim()) ||
      null;

    // Chỉ default câu "Phê duyệt..." khi đúng action APPROVE và caller không gửi note
    let approver_note = noteFromCaller;
    if (!approver_note && action === 'APPROVE') {
      approver_note = 'Phê duyệt tài khoản thành công';
    }

    return {
      action,
      approved_role: payload.approved_role || 'USER',
      approver_note,
      admin_note: noteFromCaller || approver_note,
      attempt_no: parseInt(payload.attempt_no, 10) || 1,
      status_before:
        payload.status_before !== undefined && payload.status_before !== null
          ? payload.status_before
          : null,
      status_after:
        payload.status_after !== undefined && payload.status_after !== null
          ? payload.status_after
          : null,
      is_final: payload.is_final === true,
      case_id: payload.case_id || null,
      case_status_after: payload.case_status_after || null,
      new_case_id: payload.new_case_id || null,
    };
  },

  /**
   * @dateTime 2026-06-15 15:43:00
   * @description Kiểm tra dữ liệu khi từ chối kích hoạt tài khoản của người đăng ký.
   * @note Bắt buộc lập trình viên phải truyền lý do từ chối (reason) để gửi mail thông báo minh bạch cho user.
   */
  USER_REJECTION: (payload) => {
    if (!payload.reason) throw new Error("USER_REJECTION requires a reason");
    return { reason: payload.reason };
  },

  /**
   * @dateTime 2026-06-15 15:43:30
   * @description Lưu vết tiến trình gửi yêu cầu cấp lại mật khẩu (quên mật khẩu).
   * @note Lưu lại identifier (email/phone nhận OTP) để phát hiện các cuộc tấn công spam OTP (Brute-force).
   */
  PASSWORD_RESET_REQUESTED: (payload) => {
    return {
      identifier: payload.identifier,
      ip_address: payload.ip_address || null
    };
  },

  /**
   * @dateTime 2026-06-15 15:44:00
   * @description Chuẩn hóa dữ liệu khi khóa tài khoản tạm thời hoặc cấm truy cập.
   */
  USER_LOCK: (payload) => {
    if (!payload.reason) throw new Error("USER_LOCK requires a reason");
    return {
      reason: payload.reason,
      duration_minutes: parseInt(payload.duration_minutes, 10) || null // null nghĩa là khóa vô thời hạn
    };
  },

  /**
   * @dateTime 2026-06-15 15:44:25
   * @description Ghi nhận lý do mở khóa tài khoản người dùng.
   */
  USER_UNLOCK: (payload) => {
    return { reason: payload.reason || "Mở khóa theo yêu cầu hoặc hết hạn hệ thống" };
  },

  /**
   * @dateTime 2026-06-15 15:44:50
   * @description Xử lý tiến trình cấm người dùng truy cập vĩnh viễn (Ban).
   ****************
  USER_BAN: (payload) => {
    if (!payload.reason) throw new Error("USER_BAN requires a reason");
    return { reason: payload.reason };
  },
  */
 
  /**
   * @dateTime 2026-06-15 15:45:10
   * @description Xử lý tiến trình gỡ cấm tài khoản (Unban).
   */
  USER_UNBAN: (payload) => {
    return { reason: payload.reason || "Gỡ cấm theo yêu cầu ban quản trị dòng họ" };
  },


  // =========================================================================
  // KHỐI TIẾN TRÌNH: THÀNH VIÊN GIA PHẢ (MEMBER PROCESSES)
  // =========================================================================

  /**
   * @dateTime 2026-06-15 15:45:40
   * @description Đảm bảo cấu trúc khi thêm một thành viên mới vào cây gia phả của dòng họ.
   * @note Lưu giữ các cấu trúc ID quan hệ huyết thống để phục vụ vẽ sơ đồ cây phả hệ ở Frontend.
   */
  MEMBER_ADD: (payload) => {
    if (!payload.branch_id) throw new Error("MEMBER_ADD requires branch_id");
    return {
      branch_id: payload.branch_id,
      generation: parseInt(payload.generation, 10) || 1,
      father_id: payload.father_id || null,
      mother_id: payload.mother_id || null
    };
  },

  /**
   * @dateTime 2026-06-15 15:46:10
   * @description Kiểm tra khi loại bỏ thông tin một thành viên khỏi cây gia phả.
   * @note Hỗ trợ liên kết lưu vết sang thông tin mộ phần (archive_grave_link) nếu xóa do lý do qua đời.
   */
  MEMBER_REMOVE: (payload) => {
    if (!payload.reason) throw new Error("MEMBER_REMOVE requires a reason");
    return {
      reason: payload.reason,
      archive_grave_link: payload.archive_grave_link || null
    };
  },


  // =========================================================================
  // KHỐI TIẾN TRÌNH: QUẢN LÝ DÒNG HỌ / TỔ CHỨC (CLAN / TENANT PROCESSES)
  // =========================================================================

  /**
   * @dateTime 2026-06-15 15:46:45
   * @description Ghi vết khi hệ thống khởi tạo một Không gian Không gian Dòng họ (Tenant) mới.
   */
  CLAN_CREATE: (payload) => {
    if (!payload.slug) throw new Error("CLAN_CREATE requires clan slug");
    return {
      clan_name: payload.clan_name,
      slug: payload.slug,
      creator_phone: payload.creator_phone || null
    };
  },

  /**
   * @dateTime 2026-06-15 15:47:15
   * @description Ghi vết yêu cầu xin gia nhập dòng họ của các tài khoản người dùng mới.
   */
  CLAN_JOIN: (payload) => {
    if (!payload.clan_id) throw new Error("CLAN_JOIN requires clan_id");
    return {
      clan_id: payload.clan_id,
      relationship_claimed: payload.relationship_claimed || "Thành viên chi ngành",
      note: payload.note || null
    };
  },

  /**
   * @dateTime 2026-08-10T09:55:00+07:00
   * @description OP-2: Kích hoạt tenant (TAM_NGUNG → HOAT_DONG).
   */
  TENANT_ACTIVATE: (payload) => {
    return {
      action: payload.action || 'ACTIVATE',
      status_before: payload.status_before || null,
      status_after: payload.status_after || null,
    };
  },

  /**
   * @dateTime 2026-06-24T08:16:00+07:00
   * @description Chuẩn hóa dữ liệu thô đặc thù cho toàn bộ vòng đời Onboarding của hệ thống.
   * @note [DOCTRINE 25xX]: Sàng lọc sạch sẽ các trường rác trước khi chạm xuống ổ đĩa Supabase[cite: 12, 17].
   */
  // =========================================================================
  // KHỐI TIẾN TRÌNH: MEMBER ONBOARDING
  // =========================================================================

  ONBOARDING_CASE_CREATE: (payload) => {
    if (!payload.case_type) {
      throw new Error('ONBOARDING_CASE_CREATE requires case_type');
    }

    return {
      case_type: payload.case_type,
      initial_step: payload.initial_step || 'PROFILE',
      user_id: payload.user_id || null,
      member_id: payload.member_id || null,
      branch_id: payload.branch_id || null
    };
  },

  ONBOARDING_DRAFT_SAVE: (payload) => {
    if (!payload.case_id) {
      throw new Error('ONBOARDING_DRAFT_SAVE requires case_id');
    }

    return {
      case_id: payload.case_id,
      current_step: payload.current_step || null,
      completion_percent: Number(payload.completion_percent || 0),
      draft_version: Number(payload.draft_version || 1)
    };
  },

  ONBOARDING_PROFILE_COMPLETE: (payload) => {
    if (!payload.case_id || !payload.member_id) {
      throw new Error(
        'ONBOARDING_PROFILE_COMPLETE requires case_id and member_id'
      );
    }

    return {
      case_id: payload.case_id,
      member_id: payload.member_id,
      profile_completion_percent: Number(
        payload.profile_completion_percent || 100
      )
    };
  },

  ONBOARDING_BRANCH_CREATE: (payload) => {
    if (!payload.case_id || !payload.branch_id) {
      throw new Error(
        'ONBOARDING_BRANCH_CREATE requires case_id and branch_id'
      );
    }

    return {
      case_id: payload.case_id,
      branch_id: payload.branch_id,
      root_member_id: payload.root_member_id || null,
      member_count: Number(payload.member_count || 0),
      max_generation_depth: Number(payload.max_generation_depth || 4),
      branch_status: payload.branch_status || 'DRAFT'
    };
  },

  ONBOARDING_BRANCH_UPDATE: (payload) => {
    if (!payload.case_id || !payload.branch_id) {
      throw new Error(
        'ONBOARDING_BRANCH_UPDATE requires case_id and branch_id'
      );
    }

    return {
      case_id: payload.case_id,
      branch_id: payload.branch_id,
      member_count: Number(payload.member_count || 0),
      change_summary: payload.change_summary || null
    };
  },

  ONBOARDING_SUBMIT: (payload) => {
    if (!payload.case_id || !payload.branch_id) {
      throw new Error(
        'ONBOARDING_SUBMIT requires case_id and branch_id'
      );
    }

    return {
      case_id: payload.case_id,
      member_id: payload.member_id || null,
      branch_id: payload.branch_id,
      member_count: Number(payload.member_count || 0),
      submitted_note: payload.submitted_note || null
    };
  },

  ONBOARDING_REVIEW_START: (payload) => {
    if (!payload.case_id || !payload.branch_id) {
      throw new Error(
        'ONBOARDING_REVIEW_START requires case_id and branch_id'
      );
    }

    return {
      case_id: payload.case_id,
      branch_id: payload.branch_id,
      review_note: payload.review_note || null,
      branch_locked: true
    };
  },

  ONBOARDING_REJECT: (payload) => {
    if (!payload.case_id || !payload.reason) {
      throw new Error(
        'ONBOARDING_REJECT requires case_id and reason'
      );
    }

    return {
      case_id: payload.case_id,
      branch_id: payload.branch_id || null,
      reason: payload.reason,
      branch_status_after: payload.branch_status_after || 'REJECTED'
    };
  },

  ONBOARDING_CANCEL: (payload) => {
    if (!payload.case_id) {
      throw new Error('ONBOARDING_CANCEL requires case_id');
    }

    return {
      case_id: payload.case_id,
      branch_id: payload.branch_id || null,
      reason: payload.reason || null,
      branch_status_after: payload.branch_status_after || 'ARCHIVED'
    };
  },

  ONBOARDING_BRANCH_MERGE: (payload) => {
    if (!payload.case_id || !payload.branch_id || !payload.merge_target_member_id) {
      throw new Error(
        'ONBOARDING_BRANCH_MERGE requires case_id, branch_id and merge_target_member_id'
      );
    }

    return {
      case_id: payload.case_id,
      branch_id: payload.branch_id,
      root_member_id: payload.root_member_id || null,
      merge_target_member_id: payload.merge_target_member_id,
      merged_member_count: Number(payload.merged_member_count || 0),
      branch_status_before: payload.branch_status_before || 'UNDER_REVIEW',
      branch_status_after: payload.branch_status_after || 'MERGED'
    };
  },

  ONBOARDING_MEMBER_ACTIVATE: (payload) => {
    if (!payload.case_id || !payload.member_id) {
      throw new Error(
        'ONBOARDING_MEMBER_ACTIVATE requires case_id and member_id'
      );
    }

    return {
      case_id: payload.case_id,
      member_id: payload.member_id,
      member_status_before: payload.member_status_before || 'DU_BI',
      member_status_after: payload.member_status_after || 'CHINH_THUC',
      user_role_before: payload.user_role_before || 'VIEWER',
      user_role_after: payload.user_role_after || 'USER'
    };
  },

  // =========================================================================
  // A01 /me — BFA 2.2.2 B2 — CL = NONE
  // =========================================================================

  MEMBER_PROFILE_PATCH: (payload = {}) => {
    const member = payload.member && typeof payload.member === 'object' ? payload.member : {};
    const biography = payload.biography && typeof payload.biography === 'object' ? payload.biography : {};
    const fields = Array.isArray(payload.fields)
      ? payload.fields
      : [...Object.keys(member), ...Object.keys(biography)];
    return {
      member_id: payload.member_id || null,
      action: payload.action || 'PATCH',
      fields,
      member,
      biography,
    };
  },

  ACHIEVEMENT_UPSERT: (payload = {}) => {
    if (!payload.member_id) {
      throw new Error('ACHIEVEMENT_UPSERT requires member_id');
    }
    return {
      member_id: payload.member_id,
      achievement_id: payload.achievement_id || null,
      op: payload.op === 'UPDATE' ? 'UPDATE' : 'CREATE',
      category: payload.category || null,
      sub_category: payload.sub_category || null,
      title: payload.title || null,
      achieved_year: payload.achieved_year == null ? null : Number(payload.achieved_year),
    };
  },

  ACHIEVEMENT_DELETE: (payload = {}) => {
    if (!payload.member_id || !payload.achievement_id) {
      throw new Error('ACHIEVEMENT_DELETE requires member_id and achievement_id');
    }
    return {
      member_id: payload.member_id,
      achievement_id: payload.achievement_id,
    };
  },

  MEMBER_ADDRESS_LINK: (payload = {}) => {
    if (!payload.member_id) {
      throw new Error('MEMBER_ADDRESS_LINK requires member_id');
    }
    return {
      member_id: payload.member_id,
      usage: payload.usage === 'CURRENT' ? 'CURRENT' : 'ORIGIN',
      address_id: payload.address_id || null,
    };
  },

  MEDIA_AVATAR_UPSERT: (payload = {}) => {
    if (!payload.member_id) {
      throw new Error('MEDIA_AVATAR_UPSERT requires member_id');
    }
    return {
      member_id: payload.member_id,
      media_id: payload.media_id || null,
      op: payload.op || 'UPSERT',
      mime_type: payload.mime_type || null,
      file_ext: payload.file_ext || null,
    };
  },

  MEDIA_AVATAR_DELETE: (payload = {}) => {
    if (!payload.member_id) {
      throw new Error('MEDIA_AVATAR_DELETE requires member_id');
    }
    return {
      member_id: payload.member_id,
      media_id: payload.media_id || null,
    };
  },
};

module.exports = { BusinessLogSchemas };