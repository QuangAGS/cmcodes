/**
 * PATH       : src/features/onboarding/constants/opMessages.js
 * DATETIME   : 2026-08-17T15:30:00+07:00
 * VERSION    : 1.0.0-FE-OP-B1-UI1
 * DESCRIPTION:
 * - Thông điệp AudioHelp / khung thông báo / voice theo trạng thái OP.
 * - Ngôn ngữ đời thường (Elder Support). Không hard-code rải trong page.
 */

'use strict';

/** Tóm tắt toàn trang — AudioHelpButton */
export const OP_HUB_AUDIO_HELP =
  'Bạn có thể chọn một trong các loại công việc để thực hiện theo chỉ dẫn.';

/** Lời chào khung thông báo */
export const OP_HUB_WELCOME =
  'Đây là danh mục việc bạn cần làm để được xét duyệt thành thành viên chính thức của dòng họ.';

/**
 * Câu trạng thái quy trình (hiển thị text — không chỉ audio).
 * @param {string|null} caseStatus
 * @param {boolean} profileComplete
 */
export function buildProcessStatusMessage(caseStatus, profileComplete) {
  switch (caseStatus) {
    case 'DRAFT':
      return profileComplete
        ? 'Hồ sơ cơ bản đã đủ. Bạn có thể gửi để xét duyệt.'
        : 'Hồ sơ chưa đủ. Bạn cần bổ sung vài thông tin cơ bản trước khi gửi duyệt.';
    case 'SUBMITTED':
    case 'UNDER_REVIEW':
      return 'Hồ sơ đang chờ người quản trị xem xét. Bạn vui lòng quay lại sau.';
    case 'NEEDS_REVISION':
      return 'Người quản trị đề nghị bổ sung. Hãy cập nhật Hồ sơ cơ sở rồi gửi lại.';
    case 'APPROVED':
      return 'Hồ sơ đã được duyệt. Bạn là thành viên chính thức.';
    case 'REJECTED':
      return 'Hồ sơ không được duyệt. Vui lòng liên hệ ban quản trị nếu cần hỗ trợ.';
    case 'CANCELLED':
      return 'Hồ sơ này đã được hủy.';
    default:
      return 'Đang cập nhật trạng thái hồ sơ của bạn.';
  }
}

/**
 * Đoạn hướng dẫn + TTS cho card Hồ sơ cơ sở (khi expand).
 * @param {{ complete?: boolean, missingFields?: string[] }} completeness
 * @param {string[]} missingLabels - đã map qua labelFields
 * @param {string|null} caseStatus
 */
export function buildBaseProfileGuidance(completeness, missingLabels, caseStatus) {
  const statusBit =
    caseStatus === 'DRAFT'
      ? 'Chưa gửi duyệt — đang hoàn thiện hồ sơ.'
      : caseStatus
        ? `Trạng thái hồ sơ: ${caseStatus}.`
        : '';

  if (completeness?.complete) {
    return `${statusBit} Hồ sơ cơ bản đã đủ thông tin bắt buộc. Bạn vẫn có thể xem lại hoặc chỉnh sửa.`.trim();
  }

  const missingText =
    missingLabels && missingLabels.length > 0
      ? `Còn thiếu: ${missingLabels.join(', ')}.`
      : 'Còn thiếu một số thông tin cơ bản.';

  return `${statusBit} ${missingText} Bấm Thực hiện để điền.`.replace(/\s+/g, ' ').trim();
}

/** AudioHelp — trang Hồ sơ cơ sở */
export const OP_BASE_PROFILE_AUDIO_HELP =
  'Trang này để điền họ tên, giới tính, ngày sinh và đời thứ mấy. Bạn có thể Lưu nháp khi chưa đủ, hoặc Gửi duyệt khi đã đủ thông tin bắt buộc.';

export const OP_BASE_PROFILE_ZONE = {
  basic:
    'Điền họ và tên, chọn giới tính và cho biết còn sống hay đã mất.',
  birth:
    'Điền năm, tháng và ngày sinh. Nếu không nhớ ngày hoặc tháng, tạm để trống và bổ sung sau khi lưu nháp.',
  generation:
    'Đời thứ mấy trong dòng họ, tính từ đời khởi tổ theo quy ước của dòng họ bạn.',
};

export const OP_BASE_PROFILE_TOAST = {
  draftSaved: 'Đã lưu nháp hồ sơ cơ sở.',
  submitted: 'Đã gửi hồ sơ để xét duyệt.',
  loadFailed: 'Không tải được hồ sơ. Vui lòng thử lại.',
  saveFailed: 'Không lưu được hồ sơ. Vui lòng thử lại.',
  submitFailed: 'Không gửi duyệt được. Vui lòng kiểm tra thông tin và thử lại.',
};

export default {
  OP_HUB_AUDIO_HELP,
  OP_HUB_WELCOME,
  buildProcessStatusMessage,
  buildBaseProfileGuidance,
  OP_BASE_PROFILE_AUDIO_HELP,
  OP_BASE_PROFILE_ZONE,
  OP_BASE_PROFILE_TOAST,
};