/**
 * PATH       : frontend/src/features/mfo/constants/mfoVoiceHelp.self.js
 * DATETIME   : 2026-09-20T10:40:00+07:00
 * VERSION    : 1.0.0-C1-SELF
 * DESCRIPTION: VoiceHelp + chữ màn C1-SELF (MWL có mặt trên tờ 5L).
 *              Không dùng cho PROXY / khai hộ.
 *              TTS: bấm mới đọc. Không tự nói lúc render.
 * SSOT       : BFA-Branch-Family-Doctrine-v1.3.1
 *              BFA-MFO-Lot-Ops-v1.0
 *              HandOver-MFO-L1-L10-2026-09-20
 */

export const MFO_VOICE_MODE = 'SELF';

/** Gói này cấm gắn form khai hộ. */
export const MFO_VOICE_SELF_ONLY = true;

export const MFO_VOICE_SELF = {
  enterOp:
    'Đây là tờ khai các đời trực hệ liên tục mà bạn có đủ thông tin, nhiều nhất năm đời, và bạn là một người trong các đời đó. Trước tiên, bạn mô tả năm đời theo quy định rồi trình duyệt. Căn cứ chỉ định, hướng dẫn của người duyệt, bạn mới có thể thêm người vào tờ khai. Phải mở tờ khai mới khi tờ khai cũ đã không được duyệt. Tờ đã duyệt xong thì không sửa. Muốn khai tiếp thì mở tờ mới.',

  origin:
    'Một người làm gốc cho các đời sau phải được chọn trong sổ Họ. Gốc không phải lúc nào cũng là bạn, có thể là cụ, ông, bà, cha mẹ hoặc chính là bạn. Chưa có trên sổ Họ thì nhờ Ban quản trị tạo trước.',

  k:
    'Bạn cách người gốc mấy đời theo trực hệ? Không tính vợ chồng, con nuôi, con dâu, con rể, con đỡ đầu. Quá bốn đời thì đổi người làm gốc gần hơn. Không nhồi đời thứ năm vào tờ khai này.',

  whyFive:
    'Một tờ chỉ năm dòng để khỏi khai nhầm, khỏi tạo hai lần một người. Muốn sâu thêm thì làm tờ mới, lấy người dòng cuối làm gốc.',

  line0: 'Hãy chọn một người đã có trong sổ Họ làm gốc.',

  line1:
    'Là con của đời gốc. Bạn có thể chọn nếu đã có trong sổ Họ, hoặc để trống tức là không tạo, hoặc xin phép tạo sau khi được duyệt. Đã có trên sổ thì chọn, đừng tạo thêm.',

  line2:
    'Là con của đời một. Bạn có thể chọn nếu đã có trong sổ Họ, hoặc để trống tức là không tạo, hoặc xin phép tạo sau khi được duyệt. Đã có trên sổ thì chọn, đừng tạo thêm.',

  line3:
    'Là con của đời hai. Bạn có thể chọn nếu đã có trong sổ Họ, hoặc để trống tức là không tạo, hoặc xin phép tạo sau khi được duyệt. Đã có trên sổ thì chọn, đừng tạo thêm.',

  line4:
    'Là con của đời ba. Bạn có thể chọn nếu đã có trong sổ Họ, hoặc để trống tức là không tạo, hoặc xin phép tạo sau khi được duyệt. Đã có trên sổ thì chọn, đừng tạo thêm.',

  lineK:
    'Đây là vị trí của bạn tính từ đời gốc. Chỉ gắn đúng bạn. Không tạo thêm một bạn thứ hai.',

  empty:
    'Để trống nghĩa là tờ này không khai đời đó. Không phải xóa người trên sổ.',

  create:
    'Xin phép tạo người mới đời này. Tên thật điền sau khi Ban quản trị đồng ý.',

  assign:
    'Chọn đúng người đã có trong sổ Họ. Trùng tên chưa chắc cùng một người.',

  review:
    'Kiểm tra năm dòng. Gửi là xin phép, chưa ghi sổ. Sai thì chờ trả về, làm tờ mới. Đã duyệt xong cả kết quả thì không sửa tờ này.',

  submitted:
    'Đã gửi. Vào Việc của tôi để xem chờ duyệt. Chưa được phép thì chưa điền tên người mới.',

  gapNeedUm:
    'Đời này có người nhưng chưa biết tên. Nhờ Ban quản trị tạo chỗ trống. Bạn không tự tạo.',

  windowCut:
    'Đã để trống một đời thì các đời sau trên tờ này cũng để trống. Muốn khai tiếp phía dưới thì mở tờ mới.',
};

/** Chữ End User — không hiện ASSIGN/CREATE/EMPTY trên màn. */
export const MFO_OP_LABEL = {
  ASSIGN: 'Chọn người đã có trên sổ',
  CREATE: 'Xin tạo sau khi được duyệt',
  EMPTY: 'Tờ này không khai đời đó',
};

export function mfoOpLabel(op) {
  return MFO_OP_LABEL[op] || 'Chưa chọn';
}

export function mfoLineTitle(line) {
  const i = Number(line);
  if (i === 0) return 'Đời gốc';
  if (i >= 1 && i <= 4) return `Đời ${i}`;
  return 'Đời';
}

export const MFO_LINE_VOICE_SELF = [
  MFO_VOICE_SELF.line0,
  MFO_VOICE_SELF.line1,
  MFO_VOICE_SELF.line2,
  MFO_VOICE_SELF.line3,
  MFO_VOICE_SELF.line4,
];

export function voiceForLineSelf(line) {
  const i = Number(line);
  if (i >= 0 && i <= 4) return MFO_LINE_VOICE_SELF[i];
  return '';
}
