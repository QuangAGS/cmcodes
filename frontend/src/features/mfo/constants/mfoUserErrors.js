/**
 * PATH       : frontend/src/features/mfo/constants/mfoUserErrors.js
 * DATETIME   : 2026-10-16T09:02:00+07:00
 * VERSION    : 5.1.2-CONFLICT-DEADLINE
 * DESCRIPTION: Giữ bảng lỗi; bổ sung câu thành công duy nhất theo doctrine mục 9.
 *
 * CHANGE LOG:
 * - 2026-10-13T17:07:00+07:00 | 5.1.0 | Bảng câu lỗi và câu thành công theo doctrine.
 * - 2026-10-16T09:02:00+07:00 | 5.1.1 | Câu xung đột 409 đúng doctrine mục 8.
 * RULE       : Q1 bảo tồn ngoài phạm vi; Q2 metadata và chú thích thời gian.
 */
/**
 * PATH       : frontend/src/features/mfo/constants/mfoUserErrors.js
 * DATETIME   : 2026-09-20T10:40:00+07:00
 * VERSION    : 5.0.0-COMPLETE-5L-CANVAS-FULL
 * DESCRIPTION: Map mã BE MFO_* → câu End User (chữ + TTS).
 *              Không phơi code, HTTP, plan_ok, payload cho MWL.
 *              ADMIN IT có thể đọc code riêng; hàm này không gắn code vào câu.
 * PATTERN    : AuthPage — lấy code rồi đổi nghĩa, không đọc raw.
 */

export const MFO_USER_FALLBACK =
  'Chưa gửi được. Thử lại hoặc nhờ Ban quản trị.';

/**
 * code BE → câu nghĩa. Chỉ cửa USER / MWL.
 * Bổ sung khi lát sau gặp mã mới — không sửa câu cũ nếu nghĩa không đổi.
 */
