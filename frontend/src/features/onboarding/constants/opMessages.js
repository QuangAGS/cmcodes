/**
 * PATH       : src/features/onboarding/constants/opMessages.js
 * DATETIME   : 2026-08-23T16:45:00+07:00
 * VERSION    : 1.1.0-FE-OP-B3
 * DESCRIPTION:
 * - Thông điệp AudioHelp / khung thông báo / voice theo trạng thái OP.
 * - B3: hiện đúng revision_request / rejection_reason từ admin (không chung chung).
 * - Ngôn ngữ đời thường (Elder Support).
 */

'use strict';

/** Tóm tắt toàn trang — AudioHelpButton */
export const OP_HUB_AUDIO_HELP =
  'Bạn có thể chọn một trong các loại công việc để thực hiện theo chỉ dẫn. Khi ban quản trị yêu cầu bổ sung, nội dung cụ thể sẽ hiện trong khung thông báo.';

/** Lời chào khung thông báo */
export const OP_HUB_WELCOME =
  'Đây là danh mục việc bạn cần làm để được xét duyệt thành thành viên chính thức của dòng họ.';

/**
 * @typedef {object} OpCaseAdminNotes
 * @property {string|null} [revision_request]
 * @property {string|null} [review_note]
 * @property {string|null} [rejection_reason]
 * @property {boolean} [reopenable]
 */

/**
 * Câu trạng thái quy trình — ưu tiên nội dung admin khi có.
 * @param {string|null} caseStatus
 * @param {boolean} profileComplete
 * @param {OpCaseAdminNotes} [adminNotes]
 */
export function buildProcessStatusMessage(
  caseStatus,
  profileComplete,
  adminNotes = {}
) {
  const revision =
    adminNotes?.revision_request && String(adminNotes.revision_request).trim();
  const rejection =
    adminNotes?.rejection_reason && String(adminNotes.rejection_reason).trim();
  const reopenable = adminNotes?.reopenable === true;

  switch (caseStatus) {
    case 'DRAFT':
      return profileComplete
        ? 'Hồ sơ cơ bản đã đủ. Bạn có thể mở Hồ sơ cơ sở và gửi để xét duyệt.'
        : 'Hồ sơ chưa đủ. Bạn cần bổ sung vài thông tin cơ bản trước khi gửi duyệt.';
    case 'SUBMITTED':
    case 'UNDER_REVIEW':
      return 'Hồ sơ đang chờ người quản trị xem xét. Bạn vui lòng quay lại sau.';
    case 'NEEDS_REVISION':
      if (revision) {
        return `Ban quản trị yêu cầu bạn bổ sung / chỉnh sửa: ${revision}`;
      }
      return 'Ban quản trị yêu cầu bổ sung hồ sơ. Hãy cập nhật Hồ sơ cơ sở rồi gửi lại.';
    case 'APPROVED':
      return 'Hồ sơ đã được duyệt. Bạn là thành viên chính thức.';
    case 'REJECTED':
      if (rejection) {
        return reopenable
          ? `Hồ sơ bị từ chối. Lý do: ${rejection}. Bạn có thể mở lại hồ sơ, bổ sung rồi gửi duyệt lại.`
          : `Hồ sơ bị từ chối lần cuối. Lý do: ${rejection}. Vui lòng liên hệ ban quản trị nếu cần hỗ trợ.`;
      }
      return reopenable
        ? 'Hồ sơ bị từ chối. Bạn có thể mở lại, bổ sung rồi gửi duyệt lại.'
        : 'Hồ sơ bị từ chối lần cuối. Vui lòng liên hệ ban quản trị nếu cần hỗ trợ.';
    case 'CANCELLED':
      return 'Hồ sơ này đã được hủy.';
    default:
      return 'Đang cập nhật trạng thái hồ sơ của bạn.';
  }
}

/**
 * Đoạn hướng dẫn + TTS cho card Hồ sơ cơ sở (khi expand).
 * Ưu tiên lời admin (revision) hơn danh sách field thiếu hệ thống.
 *
 * @param {{ complete?: boolean, missingFields?: string[] }} completeness
 * @param {string[]} missingLabels - đã map qua labelFields
 * @param {string|null} caseStatusLabel - nhãn tiếng Việt hoặc mã status
 * @param {OpCaseAdminNotes} [adminNotes]
 */
export function buildBaseProfileGuidance(
  completeness,
  missingLabels,
  caseStatusLabel,
  adminNotes = {}
) {
  const status = typeof caseStatusLabel === 'string' ? caseStatusLabel : '';
  const revision =
    adminNotes?.revision_request && String(adminNotes.revision_request).trim();
  const rejection =
    adminNotes?.rejection_reason && String(adminNotes.rejection_reason).trim();
  const reopenable = adminNotes?.reopenable === true;

  // Admin trả sửa: luôn hiện đúng nội dung yêu cầu
  if (status === 'NEEDS_REVISION' || status === 'Cần bổ sung') {
    if (revision) {
      const missingText =
        missingLabels && missingLabels.length > 0
          ? ` Hệ thống còn ghi nhận thiếu: ${missingLabels.join(', ')}.`
          : '';
      return `Yêu cầu từ ban quản trị: ${revision}.${missingText} Bấm Thực hiện để chỉnh sửa rồi gửi duyệt lại.`.replace(
        /\s+/g,
        ' '
      ).trim();
    }
  }

  if (status === 'REJECTED' || status === 'Từ chối') {
    if (rejection) {
      return reopenable
        ? `Lý do từ chối: ${rejection}. Bạn có thể mở lại hồ sơ và bổ sung.`
        : `Lý do từ chối lần cuối: ${rejection}.`;
    }
  }

  const statusBit =
    status === 'DRAFT' || status === 'Nháp'
      ? 'Chưa gửi duyệt — đang hoàn thiện hồ sơ.'
      : status
        ? `Trạng thái hồ sơ: ${status}.`
        : '';

  if (completeness?.complete) {
    return `${statusBit} Hồ sơ cơ bản đã đủ thông tin bắt buộc theo hệ thống. Bạn vẫn có thể xem lại hoặc chỉnh sửa.`.trim();
  }

  const missingText =
    missingLabels && missingLabels.length > 0
      ? `Còn thiếu: ${missingLabels.join(', ')}.`
      : 'Còn thiếu một số thông tin cơ bản.';

  return `${statusBit} ${missingText} Bấm Thực hiện để điền.`
    .replace(/\s+/g, ' ')
    .trim();
}

/** AudioHelp — trang Hồ sơ cơ sở */
export const OP_BASE_PROFILE_AUDIO_HELP =
  'Trang này để điền họ tên, giới tính, ngày sinh và đời thứ mấy. Bạn có thể Lưu nháp khi chưa đủ, hoặc Gửi duyệt khi đã đủ thông tin bắt buộc. Nếu ban quản trị yêu cầu bổ sung, hãy sửa đúng nội dung được nêu rồi gửi lại.';

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
  reopened: 'Đã mở lại hồ sơ. Bạn có thể bổ sung rồi gửi duyệt.',
  loadFailed: 'Không tải được hồ sơ. Vui lòng thử lại.',
  saveFailed: 'Không lưu được hồ sơ. Vui lòng thử lại.',
  submitFailed: 'Không gửi duyệt được. Vui lòng kiểm tra thông tin và thử lại.',
  reopenFailed: 'Không mở lại được hồ sơ. Vui lòng thử lại.',
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
