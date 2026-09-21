/**
 * PATH       : frontend/src/features/mfo/constants/mfoUserErrors.js
 * DATETIME   : 2026-09-20T10:40:00+07:00
 * VERSION    : 1.0.0-C1-SELF
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

  MFO_MEMBER_NOT_FOUND: 'Không thấy người này trên sổ Họ.',

  MFO_PARENT_NOT_FOUND: 'Không thấy cha hoặc mẹ trên sổ Họ.',

  MFO_MEMBER_DUP:
    'Trùng với người đã có trên sổ. Chọn người đó, đừng tạo thêm.',

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
};

const TECH_RE =
  /\b(422|409|403|404|500|payload|plan_ok|prisma|sql|uuid|null|undefined|stack|MFO_[A-Z_]+)\b/i;

export function isTechnicalMessage(text) {
  const s = String(text || '').trim();
  if (!s) return false;
  return TECH_RE.test(s);
}

/**
 * Đổi lỗi API / validate → câu đọc cho End User.
 * Ưu tiên code. Message kỹ thuật bị bỏ, không đọc.
 */
export function toMfoUserMessage(err, fallback = MFO_USER_FALLBACK) {
  const code =
    err?.code ||
    err?.error?.code ||
    err?.response?.data?.code ||
    err?.response?.data?.error?.code ||
    err?.response?.data?.errorCode ||
    '';

  if (code && MFO_USER_ERRORS[code]) return MFO_USER_ERRORS[code];

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
