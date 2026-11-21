/**
 * ============================================================================
 * PATH       : src/pages/ResultPage.jsx
 * DATETIME   : 2026-11-21T16:00:00+07:00
 * VERSION    : 25.0.0-ISO29148-UAT-BUG7-FIX
 * DESCRIPTION:
 * - Khắc phục UAT-Bug 7: Hiển thị đầy đủ toàn bộ thông tin hồ sơ đã gửi từ
 *   cả `registration_profile` lẫn các trường cấp gốc cho cả 3 luồng:
 *   1. Tạo dòng họ mới (`isNewClan` / `CLAN_SETUP`).
 *   2. Xin gia nhập dòng họ — Nhận hồ sơ có sẵn trên sổ họ (`CLAIM_EM`).
 *   3. Xin gia nhập dòng họ — Khai báo hồ sơ nhân thân mới (`NEW_PROFILE_21`).
 * - Tuân thủ chuẩn UI/UX UAT-IMP3 & UAT-IMP4 & Elder Support Doctrine:
 *   + Trình bày từng nhóm bằng `CollapsibleDetailCard` (Dòng 1: Tiêu đề;
 *     Dòng 2: 3 cột Icon trạng thái 48x48 | Nút "Nghe" | Nút "Mở ra"/"Đóng lại").
 *   + Trình bày chi tiết bằng `KeyValueDetailTable` (bảng 2 cột: cột trái nhãn
 *     in nghiêng, cột phải dữ liệu đậm) và tách văn bản dài ra `Text Area`.
 *   + Chuyển đổi toàn bộ mã kỹ thuật (`CON_DE`, `NAM`, `THANH_VIEN`, `is_clan`...)
 *     sang tiếng Việt đời thường dễ hiểu cho người cao tuổi (EU); tuyệt đối
 *     không hiển thị UUID hay mã nội bộ.
 *   + Đồng bộ kích thước nút bấm chuẩn hệ thống (`min-h-[48px] h-12 rounded-xl`).
 * ============================================================================
 * CHANGELOGS:
 * - 2026-05-14T00:00:00+07:00 (v24.1.0): AttentionZone cho success hero.
 * - 2026-11-21T16:00:00+07:00 (v25.0.0-ISO29148-UAT-BUG7-FIX):
 *   + Hydrate đầy đủ dữ liệu từ `formData.registration_profile` (3 luồng).
 *   + Chuẩn hóa trình bày theo `CollapsibleDetailCard` & `KeyValueDetailTable`.
 * ============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

import { useMemo } from 'react';
import { Check } from 'lucide-react';

import AudioHelpButton from '../features/elder-doctrine/components/AudioHelpButton.jsx';
import { ttsMessages } from '../features/elder-doctrine/constants/ttsMessages.js';
import AttentionZone from '../components/AttentionZone.jsx';
import CollapsibleDetailCard from '../components/common/CollapsibleDetailCard.jsx';
import KeyValueDetailTable from '../components/common/KeyValueDetailTable.jsx';
import {
  resolveVerificationPrompts,
  resolveMemberClanRelation,
} from '../features/membership/components/ClaimMemberWizard.jsx';

const GENDER_LABELS = {
  NAM: 'Nam',
  NU: 'Nữ',
  KHAC: 'Khác',
};

const RELATIONSHIP_LABELS = {
  CON_DE: 'Con đẻ',
  CON_DAU: 'Con dâu',
  CON_RE: 'Con rể',
  CON_NUOI: 'Con nuôi',
  CON_DO_DAU: 'Con đỡ đầu',
  CON_RIENG: 'Con riêng',
  KHAC: 'Khác',
};

const MEMBER_ROLE_LABELS = {
  THANH_VIEN: 'Thành viên trong họ',
  TRUONG_CHI: 'Trưởng chi / Trưởng phái',
  TRUONG_NGANH: 'Trưởng ngành',
  TRUONG_TOC: 'Trưởng tộc',
  TRUONG_HO: 'Trưởng họ (Người sáng lập)',
  KHAC: 'Vai vế khác',
};

const SOCIAL_LABEL_MAP = {
  zalo: 'Zalo',
  facebook: 'Facebook',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  viber: 'Viber',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  khac: 'Mạng xã hội khác',
};

/**
 * Chuẩn hóa giá trị hiển thị an toàn, tránh trống hoặc undefined.
 */
