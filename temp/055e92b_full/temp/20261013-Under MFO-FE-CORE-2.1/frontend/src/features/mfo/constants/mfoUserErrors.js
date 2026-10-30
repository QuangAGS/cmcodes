/**
 * PATH       : src/features/mfo/constants/mfoUserErrors.js
 * DATETIME   : 2026-10-12T15:15:00+07:00
 * VERSION    : 2.1.1-DOCTRINE211-CATALOG
 * DESCRIPTION:
 * - Bảng Từ điển Thông điệp Chuẩn hóa (Single Authority Error & Success Catalog).
 * - Màn hình không tự viết câu. Không dùng từ kỹ thuật (payload, staging, tem, xưởng).
 * REFERENCE  : MFO-FE-DOCTRINE-2.1 Section 8 & 9; Patch Plan 2.1.1 Section 3
 */

export const MFO_USER_ERROR_CATALOG = Object.freeze({
  MFO_HOLD_CONFLICT:
    'Không thể tiếp tục. Có thể ý định của bác đang được người khác thực hiện. Xin chờ sau thời gian <expires_at>.',
  MFO_CLAN_UNCONFIRMED:
    'Hệ thống không tự xác định nội tộc. Bác hãy chọn người này có phải nội tộc không.',
  MFO_HOLD_EXPIRED:
    'Đã hết thời gian giữ chỗ. Vui lòng làm lại từ đầu.',
  OPTIMISTIC_LOCK_CONFLICT:
    'Công việc đã được cập nhật từ thiết bị khác. Trang sẽ tải lại.',
  MFO_ACTIVE_PROPOSAL_EXISTS:
    'Bác đang có một tờ chưa xong. Hãy xong tờ cũ trước khi mở tờ mới.',
  MFO_SMP_INVALID:
    'Thông tin chưa đủ. Hãy kiểm tra họ tên, giới tính và còn sống hay đã mất.',
  MFO_SMP_FORBIDDEN:
    'Đời và cha mẹ do hệ thống gắn. Bác không cần điền.',
  MFO_SMP_INCOMPLETE:
    'Tờ khai chưa đủ. Hãy ghi hồ sơ cho mọi người xin tạo đã được duyệt.',
  MFO_ALREADY_ON_BOOK:
    'Người này đã có trên sổ với cùng cha mẹ.',
  MFO_GATE2_CLOSED:
    'Việc khai báo chưa mở hoặc tờ khai đã đóng.',
  MFO_REASON_REQUIRED:
    'Hãy nhập ý kiến trước khi gửi.',
  MFO_NOT_DELETABLE_STATE:
    'Không xóa được. Hồ sơ đang được xem hoặc đã ghi sổ.',
  MFO_TARGET_NOT_CLAN_MEMBER:
    'Không thể chọn Thành viên ngoại tộc làm mốc trong Khung ý định.',
  UNAUTHENTICATED:
    'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  FORBIDDEN:
    'Bác không có quyền thực hiện thao tác này.',
});

export const MFO_SUCCESS_ALARM_CATALOG = Object.freeze({
  MFO_DRAFT_SAVED:
    'Đã lưu bản nháp khung.',
  MFO_PLAN_SUBMITTED:
    'Đã gửi khung tới Ban quản trị.',
  MFO_PLAN_APPROVED:
    'Khung đã được duyệt. Có thể khai báo tờ khai.',
  MFO_STAGING_SAVED:
    'Đã lưu nội dung tờ khai.',
  MFO_RESULT_SUBMITTED:
    'Đã trình tờ khai. Xin chờ quyết định.',
  MFO_RESULT_APPROVED:
    'Đã duyệt. Ý định đã được ghi vào sổ họ.',
  MFO_DRAFT_DELETED:
    'Đã xóa tờ.',
});

/**
 * Tra cứu thông điệp chuẩn hóa cho EU dựa trên mã lỗi hoặc fallback
 */
export function resolveMfoErrorMessage(code, fallbackMessage = null, expiresAt = null) {
  let text = MFO_USER_ERROR_CATALOG[code] || fallbackMessage || 'Có lỗi xảy ra. Vui lòng kiểm tra lại.';
  if (expiresAt && text.includes('<expires_at>')) {
    const timeStr = new Date(expiresAt).toLocaleString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    text = text.replace('<expires_at>', timeStr);
  }
  return text;
}