/**
 * =============================================================================
 * PATH        : frontend/src/features/membership/pages/ClaimMemberPage.jsx
 * DATETIME    : 2026-11-22T18:10:00+07:00
 * VERSION     : 2.5.0-ISO29148-UAT-IMP5-RULES
 * DESCRIPTION : Trang Gia nhập dòng họ & Nhận diện nhân thân trên sổ họ:
 *               - [IMPL-PLAN-FE-PHASE2-V1.8-ISO29148 - Sprint FE-2]:
 *                 + Thay thế toàn bộ toast tự tắt bằng PersistentMessageBanner duy nhất
 *                   (hiển thị Mã tra cứu X-Correlation-Id fallback "Không có") [ARCH-02].
 *                 + Dùng BlockingLoadingOverlay hợp nhất duy nhất cho mọi thao tác async [ARCH-04].
 *                 + Xử lý HTTP 403 CLAIM_HOPPING_DETECTED: khóa gửi CLAIM_EM và cung cấp
 *                   nút chuyển nhanh sang khai báo mới 21 trường (CREATE_NEW) [NFR-03, TC-FE-13].
 *                 + Lọc và đồng bộ Cooldown bảo lãnh 7 ngày từ metadata.referral_history
 *                   và xử lý lỗi HTTP 400 REFERRER_COOLDOWN_ACTIVE [FUNC-09, TC-FE-09].
 *                 + Xử lý HTTP 423 ONBOARDING_QA_LOCKED & trạng thái qa_locked từ hồ sơ:
 *                   tắt form QA và hiển thị huy hiệu "Khóa QA (3 lần sai) - Chờ Ban Quản trị"
 *                   [FUNC-03, TC-FE-03].
 *                 + Xử lý HTTP 409 CONCURRENT_TRANSACTION_LOCKED (Keep State + Thử lại)
 *                   và 409 ALREADY_LINKED_TO_TENANT [ARCH-01, TC-FE-06, TC-FE-14].
 *                 + Tích hợp AudioHelpButton & ZoneVoiceButton (Elder Support) [NFR-FE-02].
 *               - Bảo toàn nguyên vẹn 3 chế độ URL (?mode=mặc định, add-clan, revision)
 *                 và kiểm tra chủ động checkEligibility.
 * =============================================================================
 * CHANGELOGS:
 * - 2026-11-10T11:40:00+07:00 (v1.1.0-CLAIM-MEMBER-WIZARD-AMEND-FULL): Bản gốc.
 * - 2026-11-13T10:00:00+07:00 (v2.0.0-MULTIHOME-AMEND02-V15-LAT3): Tích hợp C1 Multi-Home.
 * - 2026-11-14T11:15:00+07:00 (v2.3.0-MULTIHOME-UAT-BUG4-PROACTIVE-GUARD): Proactive Guard.
 * - 2026-11-20T06:30:00+07:00 (v2.4.0-PHASE2-SPRINT-FE2): Triển khai Sprint FE-2 ISO 29148.
 * =============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search,
  Loader2,
  Landmark,
  CheckCircle2,
  ArrowLeft,
  AlertCircle,
  PlusCircle,
  ArrowRightLeft,
  ExternalLink,
} from 'lucide-react';

import { useAuth } from '../../../context/AuthContext';
import apiClient from '../../../lib/apiClient';
import { membershipApi } from '../api/membershipApi';
import ClaimMemberWizard, {
  resolveVerificationPrompts,
} from '../components/ClaimMemberWizard';
import RegistrationProfileForm from '../components/RegistrationProfileForm';
import {
  LINK_TYPE_LABELS,
  ELDER_MEMBERSHIP_MESSAGES,
} from '../constants/membershipLabels';
import { CLAIM_MODES } from '../../onboarding/constants/onboardingPhase2Contracts';
import { getPhase2UserMessage } from '../../onboarding/constants/phase2MessageCatalog';
import PersistentMessageBanner from '../../../components/common/PersistentMessageBanner';
import BlockingLoadingOverlay from '../../../components/common/BlockingLoadingOverlay';
import CollapsibleDetailCard from '../../../components/common/CollapsibleDetailCard.jsx';
import RulesAgreementCard from '../../onboarding/components/RulesAgreementCard.jsx';
import AudioHelpButton from '../../elder-doctrine/components/AudioHelpButton';
import ZoneVoiceButton from '../../elder-doctrine/components/ZoneVoiceButton';
import { extractApiErrorInfo } from '../../../shared/hooks/useTurnstileFailClosed';
import { validatePhoneWithCountry } from '../../../shared/utils/validationRules';

const C1_LINK_TYPES = [
  'SPOUSE_FAMILY',
  'MATERNAL',
  'PRIMARY_PATERNAL',
  'DESCENDANT_FAMILY',
  'GUARDIAN',
  'OTHER',
];

export const ClaimMemberPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    user,
    activeContext,
    availableClans,
    refreshContext,
    switchContext,
    isSwitchingContext,
  } = useAuth();

  const caseId = searchParams.get('caseId');
  const modeParam = searchParams.get('mode') || '';
  const isAddClanMode = modeParam === 'add-clan';
  const isRevisionMode = modeParam === 'revision' && Boolean(caseId);

  const currentSessionTenantId =
    activeContext?.activeTenantId ||
    user?.activeTenantId ||
    user?.tenantId ||
    user?.tenant_id ||
    '';
  const currentSessionClan = (availableClans || []).find(
    (c) => c.tenantId === currentSessionTenantId
  );
  const currentSessionTenantName =
    currentSessionClan?.clanName ||
    user?.clanName ||
    user?.tenant?.name ||
    'Dòng họ hiện tại';
  const currentSessionTenantSlug =
    currentSessionClan?.clanSlug || user?.tenant?.slug || '';

  const [tenantQuery, setTenantQuery] = useState('');
  const [tenantResults, setTenantResults] = useState([]);
  const [tenantLoading, setTenantLoading] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState(() => {
    if (!isAddClanMode && !isRevisionMode && currentSessionTenantId) {
      return {
        id: currentSessionTenantId,
        name: currentSessionTenantName,
        slug: currentSessionTenantSlug,
      };
    }
    return null;
  });
  const [linkType, setLinkType] = useState(
    isAddClanMode ? 'SPOUSE_FAMILY' : 'PRIMARY_PATERNAL'
  );
  const searchTimerRef = useRef(null);

  useEffect(() => {
    if (isRevisionMode) return;
    if (isAddClanMode) {
      setSelectedTenant(null);
      setTenantQuery('');
      setTenantResults([]);
      setLinkType('SPOUSE_FAMILY');
      return;
    }
    if (currentSessionTenantId) {
      setSelectedTenant({
        id: currentSessionTenantId,
        name: currentSessionTenantName,
        slug: currentSessionTenantSlug,
      });
      setLinkType('PRIMARY_PATERNAL');
    }
  }, [
    isAddClanMode,
    isRevisionMode,
    currentSessionTenantId,
    currentSessionTenantName,
    currentSessionTenantSlug,
  ]);

  // Bước 2: Phân nhánh 'CLAIM_EM' vs 'NEW_PROFILE_21'
  const [entryMode, setEntryMode] = useState('CLAIM_EM');
  const [profileDraft, setProfileDraft] = useState({
    full_name: user?.name || '',
    alias: '',
    gender: 'NAM',
    birth_day: '',
    birth_month: '',
    birth_year: '',
    birth_place: '',
    is_alive: true,
    death_year: '',
    generation: '',
    member_role: 'THANH_VIEN',
    branch_name: '',
    father_name: '',
    mother_name: '',
    grandfather_name: '',
    grandmother_name: '',
    address: '',
    note: '',
    temp_relationship: 'CON_DE',
    social_profiles: { zalo: '', facebook: '' },
    proof_documents: [],
    claimed_member_id: '',
    claimed_member_summary: null,
    claim_verification: {
      layer1_lineage: '',
      layer2_branch_origin: '',
      layer3_guarantor_note: '',
    },
  });

  const [rulesAgreement, setRulesAgreement] = useState({
    agreed: false,
    agreed_rules_snapshot: '',
    agreed_tos_version: '1.0',
    agreed_clan_rules_version: 1,
  });
  const [rulesError, setRulesError] = useState('');
  const [profileErrors, setProfileErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingRevision, setLoadingRevision] = useState(false);
  const [checkingEligibility, setCheckingEligibility] = useState(false);
  const [eligibilityBlock, setEligibilityBlock] = useState(null);
  const [revisionFeedback, setRevisionFeedback] = useState('');

  // Trạng thái phòng vệ Phase 2 (Sprint FE-2)
  const [bannerState, setBannerState] = useState(null);
  const [isQaLocked, setIsQaLocked] = useState(false);
  const [qaFailedAttempts, setQaFailedAttempts] = useState(0);
  const [isClaimHoppingBlocked, setIsClaimHoppingBlocked] = useState(false);
  const [referralHistory, setReferralHistory] = useState([]);
  const [cooldownReferrerIds, setCooldownReferrerIds] = useState([]);

  const existingClanByTenantId = React.useMemo(() => {
    const map = new Map();
    for (const c of availableClans || []) {
      if (c?.tenantId) {
        map.set(c.tenantId, c);
      }
    }
    return map;
  }, [availableClans]);

  // Kiểm tra chủ động (proactive) ngay khi selectedTenant thay đổi
  useEffect(() => {
    if (isRevisionMode || !selectedTenant?.id) {
      setEligibilityBlock(null);
      return;
    }

    const localClan = existingClanByTenantId.get(selectedTenant.id);
    if (localClan && ['DA_DUYET', 'CHO_DUYET', 'DRAFT'].includes(localClan.status)) {
      const memberDisplay = localClan.memberName
        ? ` (hồ sơ: ${localClan.memberName})`
        : '';
      const isApproved = localClan.status === 'DA_DUYET';
      setEligibilityBlock({
        reasonCode: isApproved
          ? 'ALREADY_LINKED_TO_TENANT'
          : 'DUPLICATE_PENDING_CASE',
        linkStatus: localClan.status,
        memberId: localClan.memberId || null,
        memberName: localClan.memberName || null,
        caseId: localClan.caseId || null,
        tenantId: selectedTenant.id,
        clanName: selectedTenant.name,
        message: isApproved
          ? `Tài khoản của bác đã là thành viên của dòng họ ${selectedTenant.name}${memberDisplay}. Mỗi tài khoản chỉ được gắn với một thành viên trong một dòng họ.`
          : `Tài khoản của bác đã có hồ sơ xin gia nhập dòng họ ${selectedTenant.name}${memberDisplay} đang chờ xử lý.`,
      });
    } else {
      setEligibilityBlock(null);
    }

    let cancelled = false;
    setCheckingEligibility(true);
    membershipApi
      .checkEligibility(selectedTenant.id)
      .then((res) => {
        if (cancelled || !res) return;
        if (res.eligible === false) {
          setEligibilityBlock(res);
        } else {
          setEligibilityBlock(null);
        }
      })
      .catch(() => {
        // Giữ nguyên kết quả kiểm tra cục bộ nếu API tạm gián đoạn; BE vẫn chặn lúc submit
      })
      .finally(() => {
        if (!cancelled) setCheckingEligibility(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedTenant?.id, selectedTenant?.name, isRevisionMode, existingClanByTenantId]);

  // Nạp dữ liệu hồ sơ cũ khi ở chế độ Revision (?caseId=...&mode=revision)
  useEffect(() => {
    if (!isRevisionMode || !caseId) return;

    let cancelled = false;
    setLoadingRevision(true);
    membershipApi
      .getMembershipStatus({ caseId })
      .then((data) => {
        if (cancelled || !data) return;
        const feedback = data.reviewNote || data.revisionRequest || '';
        if (feedback) {
          setRevisionFeedback(feedback);
        }
        if (data.tenantId) {
          setSelectedTenant({
            id: data.tenantId,
            name: data.tenantName || 'Dòng họ',
            slug: data.tenantSlug || '',
          });
        }
        if (data.linkType) {
          setLinkType(data.linkType);
        }

        // Đồng bộ trạng thái khóa QA & lịch sử từ chối bảo lãnh 7 ngày từ metadata [FUNC-03, FUNC-09]
        const meta = data.caseMetadata || data.metadata || {};
        if (data.qaLocked === true || data.qa_locked === true || meta.qa_locked === true) {
          setIsQaLocked(true);
          setQaFailedAttempts(Number(data.qaFailedAttempts || data.qa_failed_attempts || 3));
        }
        if (Array.isArray(meta.referral_history)) {
          setReferralHistory(meta.referral_history);
        }

        const rp =
          data.registration_profile &&
          typeof data.registration_profile === 'object'
            ? data.registration_profile
            : meta.registration_profile || {};

        if (rp.claim_mode === 'CLAIM_EM' || rp.claimed_member_id) {
          setEntryMode('CLAIM_EM');
        } else {
          setEntryMode('NEW_PROFILE_21');
        }

        setProfileDraft((prev) => ({
          ...prev,
          ...rp,
          metadata: meta,
          temp_relationship:
            rp.child_type || rp.temp_relationship || prev.temp_relationship,
          claimed_member_summary:
            rp.claim_verification?.claimed_member_summary ||
            rp.claimed_member_summary ||
            prev.claimed_member_summary,
        }));
      })
      .catch((err) => {
        console.error('[ClaimMemberPage] Load revision error:', err);
        if (!cancelled) {
          const info = extractApiErrorInfo(err);
          setBannerState({
            type: 'error',
            title: 'Không tải được hồ sơ cần chỉnh sửa',
            message: info.message,
            correlationId: info.correlationId,
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingRevision(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isRevisionMode, caseId]);

  // Chỉ tìm kiếm dòng họ khác khi mode=add-clan và chưa chọn dòng họ đích
  useEffect(() => {
    if (!isAddClanMode || isRevisionMode || selectedTenant) return;
    const q = String(tenantQuery || '').trim();
    if (q.length < 2) {
      setTenantResults([]);
      return;
    }

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      setTenantLoading(true);
      try {
        const res = await apiClient.get('/public/tenants/search', {
          params: { q },
          headers: { Authorization: '' },
        });
        const rawList = Array.isArray(res.data?.data) ? res.data.data : [];
        setTenantResults(
          rawList
            .filter((t) => Boolean(t?.id))
            .map((t) => ({
              ...t,
              existingLink: existingClanByTenantId.get(t.id) || null,
            }))
        );
      } catch (_) {
        setTenantResults([]);
      } finally {
        setTenantLoading(false);
      }
    }, 400);

    return () => clearTimeout(searchTimerRef.current);
  }, [tenantQuery, isAddClanMode, isRevisionMode, selectedTenant, existingClanByTenantId]);

  const showValidationBanner = (message) => {
    setBannerState({
      type: 'error',
      title: 'Thông tin hồ sơ chưa đầy đủ',
      message,
    });
  };

  const validateAndBuildPayload = () => {
    setProfileErrors({});

    if (!selectedTenant?.id) {
      showValidationBanner('Bác vui lòng tìm và chọn dòng họ cần gia nhập trước.');
      return null;
    }

    if (!isRevisionMode && eligibilityBlock) {
      showValidationBanner(eligibilityBlock.message);
      return null;
    }

    // [UAT-IMP4 Mục 6b] Bắt buộc (*) Họ & tên + Số điện thoại người giới thiệu trong họ
    const rawRefName = String(profileDraft.referrer_name || '').trim();
    const rawRefPhone = String(profileDraft.referrer_phone || '').trim();
    const refCountry = profileDraft.referrer_phone_country || 'VN';

    if (!rawRefName) {
      const msg = 'Bác vui lòng nhập họ và tên người giới thiệu trong họ.';
      setProfileErrors({ referrer_name: msg });
      showValidationBanner(msg);
      return null;
    }
    if (!rawRefPhone) {
      const msg = 'Bác vui lòng nhập số điện thoại của người giới thiệu trong họ.';
      setProfileErrors({ referrer_phone: msg });
      showValidationBanner(msg);
      return null;
    }
    const refPhoneCheck = validatePhoneWithCountry(rawRefPhone, refCountry);
    if (!refPhoneCheck.valid) {
      const msg =
        refPhoneCheck.message ||
        'Số điện thoại người giới thiệu chưa đúng định dạng.';
      setProfileErrors({ referrer_phone: msg });
      showValidationBanner(msg);
      return null;
    }
    const normalizedRefPhone = refPhoneCheck.normalized;

    if (entryMode === 'CLAIM_EM') {
      if (isClaimHoppingBlocked) {
        showValidationBanner(
          'Chức năng nhận diện thành viên có sẵn đang tạm khóa do từ chối nhiều lần trong 90 ngày. Bác vui lòng chuyển sang "Cách 2 (Khai báo mới)".'
        );
        return null;
      }

      if (isQaLocked) {
        showValidationBanner(
          'Hồ sơ đã tạm khóa tự động xác thực do trả lời chưa khớp 3 lần liên tiếp và đang chờ Ban Quản trị xem xét thủ công.'
        );
        return null;
      }

      const emId = String(profileDraft.claimed_member_id || '').trim();
      const emSum = profileDraft.claimed_member_summary || {};
      const ver = profileDraft.claim_verification || {};
      const l1 = String(ver.layer1_lineage || '').trim();
      const l2 = String(ver.layer2_branch_origin || '').trim();
      const l3 = String(ver.layer3_guarantor_note || '').trim();
      const activePrompts = resolveVerificationPrompts({
        linkType,
        childType: emSum.child_type || '',
      });

      if (!emId) {
        const msg = 'Bác vui lòng tìm và chọn hồ sơ của mình trên cây gia phả.';
        setProfileErrors({ claimed_member_id: msg });
        showValidationBanner(msg);
        return null;
      }
      if (!l1) {
        const msg = activePrompts.layer1MissingError;
        setProfileErrors({ layer1_lineage: msg });
        showValidationBanner(msg);
        return null;
      }
      if (!l2) {
        const msg = activePrompts.layer2MissingError;
        setProfileErrors({ layer2_branch_origin: msg });
        showValidationBanner(msg);
        return null;
      }
      if (!l3) {
        const msg = activePrompts.layer3MissingError;
        setProfileErrors({ layer3_guarantor_note: msg });
        showValidationBanner(msg);
        return null;
      }
      if (!rulesAgreement.agreed) {
        const msg =
          'Bác vui lòng đọc và tích cam kết tuân thủ Nội quy chung và Nội quy dòng họ trước khi gửi hồ sơ.';
        setRulesError(msg);
        showValidationBanner(msg);
        return null;
      }

      const isSpouseContext = activePrompts.contextKind === 'SPOUSE_FAMILY';

      return {
        tenantId: selectedTenant.id,
        clanName: selectedTenant.name,
        link_type: linkType,
        claim_mode: CLAIM_MODES.CLAIM_EXISTING,
        claimed_member_id: emId,
        referrer_name: rawRefName,
        referrer_phone: normalizedRefPhone,
        agreed_rules: true,
        agreed_rules_snapshot: rulesAgreement.agreed_rules_snapshot || undefined,
        agreed_tos_version: rulesAgreement.agreed_tos_version || '1.0',
        agreed_clan_rules_version: Number(rulesAgreement.agreed_clan_rules_version || 1),
        registration_profile: {
          claim_mode: 'CLAIM_EM',
          referrer_name: rawRefName,
          referrer_phone: normalizedRefPhone,
          agreed_rules: true,
          agreed_rules_snapshot: rulesAgreement.agreed_rules_snapshot || undefined,
          agreed_tos_version: rulesAgreement.agreed_tos_version || '1.0',
          agreed_clan_rules_version: Number(rulesAgreement.agreed_clan_rules_version || 1),
          referrer_info: {
            full_name: rawRefName,
            phone: normalizedRefPhone,
          },
          claimed_member_id: emId,
          full_name: emSum.full_name || profileDraft.full_name || user?.name,
          alias: emSum.alias || undefined,
          gender: profileDraft.gender || 'NAM',
          birth_year: emSum.birth_year ? Number(emSum.birth_year) : undefined,
          branch_name: emSum.branch_name || l2,
          father_name: isSpouseContext
            ? emSum.father_name || undefined
            : emSum.father_name || l1,
          mother_name: emSum.mother_name || undefined,
          generation:
            emSum.generation != null ? Number(emSum.generation) : undefined,
          note: l3,
          claim_verification: {
            claimed_member_summary: emSum,
            verification_context: activePrompts.contextKind,
            layer1_lineage: l1,
            layer2_branch_origin: l2,
            layer3_guarantor_note: l3,
          },
        },
      };
    }

    // Nhánh 2: Khai báo mới 21 trường (CREATE_NEW)
    const fName = String(profileDraft.full_name || '').trim();
    const faName = String(profileDraft.father_name || '').trim();
    const noteText = String(profileDraft.note || '').trim();

    if (!fName) {
      const msg = 'Bác vui lòng nhập họ và tên khai sinh.';
      setProfileErrors({ full_name: msg });
      showValidationBanner(msg);
      return null;
    }
    if (!faName) {
      const msg = 'Bác vui lòng nhập họ và tên Cha để Ban Quản trị đối chiếu.';
      setProfileErrors({ father_name: msg });
      showValidationBanner(msg);
      return null;
    }
    if (!noteText) {
      const msg = 'Bác vui lòng nhập lời nhắn gửi Ban Quản trị xác minh.';
      setProfileErrors({ note: msg });
      showValidationBanner(msg);
      return null;
    }
    if (!rulesAgreement.agreed) {
      const msg =
        'Bác vui lòng đọc và tích cam kết tuân thủ Nội quy chung và Nội quy dòng họ trước khi gửi hồ sơ.';
      setRulesError(msg);
      showValidationBanner(msg);
      return null;
    }

    return {
      tenantId: selectedTenant.id,
      clanName: selectedTenant.name,
      link_type: linkType,
      claim_mode: CLAIM_MODES.CREATE_NEW,
      referrer_name: rawRefName,
      referrer_phone: normalizedRefPhone,
      agreed_rules: true,
      agreed_rules_snapshot: rulesAgreement.agreed_rules_snapshot || undefined,
      agreed_tos_version: rulesAgreement.agreed_tos_version || '1.0',
      agreed_clan_rules_version: Number(rulesAgreement.agreed_clan_rules_version || 1),
      registration_profile: {
        claim_mode: 'NEW_PROFILE_21',
        referrer_name: rawRefName,
        referrer_phone: normalizedRefPhone,
        agreed_rules: true,
        agreed_rules_snapshot: rulesAgreement.agreed_rules_snapshot || undefined,
        agreed_tos_version: rulesAgreement.agreed_tos_version || '1.0',
        agreed_clan_rules_version: Number(rulesAgreement.agreed_clan_rules_version || 1),
        referrer_info: {
          full_name: rawRefName,
          phone: normalizedRefPhone,
        },
        child_type: String(profileDraft.temp_relationship || 'CON_DE').trim(),
        temp_relationship: String(profileDraft.temp_relationship || 'CON_DE').trim(),
        full_name: fName,
        alias: String(profileDraft.alias || '').trim() || undefined,
        gender: profileDraft.gender || 'NAM',
        birth_day:
          profileDraft.birth_day !== '' && profileDraft.birth_day != null
            ? Number(profileDraft.birth_day)
            : undefined,
        birth_month:
          profileDraft.birth_month !== '' && profileDraft.birth_month != null
            ? Number(profileDraft.birth_month)
            : undefined,
        birth_year:
          profileDraft.birth_year !== '' && profileDraft.birth_year != null
            ? Number(profileDraft.birth_year)
            : undefined,
        birth_place: String(profileDraft.birth_place || '').trim() || undefined,
        is_alive: profileDraft.is_alive !== false,
        death_year:
          profileDraft.is_alive === false &&
          profileDraft.death_year !== '' &&
          profileDraft.death_year != null
            ? Number(profileDraft.death_year)
            : undefined,
        generation:
          profileDraft.generation !== '' && profileDraft.generation != null
            ? Number(profileDraft.generation)
            : undefined,
        member_role: profileDraft.member_role || 'THANH_VIEN',
        branch_name: String(profileDraft.branch_name || '').trim() || undefined,
        father_name: faName,
        mother_name: String(profileDraft.mother_name || '').trim() || undefined,
        grandfather_name:
          String(profileDraft.grandfather_name || '').trim() || undefined,
        grandmother_name:
          String(profileDraft.grandmother_name || '').trim() || undefined,
        address: String(profileDraft.address || '').trim() || undefined,
        note: noteText,
        proof_documents: Array.isArray(profileDraft.proof_documents)
          ? profileDraft.proof_documents
          : [],
        social_profiles:
          profileDraft.social_profiles &&
          typeof profileDraft.social_profiles === 'object'
            ? profileDraft.social_profiles
            : {},
      },
    };
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    const payload = validateAndBuildPayload();
    if (!payload) return;

    try {
      setIsSubmitting(true);
      let res;
      if (isRevisionMode && caseId) {
        res = await membershipApi.submitRevision(caseId, payload);
      } else {
        res = await membershipApi.submitClaim(payload);
        if ('speechSynthesis' in window) {
          const utterance = new SpeechSynthesisUtterance(
            ELDER_MEMBERSHIP_MESSAGES.CLAIM_SUBMITTED
          );
          utterance.lang = 'vi-VN';
          window.speechSynthesis.speak(utterance);
        }
      }

      if (typeof refreshContext === 'function') {
        await refreshContext();
      }

      const targetCaseId = res?.data?.caseId || res?.caseId || caseId || '';
      const correlationId =
        res?._correlationId || res?.data?.correlationId || 'Không có';

      setBannerState({
        type: 'success',
        title: isRevisionMode
          ? 'Đã gửi hồ sơ bổ sung thành công'
          : 'Đã gửi hồ sơ xin gia nhập dòng họ',
        message:
          'Hồ sơ của bác đã được ghi nhận an toàn. Hệ thống đang chuyển tới trang theo dõi trạng thái hồ sơ.',
        correlationId,
      });

      navigate(
        targetCaseId
          ? `/membership/status?caseId=${encodeURIComponent(targetCaseId)}`
          : `/membership/status?tenantId=${encodeURIComponent(selectedTenant.id)}`
      );
    } catch (err) {
      console.error('[ClaimMemberPage] Submit error:', err);
      const info = extractApiErrorInfo(err);

      // 1. [FUNC-03, TC-FE-03] 423 ONBOARDING_QA_LOCKED: tắt form QA, hiện huy hiệu
      if (info.status === 423 || info.code === 'ONBOARDING_QA_LOCKED') {
        const msgObj = getPhase2UserMessage('ONBOARDING_QA_LOCKED', {
          message: info.message,
        });
        setIsQaLocked(true);
        setQaFailedAttempts(3);
        setBannerState({
          type: msgObj.type,
          title: msgObj.title,
          message: msgObj.message,
        });
        return;
      }

      // Cập nhật số lần thử QA nếu Backend trả về
      if (typeof info.details?.qa_failed_attempts === 'number') {
        setQaFailedAttempts(info.details.qa_failed_attempts);
      }

      // 2. [FUNC-09, TC-FE-09] 400 REFERRER_COOLDOWN_ACTIVE: khóa người bảo lãnh 7 ngày
      if (info.status === 400 && info.code === 'REFERRER_COOLDOWN_ACTIVE') {
        if (profileDraft.referrer_member_id) {
          setCooldownReferrerIds((prev) => [
            ...new Set([...prev, String(profileDraft.referrer_member_id)]),
          ]);
          setProfileDraft((prev) => ({ ...prev, referrer_member_id: '' }));
        }
        setBannerState({
          type: 'warning',
          title: 'Người bảo lãnh đang trong thời gian chờ 7 ngày',
          message: info.message,
          correlationId: info.correlationId,
        });
        return;
      }

      // 3. [NFR-03, TC-FE-13] 403 CLAIM_HOPPING_DETECTED: khóa CLAIM_EM, gợi ý CREATE_NEW
      if (info.status === 403 && info.code === 'CLAIM_HOPPING_DETECTED') {
        const msgObj = getPhase2UserMessage('CLAIM_HOPPING_DETECTED', {
          message: info.message,
        });
        setIsClaimHoppingBlocked(true);
        setBannerState({
          type: msgObj.type,
          title: msgObj.title,
          message: msgObj.message,
          actionButton: (
            <button
              type="button"
              onClick={() => {
                setEntryMode('NEW_PROFILE_21');
                setProfileErrors({});
                setBannerState(null);
              }}
              className="min-h-[48px] h-12 rounded-xl bg-indigo-600 px-5 text-base font-bold text-white hover:bg-indigo-700 whitespace-nowrap"
            >
              Chuyển sang Khai báo hồ sơ mới
            </button>
          ),
        });
        return;
      }

      // 4. [FUNC-06, TC-FE-06] 409 ALREADY_LINKED_TO_TENANT: chuyển thẳng vào không gian dòng họ
      if (info.status === 409 && info.code === 'ALREADY_LINKED_TO_TENANT') {
        setBannerState({
          type: 'warning',
          title: 'Tài khoản đã liên kết với dòng họ này',
          message: info.message,
          correlationId: info.correlationId,
          actionButton: (
            <button
              type="button"
              disabled={isSwitchingContext}
              onClick={() => switchContext(selectedTenant.id, '/op')}
              className="min-h-[48px] inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-base font-bold text-white hover:bg-emerald-700"
            >
              <ArrowRightLeft size={16} />
              Vào không gian {selectedTenant.name}
            </button>
          ),
        });
        return;
      }

      // 5. [ARCH-01, ARCH-04, TC-FE-14] 409 CONCURRENT_TRANSACTION_LOCKED / 429:
      // Giữ nguyên toàn bộ form state, hiện nút "Thử lại ngay"
      setBannerState({
        type: info.status === 409 || info.status === 429 ? 'warning' : 'error',
        title:
          info.status === 409
            ? 'Hồ sơ đang được xử lý ở phiên khác'
            : 'Không thể gửi hồ sơ gia nhập',
        message: info.message,
        correlationId: info.correlationId,
        actionButton:
          info.status === 409 || info.status === 429 ? (
            <button
              type="button"
              onClick={() => handleSubmit()}
              className="min-h-[48px] rounded-xl bg-amber-600 px-4 py-2.5 text-base font-bold text-white hover:bg-amber-700"
            >
              Thử lại ngay
            </button>
          ) : null,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto my-6 max-w-3xl px-3 sm:px-4 pb-16">
      {/* Vòng quay chặn màn hình hợp nhất duy nhất [ARCH-04] */}
      <BlockingLoadingOverlay
        isOpen={isSubmitting || loadingRevision}
        message={
          loadingRevision
            ? 'Đang tải thông tin hồ sơ cần bổ sung...'
            : 'Đang gửi hồ sơ xin gia nhập dòng họ...'
        }
      />

      <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-8 shadow-xl">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <span className="text-sm font-bold uppercase tracking-wider text-emerald-700">
              {isRevisionMode
                ? 'Bổ sung hồ sơ gia nhập'
                : isAddClanMode
                  ? 'Gia nhập thêm dòng họ'
                  : 'Xác nhận hồ sơ thành viên'}
            </span>
            <h1 className="mt-1 text-2xl font-black text-slate-900">
              {isRevisionMode
                ? 'Chỉnh sửa hồ sơ theo góp ý'
                : isAddClanMode
                  ? 'Gia nhập dòng họ khác'
                  : 'Nhận hồ sơ trên sổ họ'}
            </h1>
            <p className="mt-1 text-base font-medium text-slate-600">
              Tài khoản <strong>{user?.phone || user?.email}</strong> được giữ
              nguyên thông tin định danh hiện tại.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <AudioHelpButton
              text="Trang gia nhập dòng họ và nhận diện nhân thân. Bác chọn dòng họ đích, chọn hình thức nhận hồ sơ đã có trên cây hoặc khai báo hồ sơ mới, sau đó bấm nút gửi hồ sơ."
              label="Nghe hướng dẫn"
              variant="soft"
            />
            <button
              type="button"
              onClick={() => navigate('/op')}
              className="min-h-[48px] h-12 inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 text-base font-bold text-slate-700 whitespace-nowrap hover:bg-slate-50"
            >
              <ArrowLeft size={18} />
              <span>Quay lại</span>
            </button>
          </div>
        </div>

        {/* Banner thông báo nghiệp vụ hợp nhất duy nhất (hiển thị X-Correlation-Id) [ARCH-02] */}
        {bannerState && (
          <PersistentMessageBanner
            type={bannerState.type}
            mode="fullscreen"
            autoSpeak
            title={bannerState.title}
            message={bannerState.message}
            actionButton={bannerState.actionButton}
            onClose={() => setBannerState(null)}
          />
        )}

        {revisionFeedback && (
          <div className="mb-6 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-amber-950">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-black uppercase tracking-wider text-amber-800">
                Góp ý từ Ban Quản trị dòng họ:
              </p>
              <AudioHelpButton
                text={`Góp ý từ Ban Quản trị: ${revisionFeedback}`}
                label="Nghe góp ý"
                variant="soft"
              />
            </div>
            <p className="mt-1 whitespace-pre-wrap text-base font-bold">
              {revisionFeedback}
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          {/* BƯỚC 1: THÔNG TIN DÒNG HỌ (CollapsibleDetailCard chuẩn 2 dòng / 3 cột) */}
          <CollapsibleDetailCard
            title={
              selectedTenant
                ? `Bước 1: Dòng họ gia nhập (${selectedTenant.name})`
                : isAddClanMode
                  ? 'Bước 1: Chọn dòng họ khác muốn gia nhập'
                  : 'Bước 1: Dòng họ đang thực hiện nhận hồ sơ'
            }
            statusLabel={selectedTenant?.id ? 'Đã chọn' : 'Chưa chọn'}
            statusVariant={selectedTenant?.id ? 'complete' : 'pending'}
            voiceText="Bước 1: Chọn dòng họ đích và mối quan hệ của bác với dòng họ này."
            defaultExpanded={true}
            disabled={isSubmitting}
          >
            <div className="space-y-4">
              {!isAddClanMode && !isRevisionMode && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => navigate('/membership/claim?mode=add-clan')}
                    className="min-h-[48px] inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 text-base font-bold text-emerald-800 hover:bg-emerald-100"
                  >
                    <PlusCircle size={18} />
                    <span>Gia nhập dòng họ khác?</span>
                  </button>
                </div>
              )}

            {isAddClanMode && !selectedTenant ? (
              <div className="space-y-3">
                <div className="relative">
                  <Search
                    size={18}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="text"
                    value={tenantQuery}
                    onChange={(e) => {
                      setTenantQuery(e.target.value);
                    }}
                    placeholder="Gõ tên dòng họ cần gia nhập (tối thiểu 2 ký tự)..."
                    className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white py-3 pl-11 pr-10 text-base text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  />
                  {tenantLoading && (
                    <Loader2
                      size={18}
                      className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-emerald-600"
                    />
                  )}
                </div>

                {tenantResults.length > 0 && (
                  <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
                    {tenantResults.map((t) => {
                      const linkInfo = t.existingLink;
                      const isAlreadyMember = linkInfo?.status === 'DA_DUYET';
                      const isPending =
                        linkInfo?.status === 'CHO_DUYET' ||
                        linkInfo?.status === 'DRAFT';

                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setSelectedTenant(t);
                            setBannerState(null);
                          }}
                          className={`min-h-[48px] flex w-full items-center justify-between rounded-2xl border p-3.5 text-left shadow-sm transition ${
                            isAlreadyMember
                              ? 'border-amber-200 bg-amber-50/60 hover:border-amber-300'
                              : isPending
                                ? 'border-blue-200 bg-blue-50/60 hover:border-blue-300'
                                : 'border-slate-200 bg-white hover:border-emerald-400 hover:bg-emerald-50'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                                isAlreadyMember
                                  ? 'bg-amber-100 text-amber-700'
                                  : isPending
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'bg-emerald-50 text-emerald-600'
                              }`}
                            >
                              <Landmark size={20} />
                            </div>
                            <div>
                              <p className="text-base font-black text-slate-900">
                                {t.name}
                              </p>

                              {isAlreadyMember && (
                                <p className="mt-0.5 text-sm font-bold text-amber-800">
                                  Đã gắn hồ sơ:{' '}
                                  {linkInfo.memberName || 'Thành viên chính thức'}
                                </p>
                              )}
                            </div>
                          </div>
                          <span
                            className={`rounded-xl px-3 py-1.5 text-sm font-black ${
                              isAlreadyMember
                                ? 'bg-amber-100 text-amber-900'
                                : isPending
                                  ? 'bg-blue-100 text-blue-900'
                                  : 'bg-emerald-600 text-white'
                            }`}
                          >
                            {isAlreadyMember
                              ? 'Đã là thành viên'
                              : isPending
                                ? 'Đang chờ duyệt'
                                : 'Chọn họ này'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : selectedTenant ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-emerald-700">
                    {isAddClanMode ? 'Dòng họ xin gia nhập' : 'Dòng họ hiện tại'}
                  </p>
                  <p className="text-lg font-black text-slate-900">
                    {selectedTenant.name}
                  </p>
                </div>
                {isAddClanMode && !isRevisionMode && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTenant(null);
                      setProfileDraft((prev) => ({
                        ...prev,
                        claimed_member_id: '',
                        claimed_member_summary: null,
                      }));
                    }}
                    className="min-h-[48px] rounded-xl border border-emerald-300 bg-white px-4 py-2 text-base font-black text-emerald-800 hover:bg-emerald-100"
                  >
                    Đổi dòng họ
                  </button>
                )}
              </div>
            ) : null}

            {/* Chọn mối quan hệ liên kết với dòng họ đích */}
            <div>
              <label className="mb-1.5 block text-base font-normal text-slate-600">
                Quan hệ của bạn với dòng họ này
              </label>
              <select
                value={linkType}
                disabled={isSubmitting}
                onChange={(e) => setLinkType(e.target.value)}
                className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base font-bold text-slate-900 outline-none focus:border-emerald-500"
              >
                {C1_LINK_TYPES.map((code) => {
                  const meta = LINK_TYPE_LABELS[code];
                  return (
                    <option key={code} value={code}>
                      {meta ? `${meta.label} — ${meta.description}` : code}
                    </option>
                  );
                })}
              </select>
            </div>
            </div>
          </CollapsibleDetailCard>

          {checkingEligibility && selectedTenant?.id && (
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base font-bold text-slate-600">
              <Loader2 size={18} className="animate-spin text-emerald-600" />
              <span>Đang kiểm tra điều kiện gia nhập tại {selectedTenant.name}...</span>
            </div>
          )}

          {eligibilityBlock && (
            <div className="space-y-3 rounded-2xl border-2 border-rose-300 bg-rose-50 p-5 text-rose-950">
              <div className="flex items-start gap-3">
                <AlertCircle size={22} className="mt-0.5 shrink-0 text-rose-600" />
                <div className="space-y-1">
                  <p className="text-xs font-black uppercase tracking-wider text-rose-700">
                    Không thể gửi thêm hồ sơ tại dòng họ này
                  </p>
                  <p className="text-base font-bold leading-relaxed">
                    {eligibilityBlock.message}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2.5 pt-1">
                {eligibilityBlock.reasonCode === 'ALREADY_LINKED_TO_TENANT' &&
                  eligibilityBlock.linkStatus === 'DA_DUYET' && (
                    <button
                      type="button"
                      disabled={isSwitchingContext}
                      onClick={() => switchContext(eligibilityBlock.tenantId, '/op')}
                      className="min-h-[48px] inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-base font-black text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <ArrowRightLeft size={16} />
                      {isSwitchingContext
                        ? 'Đang chuyển dòng họ...'
                        : `Chuyển sang ${eligibilityBlock.clanName}`}
                    </button>
                  )}

                {eligibilityBlock.reasonCode === 'DUPLICATE_PENDING_CASE' && (
                  <button
                    type="button"
                    onClick={() =>
                      navigate(
                        eligibilityBlock.caseId
                          ? `/membership/status?caseId=${encodeURIComponent(eligibilityBlock.caseId)}`
                          : `/membership/status?tenantId=${encodeURIComponent(eligibilityBlock.tenantId)}`
                      )
                    }
                    className="min-h-[48px] inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-base font-black text-white shadow-sm hover:bg-blue-700"
                  >
                    <ExternalLink size={16} />
                    Xem trạng thái hồ sơ đang chờ
                  </button>
                )}

                {isAddClanMode && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTenant(null);
                      setEligibilityBlock(null);
                      setBannerState(null);
                    }}
                    className="min-h-[48px] inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-white px-4 py-2.5 text-base font-black text-rose-800 hover:bg-rose-100"
                  >
                    Chọn dòng họ khác
                  </button>
                )}
              </div>
            </div>
          )}

          {/* BƯỚC 2: CHỌN CLAIM EM HOẶC KHAI BÁO 21 TRƯỜNG */}
          {!eligibilityBlock && (
            <CollapsibleDetailCard
              title="Bước 2: Nhận diện nhân thân trong dòng họ"
              statusLabel={
                entryMode === 'CLAIM_EM'
                  ? profileDraft.claimed_member_id
                    ? 'Đã chọn'
                    : 'Chưa hoàn chỉnh'
                  : profileDraft.full_name && profileDraft.father_name
                    ? 'Đã điền'
                    : 'Chưa hoàn chỉnh'
              }
              statusVariant={
                entryMode === 'CLAIM_EM'
                  ? profileDraft.claimed_member_id
                    ? 'complete'
                    : 'pending'
                  : profileDraft.full_name && profileDraft.father_name
                    ? 'complete'
                    : 'pending'
              }
              voiceText="Bước 2: Bác chọn Cách 1 nếu tên của bác đã có trên cây gia phả, hoặc chọn Cách 2 nếu bác chưa có tên trên cây để khai báo hồ sơ mới."
              defaultExpanded={true}
              disabled={isSubmitting}
            >
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <button
                    type="button"
                    disabled={isSubmitting || isClaimHoppingBlocked}
                    onClick={() => {
                      setEntryMode('CLAIM_EM');
                      setProfileErrors({});
                      setBannerState(null);
                    }}
                    className={`min-h-[48px] w-full rounded-2xl border p-4 text-left transition ${
                      isClaimHoppingBlocked
                        ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-500'
                        : entryMode === 'CLAIM_EM'
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-950 shadow-sm'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <p className="text-xs font-black uppercase tracking-wider text-emerald-700">
                      Cách 1 (Khuyên dùng)
                    </p>
                    <p className="mt-1 text-base font-black">
                      Đã có tên trong sổ họ (Nhận hồ sơ)
                    </p>
                    <p className="mt-0.5 text-sm text-slate-600">
                      Tra cứu tên bạn trên cây (bao gồm cả con rể/con dâu) và trả
                      lời 3 lớp gia mật.
                    </p>
                  </button>
                  {isClaimHoppingBlocked && (
                    <p className="mt-1.5 text-base font-semibold text-rose-700">
                      Tạm khóa do từ chối nhiều lần trong 90 ngày.
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => {
                    setEntryMode('NEW_PROFILE_21');
                    setProfileErrors({});
                    setBannerState(null);
                  }}
                  className={`min-h-[48px] rounded-2xl border p-4 text-left transition ${
                    entryMode === 'NEW_PROFILE_21'
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-950 shadow-sm'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <p className="text-xs font-black uppercase tracking-wider text-indigo-700">
                    Cách 2 (Khai báo mới)
                  </p>
                  <p className="mt-1 text-base font-black">
                    Chưa có tên trên cây (Khai báo mới)
                  </p>
                  <p className="mt-0.5 text-sm text-slate-600">
                    Điền đầy đủ thông tin nhân thân để Ban Quản trị đối soát và
                    thêm vào cây.
                  </p>
                </button>
              </div>

              {entryMode === 'CLAIM_EM' ? (
                selectedTenant?.id ? (
                  <ClaimMemberWizard
                    tenantId={selectedTenant.id}
                    tenantName={selectedTenant.name}
                    linkType={linkType}
                    isMultiHome={true}
                    value={profileDraft}
                    disabled={isSubmitting}
                    errors={profileErrors}
                    qaLocked={isQaLocked}
                    qaFailedAttempts={qaFailedAttempts}
                    claimHoppingBlocked={isClaimHoppingBlocked}
                    referralHistory={referralHistory}
                    cooldownReferrerIds={cooldownReferrerIds}
                    onSwitchToCreateNew={() => {
                      setEntryMode('NEW_PROFILE_21');
                      setProfileErrors({});
                      setBannerState(null);
                    }}
                    onMemberSelect={(pickedMember) => {
                      const ct = String(pickedMember?.child_type || '').toUpperCase();
                      if (
                        ct === 'CON_DAU' ||
                        ct === 'CON_RE' ||
                        pickedMember?.is_clan === false
                      ) {
                        setLinkType('SPOUSE_FAMILY');
                      } else if (ct === 'CON_NUOI' || ct === 'CON_DO_DAU') {
                        setLinkType('GUARDIAN');
                      }
                    }}
                    onChange={(nextDraft) => {
                      setProfileDraft(nextDraft);
                      setProfileErrors({});
                      setBannerState(null);
                    }}
                  />
                ) : (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-base font-bold text-amber-800">
                    Bác vui lòng tìm và chọn dòng họ ở Bước 1 trước để tra cứu
                    danh sách thành viên trên cây.
                  </div>
                )
              ) : (
                <RegistrationProfileForm
                  value={profileDraft}
                  disabled={isSubmitting}
                  errors={profileErrors}
                  onChange={(nextDraft) => {
                    setProfileDraft(nextDraft);
                    setProfileErrors({});
                    setBannerState(null);
                  }}
                />
              )}
            </div>
            </CollapsibleDetailCard>
          )}

          {!eligibilityBlock && selectedTenant?.id && (
            <RulesAgreementCard
              mode="MEMBER_JOIN"
              tenantId={selectedTenant.id}
              clanName={selectedTenant.name}
              agreed={rulesAgreement.agreed}
              disabled={isSubmitting}
              error={rulesError}
              title="Bước 3: Cam kết tuân thủ Nội quy chung & Nội quy dòng họ"
              onChange={(nextRules) => {
                setRulesAgreement(nextRules);
                if (nextRules.agreed) {
                  setRulesError('');
                  setBannerState(null);
                }
              }}
            />
          )}

          <div>
            <button
              type="submit"
              disabled={
                isSubmitting ||
                checkingEligibility ||
                Boolean(eligibilityBlock) ||
                !selectedTenant?.id ||
                (entryMode === 'CLAIM_EM' && (isQaLocked || isClaimHoppingBlocked))
              }
              className="min-h-[48px] h-12 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-base font-bold text-white shadow-md whitespace-nowrap transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  <span>Đang gửi hồ sơ...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={20} />
                  <span>
                    {isRevisionMode
                      ? 'Gửi lại hồ sơ bổ sung'
                      : 'Gửi hồ sơ xin gia nhập dòng họ'}
                  </span>
                </>
              )}
            </button>

            {/* Inline helper text >= 16px bên dưới nút disabled (cấm dùng tooltip) */}
            {entryMode === 'CLAIM_EM' && isQaLocked && (
              <p className="mt-2 text-base font-semibold text-amber-900">
                Hồ sơ đang tạm khóa xác thực tự động (3 lần sai) và chờ Ban Quản trị duyệt thủ công.
              </p>
            )}
            {entryMode === 'CLAIM_EM' && isClaimHoppingBlocked && (
              <p className="mt-2 text-base font-semibold text-rose-700">
                Chức năng nhận hồ sơ có sẵn đang tạm khóa. Bác vui lòng chọn &ldquo;Cách 2 (Khai báo mới)&rdquo; ở phía trên.
              </p>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default ClaimMemberPage;
