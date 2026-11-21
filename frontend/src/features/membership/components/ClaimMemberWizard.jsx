/**
 * ============================================================================
 * PATH       : frontend/src/features/membership/components/ClaimMemberWizard.jsx
 * DATETIME   : 2026-11-20T06:25:00+07:00
 * VERSION    : 2.0.0-PHASE2-SPRINT-FE2
 * DESCRIPTION:
 * - [IMPL-PLAN-FE-PHASE2-V1.8-ISO29148 - Sprint FE-2]:
 *   1. Hiển thị nhãn ngoại tộc (Con dâu / Con rể) khi is_clan === false qua
 *      resolveMemberClanRelation() (không lọc is_clan=false ở client) và khóa
 *      chọn sớm nếu is_claimed === true kèm inline helper text >= 16px [ARCH-03, TC-FE-15].
 *   2. Tích hợp useTurnstileFailClosed cho tra cứu công khai (/public/tenants/search
 *      và /public/tenants/:tenantId/members/claim-search) [NFR-02, TC-FE-12].
 *   3. Xử lý khóa QA sau 3 lần sai (HTTP 423 ONBOARDING_QA_LOCKED / qaLocked):
 *      tắt biểu mẫu 3 lớp xác minh, hiện huy hiệu "Khóa QA (3 lần sai) - Chờ Ban Quản trị"
 *      [FUNC-03, TC-FE-03].
 *   4. Lọc & khóa Cooldown người bảo lãnh 7 ngày từ metadata.referral_history
 *      (REFERRER_COOLDOWN_DAYS = 7) hoặc lỗi 400 REFERRER_COOLDOWN_ACTIVE kèm inline
 *      helper text "Đã từ chối bảo lãnh. Thử lại sau 7 ngày" [FUNC-09, TC-FE-09].
 *   5. Xử lý lỗi 403 CLAIM_HOPPING_DETECTED: khóa chọn/gửi CLAIM_EXISTING và cung cấp
 *      nút chuyển sang khai báo hồ sơ mới (CREATE_NEW / NEW_PROFILE_21) [NFR-03, TC-FE-13].
 *   6. Tích hợp AudioHelpButton, ZoneVoiceButton, PersistentMessageBanner,
 *      BlockingLoadingOverlay, nút bấm >= 48px, chữ >= 16px [NFR-FE-02, TC-FE-18].
 * - [AMEND-RP-OP-2026-02 V1.5.0 MF-05] Bảo toàn đầy đủ logic 3 lớp xác minh theo ngữ cảnh
 *   (SPOUSE_FAMILY, MATERNAL, GUARDIAN, PATERNAL) và toàn bộ exports hiện hành.
 * ============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Search,
  Loader2,
  UserCheck,
  ShieldCheck,
  CheckCircle2,
  RotateCcw,
  Users,
  MapPin,
  MessageSquareText,
  AlertCircle,
  Landmark,
  Lock,
  Phone,
} from 'lucide-react';
import apiClient from '../../../lib/apiClient.js';
import { COUNTRY_PHONE_OPTIONS } from '../../../shared/utils/validationRules.js';
import { getPhase2UserMessage } from '../../onboarding/constants/phase2MessageCatalog.js';
import PersistentMessageBanner from '../../../components/common/PersistentMessageBanner.jsx';
import BlockingLoadingOverlay from '../../../components/common/BlockingLoadingOverlay.jsx';
import CollapsibleDetailCard from '../../../components/common/CollapsibleDetailCard.jsx';
import KeyValueDetailTable from '../../../components/common/KeyValueDetailTable.jsx';
import ZoneVoiceButton from '../../elder-doctrine/components/ZoneVoiceButton.jsx';
import useTurnstileFailClosed, {
  isTurnstileChallengeError,
  extractApiErrorInfo,
} from '../../../shared/hooks/useTurnstileFailClosed.js';

const GENDER_OPTIONS = [
  { value: 'NAM', label: 'Nam' },
  { value: 'NU', label: 'Nữ' },
  { value: 'KHAC', label: 'Khác' },
];

const CHILD_TYPE_LABELS = {
  CON_DE: 'Con đẻ',
  CON_DAU: 'Con dâu',
  CON_RE: 'Con rể',
  CON_NUOI: 'Con nuôi',
  CON_DO_DAU: 'Con đỡ đầu',
  CON_RIENG: 'Con riêng',
};



/**
 * Suy diễn tư cách Nội tộc / Ngoại tộc (is_clan) và vai vế (child_type) từ members + marriages.
 * Khắc phục trường hợp schema.prisma đặt @default(CON_DE) cho thành viên ngoại tộc (is_clan = false).
 */
const resolveMemberClanRelation = (member) => {
  if (!member) {
    return { isClan: true, childType: 'CON_DE' };
  }
  const isClan = member.is_clan !== false;
  const hasClanWife = (member.marriages_as_husband || []).some(
    (m) =>
      m.members_marriages_wife_idTomembers &&
      m.members_marriages_wife_idTomembers.is_clan !== false
  );
  const hasClanHusband = (member.marriages_as_wife || []).some(
    (m) =>
      m.members_marriages_husband_idTomembers &&
      m.members_marriages_husband_idTomembers.is_clan !== false
  );
  const isMarriedToClanMember = hasClanWife || hasClanHusband;

  if (!isClan) {
    if (
      member.child_type === 'CON_RE' ||
      member.child_type === 'CON_DAU' ||
      member.child_type === 'KHAC'
    ) {
      return { isClan: false, childType: member.child_type };
    }
    if (isMarriedToClanMember || member.child_type === 'CON_DE' || !member.child_type) {
      const inferred =
        member.gender === 'NAM'
          ? 'CON_RE'
          : member.gender === 'NU'
            ? 'CON_DAU'
            : 'KHAC';
      return { isClan: false, childType: inferred };
    }
    return { isClan: false, childType: member.child_type };
  }

  return {
    isClan: true,
    childType: member.child_type || 'CON_DE',
  };
};

/**
 * Lấy nhãn ngoại tộc hiển thị trực quan khi is_clan === false [ARCH-03, TC-FE-15]
 */
