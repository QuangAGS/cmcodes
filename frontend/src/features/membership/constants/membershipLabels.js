/**
 * =============================================================================
 * PATH        : frontend/src/features/membership/constants/membershipLabels.js
 * DATETIME    : 2026-11-10T11:00:00+07:00
 * VERSION     : 1.1.0-MEMBERSHIP-LABELS-ELDER-ENHANCED
 * DESCRIPTION : Từ điển nhãn chuẩn (SSOT) cho Phân hệ Membership (Multi-Home),
 *               bao gồm phân loại liên kết dòng họ (link_type), trạng thái
 *               liên kết & Onboarding Case (status), hỗ trợ định dạng màu sắc,
 *               huy hiệu (badges) và phát âm giọng đọc trợ lý ảo Elder TTS.
 * =============================================================================
 * CHANGELOGS:
 * - 2026-11-10T10:30:00+07:00 (v1.0.0-MEMBERSHIP-LABELS):
 *   + Khởi tạo danh mục nhãn ban đầu cho link_type và link_status.
 * - 2026-11-10T11:00:00+07:00 (v1.1.0-MEMBERSHIP-LABELS-ELDER-ENHANCED):
 *   + Tuân thủ nghiêm ngặt quy định QX (Q1, Q2, Q3, Q4).
 *   + Bổ sung trạng thái NEEDS_REVISION, TU_CHOI_LAN_CUOI (Terminal Hard-Lock)
 *     khớp đặc tả AMEND-RP-OP-2026-01-V1.1.
 *   + Tích hợp thuộc tính ttsText hỗ trợ công nghệ Elder Doctrine Text-to-Speech.
 * =============================================================================
 */

/**
 * Danh mục nhãn phân loại mối quan hệ liên kết dòng họ (user_member_links.link_type)
 * Mục đích: Hiển thị trên Clan Switcher dropdown, Topbar, thẻ thành viên và hỗ trợ đọc âm thanh.
 */
export const LINK_TYPE_LABELS = {
  PRIMARY_PATERNAL: {
    label: 'Họ nội (Trực hệ)',
    short: 'Nội tộc',
    color: 'bg-blue-100 text-blue-800 border-blue-300',
    icon: 'ShieldCheck',
    ttsText: 'Dòng họ nội tộc chính thức',
    description: 'Quan hệ trực hệ huyết thống theo ngành nội',
  },
  MATERNAL: {
    label: 'Họ ngoại',
    short: 'Ngoại tộc',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    icon: 'HeartHandshake',
    ttsText: 'Dòng họ ngoại tộc',
    description: 'Quan hệ liên kết qua dòng dõi bên ngoại',
  },
  SPOUSE_FAMILY: {
    label: 'Nhà dâu / rể',
    short: 'Hôn phối',
    color: 'bg-purple-100 text-purple-800 border-purple-300',
    icon: 'Users',
    ttsText: 'Dòng họ gia đình bên phối ngẫu',
    description: 'Dòng họ liên kết thông qua quan hệ vợ chồng',
  },
  GUARDIAN: {
    label: 'Đỡ đầu / Giám hộ',
    short: 'Giám hộ',
    color: 'bg-amber-100 text-amber-800 border-amber-300',
    icon: 'Award',
    ttsText: 'Dòng họ đỡ đầu hoặc giám hộ',
    description: 'Mối quan hệ con đỡ đầu, giám hộ phả hệ',
  },
};

/**
 * Danh mục nhãn trạng thái liên kết và vòng đời Onboarding Case
 * Mục đích: Đồng bộ trực tiếp với State Machine tại Backend (AMEND-RP-OP-2026-01-V1.1),
 * phục vụ việc hiển thị tại MembershipStatusPage và các cảnh báo giao diện.
 */