function formatDisplay(val, fallback = '') {
  if (val === undefined || val === null) return fallback;
  const text = String(val).trim();
  return text || fallback;
}

/**
 * Định dạng Ngày / Tháng / Năm sinh từ registration_profile hoặc fallback temp_birth_year.
 */
function formatBirthDate(regProfile, fallbackBirthYear) {
  const day = formatDisplay(regProfile?.birth_day);
  const month = formatDisplay(regProfile?.birth_month);
  const year = formatDisplay(regProfile?.birth_year ?? fallbackBirthYear);

  if (day && month && year) return `${day}/${month}/${year}`;
  if (month && year) return `Tháng ${month}/${year}`;
  if (year) return year;
  return '';
}

/**
 * Trích xuất danh sách mạng xã hội từ `social_links` hoặc `social_profiles`.
 */
function extractSocialRows(regProfile, rootData) {
  const rows = [];
  const links = Array.isArray(regProfile?.social_links)
    ? regProfile.social_links
    : Array.isArray(rootData?.social_links)
      ? rootData.social_links
      : null;

  if (links && links.length > 0) {
    links.forEach((item) => {
      const val = formatDisplay(item?.value);
      if (!val) return;
      const typeLabel = formatDisplay(item?.type, 'Mạng xã hội');
      rows.push({ label: typeLabel, value: val });
    });
    if (rows.length > 0) return rows;
  }

  const sp =
    (regProfile?.social_profiles &&
    typeof regProfile.social_profiles === 'object'
      ? regProfile.social_profiles
      : null) ||
    (rootData?.social_profiles && typeof rootData.social_profiles === 'object'
      ? rootData.social_profiles
      : {});

  Object.entries(sp).forEach(([key, rawVal]) => {
    const val = formatDisplay(rawVal);
    if (!val) return;
    const normalizedKey = String(key).trim().toLowerCase();
    const label = SOCIAL_LABEL_MAP[normalizedKey] || key;
    rows.push({ label, value: val });
  });

  return rows;
}

/**
 * Diễn giải thuộc tính nội tộc / ngoại tộc (`members.is_clan`) cho hồ sơ Claim EM.
 */
function formatMemberClanRelation(member) {
  if (!member || typeof member !== 'object') return '';
  const rel = resolveMemberClanRelation(member);
  if (!rel.isClan) {
    if (rel.childType === 'CON_DAU') return 'Thành viên ngoại tộc (Con dâu)';
    if (rel.childType === 'CON_RE') return 'Thành viên ngoại tộc (Con rể)';
    return 'Thành viên ngoại tộc (Con rể / Con dâu)';
  }
  return 'Thành viên trong họ (Nội tộc)';
}