const getNonClanDisplayBadge = (member) => {
  const relation = resolveMemberClanRelation(member);
  if (!relation.isClan) {
    if (relation.childType === 'CON_DAU') return 'Con dâu';
    if (relation.childType === 'CON_RE') return 'Con rể';
    return 'Con rể / Con dâu';
  }
  if (member?.child_type && CHILD_TYPE_LABELS[member.child_type]) {
    return CHILD_TYPE_LABELS[member.child_type];
  }
  return null;
};

/**
 * [UAT-IMP3 Bổ sung 3] Diễn giải đầy đủ thuộc tính members.is_clan cho bảng chi tiết 2 cột.
 */
const resolveClanRelationDetailText = (member) => {
  const relation = resolveMemberClanRelation(member);
  if (!relation.isClan) {
    if (relation.childType === 'CON_DAU') return 'Thành viên ngoại tộc (Con dâu)';
    if (relation.childType === 'CON_RE') return 'Thành viên ngoại tộc (Con rể)';
    return 'Thành viên ngoại tộc (Con rể / Con dâu)';
  }
  return 'Thành viên trong họ (Nội tộc)';
};



const resolveVerificationPrompts = ({ linkType = '', childType = '' } = {}) => {
  const normalizedLink = String(linkType || '').toUpperCase();
  const normalizedChild = String(childType || '').toUpperCase();

  if (
    normalizedLink === 'SPOUSE_FAMILY' ||
    normalizedChild === 'CON_DAU' ||
    normalizedChild === 'CON_RE'
  ) {
    return {
      contextKind: 'SPOUSE_FAMILY',
      step2Label: '2. Xác minh hôn phối',
      sectionTitle:
        'Bước 2: Xác thực 3 lớp quan hệ hôn phối để Ban Quản trị đối chiếu',
      layer1Label: 'Lớp 1 — Vợ/Chồng trong họ & Gia đình bên vợ/chồng',
      layer1Placeholder:
        'Nhập họ tên Vợ/Chồng trong họ, năm kết hôn, và họ tên Bố/Mẹ vợ (hoặc Bố/Mẹ chồng)...',
      layer1MissingError:
        'Bác vui lòng nhập Lớp 1 xác minh (họ tên Vợ/Chồng trong họ và Bố/Mẹ vợ hoặc chồng).',
      layer2Label: 'Lớp 2 — Chi phái bên vợ/chồng & Quê quán / Nơi cư trú',
      layer2Placeholder:
        'Nhập tên Chi/Phái của gia đình bên vợ/chồng, quê quán hoặc nơi gia đình đang sinh sống...',
      layer2MissingError:
        'Bác vui lòng nhập Lớp 2 xác minh (tên Chi/Phái bên vợ/chồng hoặc nơi cư trú).',
      layer3Label: 'Lớp 3 — Người thân trong họ bảo lãnh & Lời nhắn xác minh',
      layer3Placeholder:
        'Ghi tên anh/chị/em bên vợ/chồng hoặc người trong họ có thể xác nhận...',
      layer3MissingError:
        'Bác vui lòng nhập Lớp 3 xác minh (người bảo lãnh bên vợ/chồng hoặc lời nhắn xác minh).',
      step3SummaryLabel: '3 lớp thông tin hôn phối',
    };
  }

  if (normalizedLink === 'MATERNAL') {
    return {
      contextKind: 'MATERNAL',
      step2Label: '2. 3 lớp bên ngoại',
      sectionTitle:
        'Bước 2: Xác thực 3 lớp quan hệ bên ngoại để Ban Quản trị đối chiếu',
      layer1Label: 'Lớp 1 — Quan hệ bên ngoại & Tiền nhân phía Mẹ',
      layer1Placeholder:
        'Nhập họ tên Mẹ đẻ, Ông/Bà ngoại hoặc ngày giỗ tổ bên ngoại...',
      layer1MissingError:
        'Bác vui lòng nhập Lớp 1 xác minh (họ tên Mẹ, Ông/Bà ngoại hoặc ngày giỗ bên ngoại).',
      layer2Label: 'Lớp 2 — Chi phái bên ngoại & Quê quán / Nơi cư trú',
      layer2Placeholder:
        'Nhập tên Chi/Phái bên ngoại, quê quán gốc hoặc nơi gia đình đang sinh sống...',
      layer2MissingError:
        'Bác vui lòng nhập Lớp 2 xác minh (tên Chi/Phái bên ngoại hoặc quê quán).',
      layer3Label: 'Lớp 3 — Người bảo lãnh trong họ & Lời nhắn xác minh',
      layer3Placeholder:
        'Ghi tên người thân bên ngoại có thể xác nhận hoặc lời nhắn gửi Hội đồng gia tộc...',
      layer3MissingError:
        'Bác vui lòng nhập Lớp 3 xác minh (người bảo lãnh trong họ hoặc lời nhắn xác minh).',
      step3SummaryLabel: '3 lớp thông tin bên ngoại',
    };
  }

  if (
    normalizedLink === 'GUARDIAN' ||
    normalizedChild === 'CON_NUOI' ||
    normalizedChild === 'CON_DO_DAU'
  ) {
    return {
      contextKind: 'GUARDIAN',
      step2Label: '2. 3 lớp xác minh',
      sectionTitle:
        'Bước 2: Xác thực 3 lớp quan hệ nuôi dưỡng / giám hộ để Ban Quản trị đối chiếu',
      layer1Label: 'Lớp 1 — Cha/Mẹ nuôi hoặc Người đỡ đầu trong họ',
      layer1Placeholder:
        'Nhập họ tên Cha/Mẹ nuôi, người đỡ đầu hoặc bối cảnh gắn kết với gia đình...',
      layer1MissingError:
        'Bác vui lòng nhập Lớp 1 xác minh (họ tên Cha/Mẹ nuôi hoặc người đỡ đầu).',
      layer2Label: 'Lớp 2 — Chi phái & Quê quán / Nơi cư trú',
      layer2Placeholder:
        'Nhập tên Chi/Phái, quê quán hoặc nơi gia đình đang sinh sống...',
      layer2MissingError:
        'Bác vui lòng nhập Lớp 2 xác minh (tên Chi/Phái hoặc nơi cư trú).',
      layer3Label: 'Lớp 3 — Người bảo lãnh trong họ & Lời nhắn xác minh',
      layer3Placeholder:
        'Ghi tên người thân trong họ có thể xác nhận hoặc lời nhắn gửi Hội đồng gia tộc...',
      layer3MissingError:
        'Bác vui lòng nhập Lớp 3 xác minh (người bảo lãnh trong họ hoặc lời nhắn xác minh).',
      step3SummaryLabel: '3 lớp thông tin xác minh',
    };
  }

  return {
    contextKind: 'PATERNAL',
    step2Label: '2. 3 lớp gia mật',
    sectionTitle: 'Bước 2: Xác thực 3 lớp gia mật để Ban Quản trị đối chiếu',
    layer1Label: 'Lớp 1 — Huyết thống & Tiền nhân trực hệ',
    layer1Placeholder:
      'Nhập họ tên Cha, Mẹ, Ông nội hoặc ngày giỗ tổ của gia đình...',
    layer1MissingError:
      'Bác vui lòng nhập Lớp 1 gia mật (họ tên Cha, Mẹ, Ông nội hoặc ngày giỗ tổ).',
    layer2Label: 'Lớp 2 — Chi phái & Quê quán / Nơi cư trú',
    layer2Placeholder:
      'Nhập tên Chi/Phái, quê quán gốc hoặc nơi gia đình đang sinh sống...',
    layer2MissingError:
      'Bác vui lòng nhập Lớp 2 gia mật (tên Chi/Phái hoặc quê quán).',
    layer3Label: 'Lớp 3 — Người bảo lãnh trong họ & Lời nhắn xác minh',
    layer3Placeholder:
      'Ghi tên người thân trong họ có thể xác nhận hoặc lời nhắn gửi Hội đồng gia tộc...',
    layer3MissingError:
      'Bác vui lòng nhập Lớp 3 gia mật (người bảo lãnh trong họ hoặc lời nhắn xác minh).',
    step3SummaryLabel: '3 lớp gia mật',
  };
};

