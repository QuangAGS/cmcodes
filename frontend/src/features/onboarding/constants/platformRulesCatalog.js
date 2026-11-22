/**
 * ============================================================================
 * PATH       : frontend/src/features/onboarding/constants/platformRulesCatalog.js
 * DATETIME   : 2026-11-22T18:10:00+07:00
 * VERSION    : 1.0.0-ISO29148-UAT-IMP5-RULES
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

export const CLAN_FOUNDER_COMMITMENT_TEXT =
  'Với tư cách người sáng lập (Trưởng họ), tôi cam kết chịu trách nhiệm về tính chính danh của dòng họ mới thành lập, quản trị dữ liệu thành viên đúng tôn ti, bảo mật thông tin gia phả và sớm ban hành Nội quy riêng của dòng họ sau khi kích hoạt.';

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