const ResultPage = ({ formData }) => {
  const data = formData || {};
  const regProfile =
    data.registration_profile && typeof data.registration_profile === 'object'
      ? data.registration_profile
      : {};

  const isJoinClan = data.isNewClan === false || Boolean(data.tenantId);
  const isNewClan = !isJoinClan;
  const isClaimExisting =
    !isNewClan &&
    (regProfile.claim_mode === 'CLAIM_EM' ||
      data.claim_mode === 'CLAIM_EXISTING' ||
      Boolean(regProfile.claimed_member_id || data.claimed_member_id));

  const sections = useMemo(() => {
    const clanName = formatDisplay(data.clanName, 'Chưa rõ tên dòng họ');
    const genderCode = String(
      regProfile.gender || data.gender || 'NAM'
    ).toUpperCase();
    const genderLabel = GENDER_LABELS[genderCode] || 'Nam';

    const rawRelCode = String(
      regProfile.child_type ||
        regProfile.temp_relationship ||
        data.temp_relationship ||
        ''
    ).toUpperCase();
    const relationshipLabel =
      RELATIONSHIP_LABELS[rawRelCode] || formatDisplay(rawRelCode);

    const roleCode = String(regProfile.member_role || '').toUpperCase();
    const memberRoleLabel =
      MEMBER_ROLE_LABELS[roleCode] || formatDisplay(roleCode);

    const phoneDisplay = formatDisplay(
      data.phone || regProfile.phone,
      'Chưa có thông tin'
    );
    const emailDisplay = formatDisplay(
      data.email || regProfile.email,
      'Không khai báo'
    );

    const referrerName = formatDisplay(
      regProfile.referrer_name ||
        regProfile.referrer_info?.full_name ||
        data.referrer_name
    );
    const referrerPhone = formatDisplay(
      regProfile.referrer_phone ||
        regProfile.referrer_info?.phone ||
        data.referrer_phone
    );

    // =========================================================================
    // TRƯỜNG HỢP 1: TẠO DÒNG HỌ MỚI (CLAN_SETUP)
    // =========================================================================
    if (isNewClan) {
      const founderName = formatDisplay(
        regProfile.full_name || data.temp_full_name
      );
      const fatherName = formatDisplay(
        regProfile.father_name || data.temp_father_name
      );
      const birthDisplay = formatBirthDate(regProfile, data.temp_birth_year);
      const noteText = formatDisplay(regProfile.note || data.temp_note);
      const descText = formatDisplay(data.description);

      return [
        {
          id: 'clan-setup',
          title: '1. Thông tin dòng họ mới đăng ký',
          voiceText: `Thông tin dòng họ mới: ${clanName}. ${descText ? `Mô tả: ${descText}` : ''}`,
          rows: [
            { label: 'Hình thức đăng ký', value: 'Khởi tạo dòng họ mới' },
            { label: 'Tên dòng họ', value: clanName },
          ],
          notes: descText
            ? [{ label: 'Mô tả dòng họ', value: descText }]
            : [],
        },
        {
          id: 'founder-info',
          title: '2. Thông tin người sáng lập (Trưởng họ)',
          voiceText: `Người sáng lập: ${founderName}, giới tính ${genderLabel}.`,
          rows: [
            { label: 'Họ và tên', value: founderName },
            ...(regProfile.alias
              ? [{ label: 'Tên tự / Tên hiệu', value: regProfile.alias }]
              : []),
            { label: 'Giới tính', value: genderLabel },
            ...(birthDisplay
              ? [{ label: 'Năm sinh', value: birthDisplay }]
              : []),
            ...(fatherName
              ? [{ label: 'Họ tên Cha / Mẹ', value: fatherName }]
              : []),
            ...(relationshipLabel
              ? [{ label: 'Quan hệ với họ tộc', value: relationshipLabel }]
              : []),
            ...(memberRoleLabel
              ? [{ label: 'Vai vế trong họ', value: memberRoleLabel }]
              : []),
          ],
          notes: [
            ...(regProfile.birth_place
              ? [{ label: 'Nguyên quán / Quê gốc', value: regProfile.birth_place }]
              : []),
            ...(regProfile.address
              ? [{ label: 'Địa chỉ hiện tại', value: regProfile.address }]
              : []),
            ...(noteText
              ? [{ label: 'Lời nhắn gửi Ban Quản trị', value: noteText }]
              : []),
          ],
        },
        {
          id: 'contact-info',
          title: '3. Thông tin tài khoản & Liên hệ',
          voiceText: `Số điện thoại đăng nhập: ${phoneDisplay}. Email: ${emailDisplay}.`,
          rows: [
            { label: 'Số điện thoại đăng nhập', value: phoneDisplay },
            { label: 'Email nhận thông báo', value: emailDisplay },
          ],
          notes: [],
        },
      ];
    }

    // =========================================================================
    // TRƯỜNG HỢP 2: XIN GIA NHẬP — NHẬN HỒ SƠ CÓ SẴN TRÊN SỔ HỌ (CLAIM_EM)
    // =========================================================================
    if (isClaimExisting) {
      const emSum =
        regProfile.claim_verification?.claimed_member_summary ||
        regProfile.claimed_member_summary ||
        {};
      const ver = regProfile.claim_verification || {};
      const verPrompts = resolveVerificationPrompts({
        linkType: data.link_type || '',
        childType: emSum.child_type || regProfile.child_type || '',
      });

      const targetMemberName = formatDisplay(
        emSum.full_name || regProfile.full_name || data.temp_full_name
      );
      const memberClanRelation = formatMemberClanRelation(emSum);
      const layer3Note = formatDisplay(
        ver.layer3_guarantor_note || regProfile.note
      );

      return [
        {
          id: 'claim-clan',
          title: '1. Dòng họ & Hồ sơ xin nhận trên sổ họ',
          voiceText: `Dòng họ ${clanName}. Hồ sơ xin nhận trên sổ họ: ${targetMemberName}.`,
          rows: [
            { label: 'Dòng họ xin gia nhập', value: clanName },
            {
              label: 'Hình thức đăng ký',
              value: 'Nhận hồ sơ thành viên đã có trên sổ họ',
            },
            { label: 'Họ và tên trên sổ họ', value: targetMemberName },
            ...(emSum.alias
              ? [{ label: 'Tên tự / Tên hiệu', value: emSum.alias }]
              : []),
            ...(memberClanRelation
              ? [{ label: 'Quan hệ dòng họ', value: memberClanRelation }]
              : []),
            ...(emSum.generation != null
              ? [{ label: 'Đời thứ', value: `Đời thứ ${emSum.generation}` }]
              : []),
            ...(emSum.branch_name
              ? [{ label: 'Chi / Nhánh', value: emSum.branch_name }]
              : []),
            ...(emSum.birth_year
              ? [{ label: 'Năm sinh trên sổ', value: emSum.birth_year }]
              : []),
            ...(emSum.father_name
              ? [{ label: 'Họ tên Cha trên sổ', value: emSum.father_name }]
              : []),
            ...(emSum.mother_name
              ? [{ label: 'Họ tên Mẹ trên sổ', value: emSum.mother_name }]
              : []),
            { label: 'Giới tính xác nhận', value: genderLabel },
          ],
          notes: [],
        },
        {
          id: 'claim-verification',
          title: '2. Người giới thiệu & Thông tin đối chiếu',
          voiceText: `Người giới thiệu trong họ: ${referrerName || 'Chưa có'}. Số điện thoại: ${referrerPhone || 'Chưa có'}.`,
          rows: [
            ...(referrerName
              ? [{ label: 'Người giới thiệu trong họ', value: referrerName }]
              : []),
            ...(referrerPhone
              ? [{ label: 'SĐT người giới thiệu', value: referrerPhone }]
              : []),
            ...(ver.layer1_lineage
              ? [{ label: verPrompts.layer1Label, value: ver.layer1_lineage }]
              : []),
            ...(ver.layer2_branch_origin
              ? [
                  {
                    label: verPrompts.layer2Label,
                    value: ver.layer2_branch_origin,
                  },
                ]
              : []),
          ],
          notes: layer3Note
            ? [{ label: verPrompts.layer3Label, value: layer3Note }]
            : [],
        },
        {
          id: 'claim-account',
          title: '3. Thông tin tài khoản & Liên hệ',
          voiceText: `Số điện thoại đăng nhập: ${phoneDisplay}. Email: ${emailDisplay}.`,
          rows: [
            { label: 'Số điện thoại đăng nhập', value: phoneDisplay },
            { label: 'Email', value: emailDisplay },
          ],
          notes: [],
        },
      ];
    }

    // =========================================================================
    // TRƯỜNG HỢP 3: XIN GIA NHẬP — KHAI BÁO HỒ SƠ NHÂN THÂN MỚI (NEW_PROFILE_21)
    // =========================================================================
    const fullName = formatDisplay(
      regProfile.full_name || data.temp_full_name
    );
    const alias = formatDisplay(regProfile.alias);
    const birthDateText = formatBirthDate(regProfile, data.temp_birth_year);
    const aliveText =
      regProfile.is_alive === false
        ? `Đã mất${regProfile.death_year ? ` (Năm mất: ${regProfile.death_year})` : ''}`
        : 'Còn sống';

    const fatherName = formatDisplay(
      regProfile.father_name || data.temp_father_name
    );
    const motherName = formatDisplay(regProfile.mother_name);
    const grandfatherName = formatDisplay(
      regProfile.grandfather_name || data.temp_grandfather_name
    );
    const grandmotherName = formatDisplay(regProfile.grandmother_name);
    const branchName = formatDisplay(
      regProfile.branch_name || data.temp_branch_name
    );
    const generationText =
      regProfile.generation !== undefined &&
      regProfile.generation !== null &&
      String(regProfile.generation).trim() !== ''
        ? `Đời thứ ${regProfile.generation}`
        : '';

    const socialRows = extractSocialRows(regProfile, data);
    const noteText = formatDisplay(regProfile.note || data.temp_note);

    return [
      {
        id: 'join-clan-target',
        title: 'Dòng họ xin gia nhập',
        voiceText: `Dòng họ xin gia nhập: ${clanName}. Hình thức: Khai báo hồ sơ nhân thân mới.`,
        rows: [
          { label: 'Tên dòng họ', value: clanName },
          {
            label: 'Hình thức đăng ký',
            value: 'Khai báo hồ sơ nhân thân mới',
          },
        ],
        notes: [],
      },
      {
        id: 'new-profile-basic',
        title: '1. Thông tin nhân thân',
        voiceText: `Họ và tên khai sinh: ${fullName}. Giới tính: ${genderLabel}. Tình trạng: ${aliveText}.`,
        rows: [
          { label: 'Họ và tên khai sinh', value: fullName },
          ...(alias
            ? [{ label: 'Tên tự / Tên hiệu / Tên thường gọi', value: alias }]
            : []),
          { label: 'Giới tính', value: genderLabel },
          { label: 'Sống/Chết', value: aliveText },
          ...(birthDateText
            ? [{ label: 'Ngày / Tháng / Năm sinh', value: birthDateText }]
            : []),
        ],
        notes: regProfile.birth_place
          ? [{ label: 'Nơi sinh / Nguyên quán', value: regProfile.birth_place }]
          : [],
      },
      {
        id: 'new-profile-lineage',
        title: '2. Vị trí phả hệ & Tiền nhân',
        voiceText: `Họ tên Cha: ${fatherName}. ${motherName ? `Họ tên Mẹ: ${motherName}.` : ''} ${branchName ? `Chi phái: ${branchName}.` : ''}`,
        rows: [
          { label: 'Họ và tên Cha', value: fatherName },
          ...(motherName ? [{ label: 'Họ và tên Mẹ', value: motherName }] : []),
          ...(grandfatherName
            ? [{ label: 'Họ và tên Ông nội', value: grandfatherName }]
            : []),
          ...(grandmotherName
            ? [{ label: 'Họ và tên Bà nội', value: grandmotherName }]
            : []),
          ...(branchName
            ? [{ label: 'Tên Chi / Phái / Nhánh', value: branchName }]
            : []),
          ...(generationText
            ? [{ label: 'Đời thứ trong họ', value: generationText }]
            : []),
          ...(relationshipLabel
            ? [{ label: 'Quan hệ với dòng họ', value: relationshipLabel }]
            : []),
          ...(memberRoleLabel
            ? [{ label: 'Vai vế / Chức trách', value: memberRoleLabel }]
            : []),
        ],
        notes: [],
      },
      {
        id: 'new-profile-residence',
        title: '3. Địa chỉ cư trú & Mạng xã hội',
        voiceText: regProfile.address
          ? `Địa chỉ cư trú hiện tại: ${regProfile.address}.`
          : 'Thông tin địa chỉ cư trú và mạng xã hội liên hệ.',
        rows: [
          ...socialRows,
          ...(socialRows.length === 0 && !regProfile.address
            ? [{ label: 'Thông tin bổ sung', value: 'Không khai báo' }]
            : []),
        ],
        notes: regProfile.address
          ? [{ label: 'Địa chỉ cư trú hiện tại', value: regProfile.address }]
          : [],
      },
      {
        id: 'new-profile-referrer-note',
        title: '4. Lời nhắn & Minh chứng',
        voiceText: `Người giới thiệu trong họ: ${referrerName || 'Chưa có'}. Số điện thoại người giới thiệu: ${referrerPhone || 'Chưa có'}. Lời nhắn: ${noteText}.`,
        rows: [
          ...(referrerName
            ? [{ label: 'Người giới thiệu trong họ', value: referrerName }]
            : []),
          ...(referrerPhone
            ? [{ label: 'SĐT người giới thiệu', value: referrerPhone }]
            : []),
        ],
        notes: noteText
          ? [{ label: 'Lời nhắn gửi Ban Quản trị', value: noteText }]
          : [],
      },
      {
        id: 'new-profile-account',
        title: '5. Thông tin tài khoản & Liên hệ',
        voiceText: `Số điện thoại đăng nhập: ${phoneDisplay}. Email: ${emailDisplay}.`,
        rows: [
          { label: 'Số điện thoại đăng nhập', value: phoneDisplay },
          { label: 'Email', value: emailDisplay },
        ],
        notes: [],
      },
    ];
  }, [data, regProfile, isNewClan, isClaimExisting]);

  const summaryVoiceText = useMemo(() => {
    const clanName = formatDisplay(data.clanName);
    const fullName = formatDisplay(
      regProfile.full_name ||
        regProfile.claim_verification?.claimed_member_summary?.full_name ||
        data.temp_full_name
    );
    const phone = formatDisplay(data.phone || regProfile.phone);
    const baseIntro =
      ttsMessages?.resultPage?.help ||
      'Hồ sơ của bác đã được gửi thành công. Ban quản trị sẽ xem xét và liên hệ lại trong thời gian sớm nhất.';
    const detailBits = [
      clanName ? `Dòng họ: ${clanName}.` : '',
      fullName ? `Người đăng ký: ${fullName}.` : '',
      phone ? `Số điện thoại liên hệ: ${phone}.` : '',
    ].filter(Boolean);
    return `${baseIntro} ${detailBits.join(' ')}`.trim();
  }, [data, regProfile]);

  return (
    <div className="w-full overflow-hidden rounded-3xl bg-white shadow-xl border border-slate-200">
      <style>
        {`
          @keyframes egalAttentionSoftFlash {
            0%, 100% {
              box-shadow: 0 0 0 0 rgba(59, 130, 246, 0);
              transform: translateY(0);
            }
            35% {
              box-shadow: 0 0 0 6px rgba(59, 130, 246, 0.14);
              transform: translateY(-1px);
            }
            70% {
              box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.08);
              transform: translateY(0);
            }
          }

          .egal-attention-flash {
            animation: egalAttentionSoftFlash 2.4s ease-out 1;
          }

          .egal-attention-locked {
            position: relative;
            z-index: 1;
          }

          @media (prefers-reduced-motion: reduce) {
            .egal-attention-flash {
              animation: none;
              box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.10);
            }
          }
        `}
      </style>

      {/* Hero thông báo gửi hồ sơ thành công */}
      <AttentionZone
        active
        priority="success"
        role="status"
        ariaLive="polite"
        autoScroll
        autoFocus
        flash
        lock
        className="rounded-none border-0 bg-gradient-to-br from-emerald-600 to-teal-700 px-6 py-12 text-center text-white"
        data-testid="result-page-attention-success"
      >
        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-md">
          <Check className="h-11 w-11" strokeWidth={4} />
        </div>

        <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight">
          HỒ SƠ ĐÃ ĐƯỢC GỬI THÀNH CÔNG
        </h1>

        <p className="mx-auto mt-3 max-w-lg text-base sm:text-lg font-medium leading-relaxed opacity-95">
          Cảm ơn bác! Ban Quản trị dòng họ đã nhận được hồ sơ và sẽ xem xét,
          liên hệ lại với bác trong thời gian sớm nhất.
        </p>

        <div className="mt-5 flex justify-center">
          <AudioHelpButton
            text={summaryVoiceText}
            label="Nghe tóm tắt kết quả"
            variant="soft"
          />
        </div>
      </AttentionZone>

      {/* Chi tiết đầy đủ hồ sơ đã gửi (Card 2 dòng / 3 cột + Bảng 2 cột italic + Text Area) */}
      <div className="space-y-4 p-4 sm:p-6">
        {sections.map((section) => (
          <CollapsibleDetailCard
            key={section.id}
            title={section.title}
            statusLabel="Đã gửi"
            statusVariant="complete"
            voiceText={section.voiceText}
            defaultExpanded={true}
          >
            <KeyValueDetailTable
              rows={section.rows}
              notes={section.notes}
            />
          </CollapsibleDetailCard>
        ))}
      </div>

      {/* Thanh nút điều hướng đồng bộ chuẩn UAT-IMP3 (min-h-[48px] h-12 rounded-xl) */}
      <div className="border-t border-slate-200 bg-slate-50 p-4 sm:p-6 space-y-3">
        <button
          type="button"
          onClick={() => {
            window.location.href = '/auth';
          }}
          className="min-h-[48px] h-12 w-full rounded-xl bg-emerald-600 px-5 text-base font-bold text-white whitespace-nowrap shadow-sm transition hover:bg-emerald-700"
        >
          Đăng nhập kiểm tra trạng thái hồ sơ
        </button>

        <button
          type="button"
          onClick={() => {
            window.location.href = '/';
          }}
          className="min-h-[48px] h-12 w-full rounded-xl border border-slate-300 bg-white px-5 text-base font-bold text-slate-800 whitespace-nowrap transition hover:bg-slate-100"
        >
          Về trang chủ
        </button>
      </div>
    </div>
  );
};

export default ResultPage;