const ClaimMemberWizard = ({
  tenantId: propTenantId = '',
  tenantName: propTenantName = '',
  linkType = '',
  isMultiHome = false,
  onMemberSelect,
  onTenantSelect,
  value = {},
  onChange,
  onFocusZone,
  disabled = false,
  errors = {},
  // Phase 2 Props (Sprint FE-2)
  qaLocked = false,
  qaFailedAttempts = 0,
  claimHoppingBlocked = false,
  referralHistory = [],
  referrerCandidates = [],
  cooldownReferrerIds = [],
  onSwitchToCreateNew,
  focusRequest = null,
}) => {
  const wizardRootRef = useRef(null);
  const [internalTenant, setInternalTenant] = useState(null);
  const [tenantQuery, setTenantQuery] = useState('');
  const [tenantResults, setTenantResults] = useState([]);
  const [tenantSearching, setTenantSearching] = useState(false);
  const tenantTimerRef = useRef(null);

  const activeTenantId = propTenantId || internalTenant?.id || '';
  const activeTenantName = propTenantName || internalTenant?.name || '';

  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [wizardBanner, setWizardBanner] = useState(null);
  const [rateLimitCountdown, setRateLimitCountdown] = useState(0);
  const searchTimerRef = useRef(null);
  const lastClaimSearchKeywordRef = useRef('');
  const step1CardRef = useRef(null);
  const step2CardRef = useRef(null);
  const step3CardRef = useRef(null);

  const [step1Collapsed, setStep1Collapsed] = useState(false);
  const [step2Collapsed, setStep2Collapsed] = useState(false);
  const [step3Collapsed, setStep3Collapsed] = useState(false);

  // [UAT-Bug 6] Tự động mở đúng Card Bước 1 / Bước 2 và cuộn/focus tới trường bị lỗi
  useEffect(() => {
    const targetField = focusRequest?.field;
    if (!targetField) return undefined;

    if (targetField === 'claimed_member_id') {
      setStep1Collapsed(false);
    } else if (
      [
        'referrer_name',
        'referrer_phone',
        'layer1_lineage',
        'layer2_branch_origin',
        'layer3_guarantor_note',
      ].includes(targetField)
    ) {
      setStep2Collapsed(false);
    } else {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      const container = wizardRootRef.current || document;
      const el =
        container.querySelector(`[data-field-key="${targetField}"]`) ||
        document.querySelector(`[data-field-key="${targetField}"]`);
      if (el) {
        el.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
        el.focus?.({ preventScroll: true });
      }
    }, 140);

    return () => window.clearTimeout(timer);
  }, [focusRequest?.field, focusRequest?.tick]);

  const selectedMember = value?.claimed_member_summary || null;
  const selectedMemberId = value?.claimed_member_id || selectedMember?.id || '';
  const gender = value?.gender || 'NAM';
  const verification = value?.claim_verification || {
    layer1_lineage: '',
    layer2_branch_origin: '',
    layer3_guarantor_note: '',
  };
  const referrerName = value?.referrer_name || '';
  const referrerPhone = value?.referrer_phone || '';
  const referrerPhoneCountry = value?.referrer_phone_country || 'VN';
  const selectedRefCountryMeta =
    COUNTRY_PHONE_OPTIONS.find((c) => c.code === referrerPhoneCountry) ||
    COUNTRY_PHONE_OPTIONS[0];

  // Trạng thái khóa QA 3 lần sai [FUNC-03, TC-FE-03]
  const effectiveQaLocked = Boolean(qaLocked || value?.qa_locked);
  const effectiveQaAttempts = Number(
    qaFailedAttempts || value?.qa_failed_attempts || (effectiveQaLocked ? 3 : 0)
  );

  const prompts = resolveVerificationPrompts({
    linkType,
    childType:
      selectedMember?.child_type ||
      resolveMemberClanRelation(selectedMember).childType ||
      '',
  });

  // Bộ đếm ngược Rate Limit 429
  useEffect(() => {
    if (rateLimitCountdown <= 0) return undefined;
    const timer = setInterval(() => {
      setRateLimitCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [rateLimitCountdown]);

  // Turnstile Fail-Closed cho claim-search [NFR-02, TC-FE-12]
  const executeSearchRef = useRef(null);
  const claimSearchTurnstile = useTurnstileFailClosed({
    onVerifySuccess: (verifiedToken) => {
      if (lastClaimSearchKeywordRef.current && executeSearchRef.current) {
        executeSearchRef.current(lastClaimSearchKeywordRef.current, {
          turnstileToken: verifiedToken,
          isAutoRetry: true,
        });
      }
    },
    onVerifyError: (captchaErr) => {
      const msgObj = getPhase2UserMessage('TURNSTILE_FAILED', {
        message: captchaErr?.message,
      });
      setWizardBanner({
        type: msgObj.type,
        title: msgObj.title,
        message: msgObj.message,
      });
    },
  });

  const claimSearchTurnstileRef = useRef(claimSearchTurnstile);
  claimSearchTurnstileRef.current = claimSearchTurnstile;
  const rateLimitCountdownRef = useRef(rateLimitCountdown);
  rateLimitCountdownRef.current = rateLimitCountdown;

  useEffect(() => {
    if (propTenantId || internalTenant) return;
    const q = String(tenantQuery || '').trim();
    if (q.length < 2) {
      setTenantResults([]);
      return;
    }
    if (tenantTimerRef.current) clearTimeout(tenantTimerRef.current);
    tenantTimerRef.current = setTimeout(async () => {
      setTenantSearching(true);
      try {
        const res = await apiClient.get('/public/tenants/search', {
          params: { q },
          headers: { Authorization: '' },
        });
        setTenantResults(res.data?.data || []);
      } catch (_) {
        setTenantResults([]);
      } finally {
        setTenantSearching(false);
      }
    }, 400);

    return () => clearTimeout(tenantTimerRef.current);
  }, [tenantQuery, propTenantId, internalTenant]);

  useEffect(() => {
    setResults([]);
    setSearchError('');
  }, [activeTenantId]);

  const executeSearch = useCallback(
    async (keyword, options = {}) => {
      const { turnstileToken: overrideToken, isAutoRetry = false } = options;
      const q = String(keyword || '').trim();
      if (!activeTenantId || q.length < 2) {
        setResults([]);
        setSearchError('');
        return;
      }

      if (rateLimitCountdownRef.current > 0 && !isAutoRetry) {
        return;
      }

      lastClaimSearchKeywordRef.current = q;
      const turnstileCtrl = claimSearchTurnstileRef.current;

      if (
        !isAutoRetry &&
        turnstileCtrl?.isChallengeVisible &&
        !overrideToken &&
        !turnstileCtrl?.turnstileToken
      ) {
        return;
      }

      if (!isAutoRetry) {
        turnstileCtrl?.resetRetryBudget?.();
      }

      setSearching(true);
      setSearchError('');

      const activeToken =
        overrideToken || turnstileCtrl?.turnstileToken || '';
      const headers = { Authorization: '' };
      if (activeToken) {
        headers['X-Turnstile-Token'] = activeToken;
      }

      try {
        const res = await apiClient.get(
          `/public/tenants/${encodeURIComponent(activeTenantId)}/members/claim-search`,
          {
            params: { q },
            headers,
          }
        );
        const list = res.data?.data || [];
        // [ARCH-03] Không lọc is_clan=false ở client
        setResults(Array.isArray(list) ? list : []);
        claimSearchTurnstileRef.current?.dismissChallenge?.();
        if (Array.isArray(list) && list.length === 0) {
          setSearchError(
            'Không tìm thấy thành viên chính thức nào khớp từ khóa. Bác có thể thử tên khác hoặc chọn khai báo hồ sơ mới.'
          );
        }
      } catch (err) {
        // 1. Bắt 403 Turnstile Fail-Closed [NFR-02, TC-FE-12]
        if (isTurnstileChallengeError(err)) {
          const info = extractApiErrorInfo(err);
          const msgObj = getPhase2UserMessage('TURNSTILE_REQUIRED', {
            message: info.message,
          });
          claimSearchTurnstileRef.current?.triggerChallenge?.();
          setWizardBanner({
            type: msgObj.type,
            title: msgObj.title,
            message: msgObj.message,
          });
          setResults([]);
          return;
        }

        const info = extractApiErrorInfo(err);
        if (info.status === 429) {
          const retryAfter = Number(
            info.details?.retryAfter || info.details?.retry_after || 30
          );
          const msgObj = getPhase2UserMessage('CLAIM_SEARCH_RATE_LIMITED', {
            message: info.message,
          });
          setRateLimitCountdown(retryAfter > 0 ? retryAfter : 30);
          setWizardBanner({
            type: msgObj.type,
            title: msgObj.title,
            message: msgObj.message,
          });
        } else {
          const msgObj = getPhase2UserMessage(info.code, {
            message: info.message,
          });
          setSearchError(msgObj.message);
          setWizardBanner({
            type: msgObj.type,
            title: msgObj.title,
            message: msgObj.message,
          });
        }
        setResults([]);
      } finally {
        setSearching(false);
      }
    },
    [activeTenantId]
  );

  useEffect(() => {
    executeSearchRef.current = executeSearch;
  }, [executeSearch]);

  useEffect(() => {
    if (selectedMemberId) return undefined;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      executeSearch(searchQuery);
    }, 450);

    return () => clearTimeout(searchTimerRef.current);
  }, [searchQuery, selectedMemberId, executeSearch]);

  const emitChange = (patch) => {
    if (!onChange) return;
    onChange({
      ...value,
      ...patch,
    });
  };

  const handleSelectMember = (member) => {
    // [UAT-IMP3 Bổ sung 2] Không khóa chọn sớm theo is_claimed để tránh suy ngược tài khoản
    if (!member || claimHoppingBlocked) return;
    onFocusZone?.();
    onMemberSelect?.(member);
    const relation = resolveMemberClanRelation(member);
    emitChange({
      claim_mode: 'CLAIM_EM',
      claimed_member_id: member.id,
      claimed_member_summary: member,
      full_name: member.full_name,
      alias: member.alias || '',
      gender: gender || 'NAM',
      birth_year: member.birth_year || undefined,
      branch_name: member.branch_name || '',
      father_name: member.father_name || '',
      mother_name: member.mother_name || '',
      generation: member.generation || undefined,
      child_type: relation.childType,
      claim_verification: {
        layer1_lineage: verification.layer1_lineage || '',
        layer2_branch_origin: verification.layer2_branch_origin || '',
        layer3_guarantor_note: verification.layer3_guarantor_note || '',
      },
    });

    // [UAT-IMP2] Giữ nguyên Card Bước 1 phía trên, mở Card Bước 2 và cuộn mượt tới Bước 2
    setStep2Collapsed(false);
    window.setTimeout(() => {
      step2CardRef.current?.scrollIntoView?.({
        behavior: 'smooth',
        block: 'start',
      });
    }, 120);
  };

  const handleResetSelection = () => {
    onFocusZone?.();
    setStep1Collapsed(false);
    emitChange({
      claim_mode: 'CLAIM_EM',
      claimed_member_id: '',
      claimed_member_summary: null,
    });
  };

  const handleLayerChange = (layerKey, text) => {
    if (effectiveQaLocked) return;
    onFocusZone?.();
    const nextVerification = {
      ...verification,
      [layerKey]: text,
    };
    emitChange({
      claim_mode: 'CLAIM_EM',
      claim_verification: nextVerification,
      ...(layerKey === 'layer3_guarantor_note' ? { note: text } : {}),
    });
  };

  const isAllLayersComplete =
    Boolean(selectedMemberId) &&
    Boolean(String(referrerName || '').trim()) &&
    Boolean(String(referrerPhone || '').trim()) &&
    Boolean(String(verification.layer1_lineage || '').trim()) &&
    Boolean(String(verification.layer2_branch_origin || '').trim()) &&
    Boolean(String(verification.layer3_guarantor_note || '').trim());

  const selectedMemberBadge = getNonClanDisplayBadge(selectedMember);

  return (
    <div ref={wizardRootRef} className="space-y-5">
      <BlockingLoadingOverlay
        isOpen={searching || tenantSearching}
        message="Đang tra cứu danh sách thành viên trên phả đồ..."
      />

      {/* [FUNC-03, TC-FE-03] Huy hiệu khóa QA sau 3 lần trả lời sai (423 ONBOARDING_QA_LOCKED) */}
      {effectiveQaLocked && (
        <div
          role="status"
          data-testid="qa-locked-badge"
          className="rounded-2xl border-2 border-amber-500 bg-amber-50 p-4 text-amber-950 space-y-2"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 rounded-xl bg-amber-800 px-3.5 py-2 text-base font-bold text-white">
              <Lock size={18} />
              Đã chuyển Ban Quản trị xem xét trực tiếp
            </span>
          </div>
          <p className="text-base font-medium leading-relaxed text-amber-900">
            Hồ sơ đã tạm khóa phần trả lời câu hỏi bảo mật tự động do chưa khớp 3 lần liên tiếp và đã chuyển tới Ban Quản trị dòng họ xem xét thủ công.
          </p>
        </div>
      )}

      {/* [NFR-03, TC-FE-13] Cảnh báo ngắt mạch Claim-Hopping 90 ngày (403 CLAIM_HOPPING_DETECTED) */}
      {claimHoppingBlocked && (
        <div
          role="alert"
          data-testid="claim-hopping-blocked-box"
          className="rounded-2xl border-2 border-rose-300 bg-rose-50 p-4 text-rose-950 space-y-3"
        >
          <p className="text-base font-bold leading-relaxed text-rose-900">
            Tài khoản của bác đã bị từ chối nhận diện thành viên 2 lần trong 90 ngày qua tại dòng họ này nên tạm khóa chức năng nhận hồ sơ có sẵn.
          </p>
          {typeof onSwitchToCreateNew === 'function' && (
            <button
              type="button"
              onClick={onSwitchToCreateNew}
              className="min-h-[48px] h-12 rounded-xl bg-indigo-600 px-5 text-base font-bold text-white hover:bg-indigo-700 whitespace-nowrap"
            >
              Chuyển sang Khai báo hồ sơ mới
            </button>
          )}
        </div>
      )}

      {/* [UAT-IMP1] Banner thông báo lớp trên cùng (nền mờ đậm che gần toàn màn hình + tự động đọc) */}
      {wizardBanner && (
        <PersistentMessageBanner
          type={wizardBanner.type}
          mode={wizardBanner.mode || 'fullscreen'}
          autoSpeak
          title={wizardBanner.title}
          message={wizardBanner.message}
          onClose={() => setWizardBanner(null)}
        />
      )}

      {/* BƯỚC 0 (Nếu chưa chọn dòng họ từ bên ngoài): TÌM DÒNG HỌ */}
      {!propTenantId && (
        <div className="space-y-2.5 rounded-2xl border border-slate-200 bg-white p-4">
          <label className="text-sm font-black uppercase tracking-wider text-slate-700">
            Chọn dòng họ cần tra cứu <span className="text-rose-500">*</span>
          </label>
          {!internalTenant ? (
            <>
              <div className="relative">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  disabled={disabled}
                  value={tenantQuery}
                  onChange={(e) => setTenantQuery(e.target.value)}
                  placeholder="Gõ tên dòng họ (tối thiểu 2 ký tự)..."
                  className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-9 text-base text-slate-900 outline-none focus:border-emerald-500"
                />
                {tenantSearching && (
                  <Loader2
                    size={16}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-emerald-600"
                  />
                )}
              </div>
              {tenantResults.length > 0 && (
                <div className="max-h-48 space-y-1.5 overflow-y-auto">
                  {tenantResults.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setInternalTenant(t);
                        onTenantSelect?.(t);
                      }}
                      className="min-h-[48px] flex w-full items-center gap-2.5 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-left text-base font-bold text-slate-800 hover:border-emerald-300 hover:bg-emerald-50"
                    >
                      <Landmark size={18} className="text-emerald-600" />
                      <span>{t.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-base font-bold text-emerald-900">
              <span>{internalTenant.name}</span>
              <button
                type="button"
                onClick={() => {
                  setInternalTenant(null);
                  handleResetSelection();
                }}
                className="min-h-[48px] px-3 text-base font-black text-emerald-700 underline"
              >
                Đổi họ
              </button>
            </div>
          )}
        </div>
      )}

      {/* CARD BƯỚC 1: TÌM & CHỌN THÀNH VIÊN TRONG SỔ HỌ (Card 2 dòng / 3 cột chuẩn UAT-IMP3) */}
      <div ref={step1CardRef}>
        <CollapsibleDetailCard
          title={`Bước 1: Tìm tên của bác trong sổ họ ${activeTenantName || ''}`}
          statusLabel={selectedMemberId ? 'Đã chọn' : 'Chưa chọn'}
          statusVariant={selectedMemberId ? 'complete' : 'default'}
          voiceText={`Bước 1: Tìm tên của bác trong sổ họ ${activeTenantName || 'đã chọn'}. Bác gõ họ tên của mình vào ô tìm kiếm, sau đó bấm Mở ra trên thẻ kết quả để xem thông tin chi tiết và chọn hồ sơ.`}
          expanded={!step1Collapsed}
          onToggle={(next) => setStep1Collapsed(!next)}
        >
          <div className="space-y-3">
            {selectedMemberId && (
              <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/90 p-4 text-emerald-950">
                <div className="flex items-center gap-2 text-emerald-800">
                  <UserCheck size={20} className="shrink-0" />
                  <span className="text-base font-bold">
                    Hồ sơ trong sổ họ bác đã chọn
                  </span>
                </div>

                <KeyValueDetailTable
                  rows={[
                    { label: 'Họ và tên', value: selectedMember?.full_name },
                    ...(selectedMember?.alias
                      ? [{ label: 'Tên tự / Tên hiệu', value: selectedMember.alias }]
                      : []),
                    {
                      label: 'Quan hệ dòng họ',
                      value: resolveClanRelationDetailText(selectedMember),
                    },
                    ...(selectedMember?.generation != null
                      ? [{ label: 'Đời thứ', value: `Đời thứ ${selectedMember.generation}` }]
                      : []),
                    ...(selectedMember?.branch_name
                      ? [{ label: 'Chi / Nhánh', value: selectedMember.branch_name }]
                      : []),
                    ...(selectedMember?.birth_year
                      ? [{ label: 'Năm sinh', value: selectedMember.birth_year }]
                      : []),
                    ...(selectedMember?.father_name
                      ? [{ label: 'Họ tên Cha', value: selectedMember.father_name }]
                      : []),
                    ...(selectedMember?.mother_name
                      ? [{ label: 'Họ tên Mẹ', value: selectedMember.mother_name }]
                      : []),
                  ]}
                  notes={
                    selectedMember?.note
                      ? [{ label: 'Ghi chú', value: selectedMember.note }]
                      : []
                  }
                />

                <button
                  type="button"
                  disabled={disabled}
                  onClick={handleResetSelection}
                  className="min-h-[48px] h-12 w-full inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-400 bg-white px-4 text-base font-bold text-emerald-800 whitespace-nowrap transition hover:bg-emerald-100"
                >
                  <RotateCcw size={18} />
                  <span>Chọn lại người khác</span>
                </button>
              </div>
            )}

            {!selectedMemberId && (
              <>
                <p className="text-base font-medium text-slate-600">
                  Gõ tối thiểu 2 chữ cái họ tên hoặc tên tự để tra cứu thành viên
                  chính thức (bao gồm cả con dâu, con rể) đã có trong sổ họ.
                </p>

                <div className="relative">
                  <Search
                    size={18}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="text"
                    data-field-key="claimed_member_id"
                    value={searchQuery}
                    disabled={disabled || !activeTenantId || rateLimitCountdown > 0}
                    onFocus={() => onFocusZone?.()}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={
                      activeTenantId
                        ? 'Ví dụ: Nguyễn Văn An...'
                        : 'Vui lòng chọn dòng họ trước...'
                    }
                    className="min-h-[48px] h-12 w-full rounded-xl border border-slate-300 bg-white pl-11 pr-10 text-base text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-200 disabled:text-slate-600"
                  />
                  {searching && (
                    <Loader2
                      size={18}
                      className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-emerald-600"
                    />
                  )}
                </div>

                {rateLimitCountdown > 0 && (
                  <p className="text-base font-semibold text-amber-800" role="status">
                    Tạm khóa tra cứu do thao tác quá nhanh. Vui lòng thử lại sau {rateLimitCountdown} giây.
                  </p>
                )}

                {claimSearchTurnstile.isChallengeVisible && (
                  <div
                    className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-4"
                    role="region"
                    aria-label="Xác nhận an toàn tra cứu thành viên"
                  >
                    <p className="mb-2 text-base font-bold text-amber-950">
                      Bác vui lòng tích vào ô xác nhận bên dưới để tiếp tục tra cứu thành viên:
                    </p>
                    <div
                      ref={claimSearchTurnstile.containerRef}
                      className="min-h-[65px]"
                    />
                  </div>
                )}

                {errors.claimed_member_id && (
                  <p className="text-base font-bold text-rose-600">
                    {errors.claimed_member_id}
                  </p>
                )}

                {searchError && (
                  <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-base font-semibold text-amber-900">
                    <AlertCircle size={18} className="mt-0.5 shrink-0" />
                    <span>{searchError}</span>
                  </div>
                )}

                {/* Kết quả tìm kiếm: Card 2 dòng / 3 cột + Bảng chi tiết 2 cột (italic) + Text Area + members.is_clan */}
                {results.length > 0 && (
                  <div className="max-h-[32rem] space-y-3 overflow-y-auto pr-1">
                    {results.map((m) => {
                      const relation = resolveMemberClanRelation(m);
                      const clanRelationText = resolveClanRelationDetailText(m);
                      const isCardDisabled = disabled || claimHoppingBlocked;
                      const cardTitle = m.alias
                        ? `${m.full_name} (Tự/Hiệu: ${m.alias})`
                        : m.full_name;
                      const rowVoiceText = [
                        m.full_name,
                        clanRelationText,
                        m.generation != null ? `Đời thứ ${m.generation}` : null,
                        m.branch_name ? `Chi ${m.branch_name}` : null,
                        m.birth_year ? `Sinh năm ${m.birth_year}` : null,
                        m.father_name ? `Cha là ${m.father_name}` : null,
                        m.mother_name ? `Mẹ là ${m.mother_name}` : null,
                        m.note ? `Ghi chú: ${m.note}` : null,
                      ]
                        .filter(Boolean)
                        .join('. ');

                      const detailRows = [
                        { label: 'Họ và tên', value: m.full_name },
                        ...(m.alias
                          ? [{ label: 'Tên tự / Tên hiệu', value: m.alias }]
                          : []),
                        { label: 'Quan hệ dòng họ', value: clanRelationText },
                        ...(m.generation != null
                          ? [{ label: 'Đời thứ', value: `Đời thứ ${m.generation}` }]
                          : []),
                        ...(m.branch_name
                          ? [{ label: 'Chi / Nhánh', value: m.branch_name }]
                          : []),
                        ...(m.birth_year
                          ? [{ label: 'Năm sinh', value: m.birth_year }]
                          : []),
                        ...(m.father_name
                          ? [{ label: 'Họ tên Cha', value: m.father_name }]
                          : []),
                        ...(m.mother_name
                          ? [{ label: 'Họ tên Mẹ', value: m.mother_name }]
                          : []),
                      ];
                      const detailNotes = m.note
                        ? [{ label: 'Ghi chú', value: m.note }]
                        : [];

                      return (
                        <CollapsibleDetailCard
                          key={m.id}
                          title={cardTitle}
                          statusLabel={relation.isClan ? 'Nội tộc' : 'Ngoại tộc'}
                          statusVariant={relation.isClan ? 'complete' : 'pending'}
                          voiceText={rowVoiceText}
                          defaultExpanded={false}
                        >
                          <div className="space-y-3">
                            <KeyValueDetailTable
                              rows={detailRows}
                              notes={detailNotes}
                            />

                            <button
                              type="button"
                              disabled={isCardDisabled}
                              onClick={() => handleSelectMember(m)}
                              className={`min-h-[48px] h-12 w-full rounded-xl px-4 text-base font-bold whitespace-nowrap transition ${
                                isCardDisabled
                                  ? 'cursor-not-allowed bg-slate-300 text-slate-700'
                                  : 'bg-emerald-600 text-white hover:bg-emerald-700'
                              }`}
                            >
                              Chọn hồ sơ này
                            </button>
                          </div>
                        </CollapsibleDetailCard>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </CollapsibleDetailCard>
      </div>

      {/* CARD BƯỚC 2: XÁC MINH THÔNG TIN NHÂN THÂN (Card 2 dòng / 3 cột chuẩn UAT-IMP3) */}
      {Boolean(selectedMemberId) && (
        <div ref={step2CardRef}>
          <CollapsibleDetailCard
            title={prompts.sectionTitle}
            statusLabel={isAllLayersComplete ? 'Hoàn chỉnh' : 'Chưa hoàn chỉnh'}
            statusVariant={isAllLayersComplete ? 'complete' : 'pending'}
            voiceText={`${prompts.sectionTitle}. ${prompts.layer1Label}. ${prompts.layer2Label}. ${prompts.layer3Label}.`}
            expanded={!step2Collapsed}
            onToggle={(next) => setStep2Collapsed(!next)}
          >
            <div className="space-y-4">
              {/* Xác nhận giới tính */}
              <div className="space-y-1.5">
                <label className="text-base font-bold text-slate-800">
                  Xác nhận giới tính <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {GENDER_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={disabled}
                      onClick={() => emitChange({ gender: opt.value })}
                      className={`min-h-[48px] h-12 rounded-xl border text-base font-bold whitespace-nowrap transition ${
                        gender === opt.value
                          ? 'border-emerald-600 bg-emerald-600 text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* [UAT-IMP4 Mục 6b] Người giới thiệu trong họ BẮT BUỘC (*) — tự nhập, cấm tra cứu sổ họ */}
              <div className="space-y-3.5 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-base font-bold text-amber-950">
                    Người giới thiệu trong họ{' '}
                    <span className="font-bold text-rose-600">*</span>
                  </p>
                  <ZoneVoiceButton
                    visible
                    text="Bác bắt buộc nhập họ và tên cùng số điện thoại của người thân trong họ giới thiệu bác để Ban Quản trị liên hệ xác minh."
                    label="Nghe"
                  />
                </div>

                <div>
                  <label className="block text-base font-normal text-slate-600 mb-1.5">
                    Họ và tên người giới thiệu{' '}
                    <span className="font-bold text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    data-field-key="referrer_name"
                    disabled={disabled}
                    value={referrerName}
                    onFocus={() => onFocusZone?.()}
                    onChange={(e) =>
                      emitChange({ referrer_name: e.target.value })
                    }
                    placeholder="Nhập họ tên người thân trong họ giới thiệu bác"
                    className="min-h-[48px] h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base font-bold text-slate-900 placeholder:font-normal placeholder:text-slate-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  />
                  {errors.referrer_name && (
                    <p className="mt-1 text-base font-bold text-rose-600">
                      {errors.referrer_name}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-base font-normal text-slate-600 mb-1.5">
                    Số điện thoại người giới thiệu{' '}
                    <span className="font-bold text-rose-600">*</span>
                  </label>
                  <div className="flex flex-row items-center gap-2">
                    <select
                      aria-label="Chọn mã quốc gia số điện thoại người giới thiệu"
                      disabled={disabled}
                      value={referrerPhoneCountry}
                      onFocus={() => onFocusZone?.()}
                      onChange={(e) =>
                        emitChange({ referrer_phone_country: e.target.value })
                      }
                      className="min-h-[48px] h-12 w-[124px] sm:w-[136px] shrink-0 rounded-xl border border-slate-300 bg-white px-2.5 text-base font-bold text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    >
                      {COUNTRY_PHONE_OPTIONS.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.shortLabel || c.label}
                        </option>
                      ))}
                    </select>

                    <div className="relative flex-1 min-w-0">
                      <Phone
                        size={18}
                        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                      />
                      <input
                        type="tel"
                        data-field-key="referrer_phone"
                        disabled={disabled}
                        value={referrerPhone}
                        onFocus={() => onFocusZone?.()}
                        onChange={(e) =>
                          emitChange({ referrer_phone: e.target.value })
                        }
                        placeholder={selectedRefCountryMeta.placeholder}
                        className="min-h-[48px] h-12 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 text-base font-bold text-slate-900 placeholder:font-normal placeholder:text-slate-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                      />
                    </div>
                  </div>
                  {errors.referrer_phone && (
                    <p className="mt-1 text-base font-bold text-rose-600">
                      {errors.referrer_phone}
                    </p>
                  )}
                </div>
              </div>

              {/* 3 LỚP XÁC MINH THEO NGỮ CẢNH QUAN HỆ */}
              {effectiveQaLocked ? (
                <div className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 text-base font-semibold text-amber-950">
                  Phần đối chiếu câu hỏi tự động đã tạm khóa do chưa khớp sau 3 lần thử. Hồ sơ của bác đã được chuyển tới Ban Quản trị dòng họ xem xét trực tiếp.
                </div>
              ) : (
                <div className="space-y-4">
                  {effectiveQaAttempts > 0 && effectiveQaAttempts < 3 && (
                    <p className="rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-base font-bold text-amber-950">
                      Lưu ý: Hồ sơ đã có {effectiveQaAttempts}/3 lần đối chiếu chưa khớp. Còn {3 - effectiveQaAttempts} lần thử trước khi chuyển sang duyệt trực tiếp.
                    </p>
                  )}

                  {/* Lớp 1 */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-1.5 text-base font-bold text-slate-800">
                        <Users size={16} className="text-indigo-600" />
                        {prompts.layer1Label}{' '}
                        <span className="text-rose-500">*</span>
                      </label>
                      <ZoneVoiceButton
                        visible
                        text={prompts.layer1Placeholder}
                        label="Nghe"
                      />
                    </div>
                    <input
                      type="text"
                      data-field-key="layer1_lineage"
                      disabled={disabled}
                      value={verification.layer1_lineage || ''}
                      onFocus={() => onFocusZone?.()}
                      onChange={(e) =>
                        handleLayerChange('layer1_lineage', e.target.value)
                      }
                      placeholder={prompts.layer1Placeholder}
                      className="min-h-[48px] h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                    />
                    {errors.layer1_lineage && (
                      <p className="text-base font-bold text-rose-600">
                        {errors.layer1_lineage}
                      </p>
                    )}
                  </div>

                  {/* Lớp 2 */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-1.5 text-base font-bold text-slate-800">
                        <MapPin size={16} className="text-indigo-600" />
                        {prompts.layer2Label}{' '}
                        <span className="text-rose-500">*</span>
                      </label>
                      <ZoneVoiceButton
                        visible
                        text={prompts.layer2Placeholder}
                        label="Nghe"
                      />
                    </div>
                    <input
                      type="text"
                      data-field-key="layer2_branch_origin"
                      disabled={disabled}
                      value={verification.layer2_branch_origin || ''}
                      onFocus={() => onFocusZone?.()}
                      onChange={(e) =>
                        handleLayerChange('layer2_branch_origin', e.target.value)
                      }
                      placeholder={prompts.layer2Placeholder}
                      className="min-h-[48px] h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                    />
                    {errors.layer2_branch_origin && (
                      <p className="text-base font-bold text-rose-600">
                        {errors.layer2_branch_origin}
                      </p>
                    )}
                  </div>

                  {/* Lớp 3 */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-1.5 text-base font-bold text-slate-800">
                        <MessageSquareText size={16} className="text-indigo-600" />
                        {prompts.layer3Label}{' '}
                        <span className="text-rose-500">*</span>
                      </label>
                      <ZoneVoiceButton
                        visible
                        text={prompts.layer3Placeholder}
                        label="Nghe"
                      />
                    </div>
                    <textarea
                      data-field-key="layer3_guarantor_note"
                      disabled={disabled}
                      value={verification.layer3_guarantor_note || ''}
                      onFocus={() => onFocusZone?.()}
                      onChange={(e) =>
                        handleLayerChange('layer3_guarantor_note', e.target.value)
                      }
                      placeholder={prompts.layer3Placeholder}
                      className="min-h-[96px] w-full resize-none rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                    />
                    {errors.layer3_guarantor_note && (
                      <p className="text-base font-bold text-rose-600">
                        {errors.layer3_guarantor_note}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </CollapsibleDetailCard>
        </div>
      )}

      {/* CARD BƯỚC 3: THẺ XÁC NHẬN SẴN SÀNG (Card 2 dòng / 3 cột chuẩn UAT-IMP3) */}
      {Boolean(selectedMemberId) && !effectiveQaLocked && isAllLayersComplete && (
        <div ref={step3CardRef}>
          <CollapsibleDetailCard
            title="Bước 3: Hoàn tất xác minh nhân thân"
            statusLabel="Hoàn chỉnh"
            statusVariant="complete"
            voiceText={`Đã hoàn tất ${prompts.step3SummaryLabel} cho hồ sơ ${selectedMember?.full_name || ''}.`}
            expanded={!step3Collapsed}
            onToggle={(next) => setStep3Collapsed(!next)}
          >
            <p className="text-base font-semibold leading-relaxed text-emerald-950">
              Đã hoàn tất {prompts.step3SummaryLabel} cho hồ sơ{' '}
              <strong>{selectedMember?.full_name}</strong>.{' '}
              {isMultiHome
                ? 'Bác bấm nút "Gửi hồ sơ xin gia nhập dòng họ" bên dưới để hoàn tất.'
                : 'Bác tiếp tục hoàn thiện bước "Thông tin tài khoản đăng nhập" bên dưới để rà soát và gửi đơn.'}
            </p>
          </CollapsibleDetailCard>
        </div>
      )}
    </div>
  );
};

export { ClaimMemberWizard, resolveVerificationPrompts, resolveMemberClanRelation };
export default ClaimMemberWizard;