export const MFO_USER_ERRORS = {
  MFO_MODE: 'Chưa gửi được tờ khai. Thử lại hoặc nhờ Ban quản trị.',

  MFO_K_MUST_ASSIGN_FOUNDER:
    'Dòng của bạn phải gắn đúng bạn. Không tạo thêm một bạn thứ hai.',

  MFO_LOT_NOT_FOUND: 'Không thấy tờ khai này.',

  MFO_PLAN_STATE: 'Tờ khai không ở bước cho phép việc vừa bấm.',

  MFO_GENERATION_REQUIRED: 'Đời gốc cần xác định đời trên cây họ.',

  MFO_MEMBER_NOT_FOUND: 'Không thấy người này trên sổ Họ.',

  MFO_PARENT_NOT_FOUND: 'Không thấy cha hoặc mẹ trên sổ Họ.',
  MFO_PARENT_REQUIRED: 'Đời này phải gắn cha hoặc mẹ từ đời trên.',
  MFO_GENDER_REQUIRED: 'Chọn nam hoặc nữ.',
  MFO_NAME_REQUIRED: 'Điền họ tên.',
  MFO_LINE_RANGE: 'Chỉ tạo người từ đời 1 đến đời 4.',
  MFO_UNION_EXISTS: 'Đôi này đã có trên sổ.',

  MFO_HOLD_EXPIRED: 'Tờ này đã hết hạn. Hãy mở tờ mới.',

  MFO_MEMBER_NOT_IN_LOT: 'Người này không thuộc tờ khai đang mở.',

  MFO_CANNOT_DELETE_ORIGIN: 'Không ẩn người gốc của tờ khai.',

  MFO_CANNOT_DELETE_FOUNDER: 'Không ẩn chính bạn trên tờ khai này.',

  MFO_HAS_CHILDREN:
    'Còn con gắn vào người này. Gỡ cha mẹ trên tờ trước đã.',

  MFO_UNION_NOT_FOUND: 'Không thấy quan hệ vợ chồng này.',

  MFO_ORIGIN_REQUIRED: 'Chưa chọn người gốc trong sổ Họ.',

  MFO_K_REQUIRED: 'Chưa chọn bạn cách gốc mấy đời.',

  MFO_K_TOO_FAR:
    'Bạn cách gốc hơn bốn đời. Đổi người gốc gần hơn. Không nhồi đời thứ năm vào tờ này.',

  MFO_HOLE:
    'Không để trống một đời giữa đời gốc và đời cuối đã khai.',

  MFO_LINE_GAP:
    'Không để trống một đời rồi khai đời dưới. Đời giữa có người chưa biết tên thì nhờ Ban quản trị.',

  MFO_WINDOW_CUT:
    'Đã để trống một đời thì các đời sau trên tờ này cũng để trống.',

  MFO_NEED_ORIGIN_ON_BOOK:
    'Người gốc phải đã có trên sổ Họ. Chưa có thì nhờ Ban quản trị tạo trước.',

  MFO_OPEN_LOT_EXISTS:
    'Đang có tờ khai chưa xong với cùng gốc. Làm tiếp tờ đó hoặc chờ đóng.',

  FORBIDDEN: 'Bạn không được làm việc này trên tờ khai.',

  UNAUTHORIZED: 'Phiên làm việc hết hạn. Hãy đăng nhập lại.',

  HTTP_400: 'Chưa làm được việc vừa bấm. Kiểm tra tờ khai hoặc nhờ Ban quản trị.',
  HTTP_401: 'Phiên làm việc hết hạn. Hãy đăng nhập lại.',
  HTTP_403: 'Bạn không được làm việc này.',
  HTTP_404: 'Không thấy tờ khai hoặc người này.',
  HTTP_409: 'Không thể tiếp tục. Có thể ý định của bác đang được người khác thực hiện. Xin chờ sau thời gian hết hạn tờ kia.', // <2026-10-16T09:02:00+07:00> Mục đích: Câu 409 đúng doctrine mục 8. Lý do: câu cũ không có trong doctrine.
  MFO_HOLD_CONFLICT:
    'Không thể tiếp tục. Có thể ý định của bác đang được người khác thực hiện. Xin chờ sau thời gian {thời điểm}.', // <2026-10-16T09:04:00+07:00> Mục đích: Không dùng chữ tờ kia.
  MFO_HOLD_EXPIRED: 'Đã hết thời gian giữ chỗ. Hãy làm lại từ đầu.',
  OPTIMISTIC_LOCK_CONFLICT: 'Công việc đã được cập nhật từ thiết bị khác. Trang sẽ tải lại.', // <2026-10-16T09:02:00+07:00> Mục đích: Có câu khóa lạc quan. Lý do: doctrine mục 8 đã quy định mà bảng chưa có.
  MFO_SET_CONFLICT: 'Nhánh này giao với nhánh khác đang làm. Hãy chọn người khác hoặc chờ.',
  MFO_CLAN_UNCONFIRMED: 'Hệ thống không tự xác định nội tộc. Bác hãy chọn người này có phải nội tộc không.',
  MFO_TARGET_NOT_CLAN_MEMBER: 'Không chọn người ngoại tộc làm mốc của nhánh phả hệ.',
  MFO_REASON_REQUIRED: 'Hãy ghi ý kiến trước khi gửi.',
  MFO_ACTIVE_PROPOSAL_EXISTS: 'Bác đang có một tờ chưa xong. Hãy làm xong tờ cũ trước khi mở tờ mới.',
  MFO_SMP_INVALID: 'Thông tin chưa đủ. Hãy kiểm tra họ tên, giới tính và còn sống hay đã mất.',
  MFO_SMP_FORBIDDEN: 'Đời và cha mẹ do hệ thống gắn. Bác không cần điền.',
  MFO_SMP_INCOMPLETE: 'Tờ khai chưa đủ. Hãy ghi hồ sơ cho mọi người xin thêm.',
  MFO_ALREADY_ON_BOOK: 'Người này đã có trên sổ với cùng cha mẹ.',
  MFO_GATE2_CLOSED: 'Việc khai báo chưa mở hoặc tờ khai đã đóng.',
  MFO_NOT_DELETABLE_STATE: 'Không xóa được. Tờ đang được xem hoặc đã ghi sổ.',
  HTTP_422: 'Nội dung chưa đủ để duyệt. Xem lại tờ khai.',
  HTTP_500: 'Hệ thống đang bận. Thử lại sau.',
};