export const LINK_STATUS_LABELS = {
  DRAFT: {
    code: 'DRAFT',
    label: 'Khởi tạo / Bản nháp',
    badgeClass: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    ttsText: 'Hồ sơ đang ở trạng thái soạn thảo ban đầu',
    message: 'Bạn đang trong chế độ soạn thảo hồ sơ dòng họ.',
  },
  CHO_DUYET: {
    code: 'CHO_DUYET',
    label: 'Chờ duyệt',
    badgeClass: 'bg-orange-100 text-orange-800 border-orange-300',
    ttsText: 'Hồ sơ đang chờ ban quản trị dòng họ thẩm tra và phê duyệt',
    message: 'Hồ sơ của Bác/Bạn đã được gửi đi và đang chờ Ban quản trị dòng họ đối soát.',
  },
  NEEDS_REVISION: {
    code: 'NEEDS_REVISION',
    label: 'Cần bổ sung thông tin',
    badgeClass: 'bg-amber-100 text-amber-900 border-amber-400',
    ttsText: 'Ban quản trị đã trả hồ sơ và yêu cầu bổ sung thông tin',
    message: 'Ban quản trị dòng họ yêu cầu làm rõ thêm một số thông tin phả hệ.',
  },
  DA_DUYET: {
    code: 'DA_DUYET',
    label: 'Chính thức',
    badgeClass: 'bg-green-100 text-green-800 border-green-300',
    ttsText: 'Hồ sơ đã được phê duyệt chính thức thành công',
    message: 'Liên kết dòng họ đã được xác thực chính thức.',
  },
  TU_CHOI: {
    code: 'TU_CHOI',
    label: 'Từ chối (Có thể mở lại)',
    badgeClass: 'bg-red-100 text-red-800 border-red-300',
    ttsText: 'Hồ sơ chưa được chấp thuận. Bác có thể gửi lại yêu cầu mới nếu cần',
    message: 'Yêu cầu liên kết tạm thời chưa được duyệt.',
  },
  TU_CHOI_LAN_CUOI: {
    code: 'TU_CHOI_LAN_CUOI',
    label: 'Từ chối lần cuối (Khóa vĩnh viễn)',
    badgeClass: 'bg-gray-800 text-white border-gray-900',
    ttsText: 'Hồ sơ đã bị từ chối lần cuối và đã được khóa an toàn',
    message: 'Hồ sơ đã bị từ chối lần cuối theo quyết định của Hội đồng gia tộc. Không thể mở lại.',
  },
};

/**
 * Thông điệp hỗ trợ giọng nói theo tôn ti Elder Doctrine
 * Mục đích: Trợ lý âm thanh (Voice Assistant) sử dụng xưng hô kính trọng khi hướng dẫn người cao tuổi.
 */
export const ELDER_MEMBERSHIP_MESSAGES = {
  SWITCH_SUCCESS: (clanName) => `Dạ thưa Bác, hệ thống đã chuyển thành công sang không gian của ${clanName}.`,
  SWITCH_FAILURE: 'Dạ thưa Bác, hệ thống gặp gián đoạn khi đổi dòng họ. Kính mời Bác bấm thử lại.',
  CLAIM_SUBMITTED: 'Dạ, hồ sơ nhận người thân đã gửi tới Ban quản trị dòng họ. Cháu sẽ kính báo ngay khi có kết quả.',
  REVISION_PROMPT: 'Dạ thưa Bác, Ban quản trị có gửi lời nhắn yêu cầu chỉnh sửa, Bác vui lòng nhấn nút để cập nhật hồ sơ.',
};

/**
 * Helper ánh xạ an toàn nhãn phân loại quan hệ dòng họ
 * @param {string} linkType - Mã phân loại liên kết (ví dụ: PRIMARY_PATERNAL, MATERNAL)
 * @returns {object} Đối tượng chứa nhãn và màu sắc định dạng chuẩn
 */
export const getLinkTypeMeta = (linkType) => {
  return LINK_TYPE_LABELS[linkType] || {
    label: 'Thành viên liên kết',
    short: 'Liên kết',
    color: 'bg-gray-100 text-gray-800 border-gray-300',
    icon: 'User',
    ttsText: 'Thành viên dòng họ',
    description: 'Quan hệ thành viên dòng họ',
  };
};

/**
 * Helper ánh xạ an toàn trạng thái liên kết
 * @param {string} status - Mã trạng thái liên kết/case (ví dụ: CHO_DUYET, DA_DUYET)
 * @returns {object} Đối tượng cấu hình hiển thị trạng thái
 */
export const getLinkStatusMeta = (status) => {
  return LINK_STATUS_LABELS[status] || {
    code: 'UNKNOWN',
    label: 'Không xác định',
    badgeClass: 'bg-gray-100 text-gray-700 border-gray-300',
    ttsText: 'Trạng thái hiện tại chưa xác định',
    message: 'Thông tin trạng thái đang được cập nhật.',
  };
};