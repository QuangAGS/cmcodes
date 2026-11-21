/**
 * ============================================================================
 * PATH       : src/features/onboarding/constants/phase2MessageCatalog.js
 * DATETIME   : 2026-11-21T09:45:00+07:00
 * VERSION    : 1.1.0-ISO29148-UAT-IMP3
 * DESCRIPTION:
 * - Từ điển quản lý tập trung toàn bộ thông báo nghiệp vụ & trợ lý giọng nói
 *   Phase 2 (Single Message Catalog) theo UAT-IMP3.
 * - Quy chuẩn bắt buộc:
 *   1. Ngôn ngữ thuần Việt đời thường, ấm áp, dễ hiểu với người cao tuổi (EU).
 *   2. Tuyệt đối KHÔNG chứa mã lỗi kỹ thuật, tên biến, mã HTTP hay chuỗi UUID.
 *   3. Không chứa ghi chú có nguy cơ suy ngược thông tin bảo mật của thành viên.
 * ============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

export const PHASE2_MESSAGE_CATALOG = Object.freeze({
  RULES_SNAPSHOT_TOO_LONG: {
    type: 'error',
    title: 'Nội dung bản cam kết quá dài',
    message:
      'Nội dung bản cam kết nội quy vượt quá giới hạn cho phép. Bác vui lòng rút gọn bớt hoặc liên hệ Ban Quản trị dòng họ để được hỗ trợ.',
    actionLabel: 'Đã hiểu',
    action: 'keep_state',
  },
  REFERRER_COOLDOWN_ACTIVE: {
    type: 'warning',
    title: 'Người giới thiệu tạm thời chưa nhận bảo lãnh',
    message:
      'Thành viên này vừa từ chối một yêu cầu bảo lãnh trước đó. Bác vui lòng chọn người thân khác trong họ hoặc thử lại sau 7 ngày.',
    actionLabel: 'Đã hiểu',
    action: 'lock_referrer',
  },
  REFERRER_DECEASED: {
    type: 'warning',
    title: 'Cần chọn người giới thiệu khác trong họ',
    message:
      'Người giới thiệu của hồ sơ này vừa được ghi nhận đã qua đời. Hệ thống đã chuyển hồ sơ sang trạng thái cần bổ sung để bác chọn người giới thiệu khác.',
    actionLabel: 'Đã hiểu',
    action: 'needs_revision',
  },
  INVALID_BENEFICIARY_TOKEN: {
    type: 'error',
    title: 'Đường dẫn xác nhận không hợp lệ',
    message:
      'Đường dẫn xác nhận đồng thuận này không đúng hoặc đã được sử dụng trước đó. Bác vui lòng kiểm tra lại tin nhắn hoặc liên hệ người khai hộ.',
    actionLabel: 'Về trang chủ',
    action: 'go_home',
  },
  TURNSTILE_REQUIRED: {
    type: 'warning',
    title: 'Xác nhận an toàn trước khi tìm kiếm',
    message:
      'Để bảo vệ thông tin sổ họ, bác vui lòng tích vào ô xác nhận bên dưới rồi tiếp tục tìm kiếm.',
    actionLabel: 'Đã hiểu',
    action: 'show_turnstile',
  },
  TURNSTILE_FAILED: {
    type: 'error',
    title: 'Xác nhận an toàn chưa hoàn tất',
    message:
      'Ô xác nhận an toàn chưa hoàn tất. Bác vui lòng tích lại vào ô vuông bên dưới để tiếp tục.',
    actionLabel: 'Đã hiểu',
    action: 'show_turnstile',
  },
  CLAIM_HOPPING_DETECTED: {
    type: 'error',
    title: 'Tạm khóa chức năng nhận hồ sơ có sẵn',
    message:
      'Tài khoản của bác đã có 2 lần gửi yêu cầu nhận hồ sơ chưa được duyệt tại dòng họ này trong 90 ngày qua. Bác vui lòng chọn mục khai báo hồ sơ mới để tiếp tục.',
    actionLabel: 'Chuyển sang Khai báo hồ sơ mới',
    action: 'block_claim',
  },
  CONCURRENT_TRANSACTION_LOCKED: {
    type: 'warning',
    title: 'Hồ sơ đang được xử lý',
    message:
      'Hồ sơ này đang được xử lý ở một phiên khác. Thông tin bác đã nhập vẫn được giữ nguyên, bác vui lòng bấm Thử lại ngay sau vài giây.',
    actionLabel: 'Thử lại ngay',
    action: 'keep_state',
  },
  ALREADY_LINKED_TO_TENANT: {
    type: 'warning',
    title: 'Tài khoản đã tham gia dòng họ này',
    message:
      'Tài khoản của bác đã được liên kết với một thành viên trong dòng họ này rồi. Bác có thể vào thẳng trang của dòng họ.',
    actionLabel: 'Vào không gian dòng họ',
    action: 'redirect_tenant',
  },
  BENEFICIARY_TOKEN_EXPIRED: {
    type: 'error',
    title: 'Đường dẫn xác nhận đã hết hạn',
    message:
      'Đường dẫn xác nhận đồng thuận này đã hết thời hạn sử dụng hoặc hồ sơ đã được giải quyết xong.',
    actionLabel: 'Đã hiểu',
    action: 'terminal_state',
  },
  ONBOARDING_CASE_TERMINAL_TOKEN_GONE: {
    type: 'error',
    title: 'Hồ sơ đã được đóng',
    message:
      'Hồ sơ liên quan đến đường dẫn này đã hoàn tất xử lý nên không cần xác nhận thêm.',
    actionLabel: 'Đã hiểu',
    action: 'terminal_state',
  },
  ONBOARDING_QA_LOCKED: {
    type: 'warning',
    title: 'Chuyển sang Ban Quản trị xem xét thủ công',
    message:
      'Do thông tin đối chiếu chưa khớp sau 3 lần thử, hệ thống đã tạm khóa phần trả lời tự động và chuyển hồ sơ tới Ban Quản trị dòng họ xem xét trực tiếp.',
    actionLabel: 'Đã hiểu',
    action: 'lock_qa',
  },
  PUBLIC_SEARCH_RATE_LIMITED: {
    type: 'warning',
    title: 'Tạm nghỉ tìm kiếm trong giây lát',
    message:
      'Bác thao tác tìm kiếm hơi nhanh. Bác vui lòng chờ vài giây rồi thử lại nhé.',
    actionLabel: 'Đã hiểu',
    action: 'rate_limit',
  },
  CLAIM_SEARCH_RATE_LIMITED: {
    type: 'warning',
    title: 'Tạm nghỉ tra cứu trong giây lát',
    message:
      'Bác thao tác tra cứu hơi nhanh. Bác vui lòng chờ vài giây rồi thử lại nhé.',
    actionLabel: 'Đã hiểu',
    action: 'rate_limit',
  },
  IN_APP_SEARCH_RATE_LIMITED: {
    type: 'warning',
    title: 'Tạm nghỉ tra cứu trong giây lát',
    message:
      'Bác thao tác tra cứu hơi nhanh. Bác vui lòng chờ vài giây rồi thử lại nhé.',
    actionLabel: 'Đã hiểu',
    action: 'rate_limit',
  },
  NETWORK_ERROR: {
    type: 'error',
    title: 'Mất kết nối mạng',
    message:
      'Không kết nối được với máy chủ. Bác vui lòng kiểm tra lại sóng Wifi hoặc 4G rồi thử lại.',
    actionLabel: 'Đã hiểu',
    action: 'keep_state',
  },
  GENERIC_ERROR: {
    type: 'error',
    title: 'Chưa thể thực hiện lúc này',
    message:
      'Hệ thống đang bận hoặc gặp gián đoạn nhỏ. Bác vui lòng bấm Đã hiểu và thử lại sau ít phút.',
    actionLabel: 'Đã hiểu',
    action: 'none',
  },
});

/**
 * Tra cứu thông báo chuẩn hóa cho người dùng cuối (EU) theo mã lỗi.
 * @param {string} code
 * @param {Partial<{ type: string, title: string, message: string, actionLabel: string }>} [overrides]
 */
export function getPhase2UserMessage(code, overrides = {}) {
  const entry =
    (code && PHASE2_MESSAGE_CATALOG[code]) || PHASE2_MESSAGE_CATALOG.GENERIC_ERROR;
  return {
    type: overrides.type || entry.type,
    title: overrides.title || entry.title,
    message: overrides.message || entry.message,
    actionLabel: overrides.actionLabel || entry.actionLabel,
    action: entry.action,
  };
}
