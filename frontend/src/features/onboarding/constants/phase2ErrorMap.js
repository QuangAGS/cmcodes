/**
 * PATH       : src/features/onboarding/constants/phase2ErrorMap.js
 * DATETIME   : 2026-11-19T16:30:00+07:00
 * VERSION    : 1.0.0-ISO29148
 * DESCRIPTION: Bảng ánh xạ mã lỗi HTTP sang thông báo UI thân thiện.
 */

export const PHASE2_ERROR_MAP = Object.freeze({
  RULES_SNAPSHOT_TOO_LONG: {
    message: "Nội dung bản cam kết nội quy vượt quá giới hạn 30.000 ký tự. Vui lòng rút gọn hoặc liên hệ Ban Quản trị.",
    action: "keep_state",
  },
  REFERRER_COOLDOWN_ACTIVE: {
    message: "Người bảo lãnh này vừa từ chối yêu cầu trước đó. Bác vui lòng chọn người bảo lãnh khác hoặc thử lại sau 7 ngày.",
    action: "lock_referrer",
  },
  REFERRER_DECEASED: {
    message: "Người bảo lãnh của hồ sơ này vừa được ghi nhận đã qua đời. Hệ thống đã tự động chuyển hồ sơ về trạng thái Yêu cầu bổ sung để chọn người bảo lãnh mới.",
    action: "needs_revision",
  },
  INVALID_BENEFICIARY_TOKEN: {
    message: "Mã xác nhận đồng thuận không hợp lệ hoặc đã được sử dụng trước đó.",
    action: "go_home",
  },
  TURNSTILE_REQUIRED: {
    message: "Hệ thống đang tăng cường kiểm tra an toàn. Bác vui lòng tích vào ô xác thực bên dưới để tiếp tục tìm kiếm.",
    action: "show_turnstile",
  },
  TURNSTILE_FAILED: {
    message: "Hệ thống đang tăng cường kiểm tra an toàn. Bác vui lòng tích vào ô xác thực bên dưới để tiếp tục tìm kiếm.",
    action: "show_turnstile",
  },
  CLAIM_HOPPING_DETECTED: {
    message: "Tài khoản của bác đã có 2 lần gửi yêu cầu nhận diện thành viên bị từ chối vĩnh viễn tại dòng họ này trong 90 ngày qua nên tạm khóa chức năng này.",
    action: "block_claim",
  },
  CONCURRENT_TRANSACTION_LOCKED: {
    message: "Hồ sơ hoặc thành viên này đang được xử lý ở một phiên khác. Dữ liệu của bác vẫn được giữ nguyên, vui lòng bấm Thử lại sau 5 giây.",
    action: "keep_state",
  },
  ALREADY_LINKED_TO_TENANT: {
    message: "Tài khoản của bác đã được liên kết với một thành viên trong dòng họ này rồi.",
    action: "redirect_tenant",
  },
  BENEFICIARY_TOKEN_EXPIRED: {
    message: "Liên kết xác nhận đồng thuận này đã hết thời hạn hoặc hồ sơ đã được xử lý xong.",
    action: "terminal_state",
  },
  ONBOARDING_CASE_TERMINAL_TOKEN_GONE: {
    message: "Liên kết xác nhận đồng thuận này đã hết thời hạn hoặc hồ sơ đã được xử lý xong.",
    action: "terminal_state",
  },
  ONBOARDING_QA_LOCKED: {
    message: "Hồ sơ đã tạm khóa tự động xác thực do trả lời chưa khớp 3 lần liên tiếp và đã được chuyển tới Ban Quản trị dòng họ xem xét thủ công.",
    action: "lock_qa",
  },
  PUBLIC_SEARCH_RATE_LIMITED: {
    message: "Bác thao tác tìm kiếm hơi nhanh. Vui lòng chờ trong giây lát rồi thử lại.",
    action: "rate_limit",
  },
  CLAIM_SEARCH_RATE_LIMITED: {
    message: "Bác thao tác tìm kiếm hơi nhanh. Vui lòng chờ trong giây lát rồi thử lại.",
    action: "rate_limit",
  },
  IN_APP_SEARCH_RATE_LIMITED: {
    message: "Bác thao tác tìm kiếm hơi nhanh. Vui lòng chờ trong giây lát rồi thử lại.",
    action: "rate_limit",
  },
});
