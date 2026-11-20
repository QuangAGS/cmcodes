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
} from 'lucide-react';
import apiClient from '../../../lib/apiClient.js';
import { REFERRER_COOLDOWN_DAYS } from '../../onboarding/constants/onboardingPhase2Contracts.js';
import PersistentMessageBanner from '../../../components/common/PersistentMessageBanner.jsx';
import BlockingLoadingOverlay from '../../../components/common/BlockingLoadingOverlay.jsx';
import AudioHelpButton from '../../elder-doctrine/components/AudioHelpButton.jsx';
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

const SEVEN_DAYS_MS = REFERRER_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

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
 * [FUNC-09, TC-FE-09] Kiểm tra người bảo lãnh có nằm trong thời gian Cooldown 7 ngày hay không
 * dựa trên metadata.referral_history = [{ referrer_id, status: 'DECLINED', decided_at }]
 */
const checkReferrerCooldown = (referrerId, referralHistory = [], extraBlockedIds = new Set()) => {
  if (!referrerId) return false;
  if (extraBlockedIds.has(String(referrerId))) return true;
  if (!Array.isArray(referralHistory) || referralHistory.length === 0) return false;

  const now = Date.now();
  return referralHistory.some((item) => {
    const id = String(item?.referrer_id || item?.referrer_member_id || '');
    if (id !== String(referrerId)) return false;
    const st = String(item?.status || item?.decision || '').toUpperCase();
    if (st !== 'DECLINED' && st !== 'REJECTED') return false;
    if (!item?.decided_at) return true;
    const elapsed = now - new Date(item.decided_at).getTime();
    return elapsed >= 0 && elapsed < SEVEN_DAYS_MS;
  });
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
}) => {
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

  const selectedMember = value?.claimed_member_summary || null;
  const selectedMemberId = value?.claimed_member_id || selectedMember?.id || '';
  const gender = value?.gender || 'NAM';
  const verification = value?.claim_verification || {
    layer1_lineage: '',
    layer2_branch_origin: '',
    layer3_guarantor_note: '',
  };
  const selectedReferrerId = value?.referrer_member_id || '';

  // Kết hợp metadata.referral_history từ props và từ value.metadata
  const mergedReferralHistory = useMemo(() => {
    const fromValue = Array.isArray(value?.metadata?.referral_history)
      ? value.metadata.referral_history
      : [];
    const fromProp = Array.isArray(referralHistory) ? referralHistory : [];
    return [...fromProp, ...fromValue];
  }, [referralHistory, value?.metadata?.referral_history]);

  const extraCooldownSet = useMemo(
    () => new Set((cooldownReferrerIds || []).map((id) => String(id))),
    [cooldownReferrerIds]
  );

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
      setWizardBanner({
        type: 'error',
        title: 'Xác thực bảo mật chưa thành công',
        message: captchaErr?.message,
        correlationId: 'Không có',
      });
    },
  });

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
    setWizardBanner(null);
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

      if (rateLimitCountdown > 0 && !isAutoRetry) {
        return;
      }

      lastClaimSearchKeywordRef.current = q;
      if (!isAutoRetry) {
        claimSearchTurnstile.resetRetryBudget();
      }

      setSearching(true);
      setSearchError('');

      const activeToken =
        overrideToken || claimSearchTurnstile.turnstileToken || '';
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
        setWizardBanner(null);
        claimSearchTurnstile.dismissChallenge();
        if (Array.isArray(list) && list.length === 0) {
          setSearchError(
            'Không tìm thấy thành viên chính thức nào khớp từ khóa. Bác có thể thử tên khác hoặc chọn "Khai báo mới 21 trường".'
          );
        }
      } catch (err) {
        // 1. Bắt 403 Turnstile Fail-Closed [NFR-02, TC-FE-12]
        if (isTurnstileChallengeError(err)) {
          const info = extractApiErrorInfo(err);
          claimSearchTurnstile.triggerChallenge();
          setWizardBanner({
            type: 'warning',
            title: 'Yêu cầu xác minh bảo mật tìm kiếm',
            message: info.message,
            correlationId: info.correlationId,
          });
          setResults([]);
          return;
        }

        const info = extractApiErrorInfo(err);
        if (info.status === 429) {
          const retryAfter = Number(
            info.details?.retryAfter || info.details?.retry_after || 30
          );
          setRateLimitCountdown(retryAfter > 0 ? retryAfter : 30);
          setWizardBanner({
            type: 'warning',
            title: 'Tạm giới hạn tần suất tra cứu thành viên',
            message: info.message,
            correlationId: info.correlationId,
          });
        } else {
          setSearchError(info.message);
          setWizardBanner({
            type: 'error',
            title: 'Không tra cứu được danh sách thành viên',
            message: info.message,
            correlationId: info.correlationId,
          });
        }
        setResults([]);
      } finally {
        setSearching(false);
      }
    },
    [activeTenantId, rateLimitCountdown, claimSearchTurnstile]
  );

  useEffect(() => {
    executeSearchRef.current = executeSearch;
  }, [executeSearch]);

  useEffect(() => {
    if (selectedMemberId) return;
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
    // [ARCH-03, TC-FE-15] Khóa chọn sớm nếu is_claimed === true hoặc bị chặn Claim-Hopping
    if (member?.is_claimed === true || claimHoppingBlocked) return;
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
  };

  const handleResetSelection = () => {
    onFocusZone?.();
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
    Boolean(String(verification.layer1_lineage || '').trim()) &&
    Boolean(String(verification.layer2_branch_origin || '').trim()) &&
    Boolean(String(verification.layer3_guarantor_note || '').trim());

  const selectedMemberBadge = getNonClanDisplayBadge(selectedMember);

  return (
    <div className="space-y-5">
      <BlockingLoadingOverlay
        isOpen={searching || tenantSearching}
        message="Đang tra cứu danh sách thành viên trên phả đồ..."
      />

      {/* Header trợ lý giọng nói cho quy trình Claim [NFR-FE-02, TC-FE-18] */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3">
        <span className="text-base font-bold text-slate-800">
          Trợ lý hướng dẫn nhận hồ sơ
        </span>
        <AudioHelpButton
          text="Bác tìm tên của mình trên cây gia phả. Các vị trí đã có tài khoản liên kết sẽ bị khóa chọn. Nếu bác là con dâu hoặc con rể, hệ thống vẫn hiển thị để bác chọn. Sau đó bác nhập 3 lớp thông tin xác minh để Ban Quản trị đối chiếu."
          label="Nghe hướng dẫn"
          variant="soft"
        />
      </div>

      {/* [FUNC-03, TC-FE-03] Huy hiệu khóa QA sau 3 lần trả lời sai (423 ONBOARDING_QA_LOCKED) */}
      {effectiveQaLocked && (
        <div
          role="status"
          data-testid="qa-locked-badge"
          className="rounded-2xl border-2 border-amber-500 bg-amber-50 p-4 text-amber-950 space-y-2"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 rounded-xl bg-amber-800 px-3 py-1.5 text-base font-black text-white">
              <Lock size={18} />
              Khóa QA (3 lần sai) - Chờ Ban Quản trị
            </span>
            <span className="text-base font-bold text-amber-900">
              Chờ duyệt thủ công
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
              className="min-h-[48px] rounded-xl bg-indigo-600 px-4 py-2.5 text-base font-bold text-white hover:bg-indigo-700"
            >
              Chuyển sang Tạo hồ sơ mới (CREATE_NEW)
            </button>
          )}
        </div>
      )}

      {/* Banner thông báo nghiệp vụ hợp nhất duy nhất (kèm X-Correlation-Id) */}
      {wizardBanner && (
        <PersistentMessageBanner
          type={wizardBanner.type}
          title={wizardBanner.title}
          message={wizardBanner.message}
          correlationId={wizardBanner.correlationId}
          onClose={() => setWizardBanner(null)}
        />
      )}

      {/* Thanh tiến trình 3 bước trực quan */}
      <div className="grid grid-cols-3 gap-2 rounded-2xl bg-slate-100 p-1.5 text-center text-sm sm:text-base font-black">
        <div
          className={`rounded-xl py-2.5 transition ${
            !selectedMemberId
              ? 'bg-white text-emerald-700 shadow-sm'
              : 'text-emerald-700'
          }`}
        >
          1. Tìm trên cây
        </div>
        <div
          className={`rounded-xl py-2.5 transition ${
            selectedMemberId && !isAllLayersComplete
              ? 'bg-white text-emerald-700 shadow-sm'
              : isAllLayersComplete
                ? 'text-emerald-700'
                : 'text-slate-500'
          }`}
        >
          {prompts.step2Label}
        </div>
        <div
          className={`rounded-xl py-2.5 transition ${
            isAllLayersComplete
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-500'
          }`}
        >
          3. Xác nhận
        </div>
      </div>

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

      {/* BƯỚC 1: TÌM THÀNH VIÊN TRÊN CÂY */}
      {!selectedMemberId ? (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1">
              <label className="text-base font-black text-slate-800">
                Bước 1: Tìm tên của bác trên cây gia phả{' '}
                {activeTenantName ? `(${activeTenantName})` : ''}{' '}
                <span className="text-rose-500">*</span>
              </label>
              <p className="text-base font-medium text-slate-600">
                Gõ tối thiểu 2 chữ cái họ tên hoặc tên tự để tra cứu thành viên
                chính thức (bao gồm cả con dâu, con rể) đã có trên sổ họ.
              </p>
            </div>
            <ZoneVoiceButton
              visible
              text="Bác gõ họ tên của mình vào ô tìm kiếm bên dưới để tìm vị trí trên cây gia phả."
              label="Nghe"
            />
          </div>

          <div className="relative">
            <Search
              size={18}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={searchQuery}
              disabled={disabled || !activeTenantId || rateLimitCountdown > 0}
              onFocus={() => onFocusZone?.()}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                activeTenantId
                  ? 'Ví dụ: Nguyễn Văn An...'
                  : 'Vui lòng chọn dòng họ trước...'
              }
              className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white py-3 pl-11 pr-10 text-base text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-200 disabled:text-slate-600"
            />
            {searching && (
              <Loader2
                size={18}
                className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-emerald-600"
              />
            )}
          </div>

          {/* Inline helper text >= 16px khi bị Rate Limit 429 */}
          {rateLimitCountdown > 0 && (
            <p className="text-base font-semibold text-amber-800" role="status">
              Tạm khóa tra cứu do thao tác quá nhanh. Vui lòng thử lại sau {rateLimitCountdown} giây.
            </p>
          )}

          {/* [NFR-02, TC-FE-12] Khung Turnstile Fail-Closed cho claim-search */}
          {claimSearchTurnstile.isChallengeVisible && (
            <div
              className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-4"
              role="region"
              aria-label="Xác minh bảo mật tra cứu thành viên"
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

          {results.length > 0 && (
            <div className="max-h-96 space-y-2.5 overflow-y-auto pr-1">
              {results.map((m) => {
                const isClaimed = m.is_claimed === true;
                const relation = resolveMemberClanRelation(m);
                const nonClanOrChildLabel = getNonClanDisplayBadge(m);
                const isCardDisabled = disabled || isClaimed || claimHoppingBlocked;

                return (
                  <div
                    key={m.id}
                    className={`w-full rounded-2xl border p-4 text-left shadow-sm transition ${
                      isClaimed || claimHoppingBlocked
                        ? 'border-slate-300 bg-slate-100'
                        : 'border-slate-200 bg-white hover:border-emerald-400 hover:bg-emerald-50/60'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-lg font-black text-slate-900">
                            {m.full_name}
                            {m.alias ? (
                              <span className="ml-2 text-base font-bold text-slate-600">
                                (Tự/Hiệu: {m.alias})
                              </span>
                            ) : null}
                          </p>
                          {/* [ARCH-03, TC-FE-15] Nhãn ngoại tộc (Con dâu / Con rể) */}
                          {nonClanOrChildLabel && (
                            <span
                              className={`rounded-lg px-2.5 py-0.5 text-base font-bold ${
                                !relation.isClan
                                  ? 'border border-indigo-300 bg-indigo-100 text-indigo-900'
                                  : 'bg-amber-50 text-amber-900'
                              }`}
                            >
                              {nonClanOrChildLabel}
                            </span>
                          )}
                        </div>

                        <div className="mt-1.5 flex flex-wrap gap-2 text-base font-semibold text-slate-700">
                          {m.generation != null && (
                            <span className="rounded-lg bg-indigo-50 px-2.5 py-0.5 text-indigo-800">
                              Đời thứ {m.generation}
                            </span>
                          )}
                          {m.branch_name && (
                            <span className="rounded-lg bg-slate-100 px-2.5 py-0.5 text-slate-800">
                              Chi: {m.branch_name}
                            </span>
                          )}
                          {m.birth_year && (
                            <span className="rounded-lg bg-slate-100 px-2.5 py-0.5 text-slate-800">
                              Sinh năm {m.birth_year}
                            </span>
                          )}
                        </div>

                        {(m.father_name || m.mother_name) && (
                          <p className="mt-1.5 text-base font-medium text-slate-600">
                            {m.father_name ? `Cha: ${m.father_name}` : ''}
                            {m.father_name && m.mother_name ? ' • ' : ''}
                            {m.mother_name ? `Mẹ: ${m.mother_name}` : ''}
                          </p>
                        )}
                      </div>

                      <div className="shrink-0">
                        <button
                          type="button"
                          disabled={isCardDisabled}
                          onClick={() => handleSelectMember(m)}
                          className={`min-h-[48px] w-full sm:w-auto rounded-xl px-4 py-2.5 text-base font-black transition ${
                            isCardDisabled
                              ? 'cursor-not-allowed bg-slate-300 text-slate-700'
                              : 'bg-emerald-600 text-white hover:bg-emerald-700'
                          }`}
                        >
                          {isClaimed ? 'Không thể chọn' : 'Chọn hồ sơ'}
                        </button>
                      </div>
                    </div>

                    {/* [ARCH-03, TC-FE-15] Bắt buộc dùng inline helper text >= 16px thay cho tooltip */}
                    {isClaimed && (
                      <p className="mt-2 text-base font-bold text-rose-700">
                        Đã có tài khoản liên kết
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* BƯỚC 2 & BƯỚC 3: HIỂN THỊ HỒ SƠ ĐÃ CHỌN + NGƯỜI BẢO LÃNH (COOLDOWN 7D) + 3 LỚP XÁC MINH */
        <div className="space-y-4">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/90 p-4 text-emerald-950">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
                  <UserCheck size={20} />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-emerald-700">
                    Hồ sơ trên cây xin nhận
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-lg font-black text-slate-900">
                      {selectedMember?.full_name}
                    </p>
                    {selectedMemberBadge && (
                      <span className="rounded-lg border border-indigo-300 bg-indigo-100 px-2.5 py-0.5 text-base font-bold text-indigo-900">
                        {selectedMemberBadge}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-base font-semibold text-slate-700">
                    {[
                      selectedMember?.generation != null
                        ? `Đời thứ ${selectedMember.generation}`
                        : null,
                      selectedMember?.branch_name
                        ? `Chi: ${selectedMember.branch_name}`
                        : null,
                      selectedMember?.birth_year
                        ? `Sinh năm ${selectedMember.birth_year}`
                        : null,
                      selectedMember?.father_name
                        ? `Cha: ${selectedMember.father_name}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' • ') || 'Thành viên chính thức trên cây'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled={disabled}
                onClick={handleResetSelection}
                className="min-h-[48px] inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-emerald-300 bg-white px-4 py-2 text-base font-black text-emerald-800 transition hover:bg-emerald-100"
              >
                <RotateCcw size={16} />
                Chọn lại
              </button>
            </div>
          </div>

          {/* Xác nhận giới tính */}
          <div className="space-y-1.5">
            <label className="text-sm font-black uppercase tracking-wider text-slate-700">
              Xác nhận giới tính <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {GENDER_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={disabled}
                  onClick={() => emitChange({ gender: opt.value })}
                  className={`min-h-[48px] rounded-xl border py-2.5 text-base font-black transition ${
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

          {/* [FUNC-09, TC-FE-09] Chọn người bảo lãnh trong họ (lọc Cooldown 7 ngày từ metadata.referral_history) */}
          {Array.isArray(referrerCandidates) && referrerCandidates.length > 0 && (
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <label className="text-base font-black text-slate-800">
                  Chọn thành viên bảo lãnh trong họ
                </label>
                <ZoneVoiceButton
                  visible
                  text="Chọn một thành viên trong họ để xác nhận bảo lãnh. Người từng từ chối bảo lãnh trong 7 ngày qua sẽ tạm khóa chọn."
                  label="Nghe"
                />
              </div>

              <div className="space-y-2.5">
                {referrerCandidates.map((cand) => {
                  const inCooldown = checkReferrerCooldown(
                    cand.id,
                    mergedReferralHistory,
                    extraCooldownSet
                  );
                  const candBadge = getNonClanDisplayBadge(cand);
                  const isChosen =
                    String(selectedReferrerId) === String(cand.id);

                  return (
                    <div
                      key={cand.id}
                      className={`rounded-xl border p-3.5 ${
                        inCooldown
                          ? 'border-slate-300 bg-slate-100'
                          : isChosen
                            ? 'border-emerald-600 bg-emerald-50'
                            : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <span className="text-base font-black text-slate-900">
                            {cand.full_name}
                          </span>
                          {candBadge && (
                            <span className="ml-2 rounded-lg bg-indigo-100 px-2 py-0.5 text-sm font-bold text-indigo-900">
                              {candBadge}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          disabled={disabled || inCooldown}
                          onClick={() =>
                            emitChange({ referrer_member_id: cand.id })
                          }
                          className={`min-h-[48px] rounded-xl px-4 py-2 text-base font-bold ${
                            inCooldown
                              ? 'cursor-not-allowed bg-slate-300 text-slate-700'
                              : isChosen
                                ? 'bg-emerald-700 text-white'
                                : 'border border-emerald-600 bg-white text-emerald-800 hover:bg-emerald-50'
                          }`}
                        >
                          {inCooldown
                            ? 'Tạm khóa chọn'
                            : isChosen
                              ? 'Đã chọn bảo lãnh'
                              : 'Chọn người bảo lãnh'}
                        </button>
                      </div>

                      {/* [FUNC-09, TC-FE-09] Inline helper text >= 16px bên dưới nút, cấm tooltip */}
                      {inCooldown && (
                        <p className="mt-2 text-base font-bold text-rose-700">
                          Đã từ chối bảo lãnh. Thử lại sau 7 ngày
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3 LỚP XÁC MINH THEO NGỮ CẢNH QUAN HỆ (Tắt hoàn toàn nếu effectiveQaLocked === true) [FUNC-03] */}
          {effectiveQaLocked ? (
            <div className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 text-base font-semibold text-amber-950">
              Biểu mẫu xác minh 3 lớp đã tạm khóa do trả lời chưa khớp 3 lần. Bác vui lòng chờ Ban Quản trị dòng họ kiểm duyệt thủ công.
            </div>
          ) : (
            <div className="space-y-4 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-indigo-900">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={20} className="text-indigo-600" />
                  <h4 className="text-base font-black">
                    {prompts.sectionTitle}
                  </h4>
                </div>
                <ZoneVoiceButton
                  visible
                  text={`${prompts.sectionTitle}. ${prompts.layer1Label}. ${prompts.layer2Label}. ${prompts.layer3Label}.`}
                  label="Nghe"
                />
              </div>

              {effectiveQaAttempts > 0 && effectiveQaAttempts < 3 && (
                <p className="rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-base font-bold text-amber-950">
                  Lưu ý: Hồ sơ đã có {effectiveQaAttempts}/3 lần đối chiếu chưa khớp. Còn {3 - effectiveQaAttempts} lần thử trước khi chuyển sang duyệt thủ công.
                </p>
              )}

              {/* Lớp 1 */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-1.5 text-base font-black text-slate-800">
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
                  disabled={disabled}
                  value={verification.layer1_lineage || ''}
                  onFocus={() => onFocusZone?.()}
                  onChange={(e) =>
                    handleLayerChange('layer1_lineage', e.target.value)
                  }
                  placeholder={prompts.layer1Placeholder}
                  className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
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
                  <label className="flex items-center gap-1.5 text-base font-black text-slate-800">
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
                  disabled={disabled}
                  value={verification.layer2_branch_origin || ''}
                  onFocus={() => onFocusZone?.()}
                  onChange={(e) =>
                    handleLayerChange('layer2_branch_origin', e.target.value)
                  }
                  placeholder={prompts.layer2Placeholder}
                  className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
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
                  <label className="flex items-center gap-1.5 text-base font-black text-slate-800">
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

          {/* BƯỚC 3: THẺ XÁC NHẬN SẴN SÀNG */}
          {!effectiveQaLocked && isAllLayersComplete && (
            <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3.5 text-base font-bold text-emerald-800">
              <CheckCircle2 size={20} className="shrink-0 text-emerald-600" />
              <span>
                Bước 3: Đã hoàn tất {prompts.step3SummaryLabel} cho hồ sơ{' '}
                <strong>{selectedMember?.full_name}</strong>.{' '}
                {isMultiHome
                  ? 'Bác bấm nút "Gửi hồ sơ xin gia nhập dòng họ" bên dưới để hoàn tất.'
                  : 'Bác tiếp tục hoàn thiện thông tin tài khoản bên dưới để rà soát và gửi đơn.'}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export { ClaimMemberWizard, resolveVerificationPrompts, resolveMemberClanRelation };
export default ClaimMemberWizard;