const TECH_RE =
  /\b(400|401|403|404|409|422|500|payload|plan_ok|prisma|sql|uuid|null|undefined|stack|MFO_[A-Z_]+|status code|axios|request failed|ECONN|network error)\b/i;

/** <2026-10-13T17:07:00+07:00> Mục đích: Giữ xử lý isTechnicalMessage; thay đổi chỉ trong thao tác admin lát 5. */
export function isTechnicalMessage(text) {
  const s = String(text || '').trim();
  if (!s) return false;
  return TECH_RE.test(s);
}

/**
 * Đổi lỗi API / validate → câu đọc cho End User.
 * Ưu tiên code. Message kỹ thuật bị bỏ, không đọc.
 */
/** <2026-10-13T17:07:00+07:00> Mục đích: Giữ xử lý toMfoUserMessage; thay đổi chỉ trong thao tác admin lát 5. */
export function toMfoUserMessage(err, fallback = MFO_USER_FALLBACK) {
  const code =
    err?.code ||
    err?.error?.code ||
    err?.response?.data?.code ||
    err?.response?.data?.error?.code ||
    err?.response?.data?.errorCode ||
    '';

  // <2026-10-16T09:03:00+07:00> Mục đích: Ghép thời hạn chót của tờ kia. Lý do: doctrine yêu cầu nói rõ đến lúc nào.
  const when = err?.response?.data?.expires_at || err?.expires_at || err?.response?.data?.data?.expires_at || null;
  const whenText = when ? new Date(when).toLocaleString('vi-VN') : 'một lúc rồi thử lại'; // <2026-10-16T09:04:00+07:00> Mục đích: Bỏ chữ tờ kia. Lý do: không ai nói vậy, doctrine cũng không có.
  if (code === 'MFO_HOLD_CONFLICT' || Number(err?.response?.status || err?.status || 0) === 409) {
    if (code === 'OPTIMISTIC_LOCK_CONFLICT') return MFO_USER_ERRORS.OPTIMISTIC_LOCK_CONFLICT;
    return MFO_USER_ERRORS.MFO_HOLD_CONFLICT.replace('{thời điểm}', whenText);
  }

  if (code && MFO_USER_ERRORS[code]) return MFO_USER_ERRORS[code];

  const http = Number(err?.response?.status || err?.status || 0);
  if (http && MFO_USER_ERRORS[`HTTP_${http}`]) return MFO_USER_ERRORS[`HTTP_${http}`];

  const raw = String(
    err?.userMessage ||
      err?.response?.data?.userMessage ||
      err?.message ||
      err?.response?.data?.message ||
      err?.response?.data?.error?.message ||
      ''
  ).trim();

  if (raw && !isTechnicalMessage(raw) && raw.length <= 180) return raw;

  return fallback;
}

/**
 * <2026-10-13T17:07:00+07:00>
 * Mục đích: Câu thành công đúng doctrine, các màn admin chỉ tham chiếu key.
 */
export const MFO_USER_SUCCESS = Object.freeze({
  SAVE_PLAN: 'Đã lưu nhánh phả hệ.',
  SUBMIT_PLAN: 'Đã gửi nhánh phả hệ tới ban quản trị.',
  APPROVE_PLAN: 'Nhánh phả hệ đã được duyệt. Có thể khai tờ khai.',
  SAVE_RESULT: 'Đã lưu tờ khai.',
  SUBMIT_RESULT: 'Đã trình tờ khai. Xin chờ quyết định.',
  APPROVE_RESULT: 'Đã duyệt. Ý định đã được ghi vào sổ.',
  DELETE: 'Đã xóa tờ.',
});
