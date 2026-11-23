/**
 * =============================================================================
 * PATH       : frontend/src/features/admin/components/UserApprovalForm.jsx
 * DATETIME   : 2026-11-23T06:13:00+07:00
 * VERSION    : 15.4.0-ISO29148-UAT-IMP6-CLAN-SETUP
 * DESCRIPTION:
 * - [UAT-IMP5 2026-11-21]:
 *   1. Bổ sung Card chuyên biệt "1. Thông tin Người giới thiệu trong họ" hiển thị
 *      Họ tên & Số điện thoại người giới thiệu từ registration_profile / snapshot,
 *      kèm nút gọi điện trực tiếp (tel:...) và nút "Tra cứu người giới thiệu
 *      trên sổ họ" mở AdminClanLookupDrawer.
 *   2. Tổ chức toàn bộ các nhóm thông tin bằng CollapsibleDetailCard (Dòng 1: Title;
 *      Dòng 2: 3 cột Icon trạng thái 48x48 | Nghe | Mở ra/Đóng lại) +
 *      KeyValueDetailTable (bảng 2 cột nhãn italic, dữ liệu đậm, Text Area).
 *   3. Mỗi Card có ô tích khẳng định: "Tôi đã xem và khẳng định đã kiểm soát
 *      nhóm thông tin này". Khi chưa tích, Card mang biểu tượng ◌ màu cam; khi
 *      tích xong chuyển sang ✓ màu xanh lá.
 *   4. Approval Gate: Khóa nút "Phê duyệt hồ sơ" cho tới khi Admin tích khẳng định
 *      đã kiểm soát 100% các nhóm thông tin (hiển thị inline helper text >= 16px
 *      liệt kê các mục chưa kiểm soát; cấm dùng tooltip).
 * - Bảo toàn trọn vẹn các luồng nghiệp vụ: EM 3 lớp, 21 trường, CLAN SETUP (C1-S/C2-S),
 *   Multi-Home C1, từ chối lần cuối 2 bước, trả về sửa (RETURN_FOR_REVISION) và mở lại.
 * =============================================================================
 * CHANGELOGS:
 * - 2026-08-04T17:20:00+07:00 (v14.4.3-PR-OP-4-FINAL-LABEL): 3 khung đối soát + từ chối lần cuối.
 * - 2026-11-13T17:15:00+07:00 (v14.9.0-MULTIHOME-UAT-BUG2-ISCLAN-COMPOSITE): Hiển thị ghép is_clan.
 * - 2026-11-21T17:30:00+07:00 (v15.0.0-ISO29148-UAT-IMP5):
 *   + Thêm Card Người giới thiệu + Tra cứu nhanh sổ họ.
 *   + Chuẩn hóa Card 2 dòng / 3 cột + Checkbox khẳng định kiểm soát từng Card + Approval Gate.
 * - 2026-11-23T06:13:00+07:00 (v15.4.0-ISO29148-UAT-IMP6-CLAN-SETUP):
 *   + Cập nhật Card 3 của CLAN_SETUP hiển thị 4 thông tin thẩm định khởi tạo dòng họ
 *     (setup_purpose, known_generations, earliest_ancestor_name, clan_origin_place) +
 *     người thân tham chiếu tùy chọn (bãi bỏ cảnh báo thiếu người >= 60 tuổi).
 *   + Bổ sung cảnh báo đối chiếu tự động tên dòng họ trùng trên Card 1.
 * =============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Save,
  X,
  Lock,
  Search,
  Phone,
  CheckCircle2,
  CircleDashed,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import CollapsibleDetailCard from '../../../components/common/CollapsibleDetailCard.jsx';
import KeyValueDetailTable from '../../../components/common/KeyValueDetailTable.jsx';
import ZoneVoiceButton from '../../elder-doctrine/components/ZoneVoiceButton.jsx';
import apiClient from '../../../lib/apiClient.js';
import { resolveVerificationPrompts } from '../../membership/components/ClaimMemberWizard.jsx';
import {
  SETUP_PURPOSE_LABELS,
  KNOWN_GENERATIONS_LABELS,
} from '../../onboarding/constants/platformRulesCatalog.js';

const GENDER_LABELS = {
  NAM: 'Nam',
  MALE: 'Nam',
  NU: 'Nữ',
  NỮ: 'Nữ',
  FEMALE: 'Nữ',
  KHAC: 'Khác',
};

const RELATIONSHIP_DISPLAY_LABELS = {
  CON_DE: 'Con đẻ',
  CON_DAU: 'Con dâu',
  CON_RE: 'Con rể',
  CON_NUOI: 'Con nuôi',
  CON_DO_DAU: 'Con đỡ đầu',
  CON_RIENG: 'Con riêng',
  SPOUSE_FAMILY: 'Nhà dâu / rể (Hôn phối)',
  MATERNAL: 'Họ ngoại',
  GUARDIAN: 'Đỡ đầu / Giám hộ',
  PRIMARY_PATERNAL: 'Họ nội (Trực hệ)',
  DESCENDANT_FAMILY: 'Dòng dõi hậu duệ',
  OTHER: 'Khác',
  KHAC: 'Khác',
};

const MEMBER_ROLE_LABELS = {
  THANH_VIEN: 'Thành viên trong họ',
  TRUONG_CHI: 'Trưởng chi / Trưởng phái',
  TRUONG_NGANH: 'Trưởng ngành',
  TRUONG_TOC: 'Trưởng tộc',
  TRUONG_HO: 'Trưởng họ (Người sáng lập)',
  CLAN_ADMIN: 'Quản trị viên dòng họ',
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

function cleanStr(val, fallback = '') {
  if (val === undefined || val === null) return fallback;
  const text = String(val).trim();
  return text || fallback;
}

const resolveEffectiveIsClan = (
  memberIsClan,
  summaryIsClan,
  snapshotIsClan
) => {
  if (typeof memberIsClan === 'boolean') return memberIsClan;
  if (typeof summaryIsClan === 'boolean') return summaryIsClan;
  if (typeof snapshotIsClan === 'boolean') return snapshotIsClan;
  return null;
};

const formatClanRelationshipDisplay = ({
  isClan,
  memberGender,
  memberChildType,
  summaryChildType,
  snapshotChildType,
  linkType,
  snapshotRelationship,
}) => {
  let effectiveChildType = String(
    memberChildType || summaryChildType || snapshotChildType || ''
  ).toUpperCase();
  const effectiveLinkType = String(linkType || '').toUpperCase();
  const rawRel = String(snapshotRelationship || '').toUpperCase();
  const gender = String(memberGender || '').toUpperCase();

  if (isClan === false && (!effectiveChildType || effectiveChildType === 'CON_DE')) {
    effectiveChildType =
      gender === 'NAM' ? 'CON_RE' : gender === 'NU' ? 'CON_DAU' : 'KHAC';
  }

  const childLabel = effectiveChildType
    ? RELATIONSHIP_DISPLAY_LABELS[effectiveChildType] || effectiveChildType
    : '';
  const linkLabel = effectiveLinkType
    ? RELATIONSHIP_DISPLAY_LABELS[effectiveLinkType] || effectiveLinkType
    : '';

  if (typeof isClan === 'boolean') {
    const clanScopeLabel = isClan ? 'Nội tộc' : 'Ngoại tộc';
    const roleLabel =
      childLabel ||
      (rawRel ? RELATIONSHIP_DISPLAY_LABELS[rawRel] || snapshotRelationship : '') ||
      linkLabel;
    return roleLabel ? `${clanScopeLabel} — ${roleLabel}` : clanScopeLabel;
  }

  const declaredRole =
    childLabel ||
    (rawRel ? RELATIONSHIP_DISPLAY_LABELS[rawRel] || snapshotRelationship : '');
  if (declaredRole && linkLabel && declaredRole !== linkLabel) {
    return `${declaredRole} (${linkLabel})`;
  }
  return declaredRole || linkLabel || 'Chưa khai báo';
};

function extractSocialRows(regProfile, snapshot, userCore) {
  const rows = [];
  const links = Array.isArray(regProfile?.social_links)
    ? regProfile.social_links
    : Array.isArray(snapshot?.social_links)
      ? snapshot.social_links
      : null;

  if (links && links.length > 0) {
    links.forEach((item) => {
      const val = cleanStr(item?.value);
      if (!val) return;
      rows.push({
        label: cleanStr(item?.type, 'Mạng xã hội'),
        value: val,
      });
    });
    if (rows.length > 0) return rows;
  }

  const sp =
    (regProfile?.social_profiles &&
    typeof regProfile.social_profiles === 'object'
      ? regProfile.social_profiles
      : null) ||
    (snapshot?.social_profiles && typeof snapshot.social_profiles === 'object'
      ? snapshot.social_profiles
      : null) ||
    (userCore?.social_profiles && typeof userCore.social_profiles === 'object'
      ? userCore.social_profiles
      : {});

  Object.entries(sp).forEach(([k, v]) => {
    const val = cleanStr(v);
    if (!val) return;
    const norm = String(k).trim().toLowerCase();
    rows.push({
      label: SOCIAL_LABEL_MAP[norm] || k,
      value: val,
    });
  });

  return rows;
}

const UserApprovalForm = ({
  userData,
  onSubmit,
  onCancel,
  loading,
  onOpenClanLookup,
}) => {
  const raw = userData?.rawBackendData || userData || {};

  const userCore = raw.userData || raw;
  const snapshot = userCore.temp_snapshot || raw.temp_snapshot || {};
  const caseMetadata = raw.caseMetadata || userCore.caseMetadata || {};
  const regProfile =
    caseMetadata.registration_profile &&
    typeof caseMetadata.registration_profile === 'object'
      ? caseMetadata.registration_profile
      : raw.registration_profile && typeof raw.registration_profile === 'object'
        ? raw.registration_profile
        : {};
  const claimVerification =
    regProfile.claim_verification &&
    typeof regProfile.claim_verification === 'object'
      ? regProfile.claim_verification
      : {};

  const isMultiHomeCase =
    raw.isMultiHomeCase === true || userCore.isMultiHomeCase === true;
  const isClaimEmCase =
    regProfile.claim_mode === 'CLAIM_EM' ||
    Boolean(
      regProfile.claimed_member_id ||
        snapshot.claimed_member_id ||
        caseMetadata.claimed_member_id
    );
  const isClanSetupCase =
    raw.caseType === 'CLAN_SETUP' ||
    userCore.caseType === 'CLAN_SETUP' ||
    regProfile.claim_mode === 'CLAN_SETUP';

  const agreedRulesObj = raw.agreedRules || userCore.agreedRules || {};
  const hasAgreedRules = Boolean(
    agreedRulesObj.agreed ||
      regProfile.agreed_rules ||
      caseMetadata.agreed_rules
  );
  const agreedRulesText = hasAgreedRules
    ? `Đã cam kết tuân thủ (v${agreedRulesObj.tosVersion || regProfile.agreed_tos_version || '1.0'})${
        agreedRulesObj.agreedAt
          ? ` — ${new Date(agreedRulesObj.agreedAt).toLocaleString('vi-VN')}`
          : ''
      }`
    : 'Hồ sơ nộp trước khi áp dụng cam kết nội quy điện tử';

  const tenant = userCore.tenant || raw.tenant || raw.tenantData;
  const member = userCore.member_profile || raw.member_profile || raw.memberData;

  const effectiveIsClan = resolveEffectiveIsClan(
    member?.is_clan,
    claimVerification?.claimed_member_summary?.is_clan,
    snapshot.is_clan
  );

  const resolvedRelationshipDisplay = formatClanRelationshipDisplay({
    isClan: effectiveIsClan,
    memberGender: member?.gender || regProfile.gender || snapshot.gender,
    memberChildType: member?.child_type,
    summaryChildType: claimVerification?.claimed_member_summary?.child_type,
    snapshotChildType: regProfile.child_type || snapshot.child_type,
    linkType: caseMetadata.link_type || snapshot.link_type,
    snapshotRelationship:
      regProfile.temp_relationship || snapshot.relationship,
  });

  const currentUserStatus =
    isMultiHomeCase && raw.caseStatus
      ? raw.caseStatus === 'REJECTED'
        ? 'TU_CHOI'
        : raw.caseStatus === 'APPROVED' || raw.caseStatus === 'MERGED'
          ? 'DA_DUYET'
          : 'CHO_DUYET'
      : raw.status || userCore.status || 'CHO_DUYET';

  const isFinalRejectionRecord =
    userCore.isFinalRejection === true || raw.isFinalRejection === true;

  const resolveDefaultNewStatus = (status, isFinal) => {
    if (status === 'CHO_DUYET') return 'DA_DUYET';
    if (status === 'TU_CHOI' && !isFinal) return 'CHO_DUYET';
    return '';
  };

  // Trạng thái tích khẳng định đã xem & kiểm soát từng nhóm thông tin [UAT-IMP5 Mục 2]
  const [verifiedCards, setVerifiedCards] = useState({});
  const [showRawJson, setShowRawJson] = useState(false);
  const [duplicateClanMatches, setDuplicateClanMatches] = useState([]);
  const [confirmFinalStep2, setConfirmFinalStep2] = useState(false);
  const [localValidationMsg, setLocalValidationMsg] = useState('');

  const [formState, setFormState] = useState({
    userId: userCore.id || raw.id,
    newStatus: resolveDefaultNewStatus(
      currentUserStatus,
      isFinalRejectionRecord
    ),
    adminNote: userCore.adminNote || '',
    tenantId: tenant?.id || null,
    newTenantStatus: tenant?.status || 'CHO_DUYET',
    isFinalRejection: false,
  });

  useEffect(() => {
    if (!isClanSetupCase) {
      setDuplicateClanMatches([]);
      return undefined;
    }
    const targetName = cleanStr(
      tenant?.name || tenant?.clan_name || snapshot.clanName,
      ''
    );
    if (!targetName || targetName.length < 2) return undefined;

    let cancelled = false;
    apiClient
      .get('/tenants', { params: { q: targetName, page: 1, limit: 10 } })
      .then((res) => {
        if (cancelled) return;
        const items = res.data?.data?.items || res.data?.items || [];
        const others = items.filter((t) => t && t.id !== tenant?.id);
        setDuplicateClanMatches(others);
      })
      .catch(() => {
        if (!cancelled) setDuplicateClanMatches([]);
      });

    return () => {
      cancelled = true;
    };
  }, [isClanSetupCase, tenant?.id, tenant?.name, tenant?.clan_name, snapshot.clanName]);

  const toggleCardVerification = (cardKey, checked) => {
    setVerifiedCards((prev) => ({
      ...prev,
      [cardKey]: checked,
    }));
    setLocalValidationMsg('');
  };

  // Trích xuất thông tin Người giới thiệu trong họ [UAT-IMP5 Mục 1]
  const referrerName = cleanStr(
    regProfile.referrer_name ||
      regProfile.referrer_info?.full_name ||
      snapshot.referrer_name ||
      caseMetadata.referrer_name ||
      raw.referrer_name
  );
  const referrerPhone = cleanStr(
    regProfile.referrer_phone ||
      regProfile.referrer_info?.phone ||
      snapshot.referrer_phone ||
      caseMetadata.referrer_phone ||
      raw.referrer_phone
  );

  // Xây dựng danh sách các Card kiểm soát theo loại hồ sơ
  const reviewCards = useMemo(() => {
    const genderCode = String(
      regProfile.gender || snapshot.gender || 'NAM'
    ).toUpperCase();
    const genderLabel = GENDER_LABELS[genderCode] || 'Nam';
    const roleCode = String(
      regProfile.member_role || snapshot.member_role || ''
    ).toUpperCase();
    const memberRoleLabel =
      MEMBER_ROLE_LABELS[roleCode] || cleanStr(roleCode, 'Thành viên trong họ');

    const applicantName = cleanStr(
      regProfile.full_name || snapshot.full_name || userCore.name,
      'Chưa khai báo'
    );
    const applicantAlias = cleanStr(regProfile.alias || snapshot.alias);
    const birthDateText =
      [
        regProfile.birth_day,
        regProfile.birth_month,
        regProfile.birth_year || snapshot.birth_year,
      ]
        .filter((v) => v !== undefined && v !== null && String(v).trim() !== '')
        .join('/') || 'Chưa rõ';
    const aliveText =
      regProfile.is_alive === false
        ? `Đã mất${regProfile.death_year ? ` (Năm mất: ${regProfile.death_year})` : ''}`
        : 'Còn sống';
    const birthPlace = cleanStr(
      regProfile.birth_place || snapshot.birth_place
    );
    const addressText = cleanStr(regProfile.address || snapshot.address);
    const noteText = cleanStr(regProfile.note || snapshot.note);
    const phoneText = cleanStr(
      userCore.phone || regProfile.phone,
      'Chưa khai báo'
    );
    const emailText = cleanStr(
      userCore.email || regProfile.email,
      'Không khai báo'
    );

    // =========================================================================
    // NHÁNH A: HỒ SƠ LẬP DÒNG HỌ MỚI (CLAN_SETUP)
    // =========================================================================
    if (isClanSetupCase) {
      const clanNameText = cleanStr(
        tenant?.name || tenant?.clan_name || snapshot.clanName,
        'Chưa rõ tên dòng họ'
      );
      const clanDescText = cleanStr(
        tenant?.description || snapshot.description
      );
      const elderName = cleanStr(
        regProfile.elder_name || snapshot.elder_name || referrerName
      );
      const elderPhone = cleanStr(
        regProfile.elder_phone || snapshot.elder_phone || referrerPhone
      );

      return [
        {
          id: 'clan_info',
          shortLabel: 'Mục 1 (Dòng họ mới)',
          title: '1. Thông tin dòng họ mới đăng ký',
          voiceText: `Mục 1: Thông tin dòng họ mới đăng ký: ${clanNameText}.`,
          confirmLabel:
            'Tôi đã kiểm tra thông tin dòng họ mới và khẳng định đã kiểm soát nhóm thông tin này.',
          rows: [
            { label: 'Tên dòng họ', value: clanNameText },
            {
              label: 'Mã định danh',
              value: cleanStr(tenant?.slug, 'Chưa cấp mã'),
            },
            {
              label: 'Trạng thái hiện tại',
              value: cleanStr(tenant?.status, 'CHO_DUYET'),
            },
          ],
          notes: clanDescText
            ? [{ label: 'Mô tả dòng họ', value: clanDescText }]
            : [],
          extraContent: (
            <div className="space-y-2.5">
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-3 text-base font-normal text-indigo-950">
                Khi SYSTEM_ADMIN bấm <strong>Phê duyệt hồ sơ</strong> bên dưới, dòng họ sẽ tự động mở ở <strong>Chế độ dùng thử 30 ngày (Sandbox)</strong> để Trưởng họ dựng cây phả hệ gốc.
              </div>
              {duplicateClanMatches.length > 0 && (
                <div
                  role="alert"
                  className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-base text-amber-950 space-y-1"
                >
                  <p className="font-bold text-amber-900">
                    Cảnh báo đối chiếu tự động: Phát hiện {duplicateClanMatches.length} dòng họ có tên tương tự trên hệ thống:
                  </p>
                  <ul className="list-disc pl-5 text-sm font-semibold">
                    {duplicateClanMatches.slice(0, 3).map((m) => (
                      <li key={m.id}>
                        {m.name} ({m.slug || 'Chưa mã'} — {m.status})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {typeof onOpenClanLookup === 'function' && (
                <button
                  type="button"
                  onClick={() =>
                    onOpenClanLookup(clanNameText, { mode: 'CLAN_DIRECTORY' })
                  }
                  className="min-h-[48px] h-12 w-full inline-flex items-center justify-center gap-2 rounded-xl border border-blue-300 bg-blue-50 px-4 text-base font-bold text-blue-800 whitespace-nowrap hover:bg-blue-100"
                >
                  <Search size={18} />
                  <span>Kiểm tra trùng dòng họ trên hệ thống</span>
                </button>
              )}
            </div>
          ),
        },
        {
          id: 'founder_info',
          shortLabel: 'Mục 2 (Người sáng lập)',
          title: '2. Thông tin người sáng lập (Trưởng họ)',
          voiceText: `Mục 2: Người sáng lập dòng họ: ${applicantName}, giới tính ${genderLabel}.`,
          confirmLabel:
            'Tôi đã xem và khẳng định đã kiểm soát nhóm thông tin Người sáng lập này.',
          rows: [
            { label: 'Họ và tên khai sinh', value: applicantName },
            ...(applicantAlias
              ? [{ label: 'Tên tự / Tên hiệu', value: applicantAlias }]
              : []),
            { label: 'Giới tính', value: genderLabel },
            { label: 'Năm sinh', value: birthDateText },
            {
              label: 'Họ tên Cha / Mẹ',
              value: cleanStr(
                regProfile.father_name || snapshot.father_name,
                'Chưa rõ'
              ),
            },
            { label: 'Quan hệ với họ tộc', value: resolvedRelationshipDisplay },
          ],
          notes: [
            ...(birthPlace
              ? [{ label: 'Nguyên quán / Quê gốc', value: birthPlace }]
              : []),
            ...(addressText
              ? [{ label: 'Địa chỉ cư trú hiện tại', value: addressText }]
              : []),
          ],
        },
        {
          id: 'offline_verifier',
          shortLabel: 'Mục 3 (Thẩm định lập họ)',
          title: '3. Thông tin thẩm định khởi tạo dòng họ',
          voiceText: `Mục 3: Thông tin thẩm định khởi tạo dòng họ. Vị tiền nhân cao nhất: ${cleanStr(regProfile.earliest_ancestor_name || snapshot.earliest_ancestor_name, 'Chưa khai báo')}. Địa bàn gốc: ${cleanStr(regProfile.clan_origin_place || snapshot.clan_origin_place, 'Chưa khai báo')}.`,
          confirmLabel:
            'Tôi đã kiểm tra thông tin thẩm định khởi tạo dòng họ và khẳng định đã kiểm soát nhóm thông tin này.',
          rows: [
            {
              label: 'Mục đích khởi tạo',
              value:
                SETUP_PURPOSE_LABELS[
                  regProfile.setup_purpose || snapshot.setup_purpose
                ] ||
                cleanStr(
                  regProfile.setup_purpose || snapshot.setup_purpose,
                  'Chưa khai báo'
                ),
            },
            {
              label: 'Số đời dự kiến',
              value:
                KNOWN_GENERATIONS_LABELS[
                  regProfile.known_generations || snapshot.known_generations
                ] ||
                cleanStr(
                  regProfile.known_generations || snapshot.known_generations,
                  'Chưa khai báo'
                ),
            },
            {
              label: 'Vị tiền nhân cao nhất',
              value: cleanStr(
                regProfile.earliest_ancestor_name ||
                  snapshot.earliest_ancestor_name,
                'Chưa khai báo'
              ),
            },
            {
              label: 'Địa bàn gốc / Cư trú',
              value: cleanStr(
                regProfile.clan_origin_place || snapshot.clan_origin_place,
                'Chưa khai báo'
              ),
            },
            ...(elderName
              ? [{ label: 'Người thân tham chiếu', value: elderName }]
              : []),
            ...(elderPhone
              ? [{ label: 'SĐT tham chiếu', value: elderPhone }]
              : []),
          ],
          notes: [],
          extraContent: elderPhone ? (
            <a
              href={`tel:${elderPhone.replace(/\s+/g, '')}`}
              className="min-h-[48px] h-12 w-full inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 text-base font-bold text-emerald-900 whitespace-nowrap hover:bg-emerald-100"
            >
              <Phone size={18} />
              <span>Gọi điện người thân tham chiếu ({elderPhone})</span>
            </a>
          ) : null,
        },
        {
          id: 'contact_note',
          shortLabel: 'Mục 4 (Lời nhắn & Liên hệ)',
          title: '4. Lời nhắn & Tài khoản quản trị',
          voiceText: `Mục 4: Số điện thoại đăng nhập ${phoneText}. Email ${emailText}.`,
          confirmLabel:
            'Tôi đã xem và khẳng định đã kiểm soát Lời nhắn & Tài khoản quản trị này.',
          rows: [
            { label: 'Số điện thoại đăng nhập', value: phoneText },
            { label: 'Email nhận thông báo', value: emailText },
            { label: 'Cam kết nội quy', value: agreedRulesText },
          ],
          notes: noteText
            ? [{ label: 'Lời nhắn gửi Quản trị viên', value: noteText }]
            : [],
        },
      ];
    }

    // =========================================================================
    // NHÁNH B: HỒ SƠ XIN GIA NHẬP DÒNG HỌ (CLAIM_EM HOẶC NEW_PROFILE_21)
    // =========================================================================
    const socialRows = extractSocialRows(regProfile, snapshot, userCore);

    // Card 1: Thông tin Người giới thiệu trong họ [UAT-IMP5 Mục 1]
    const card1Referrer = {
      id: 'referrer_info',
      shortLabel: 'Mục 1 (Người giới thiệu)',
      title: '1. Thông tin Người giới thiệu trong họ',
      voiceText: referrerName
        ? `Mục 1: Người giới thiệu trong họ là ${referrerName}, số điện thoại ${referrerPhone || 'chưa có'}.`
        : 'Mục 1: Thông tin người giới thiệu trong họ. Hồ sơ này chưa khai báo người giới thiệu.',
      confirmLabel:
        'Tôi đã liên hệ / đối chiếu sổ họ và khẳng định đã kiểm soát nhóm thông tin Người giới thiệu này.',
      rows: [
        {
          label: 'Họ và tên người giới thiệu',
          value: referrerName || 'Chưa khai báo',
        },
        {
          label: 'Số điện thoại người giới thiệu',
          value: referrerPhone || 'Chưa khai báo',
        },
      ],
      notes: [],
      extraContent: (
        <div className="space-y-2.5">
          {!referrerName && !referrerPhone && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-base font-semibold text-rose-800">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <span>
                Hồ sơ chưa có thông tin người giới thiệu trong họ. Admin có thể bấm &ldquo;Yêu cầu bổ sung&rdquo; để ứng viên cung cấp.
              </span>
            </div>
          )}

          {referrerPhone && (
            <a
              href={`tel:${referrerPhone.replace(/\s+/g, '')}`}
              className="min-h-[48px] h-12 w-full inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 text-base font-bold text-emerald-900 whitespace-nowrap hover:bg-emerald-100"
            >
              <Phone size={18} />
              <span>Gọi người giới thiệu ({referrerPhone})</span>
            </a>
          )}

          {typeof onOpenClanLookup === 'function' && (
            <button
              type="button"
              onClick={() => onOpenClanLookup(referrerPhone || referrerName || '')}
              className="min-h-[48px] h-12 w-full inline-flex items-center justify-center gap-2 rounded-xl border border-blue-300 bg-blue-50 px-4 text-base font-bold text-blue-800 whitespace-nowrap hover:bg-blue-100"
            >
              <Search size={18} />
              <span>
                {referrerName || referrerPhone
                  ? 'Tra cứu người giới thiệu trên sổ họ'
                  : 'Mở công cụ tra cứu sổ họ'}
              </span>
            </button>
          )}
        </div>
      ),
    };

    // Card 2: Thông tin nhân thân người đăng ký
    const card2Personal = {
      id: 'personal_info',
      shortLabel: 'Mục 2 (Nhân thân)',
      title: '2. Thông tin nhân thân người đăng ký',
      voiceText: `Mục 2: Thông tin nhân thân. Họ và tên khai sinh: ${applicantName}. Giới tính: ${genderLabel}. Tình trạng: ${aliveText}.`,
      confirmLabel:
        'Tôi đã xem và khẳng định đã kiểm soát nhóm thông tin Nhân thân này.',
      rows: [
        { label: 'Họ và tên khai sinh', value: applicantName },
        ...(applicantAlias
          ? [{ label: 'Tên tự / Tên hiệu / Thường gọi', value: applicantAlias }]
          : []),
        { label: 'Giới tính', value: genderLabel },
        { label: 'Sống / Chết', value: aliveText },
        { label: 'Ngày / Tháng / Năm sinh', value: birthDateText },
      ],
      notes: birthPlace
        ? [{ label: 'Nơi sinh / Nguyên quán', value: birthPlace }]
        : [],
    };

    // Card 3: Vị trí phả hệ & Tiền nhân (phân nhánh EM vs 21 trường)
    let card3Lineage;
    if (isClaimEmCase) {
      const emSum = claimVerification?.claimed_member_summary || {};
      const adminVerPrompts = resolveVerificationPrompts({
        linkType: caseMetadata.link_type || '',
        childType: member?.child_type || emSum.child_type || '',
      });
      const treeMemberName = cleanStr(
        member?.full_name || emSum.full_name || regProfile.full_name,
        'Chưa rõ'
      );
      const treeGen =
        member?.generation ?? emSum.generation ?? 'Chưa rõ';
      const treeBranch = cleanStr(
        member?.branch_name || member?.branch?.name || emSum.branch_name,
        'Chưa rõ'
      );

      card3Lineage = {
        id: 'lineage_info',
        shortLabel: 'Mục 3 (Phả hệ & Đối chiếu)',
        title: '3. Hồ sơ nhận trên cây & 3 lớp xác minh',
        voiceText: `Mục 3: Hồ sơ trên cây xin nhận là ${treeMemberName}, đời thứ ${treeGen}, ${resolvedRelationshipDisplay}.`,
        confirmLabel:
          'Tôi đã đối chiếu phả hệ và khẳng định đã kiểm soát nhóm thông tin Vị trí phả hệ này.',
        rows: [
          { label: 'Tên trên sổ họ xin nhận', value: treeMemberName },
          { label: 'Quan hệ dòng họ (is_clan)', value: resolvedRelationshipDisplay },
          { label: 'Đời thứ trên sổ', value: `Đời thứ ${treeGen}` },
          { label: 'Chi / Phái / Nhánh', value: treeBranch },
          ...(member?.father_name || emSum.father_name
            ? [
                {
                  label: 'Họ tên Cha trên sổ',
                  value: member?.father_name || emSum.father_name,
                },
              ]
            : []),
          {
            label: adminVerPrompts.layer1Label,
            value: cleanStr(
              claimVerification.layer1_lineage || snapshot.father_name,
              '—'
            ),
          },
          {
            label: adminVerPrompts.layer2Label,
            value: cleanStr(
              claimVerification.layer2_branch_origin || snapshot.branch_name,
              '—'
            ),
          },
        ],
        notes: [
          {
            label: adminVerPrompts.layer3Label,
            value: cleanStr(
              claimVerification.layer3_guarantor_note || snapshot.note,
              'Không có ghi chú'
            ),
          },
        ],
        extraContent: !member ? (
          <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-base font-bold text-rose-800">
            Cảnh báo: Không tìm thấy bản ghi thành viên hợp lệ trên cây phả hệ!
          </div>
        ) : null,
      };
    } else {
      card3Lineage = {
        id: 'lineage_info',
        shortLabel: 'Mục 3 (Phả hệ & Tiền nhân)',
        title: '3. Vị trí phả hệ & Tiền nhân',
        voiceText: `Mục 3: Vị trí phả hệ. Họ tên Cha là ${cleanStr(regProfile.father_name || snapshot.father_name, 'chưa rõ')}. Quan hệ: ${resolvedRelationshipDisplay}.`,
        confirmLabel:
          'Tôi đã đối chiếu phả hệ và khẳng định đã kiểm soát nhóm thông tin Vị trí phả hệ này.',
        rows: [
          {
            label: 'Họ và tên Cha',
            value: cleanStr(
              regProfile.father_name || snapshot.father_name,
              'Chưa khai báo'
            ),
          },
          ...(regProfile.mother_name || snapshot.mother_name
            ? [
                {
                  label: 'Họ và tên Mẹ',
                  value: regProfile.mother_name || snapshot.mother_name,
                },
              ]
            : []),
          ...(regProfile.grandfather_name || snapshot.grandfather_name
            ? [
                {
                  label: 'Họ và tên Ông nội',
                  value:
                    regProfile.grandfather_name || snapshot.grandfather_name,
                },
              ]
            : []),
          ...(regProfile.grandmother_name || snapshot.grandmother_name
            ? [
                {
                  label: 'Họ và tên Bà nội',
                  value:
                    regProfile.grandmother_name || snapshot.grandmother_name,
                },
              ]
            : []),
          {
            label: 'Tên Chi / Phái / Nhánh',
            value: cleanStr(
              regProfile.branch_name || snapshot.branch_name,
              'Chưa khai báo'
            ),
          },
          {
            label: 'Đời thứ trong họ',
            value:
              regProfile.generation || snapshot.generation
                ? `Đời thứ ${regProfile.generation || snapshot.generation}`
                : 'Chưa khai báo',
          },
          { label: 'Quan hệ với dòng họ', value: resolvedRelationshipDisplay },
          { label: 'Vai vế / Chức trách', value: memberRoleLabel },
        ],
        notes: [],
      };
    }

    // Card 4: Địa chỉ cư trú & Mạng xã hội
    const card4Residence = {
      id: 'residence_info',
      shortLabel: 'Mục 4 (Cư trú & MXH)',
      title: '4. Địa chỉ cư trú & Mạng xã hội',
      voiceText: addressText
        ? `Mục 4: Địa chỉ cư trú hiện tại: ${addressText}.`
        : 'Mục 4: Địa chỉ cư trú và mạng xã hội liên hệ.',
      confirmLabel:
        'Tôi đã xem và khẳng định đã kiểm soát nhóm thông tin Cư trú & Mạng xã hội này.',
      rows: [
        ...socialRows,
        ...(socialRows.length === 0 && !addressText
          ? [{ label: 'Thông tin cư trú & MXH', value: 'Ứng viên không khai báo' }]
          : []),
      ],
      notes: addressText
        ? [{ label: 'Địa chỉ cư trú hiện tại', value: addressText }]
        : [],
    };

    // Card 5: Lời nhắn, Minh chứng & Tài khoản liên hệ
    const card5ContactNote = {
      id: 'contact_note_info',
      shortLabel: 'Mục 5 (Lời nhắn & Liên hệ)',
      title: '5. Lời nhắn, Minh chứng & Liên hệ',
      voiceText: `Mục 5: Số điện thoại đăng nhập ${phoneText}. Email ${emailText}. Lời nhắn: ${noteText || 'không có'}.`,
      confirmLabel:
        'Tôi đã xem và khẳng định đã kiểm soát Lời nhắn, Minh chứng & Liên hệ này.',
      rows: [
        { label: 'Số điện thoại đăng nhập', value: phoneText },
        { label: 'Email liên hệ', value: emailText },
        {
          label: 'Vai trò tài khoản',
          value: cleanStr(userCore.role, 'USER'),
        },
        { label: 'Cam kết nội quy', value: agreedRulesText },
      ],
      notes: [
        {
          label: 'Lời nhắn gửi Ban Quản trị xác minh',
          value: noteText || 'Không có ghi chú kèm theo',
        },
      ],
      extraContent:
        phoneText && phoneText !== 'Chưa khai báo' && phoneText !== 'Chưa có số' ? (
          <a
            href={`tel:${phoneText.replace(/\s+/g, '')}`}
            className="min-h-[48px] h-12 w-full inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-slate-50 px-4 text-base font-bold text-slate-800 whitespace-nowrap hover:bg-slate-100"
          >
            <Phone size={18} className="text-emerald-600" />
            <span>Gọi người đăng ký ({phoneText})</span>
          </a>
        ) : null,
    };

    return [
      card1Referrer,
      card2Personal,
      card3Lineage,
      card4Residence,
      card5ContactNote,
    ];
  }, [
    isClanSetupCase,
    isClaimEmCase,
    regProfile,
    snapshot,
    userCore,
    tenant,
    member,
    claimVerification,
    caseMetadata,
    resolvedRelationshipDisplay,
    referrerName,
    referrerPhone,
    duplicateClanMatches,
    onOpenClanLookup,
  ]);

  // Tính toán Approval Gate [UAT-IMP5 Mục 2]
  const verifiedCount = reviewCards.filter((c) => Boolean(verifiedCards[c.id])).length;
  const totalCardsCount = reviewCards.length;
  const unverifiedCards = reviewCards.filter((c) => !verifiedCards[c.id]);
  const allCardsVerified = totalCardsCount > 0 && unverifiedCards.length === 0;

  const isApproveAction = formState.newStatus === 'DA_DUYET';
  const isActionLockedByStatus =
    currentUserStatus === 'DA_DUYET' || isFinalRejectionRecord;
  const isApproveBlockedByGate = isApproveAction && !allCardsVerified;

  const handleLocalSubmit = (e) => {
    e.preventDefault();
    setLocalValidationMsg('');

    if (isApproveAction && !allCardsVerified) {
      setLocalValidationMsg(
        `Ban Quản trị cần tích khẳng định đã kiểm soát đủ ${totalCardsCount}/${totalCardsCount} nhóm thông tin (còn thiếu: ${unverifiedCards
          .map((c) => c.shortLabel)
          .join(', ')}) trước khi phê duyệt hồ sơ.`
      );
      return;
    }

    if (!formState.adminNote || formState.adminNote.trim() === '') {
      setLocalValidationMsg(
        'Vui lòng nhập Bút phê / Ghi chú của Ban Quản trị trước khi lưu quyết định.'
      );
      return;
    }

    if (!formState.newStatus) {
      setLocalValidationMsg(
        'Trạng thái hiện tại không cho phép thao tác tại biểu mẫu này.'
      );
      return;
    }

    let newStatus = formState.newStatus;
    let isFinalRejection = formState.isFinalRejection === true;

    if (newStatus === 'FINAL_REJECT') {
      newStatus = 'TU_CHOI';
      isFinalRejection = true;
    }

    if (newStatus === 'TU_CHOI' && isFinalRejection && !confirmFinalStep2) {
      setLocalValidationMsg(
        'Vui lòng tích xác nhận bước 2 cho quyết định Từ chối vĩnh viễn.'
      );
      return;
    }

    onSubmit({
      ...formState,
      newStatus,
      isFinalRejection,
    });
  };

  return (
    <form
      onSubmit={handleLocalSubmit}
      noValidate
      className="space-y-4 text-slate-900 font-sans"
    >
      {/* CẢNH BÁO KHÓA QA 3 LẦN SAI [FUNC-03] */}
      {(userCore.qa_locked === true ||
        raw.qa_locked === true ||
        caseMetadata.qa_locked === true) && (
        <div
          role="alert"
          data-testid="user-approval-qa-locked-warning"
          className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 text-amber-950 space-y-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 text-base font-bold text-amber-900">
              <Lock size={18} className="text-amber-700 shrink-0" />
              Cảnh báo: Khóa QA (3 lần sai) - Chờ duyệt thủ công
            </span>
            <ZoneVoiceButton
              visible
              text="Hồ sơ này đang bị khóa câu hỏi bảo mật do nhập sai 3 lần liên tiếp. Quản trị viên cần kiểm tra và duyệt thủ công."
              label="Nghe"
            />
          </div>
          <p className="text-base font-normal text-amber-900">
            Ứng viên đã nhập chưa khớp câu hỏi bảo mật 3 lần liên tiếp.
          </p>
        </div>
      )}

      {/* TÓM TẮT HỒ SƠ & TIẾN ĐỘ KIỂM SOÁT */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-black text-indigo-800 border border-indigo-200">
            {isClanSetupCase
              ? isMultiHomeCase
                ? '[LẬP DÒNG HỌ MỚI - CLAN SETUP (C1-S)]'
                : '[LẬP DÒNG HỌ MỚI - CLAN SETUP (C2-S)]'
              : isMultiHomeCase
                ? '[GIA NHẬP HỌ THỨ HAI - C1]'
                : isClaimEmCase
                  ? '[NHẬN NGƯỜI TRÊN CÂY - EM]'
                  : '[KHAI BÁO MỚI - 21 TRƯỜNG]'}
          </span>

          <span
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-black border ${
              allCardsVerified
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                : 'bg-amber-50 text-amber-800 border-amber-300'
            }`}
          >
            {allCardsVerified ? (
              <CheckCircle2 size={14} />
            ) : (
              <CircleDashed size={14} />
            )}
            <span>
              Đã kiểm soát: {verifiedCount}/{totalCardsCount} nhóm
            </span>
          </span>
        </div>

        <div>
          <h2 className="text-xl font-black text-slate-900">
            {cleanStr(
              regProfile.full_name || snapshot.full_name || userCore.name,
              'Hồ sơ đăng ký'
            )}
          </h2>
          <p className="mt-0.5 text-base font-normal text-slate-600">
            Dòng họ:{' '}
            <strong className="font-bold text-indigo-900">
              {cleanStr(
                tenant?.name || tenant?.clan_name,
                'Chưa phân bổ tộc hệ'
              )}
            </strong>
          </p>
        </div>

        {(raw.caseStatus === 'NEEDS_REVISION' ||
          userCore.caseStatus === 'NEEDS_REVISION') && (
          <div
            role="status"
            className="rounded-xl border-2 border-sky-300 bg-sky-50 p-3.5 text-sky-950 space-y-1"
          >
            <p className="text-base font-bold text-sky-900">
              Trạng thái hiện tại: Đã yêu cầu bổ sung (Đang chờ người đăng ký chỉnh sửa)
            </p>
            {(raw.reviewNote ||
              userCore.reviewNote ||
              caseMetadata.review_note) && (
              <p className="text-base font-normal text-sky-900">
                Nội dung đã yêu cầu:{' '}
                <strong className="font-semibold">
                  {raw.reviewNote ||
                    userCore.reviewNote ||
                    caseMetadata.review_note}
                </strong>
              </p>
            )}
          </div>
        )}

        {isMultiHomeCase && (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-3 text-sm font-medium text-indigo-950">
            Tài khoản này đã hoạt động (<code>DA_DUYET</code>) tại dòng họ gốc.
            Khi duyệt, hệ thống chỉ tạo liên kết phụ (<code>is_default = false</code>) tại{' '}
            <strong>{tenant?.name || tenant?.clan_name || 'dòng họ đích'}</strong>.
          </div>
        )}

        {/* Chú giải biểu tượng trạng thái kiểm soát */}
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 size={18} className="text-emerald-700 shrink-0" />
            <span>Đã kiểm soát</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CircleDashed size={18} className="text-amber-600 shrink-0" />
            <span>Chưa kiểm soát</span>
          </span>
        </div>
      </div>

      {/* DANH SÁCH CÁC CARD THÔNG TIN KÈM Ô XÁC NHẬN KIỂM SOÁT [UAT-IMP5 Mục 1 & 2] */}
      <div className="space-y-4">
        {reviewCards.map((card, index) => {
          const isChecked = Boolean(verifiedCards[card.id]);
          return (
            <CollapsibleDetailCard
              key={card.id}
              title={card.title}
              statusLabel={isChecked ? 'Đã kiểm soát' : 'Chưa kiểm soát'}
              statusVariant={isChecked ? 'complete' : 'pending'}
              voiceText={card.voiceText}
              defaultExpanded={index === 0}
              disabled={loading}
            >
              <div className="space-y-4">
                <KeyValueDetailTable rows={card.rows} notes={card.notes} />

                {card.extraContent}

                {/* Khối khẳng định đã xem và kiểm soát nhóm thông tin này */}
                <label
                  className={`flex items-start gap-3 rounded-xl border-2 p-3.5 cursor-pointer transition-colors ${
                    isChecked
                      ? 'border-emerald-400 bg-emerald-50 text-emerald-950'
                      : 'border-amber-300 bg-amber-50/80 text-amber-950 hover:bg-amber-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={loading}
                    onChange={(e) =>
                      toggleCardVerification(card.id, e.target.checked)
                    }
                    className="mt-1 h-5 w-5 shrink-0 rounded border-slate-400 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-base font-bold leading-snug">
                    {card.confirmLabel}
                  </span>
                </label>
              </div>
            </CollapsibleDetailCard>
          );
        })}
      </div>

      {/* KHỐI QUYẾT ĐỊNH XỬ LÝ & APPROVAL GATE [UAT-IMP5 Mục 2] */}
      <div className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck size={20} className="text-emerald-700 shrink-0" />
            <h3 className="text-lg font-bold text-slate-900">
              Quyết định xử lý hồ sơ
            </h3>
          </div>
          <ZoneVoiceButton
            visible
            text="Quản trị viên chọn quyết định phê duyệt, yêu cầu bổ sung hoặc từ chối hồ sơ, nhập bút phê bắt buộc rồi bấm nút lưu quyết định."
            label="Nghe"
          />
        </div>

        {isFinalRejectionRecord && (
          <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-base font-bold text-rose-800">
            Hồ sơ đã từ chối lần cuối. Không thể mở lại qua quy trình reopen.
          </p>
        )}

        <div>
          <label className="block text-base font-normal text-slate-600 mb-1.5">
            Chọn quyết định xử lý <span className="font-bold text-rose-600">*</span>
          </label>
          <select
            className="min-h-[48px] h-12 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-base font-bold text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100 disabled:text-slate-500"
            value={formState.newStatus}
            disabled={isActionLockedByStatus || loading}
            onChange={(e) => {
              const v = e.target.value;
              setLocalValidationMsg('');
              setFormState((p) => ({
                ...p,
                newStatus: v,
                isFinalRejection:
                  currentUserStatus === 'TU_CHOI' && v === 'TU_CHOI'
                    ? true
                    : v === 'TU_CHOI'
                      ? p.isFinalRejection
                      : false,
              }));
            }}
          >
            {currentUserStatus === 'CHO_DUYET' && (
              <>
                <option value="DA_DUYET">Phê duyệt hồ sơ (Chấp thuận)</option>
                <option value="RETURN_FOR_REVISION">
                  Yêu cầu bổ sung hồ sơ (Trả về sửa)
                </option>
                <option value="TU_CHOI">Từ chối hồ sơ</option>
              </>
            )}
            {currentUserStatus === 'TU_CHOI' && !isFinalRejectionRecord && (
              <>
                <option value="CHO_DUYET">Mở lại hồ sơ để xét duyệt</option>
                <option value="TU_CHOI">Từ chối lần cuối (Khóa vĩnh viễn)</option>
              </>
            )}
            {currentUserStatus === 'TU_CHOI' && isFinalRejectionRecord && (
              <option value="">Đã từ chối lần cuối — không thể thao tác</option>
            )}
            {currentUserStatus === 'DA_DUYET' && (
              <option value="">Hồ sơ đã được phê duyệt</option>
            )}
            {!['CHO_DUYET', 'TU_CHOI', 'DA_DUYET'].includes(
              currentUserStatus
            ) && (
              <option value="" disabled>
                Trạng thái {currentUserStatus} — không hỗ trợ tại đây
              </option>
            )}
          </select>
        </div>

        {/* Xác nhận 2 bước khi chọn Từ chối lần cuối */}
        {formState.newStatus === 'TU_CHOI' && (
          <div className="space-y-2.5 rounded-xl border border-rose-200 bg-rose-50/80 p-3.5">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 shrink-0"
                checked={formState.isFinalRejection === true}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setConfirmFinalStep2(false);
                  setFormState((p) => ({
                    ...p,
                    isFinalRejection: checked,
                  }));
                }}
              />
              <span className="text-base font-bold text-rose-800 leading-snug">
                Từ chối lần cuối — khóa vĩnh viễn hồ sơ, không cho mở lại.
              </span>
            </label>

            {formState.isFinalRejection === true && (
              <label className="ml-6 flex items-start gap-2.5 rounded-xl border border-rose-300 bg-white p-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1 h-5 w-5 shrink-0"
                  checked={confirmFinalStep2}
                  onChange={(e) => setConfirmFinalStep2(e.target.checked)}
                />
                <span className="text-base font-bold text-rose-900 leading-snug">
                  Bước 2: Tôi xác nhận quyết định từ chối vĩnh viễn của Hội đồng gia tộc là không thể hoàn tác.
                </span>
              </label>
            )}
          </div>
        )}

        <div>
          <label className="block text-base font-normal text-slate-600 mb-1.5">
            Bút phê / Ghi chú của Ban Quản trị{' '}
            <span className="font-bold text-rose-600">*</span>
          </label>
          <textarea
            rows={3}
            required
            disabled={isActionLockedByStatus || loading}
            placeholder="Nhập lý do phê duyệt, nội dung cần bổ sung hoặc lý do từ chối gửi tới người đăng ký..."
            className="min-h-[92px] w-full resize-y rounded-xl border border-slate-300 bg-white px-4 py-3 text-base font-bold text-slate-900 placeholder:font-normal placeholder:text-slate-400 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100"
            value={formState.adminNote}
            onChange={(e) => {
              setLocalValidationMsg('');
              setFormState((p) => ({
                ...p,
                adminNote: e.target.value,
              }));
            }}
          />
        </div>

        {/* Inline Helper Text >= 16px của Approval Gate (cấm dùng tooltip) */}
        {isApproveBlockedByGate && !isActionLockedByStatus && (
          <p
            role="status"
            className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-base font-bold leading-relaxed text-amber-950"
          >
            Cần tích khẳng định đã kiểm soát đủ {totalCardsCount}/{totalCardsCount} nhóm thông tin phía trên (còn thiếu:{' '}
            {unverifiedCards.map((c) => c.shortLabel).join(', ')}) để mở khóa nút Phê duyệt hồ sơ.
          </p>
        )}

        {localValidationMsg && (
          <div
            role="alert"
            className="rounded-xl border border-rose-300 bg-rose-50 p-3.5 text-base font-bold text-rose-800"
          >
            {localValidationMsg}
          </div>
        )}

        {/* Thanh nút hành động chuẩn 48px / rounded-xl */}
        <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="min-h-[48px] h-12 px-4 rounded-xl border border-slate-300 bg-white text-base font-bold text-slate-700 whitespace-nowrap hover:bg-slate-50 transition inline-flex items-center justify-center gap-1.5 sm:flex-1"
          >
            <X size={18} />
            <span>Quay lại</span>
          </button>

          <button
            type="submit"
            disabled={
              loading || isActionLockedByStatus || isApproveBlockedByGate
            }
            className={`min-h-[48px] h-12 px-5 rounded-xl text-base font-bold whitespace-nowrap transition inline-flex items-center justify-center gap-2 sm:flex-[1.6] ${
              loading || isActionLockedByStatus || isApproveBlockedByGate
                ? 'cursor-not-allowed bg-slate-300 text-slate-600'
                : formState.newStatus === 'DA_DUYET'
                  ? 'bg-emerald-600 text-white shadow-md hover:bg-emerald-700'
                  : formState.newStatus === 'RETURN_FOR_REVISION'
                    ? 'bg-amber-600 text-white shadow-md hover:bg-amber-700'
                    : 'bg-rose-600 text-white shadow-md hover:bg-rose-700'
            }`}
          >
            <Save size={18} />
            <span>
              {loading
                ? 'Đang lưu quyết định...'
                : formState.newStatus === 'DA_DUYET'
                  ? 'Phê duyệt hồ sơ'
                  : formState.newStatus === 'RETURN_FOR_REVISION'
                    ? 'Gửi yêu cầu bổ sung'
                    : formState.newStatus === 'TU_CHOI'
                      ? 'Xác nhận từ chối'
                      : formState.newStatus === 'CHO_DUYET'
                        ? 'Mở lại hồ sơ'
                        : 'Lưu quyết định'}
            </span>
          </button>
        </div>

        {/* Tiện ích xem JSON kỹ thuật khi cần đối chiếu sâu (thu gọn mặc định) */}
        <div className="border-t border-slate-100 pt-2 text-right">
          <button
            type="button"
            onClick={() => setShowRawJson((prev) => !prev)}
            className="text-xs font-bold text-slate-400 hover:text-slate-700 underline"
          >
            {showRawJson ? 'Ẩn dữ liệu kỹ thuật (JSON)' : 'Xem dữ liệu kỹ thuật (JSON)'}
          </button>
          {showRawJson && (
            <pre className="mt-2 max-h-56 overflow-auto rounded-xl bg-slate-900 p-3 text-left text-[11px] font-mono text-emerald-400">
              {JSON.stringify(
                {
                  user: userCore,
                  registration_profile: regProfile,
                  tenant,
                  member,
                },
                null,
                2
              )}
            </pre>
          )}
        </div>
      </div>
    </form>
  );
};

export default UserApprovalForm;
