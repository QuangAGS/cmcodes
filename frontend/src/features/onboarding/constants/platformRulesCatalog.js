/**
 * ============================================================================
 * PATH       : frontend/src/features/onboarding/constants/platformRulesCatalog.js
 * DATETIME   : 2026-11-22T23:10:00+07:00
 * VERSION    : 1.1.0-ISO29148-UAT-IMP6-SANDBOX
 * DESCRIPTION:
 * - Bộ Nội quy chung chuẩn của nền tảng Gia Phả Số & quy ước Nội quy từng Dòng họ
 *   phục vụ bước cam kết bắt buộc trước khi gửi hồ sơ MEMBER_JOIN & CLAN_SETUP
 *   [UAT-IMP5 Mục 3 / Baseline FUNC-11].
 * ============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

export const DEFAULT_TOS_VERSION = '1.0';

export const PLATFORM_GENERAL_ARTICLES = [
  {
    code: 'ĐIỀU 1',
    title: 'Xác thực huyết thống và trung thực thông tin',
    body: 'Thành viên cam kết khai báo trung thực họ tên, quan hệ huyết thống, hôn phối, tiền nhân và thông tin người giới thiệu/xác minh; không mạo danh hoặc làm sai lệch phả hệ.',
  },
  {
    code: 'ĐIỀU 2',
    title: 'Tôn trọng tôn ti, gia đạo và thuần phong mỹ tục',
    body: 'Giữ gìn sự đoàn kết, kính trên nhường dưới trong dòng họ; sử dụng ngôn từ chuẩn mực, văn minh khi trao đổi và đóng góp tư liệu trên hệ thống.',
  },
  {
    code: 'ĐIỀU 3',
    title: 'Bảo mật dữ liệu gia phả và quyền riêng tư',
    body: 'Không tự ý sao chép, phát tán thông tin cá nhân, số điện thoại, địa chỉ hoặc tư liệu nội bộ của thành viên dòng họ ra bên ngoài khi chưa được sự đồng ý của chủ thể hoặc Ban Quản trị dòng họ.',
  },
  {
    code: 'ĐIỀU 4',
    title: 'Tuân thủ Nội quy riêng của từng Dòng họ',
    body: 'Chấp hành quy ước, gia pháp và sự điều hành hợp lệ của Hội đồng gia tộc / Ban Quản trị dòng họ mà mình tham gia hoặc sáng lập.',
  },
];

export const PLATFORM_GENERAL_RULES_TEXT = PLATFORM_GENERAL_ARTICLES.map(
  (a) => `${a.code}. ${a.title.toUpperCase()}: ${a.body}`
).join('\n\n');

export const DEFAULT_CLAN_RULES_FALLBACK =
  'Dòng họ hiện áp dụng theo Nội quy chung của nền tảng Gia Phả Số và Gia pháp truyền thống do Ban Quản trị / Hội đồng gia tộc điều hành.';

export const SETUP_PURPOSE_OPTIONS = [
  {
    value: 'FAMILY_START',
    label: 'Lập phả từ gia đình nhỏ (từ cha mẹ / bản thân)',
  },
  {
    value: 'CLAN_DIGITIZE',
    label: 'Số hóa gia phả dòng họ đã có tư liệu',
  },
  {
    value: 'FAMILY_CONNECT',
    label: 'Kết nối họ hàng nội / ngoại ở xa',
  },
  {
    value: 'OTHER',
    label: 'Mục đích khác (nêu rõ ở lời nhắn)',
  },
];

export const KNOWN_GENERATIONS_OPTIONS = [
  {
    value: '1_2',
    label: '1 – 2 đời (Gia đình hiện tại: Cha/Mẹ – Con cái)',
  },
  {
    value: '3_4',
    label: '3 – 4 đời (Từ Ông/Bà hoặc Cụ trở xuống)',
  },
  {
    value: '5_PLUS',
    label: 'Từ 5 đời trở lên (Gia phả nhiều đời)',
  },
];

export const SETUP_PURPOSE_LABELS = Object.fromEntries(
  SETUP_PURPOSE_OPTIONS.map((o) => [o.value, o.label])
);

export const KNOWN_GENERATIONS_LABELS = Object.fromEntries(
  KNOWN_GENERATIONS_OPTIONS.map((o) => [o.value, o.label])
);

export const CLAN_FOUNDER_COMMITMENT_TEXT =
  'Với tư cách người sáng lập (Trưởng họ), tôi cam kết chịu trách nhiệm về tính chính danh của dòng họ mới thành lập, quản trị dữ liệu thành viên đúng tôn ti, bảo mật thông tin gia phả và sớm ban hành Nội quy riêng của dòng họ sau khi kích hoạt. Tôi hiểu rằng dòng họ mới sẽ được mở dùng thử miễn phí trong 30 ngày (Sandbox); sau 30 ngày nếu chưa hoàn tất đóng góp duy trì hạ tầng để kích hoạt chính thức, hệ thống sẽ chuyển sang 30 ngày đệm Tạm ngưng (TAM_NGUNG) trước khi đóng vĩnh viễn (NGUNG_HAN) và dọn dẹp dữ liệu dùng thử.';

export function composeAgreedRulesSnapshot({
  mode = 'MEMBER_JOIN',
  clanName = '',
  platformRules = PLATFORM_GENERAL_RULES_TEXT,
  tosVersion = DEFAULT_TOS_VERSION,
  clanRules = '',
  clanRulesVersion = 1,
} = {}) {
  const safeClanName = String(clanName || '').trim();
  const header = `[NỘI QUY CHUNG NỀN TẢNG GIA PHẢ SỐ - PHIÊN BẢN ${tosVersion}]`;
  const baseText = String(platformRules || PLATFORM_GENERAL_RULES_TEXT).trim();

  if (mode === 'CLAN_SETUP') {
    return [
      header,
      baseText,
      '',
      `[CAM KẾT NGƯỜI SÁNG LẬP DÒNG HỌ ${safeClanName ? `"${safeClanName}"` : ''}]`,
      CLAN_FOUNDER_COMMITMENT_TEXT,
    ].join('\n');
  }

  const trimmedClanRules = String(clanRules || '').trim();
  const clanSection = trimmedClanRules
    ? `[NỘI QUY DÒNG HỌ ${safeClanName ? `"${safeClanName}" ` : ''}- PHIÊN BẢN ${clanRulesVersion}]\n${trimmedClanRules}`
    : `[QUY ƯỚC DÒNG HỌ ${safeClanName ? `"${safeClanName}"` : ''}]\n${DEFAULT_CLAN_RULES_FALLBACK}`;

  return [header, baseText, '', clanSection].join('\n');
}
