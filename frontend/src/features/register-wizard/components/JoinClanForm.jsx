/**
 * PATH       : frontend/src/features/register-wizard/components/JoinClanForm.jsx
 * OLD PATH   : src/features/auth/components/JoinClanForm.jsx
 * DATETIME   : 2026-11-20T06:20:00+07:00
 * VERSION    : EGAL-25.X. R6.4.0-PHASE2-SPRINT-FE2
 * DESCRIPTION:
 * - PURPOSE EGAL-25.X. R6.4.0-PHASE2-SPRINT-FE2 (IMPL-PLAN-FE-PHASE2-V1.8-ISO29148):
 *    1. Gắn useTurnstileFailClosed (src/shared/hooks/useTurnstileFailClosed.js) cho
 *       public search (/public/tenants/search & claim-search): tự động kích hoạt
 *       Turnstile khi nhận 403 TURNSTILE_REQUIRED/FAILED [NFR-02], tự động gọi lại
 *       API tối đa 1 lần sau khi tick xanh [TC-FE-12], và tự reset widget (không
 *       auto-retry) nếu CAPTCHA thất bại.
 *    2. Hiển thị nhãn ngoại tộc (Con dâu / Con rể) khi is_clan === false và khóa
 *       chọn sớm nếu is_claimed === true (kèm inline helper text >= 16px) [ARCH-03, TC-FE-15].
 *    3. Multi-Home Bypass OTP [FUNC-04, TC-FE-04]: Khi user.status === 'DA_DUYET'
 *       (hoặc isApprovedMultiHome), ẩn hoàn toàn UI bước/khối OTP và cho phép gửi
 *       hồ sơ gia nhập trực tiếp.
 *    4. Hợp nhất PersistentMessageBanner (kèm X-Correlation-Id fallback "Không có")
 *       và BlockingLoadingOverlay cho các lỗi Phase 2 (403 Claim-Hopping, 409 LCK
 *       Keep State, 409 Already Linked, 429 Rate Limit).
 * - PURPOSE EGAL-25.X. R6.3.2:
 *    Tích hợp bộ chọn quốc gia (COUNTRY_PHONE_OPTIONS) và chuẩn hóa số điện thoại quốc tế
 *    ITU-T E.164 bằng libphonenumber-js/min (validatePhoneWithCountry, detectPhoneCountry),
 *    đồng thời tương thích ngược 100% với số điện thoại Việt Nam (0xxxxxxxxx).
 * - PURPOSE EGAL-25.X. R6.2.2A:
 *    chỉ gỡ social preferred-channel khỏi JoinClanForm, thêm email optional,
 *    và giữ WaitingPage/payload ổn định.
 * - PURPOSE EGAL-24.6.7.R3.3: New doctrine:
 *    1. Keep `GuidedFieldWrapper` only as UI/AZ shell.
 *    2. User may freely touch/focus any AZ.
 *    3. Validation happens on submit only.
 *    4. Native browser validation must not block React validation (`noValidate`).
 * - Tuân thủ Q1/Q2/Q3/Q4.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Search,
  Loader2,
  Phone,
  LockKeyhole,
  Landmark,
  Eye,
  EyeOff,
  User,
  Mail,
  AlertCircle,
  ShieldCheck,
  LogIn,
  UserPlus,
} from 'lucide-react';

import AudioHelpButton from '../../elder-doctrine/components/AudioHelpButton.jsx';
import { ttsMessages } from '../../../features/elder-doctrine/constants/ttsMessages.js';

import GuidedFieldWrapper from '../../elder-doctrine/components/GuidedFieldWrapper.jsx';
import useGuidedFlow from '../../../shared/hooks/useGuidedFlow.js';

import {
  runValidationGate,
  buildValidationAttentionTarget,
} from '../../elder-doctrine/services/validationGate.service.js';

import {
  createInvalidationPlan,
  shouldClearOnlineValidation,
  shouldClearCompletedField,
} from '../../elder-doctrine/services/runtimeInvalidation.service.js';

import AttentionZone from '../../../components/AttentionZone.jsx';

import apiClient from '../../../lib/apiClient.js';
import { joinClanSchema } from '../utils/joinClanValidation.js';
import {
  COUNTRY_PHONE_OPTIONS,
  validatePhoneWithCountry,
  detectPhoneCountry,
} from '../../../shared/utils/validationRules.js';
import {
  resolveRevisionPhone,
  resolveRevisionEmail,
} from '../utils/identityHelpers.js';
import { useTts } from '../../../shared/hooks/useTts.js';
import ZoneVoiceButton from '../../elder-doctrine/components/ZoneVoiceButton.jsx';
import useCaptchaZone from '../../elder-doctrine/hooks/useCaptchaZone.js';
import CaptchaAttentionField from '../../elder-doctrine/components/CaptchaAttentionField.jsx';
import ClaimMemberWizard, {
  resolveMemberClanRelation,
} from '../../membership/components/ClaimMemberWizard.jsx';
import RegistrationProfileForm from '../../membership/components/RegistrationProfileForm.jsx';

// Sprint FE-1 & FE-2 Phase 2 Contracts, Banner, Overlay & Fail-Closed Turnstile Hook
import { CLAIM_MODES } from '../../onboarding/constants/onboardingPhase2Contracts.js';
import { getPhase2UserMessage } from '../../onboarding/constants/phase2MessageCatalog.js';
import PersistentMessageBanner from '../../../components/common/PersistentMessageBanner.jsx';
import BlockingLoadingOverlay from '../../../components/common/BlockingLoadingOverlay.jsx';
import CollapsibleDetailCard from '../../../components/common/CollapsibleDetailCard.jsx';
import useTurnstileFailClosed, {
  isTurnstileChallengeError,
  extractApiErrorInfo,
} from '../../../shared/hooks/useTurnstileFailClosed.js';

/**
 * Static option maps
 * - Chỉ phục vụ UI label/select.
 * - Không chứa business logic.
 */
const RELATIONSHIP_OPTIONS = [
  { value: '', label: 'Chọn quan hệ với dòng họ' },
  { value: 'CON_DE', label: 'Con đẻ' },
  { value: 'CON_DAU', label: 'Con dâu' },
  { value: 'CON_RE', label: 'Con rể' },
  { value: 'CON_NUOI', label: 'Con nuôi' },
  { value: 'CON_DO_DAU', label: 'Con đỡ đầu' },
  { value: 'KHAC', label: 'Khác' },
];

/**
 * PR-OP-4: chuẩn hóa draft revision / Waiting edit
 * - BE thường trả temp_birth_year dạng number → .trim() fail trong nextStep
 */
const normalizeJoinDraft = (data) => {
  if (!data || typeof data !== 'object') return data || {};
  const rp =
    data.registration_profile && typeof data.registration_profile === 'object'
      ? data.registration_profile
      : {};

  const resolvedFullName = data.temp_full_name ?? rp.full_name;
  const resolvedFatherName = data.temp_father_name ?? rp.father_name;
  const resolvedBirthYear = data.temp_birth_year ?? rp.birth_year;
  const resolvedRelationship =
    data.temp_relationship ?? rp.child_type ?? rp.temp_relationship;
  const resolvedNote = data.temp_note ?? rp.note;

  return {
    ...data,
    temp_full_name:
      resolvedFullName != null ? String(resolvedFullName) : '',
    temp_father_name:
      resolvedFatherName != null ? String(resolvedFatherName) : '',
    temp_birth_year:
      resolvedBirthYear != null && resolvedBirthYear !== ''
        ? String(resolvedBirthYear)
        : '',
    temp_relationship:
      resolvedRelationship != null ? String(resolvedRelationship) : '',
    temp_note: resolvedNote != null ? String(resolvedNote) : '',
    phone: data.phone != null ? String(data.phone) : '',
    email: data.email != null ? String(data.email) : '',
    password: data.password != null ? String(data.password) : '',
    tenantId: data.tenantId || data.tenant_id || '',
    clanName: data.clanName || '',
    tenantSlug: data.tenantSlug || '',
  };
};

const DEFAULT_UI_SYSTEM = {
  container: 'w-full space-y-6',
  section: 'space-y-4 rounded-3xl border border-slate-100 bg-white p-4 shadow-sm',
  label: 'text-sm font-black text-slate-700',
  input:
    'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100',
  select:
    'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100',
  buttonSecondary:
    'flex-1 rounded-3xl border border-slate-200 bg-white px-4 py-4 text-base font-black text-slate-700 transition hover:bg-slate-50',
  footer: 'flex gap-3 pt-8',
};

const JoinClanForm = ({
  onSubmit,
  loading = false,
  isSubmitting = false,
  onBackToRegister,
  uiSystem: uiSystemProp,
  onGoToWaiting,
  initialData = null,
  lifecycleContext = null,
  runtimeSessionId = 0,
  // PR-OP-4
  isRevision = false,
  reviewNote = '',
  lockedIdentifier = '',
  // Phase 2 Multi-Home Bypass OTP [FUNC-04, TC-FE-04]
  currentUser = null,
  isApprovedMultiHome = false,
  onNavigateToClan,
  onSwitchToLogin,
}) => {
  // Đọc phiên đăng nhập hiện có trên trình duyệt (prop currentUser hoặc JWT trong localStorage)
  const existingSessionUser = useMemo(() => {
    if (currentUser && typeof currentUser === 'object') {
      return currentUser;
    }
    if (typeof window === 'undefined') return null;
    try {
      const rawToken =
        window.localStorage.getItem('auth_token') ||
        window.localStorage.getItem('token');
      if (!rawToken || rawToken.split('.').length < 2) return null;
      const base64 = rawToken
        .split('.')[1]
        .replace(/-/g, '+')
        .replace(/_/g, '/');
      const jsonStr = decodeURIComponent(
        window
          .atob(base64)
          .split('')
          .map((c) => `%${`00${c.charCodeAt(0).toString(16)}`.slice(-2)}`)
          .join('')
      );
      const payload = JSON.parse(jsonStr);
      if (payload?.exp && Number(payload.exp) * 1000 <= Date.now()) {
        return null;
      }
      if (payload?.id || payload?.userId || payload?.sub || payload?.phone || payload?.email) {
        return {
          id: payload.id || payload.userId || payload.sub || '',
          name: payload.name || payload.full_name || '',
          phone: payload.phone || '',
          email: payload.email || '',
          status: payload.status || '',
          tenant_id: payload.tenant_id || payload.tenantId || '',
        };
      }
    } catch {
      return null;
    }
    return null;
  }, [currentUser]);
  const effectiveReviewNote = String(
    reviewNote || initialData?.reviewNote || ''
  ).trim();
  const uiSystem = uiSystemProp || DEFAULT_UI_SYSTEM;
  const effectiveLoading = loading || isSubmitting;

  /**
   * [FUNC-04, TC-FE-04] Multi-Home Bypass OTP:
   * Điều kiện kích hoạt: user.status === 'DA_DUYET'.
   * Hành vi: Ẩn hoàn toàn bước/khối xác thực OTP và cho phép submit trực tiếp.
   */
  const isMultiHomeBypassOtp = Boolean(
    isApprovedMultiHome ||
      currentUser?.status === 'DA_DUYET' ||
      lifecycleContext?.userStatus === 'DA_DUYET' ||
      initialData?.userStatus === 'DA_DUYET'
  );

  /**
   * Local UI state
   */
  const step = 1;
  const [searchKeyword, setSearchKeyword] = useState(initialData?.clanName || '');
  const [tenantResults, setTenantResults] = useState([]);
  const [tenantLoading, setTenantLoading] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState(
    initialData?.tenantId
      ? {
          id: initialData.tenantId,
          name: initialData.clanName,
          slug: initialData.tenantSlug || '',
        }
      : null,
  );

  // [AMEND-RP-OP-2026-02 V1.5.0 Lát 1] Phân nhánh C2: CLAIM_EM vs NEW_PROFILE_21
  const initialRegProfile =
    initialData?.registration_profile &&
    typeof initialData.registration_profile === 'object'
      ? initialData.registration_profile
      : {};

  const [claimMode, setClaimMode] = useState(() => {
    if (
      initialRegProfile.claim_mode === 'CLAIM_EM' ||
      initialRegProfile.claimed_member_id ||
      initialData?.claimed_member_id
    ) {
      return 'CLAIM_EM';
    }
    if (
      initialRegProfile.claim_mode === 'NEW_PROFILE_21' ||
      initialRegProfile.full_name ||
      initialData?.temp_full_name
    ) {
      return 'NEW_PROFILE_21';
    }
    return 'CLAIM_EM';
  });

  const [profileDraft, setProfileDraft] = useState(() => ({
    full_name: initialRegProfile.full_name || initialData?.temp_full_name || '',
    alias: initialRegProfile.alias || '',
    gender: initialRegProfile.gender || 'NAM',
    birth_day: initialRegProfile.birth_day ?? '',
    birth_month: initialRegProfile.birth_month ?? '',
    birth_year:
      initialRegProfile.birth_year ?? initialData?.temp_birth_year ?? '',
    birth_place: initialRegProfile.birth_place || '',
    is_alive:
      initialRegProfile.is_alive !== undefined
        ? initialRegProfile.is_alive
        : true,
    death_year: initialRegProfile.death_year ?? '',
    generation: initialRegProfile.generation ?? '',
    member_role: initialRegProfile.member_role || 'THANH_VIEN',
    branch_name:
      initialRegProfile.branch_name || initialData?.temp_branch_name || '',
    father_name:
      initialRegProfile.father_name || initialData?.temp_father_name || '',
    mother_name: initialRegProfile.mother_name || '',
    grandfather_name:
      initialRegProfile.grandfather_name ||
      initialData?.temp_grandfather_name ||
      '',
    grandmother_name: initialRegProfile.grandmother_name || '',
    address: initialRegProfile.address || initialData?.temp_address || '',
    note: initialRegProfile.note || initialData?.temp_note || '',
    temp_relationship:
      initialRegProfile.child_type ||
      initialRegProfile.temp_relationship ||
      initialData?.temp_relationship ||
      'CON_DE',
    social_profiles: initialRegProfile.social_profiles || {
      zalo: '',
      facebook: '',
    },
    proof_documents: Array.isArray(initialRegProfile.proof_documents)
      ? initialRegProfile.proof_documents
      : [],
    claimed_member_id:
      initialRegProfile.claimed_member_id ||
      initialData?.claimed_member_id ||
      '',
    claimed_member_summary:
      initialRegProfile.claim_verification?.claimed_member_summary ||
      initialRegProfile.claimed_member_summary ||
      null,
    claim_verification: initialRegProfile.claim_verification || {
      layer1_lineage: '',
      layer2_branch_origin: '',
      layer3_guarantor_note: '',
    },
    referrer_name:
      initialRegProfile.referrer_name ||
      initialRegProfile.referrer_info?.full_name ||
      initialData?.referrer_name ||
      '',
    referrer_phone:
      initialRegProfile.referrer_phone ||
      initialRegProfile.referrer_info?.phone ||
      initialData?.referrer_phone ||
      '',
    referrer_phone_country:
      initialRegProfile.referrer_phone_country ||
      detectPhoneCountry(
        initialRegProfile.referrer_phone || initialData?.referrer_phone,
        'VN'
      ),
  }));

  const [profileErrors, setProfileErrors] = useState({});

  // Trạng thái Phase 2: PersistentMessageBanner, Rate Limit 429, Claim-Hopping 403
  const [phase2Banner, setPhase2Banner] = useState(null);
  const [searchRateLimitSeconds, setSearchRateLimitSeconds] = useState(0);
  const [isClaimHoppingBlocked, setIsClaimHoppingBlocked] = useState(false);

  const [phoneCountry, setPhoneCountry] = useState(() =>
    initialData?.phoneCountry || detectPhoneCountry(initialData?.phone, 'VN')
  );
  const checkedPhoneCacheRef = useRef(null);
  const selectedCountryMeta = useMemo(
    () =>
      COUNTRY_PHONE_OPTIONS.find((c) => c.code === phoneCountry) ||
      COUNTRY_PHONE_OPTIONS[0],
    [phoneCountry]
  );

  const [phoneRemoteError, setPhoneRemoteError] = useState('');
  const [phoneChecking, setPhoneChecking] = useState(false);
  const [emailRemoteError, setEmailRemoteError] = useState('');
  const [emailChecking, setEmailChecking] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [attentionMessage, setAttentionMessage] = useState('');
  const { speak } = useTts();

  // Đếm ngược thời gian khóa tìm kiếm khi dính HTTP 429 [NFR-02]
  useEffect(() => {
    if (searchRateLimitSeconds <= 0) return undefined;
    const timer = setInterval(() => {
      setSearchRateLimitSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [searchRateLimitSeconds]);

  const speakMandatoryError = useCallback(
    (text, options = {}) => {
      if (!text) return false;

      return speak?.(text, {
        rate: 0.82,
        ...options,
      });
    },
    [speak],
  );

  /**
   * Shared captcha runtime (for final form submit)
   */
  const captchaZone = useCaptchaZone({
    zoneId: 'captcha',
    nextZone: 'submit',
    debugName: 'JOIN_CLAN',
    debug: import.meta.env.DEV || import.meta.env.VITE_DEBUG_MODE === 'true',
  });

  const speakCriticalAttention = useCallback(
    (message) => {
      if (!message) return;

      setAttentionMessage('');

      requestAnimationFrame(() => {
        setAttentionMessage(message);
        speakMandatoryError(message);
      });
    },
    [speakMandatoryError],
  );

  /**
   * Field refs for precise routing
   */
  const searchTimerRef = useRef(null);
  const lastPublicSearchKeywordRef = useRef('');
  const tenantSearchRef = useRef(null);
  const fullNameRef = useRef(null);
  const fatherNameRef = useRef(null);
  const birthYearRef = useRef(null);
  const relationshipRef = useRef(null);
  const noteRef = useRef(null);
  const phoneRef = useRef(null);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);

  const lastLifecycleVersionRef = useRef(lifecycleContext?.runtimeVersion || 0);
  const lastRuntimeSessionIdRef = useRef(null);

  // [UAT-IMP2] Refs & trạng thái điều phối từng Card tuần tự + Thu gọn / Mở ra
  const accountGateCardRef = useRef(null);
  const clanCardRef = useRef(null);
  const personalCardRef = useRef(null);
  const accountCardRef = useRef(null);

  const hasInitialDraft = Boolean(isRevision || initialData);
  const [accountGateConfirmed, setAccountGateConfirmed] = useState(hasInitialDraft);
  const [accountGateCollapsed, setAccountGateCollapsed] = useState(hasInitialDraft);
  const [clanCardCollapsed, setClanCardCollapsed] = useState(false);
  const [personalCardCollapsed, setPersonalCardCollapsed] = useState(false);
  const [accountCardCollapsed, setAccountCardCollapsed] = useState(false);
  const [childFocusRequest, setChildFocusRequest] = useState(null);

  // [UAT-IMP4 Mục 6b] Người giới thiệu trong họ bắt buộc nhập tự do (không tra cứu sổ họ)

  const JOIN_CLAN_EMPTY_VALUES = {
    tenantId: '',
    clanName: '',
    temp_full_name: '',
    temp_father_name: '',
    temp_birth_year: '',
    temp_relationship: '',
    temp_note: '',
    email: '',
    phone: '',
    password: '',
    hp_field: '',
  };

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    trigger,
    getValues,
    getFieldState,
    reset,
    clearErrors,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(joinClanSchema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: {
      ...JOIN_CLAN_EMPTY_VALUES,
      ...normalizeJoinDraft(initialData || {}),
    },
  });

  const formValues = watch();

  const showAzVoiceButton = (zoneId) => guidedFlow.activeField === zoneId;

  const selectedClanDisplayName = String(selectedTenant?.name || '').trim();

  const zoneHelpText = useMemo(
    () => ({
      clanSearch: ttsMessages?.joinClan?.clanSearch || 'Bác nhập tên dòng họ cần tìm.',
      personalInfo: selectedClanDisplayName
        ? `Nhận diện nhân thân trong dòng họ ${selectedClanDisplayName}. Bấm vào ô thứ nhất nếu bác đã có tên trong sổ họ ${selectedClanDisplayName} để tiếp tục khai báo. Bấm vào ô thứ hai nếu bác chưa có tên trong sổ họ ${selectedClanDisplayName} để tiếp tục khai báo.`
        : 'Nhận diện nhân thân trong dòng họ. Bấm vào ô thứ nhất nếu bác đã có tên trong sổ họ đã chọn để tiếp tục khai báo. Bấm vào ô thứ hai nếu bác chưa có tên trong sổ họ đã chọn để tiếp tục khai báo.',
      accountInfo:
        ttsMessages?.joinClan?.accountInfo ||
        'Bác nhập số điện thoại, email nếu có, và mật khẩu để tạo tài khoản đăng nhập.',
      captcha:
        ttsMessages?.joinClan?.captcha ||
        'Bác hãy bấm vào ô vuông. Khi thấy dấu tích màu xanh là đã xác nhận xong.',
      submit:
        ttsMessages?.joinClan?.submit || 'Bác bấm nút tiếp tục rà soát để kiểm tra lại hồ sơ.',
    }),
    [selectedClanDisplayName],
  );

  const guidedSteps = useMemo(
    () => [
      {
        fieldKey: 'clanSearch',
        title: 'Tìm dòng họ cần gia nhập',
        description: ttsMessages?.joinClan?.clanSearch || 'Bác nhập tên dòng họ cần tìm.',
        nextLabel: 'Tiếp theo: chọn đúng dòng họ.',
      },
      {
        fieldKey: 'personalInfo',
        title: 'Nhập thông tin cá nhân',
        description:
          ttsMessages?.joinClan?.personalInfo ||
          'Bác nhập thông tin cá nhân để Ban quản trị xác minh.',
        nextLabel: 'Tiếp theo: tạo thông tin đăng nhập.',
      },
      {
        fieldKey: 'accountInfo',
        title: 'Tạo thông tin đăng nhập',
        description:
          ttsMessages?.joinClan?.accountInfo ||
          'Bác nhập số điện thoại và mật khẩu để tạo tài khoản đăng nhập.',
        nextLabel: 'Tiếp theo: xác minh.',
      },
      {
        fieldKey: 'captcha',
        title: 'Xác minh',
        description:
          ttsMessages?.joinClan?.captcha ||
          'Bác hãy bấm vào ô vuông. Khi thấy dấu tích màu xanh là đã xác nhận xong.',
        nextLabel: 'Tiếp theo: rà soát hồ sơ.',
      },
      {
        fieldKey: 'submit',
        title: 'Rà soát hồ sơ',
        description:
          ttsMessages?.joinClan?.submit || 'Bác bấm nút tiếp tục rà soát để kiểm tra lại hồ sơ.',
        nextLabel: '',
      },
    ],
    [],
  );

  const guidedFlow = useGuidedFlow(guidedSteps, {
    initialStepIndex: 0,
    initialFieldKey: 'clanSearch',
    enabled: true,
    persistRecovery: false,
  });

  useEffect(() => {
    const isEditFromWaiting = !!initialData;

    if (!isEditFromWaiting) {
      reset(JOIN_CLAN_EMPTY_VALUES);
      setPhoneCountry('VN');
      checkedPhoneCacheRef.current = null;
      setSearchKeyword('');
      setTenantResults([]);
      setSelectedTenant(null);
      setClaimMode('CLAIM_EM');
      setIsClaimHoppingBlocked(false);
      setPhase2Banner(null);
      setProfileErrors({});
      setAccountGateConfirmed(false);
      setAccountGateCollapsed(false);
      setClanCardCollapsed(false);
      setPersonalCardCollapsed(false);
      setAccountCardCollapsed(false);
      setProfileDraft({
        full_name: '',
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
        referrer_name: '',
        referrer_phone: '',
        referrer_phone_country: 'VN',
      });
    }

    const isInitialMount = lastRuntimeSessionIdRef.current === null;
    lastRuntimeSessionIdRef.current = runtimeSessionId;

    // UAT Bug 3.2: Đưa màn hình về đầu trang khi mở form đăng ký gia nhập
    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }

    // UAT Bug 3.1: Chỉ remount Turnstile khi runtimeSessionId thực sự thay đổi sau lần mount đầu,
    // tránh hủy ngang iframe normal?lang=auto vừa khởi tạo.
    if (!isInitialMount) {
      captchaZone.reset({
        reason: 'runtime-reset',
        remount: true,
      });
    }

    setAttentionMessage('');
    setPhoneRemoteError('');
    setPhoneChecking(false);

    if (guidedFlow.resetGuidedFlow) {
      guidedFlow.resetGuidedFlow();
    } else if (guidedFlow.resetFlow) {
      guidedFlow.resetFlow();
    }

    guidedFlow.goToField('clanSearch');

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtimeSessionId]);

  useEffect(() => {
    const nextVersion = lifecycleContext?.runtimeVersion || 0;
    const versionChanged = nextVersion !== lastLifecycleVersionRef.current;
    const shouldReconstruct =
      lifecycleContext?.reconstructRuntime === true ||
      lifecycleContext?.reentryContext?.resetRuntime === true;

    if (versionChanged && shouldReconstruct) {
      setAttentionMessage('');
      setPhoneRemoteError('');
      setPhoneChecking(false);
      checkedPhoneCacheRef.current = null;
      setEmailRemoteError('');
      setEmailChecking(false);

      if (guidedFlow.resetGuidedFlow) {
        guidedFlow.resetGuidedFlow();
      } else if (guidedFlow.resetFlow) {
        guidedFlow.resetFlow();
      }

      guidedFlow.goToField('clanSearch');
    }

    lastLifecycleVersionRef.current = nextVersion;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lifecycleContext?.runtimeVersion]);

  useEffect(() => {
    if (!initialData) return;

    const n = normalizeJoinDraft(initialData);
    if (n.phone || initialData?.phoneCountry) {
      setPhoneCountry(
        initialData?.phoneCountry || detectPhoneCountry(n.phone, 'VN')
      );
      checkedPhoneCacheRef.current = null;
    }

    if (n.tenantId && n.clanName) {
      setSelectedTenant({
        id: n.tenantId,
        name: n.clanName,
        slug: n.tenantSlug || '',
      });
      setValue('tenantId', n.tenantId, { shouldValidate: false });
      setValue('clanName', n.clanName, { shouldValidate: false });
      setSearchKeyword(n.clanName || '');
    }

    [
      'temp_full_name',
      'temp_father_name',
      'temp_birth_year',
      'temp_relationship',
      'temp_note',
      'phone',
      'email',
      'password',
    ].forEach((key) => {
      if (n[key] !== undefined && n[key] !== '') {
        setValue(key, n[key], { shouldValidate: false, shouldDirty: false });
      }
    });

    const rp =
      initialData?.registration_profile &&
      typeof initialData.registration_profile === 'object'
        ? initialData.registration_profile
        : {};
    if (rp.claim_mode === 'CLAIM_EM' || rp.claimed_member_id) {
      setClaimMode('CLAIM_EM');
    } else if (rp.claim_mode === 'NEW_PROFILE_21' || rp.full_name) {
      setClaimMode('NEW_PROFILE_21');
    }
    setProfileDraft((prev) => ({
      ...prev,
      ...rp,
      full_name: rp.full_name || n.temp_full_name || prev.full_name,
      father_name: rp.father_name || n.temp_father_name || prev.father_name,
      birth_year: rp.birth_year ?? n.temp_birth_year ?? prev.birth_year,
      note: rp.note || n.temp_note || prev.note,
      temp_relationship:
        rp.child_type ||
        rp.temp_relationship ||
        n.temp_relationship ||
        prev.temp_relationship,
      claimed_member_summary:
        rp.claim_verification?.claimed_member_summary ||
        rp.claimed_member_summary ||
        prev.claimed_member_summary,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData, setValue]);

  const applyInvalidationPlan = useCallback(
    (plan) => {
      if (!plan?.invalidated) return;

      if (shouldClearOnlineValidation(plan, 'phone')) {
        setPhoneRemoteError('');
        setPhoneChecking(false);
      }

      ['clanSearch', 'personalInfo', 'accountInfo', 'captcha'].forEach((fieldKey) => {
        if (shouldClearCompletedField(plan, fieldKey)) {
          guidedFlow.unmarkCompleted(fieldKey);
        }
      });

      if (plan.affectedZones?.[0]) {
        guidedFlow.goToField(plan.affectedZones[0]);
      }
    },
    [guidedFlow],
  );

  const invalidateRuntimeForField = useCallback(
    (fieldKey) => {
      const plan = createInvalidationPlan([fieldKey]);
      applyInvalidationPlan(plan);
    },
    [applyInvalidationPlan],
  );

  const clearFieldErrorOnEdit = useCallback(
    (fieldName, options = {}) => {
      clearErrors(fieldName);
      setAttentionMessage('');

      if (options.clearPhoneRemoteError) {
        checkedPhoneCacheRef.current = null;
        setPhoneRemoteError('');
      }
      if (options.clearEmailRemoteError) {
        setEmailRemoteError('');
      }

      invalidateRuntimeForField(options.invalidateField || fieldName);
    },
    [clearErrors, invalidateRuntimeForField],
  );

  const focusFieldByName = useCallback((fieldName) => {
    const normalizeKeyMap = {
      temp_full_name: 'full_name',
      temp_father_name: 'father_name',
      temp_birth_year: 'birth_year',
      temp_note: 'note',
    };
    const resolvedKey = normalizeKeyMap[fieldName] || fieldName;

    const personalFieldSet = new Set([
      'personalInfo',
      'full_name',
      'alias',
      'birth_year',
      'birth_place',
      'father_name',
      'mother_name',
      'grandfather_name',
      'grandmother_name',
      'branch_name',
      'temp_relationship',
      'address',
      'referrer_name',
      'referrer_phone',
      'note',
      'claimed_member_id',
      'layer1_lineage',
      'layer2_branch_origin',
      'layer3_guarantor_note',
    ]);

    const accountFieldSet = new Set([
      'accountInfo',
      'phone',
      'email',
      'password',
    ]);

    // 1. Tự động mở Card cha tương ứng nếu đang thu gọn [UAT-Bug 6]
    if (['clanSearch', 'tenantId', 'clanName'].includes(resolvedKey)) {
      setClanCardCollapsed(false);
    } else if (personalFieldSet.has(resolvedKey)) {
      setPersonalCardCollapsed(false);
      setChildFocusRequest({ field: resolvedKey, tick: Date.now() });
    } else if (accountFieldSet.has(resolvedKey)) {
      setAccountCardCollapsed(false);
    }

    const refMap = {
      clanSearch: tenantSearchRef,
      tenantId: tenantSearchRef,
      clanName: tenantSearchRef,
      phone: phoneRef,
      email: emailRef,
      password: passwordRef,
    };

    // 2. Chờ Card mở xong rồi cuộn mượt tới đúng field và đặt con trỏ nhập liệu
    window.setTimeout(() => {
      const targetEl =
        refMap[resolvedKey]?.current ||
        document.querySelector(`[data-field-key="${resolvedKey}"]`) ||
        (personalFieldSet.has(resolvedKey) ? personalCardRef.current : null) ||
        (accountFieldSet.has(resolvedKey) ? accountCardRef.current : null) ||
        clanCardRef.current;

      if (targetEl) {
        targetEl.scrollIntoView?.({
          behavior: 'smooth',
          block: 'center',
        });
        targetEl.focus?.({
          preventScroll: true,
        });
      }
    }, 160);
  }, []);

  const routeFieldError = useCallback(
    (fieldName, message, attentionField) => {
      const finalMessage =
        message || 'Thông tin hồ sơ chưa đầy đủ hoặc chưa đúng. Bác vui lòng kiểm tra lại.';

      setAttentionMessage('');

      requestAnimationFrame(() => {
        setAttentionMessage(finalMessage);

        if (attentionField) {
          guidedFlow.goToField(attentionField);
        }

        focusFieldByName(fieldName || attentionField);

        window.setTimeout(() => {
          speakMandatoryError(finalMessage);
        }, 250);
      });
    },
    [focusFieldByName, guidedFlow, speakMandatoryError],
  );

  /**
   * [NFR-02, TC-FE-12] Public Search dòng họ tích hợp Turnstile Fail-Closed:
   * - Gửi kèm header 'X-Turnstile-Token' nếu đã có token từ useTurnstileFailClosed.
   * - Khi gặp 403 TURNSTILE_REQUIRED / FAILED -> hiển thị widget Turnstile và thông báo qua
   *   PersistentMessageBanner; sau khi tick xanh tự động gọi lại tối đa 1 lần.
   * - Khi gặp 429 *_RATE_LIMITED -> giữ nguyên từ khóa (Keep State), khóa ô tìm kiếm theo giây chờ.
   */
  const searchTenantRef = useRef(null);

  const publicSearchTurnstile = useTurnstileFailClosed({
    onVerifySuccess: (verifiedToken) => {
      if (lastPublicSearchKeywordRef.current && searchTenantRef.current) {
        searchTenantRef.current(lastPublicSearchKeywordRef.current, {
          turnstileToken: verifiedToken,
          isAutoRetry: true,
        });
      }
    },
    onVerifyError: (captchaErr) => {
      // TC-FE-12 Scenario 2: Báo lỗi qua PersistentMessageBanner, reset widget, KHÔNG auto-retry
      const msgObj = getPhase2UserMessage('TURNSTILE_FAILED', {
        message: captchaErr?.message,
      });
      setPhase2Banner({
        type: msgObj.type,
        title: msgObj.title,
        message: msgObj.message,
      });
    },
  });

  // Giữ ref ổn định cho Turnstile & RateLimit để searchTenant không bao giờ bị tái tạo gây loop
  const publicSearchTurnstileRef = useRef(publicSearchTurnstile);
  publicSearchTurnstileRef.current = publicSearchTurnstile;
  const searchRateLimitSecondsRef = useRef(searchRateLimitSeconds);
  searchRateLimitSecondsRef.current = searchRateLimitSeconds;

  const searchTenant = useCallback(async (keyword, options = {}) => {
    const { turnstileToken: overrideToken, isAutoRetry = false } = options;
    const q = keyword?.trim();

    if (!q || q.length < 2) {
      setTenantResults([]);
      return;
    }

    if (searchRateLimitSecondsRef.current > 0 && !isAutoRetry) {
      return;
    }

    lastPublicSearchKeywordRef.current = q;
    const turnstileCtrl = publicSearchTurnstileRef.current;

    // Nếu widget Turnstile đang mở chờ người dùng tích và chưa có token mới,
    // lưu từ khóa mới vào ref và đợi người dùng tick xanh thay vì bắn request 403 lặp lại.
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

    setTenantLoading(true);
    const activeToken =
      overrideToken || turnstileCtrl?.turnstileToken || '';
    const requestHeaders = activeToken
      ? { 'X-Turnstile-Token': activeToken }
      : {};

    try {
      const res = await apiClient.get('/public/tenants/search', {
        params: { q },
        headers: requestHeaders,
      });
      setTenantResults(res.data?.data || []);
      publicSearchTurnstileRef.current?.dismissChallenge?.();
    } catch (err) {
      const info = extractApiErrorInfo(err);

      // 1. Bắt 403 Turnstile Fail-Closed [NFR-02, TC-FE-12]
      if (isTurnstileChallengeError(err)) {
        const msgObj = getPhase2UserMessage('TURNSTILE_REQUIRED', {
          message: info.message,
        });
        publicSearchTurnstileRef.current?.triggerChallenge?.();
        setPhase2Banner({
          type: msgObj.type,
          title: msgObj.title,
          message: msgObj.message,
        });
        setTenantResults([]);
        return;
      }

      // 2. Bắt 429 Rate Limit [NFR-02, ARCH-01]
      if (info.status === 429) {
        const retryAfter = Number(
          info.details?.retryAfter || info.details?.retry_after || 30
        );
        const msgObj = getPhase2UserMessage('PUBLIC_SEARCH_RATE_LIMITED', {
          message: info.message,
        });
        setSearchRateLimitSeconds(retryAfter > 0 ? retryAfter : 30);
        setPhase2Banner({
          type: msgObj.type,
          title: msgObj.title,
          message: msgObj.message,
        });
        return;
      }

      // 3. Mọi lỗi còn lại (kể cả CORS / Network Error): dừng tại 1 request duy nhất
      const msgObj = getPhase2UserMessage(info.code, {
        message: info.message,
      });
      setTenantResults([]);
      setPhase2Banner({
        type: msgObj.type,
        title: msgObj.title,
        message: msgObj.message,
      });
    } finally {
      setTenantLoading(false);
    }
  }, []);

  useEffect(() => {
    searchTenantRef.current = searchTenant;
  }, [searchTenant]);

  useEffect(() => {
    if (selectedTenant || isRevision) return undefined;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    searchTimerRef.current = setTimeout(() => {
      searchTenant(searchKeyword);
    }, 450);

    return () => clearTimeout(searchTimerRef.current);
  }, [searchKeyword, selectedTenant, isRevision, searchTenant]);

  /**
   * Online phone uniqueness check theo quốc gia đã chọn (libphonenumber-js/min)
   */
  const checkPhoneAvailability = async (phone, options = {}) => {
    const { force = false, showFormatError = false, countryOverride } = options;
    const activeCountry = countryOverride || phoneCountry;
    const raw = String(phone || '').trim();

    if (!raw) {
      checkedPhoneCacheRef.current = null;
      setPhoneRemoteError('');
      return {
        valid: false,
        message: '',
      };
    }

    const phoneFormat = validatePhoneWithCountry(raw, activeCountry);
    if (!phoneFormat.valid) {
      checkedPhoneCacheRef.current = null;
      setPhoneRemoteError(showFormatError ? phoneFormat.message : '');
      return {
        valid: false,
        message: phoneFormat.message,
      };
    }

    const normalizedPhone = phoneFormat.normalized;
    const cached = checkedPhoneCacheRef.current;
    if (!force && cached && cached.value === normalizedPhone) {
      setPhoneRemoteError(cached.valid ? '' : cached.message);
      return {
        valid: cached.valid,
        normalized: normalizedPhone,
        message: cached.message,
      };
    }

    setPhoneChecking(true);

    try {
      const res = await apiClient.get('/auth/check-identity', {
        params: { type: 'phone', value: normalizedPhone, country: activeCountry },
      });

      if (res.data?.available === false) {
        const message =
          res.data?.message || 'Số điện thoại này đã được sử dụng.';
        checkedPhoneCacheRef.current = {
          value: normalizedPhone,
          valid: false,
          message,
        };
        setPhoneRemoteError(message);
        setAttentionMessage(message);

        guidedFlow.goToField('accountInfo');

        window.setTimeout(() => {
          phoneRef?.current?.scrollIntoView?.({
            behavior: 'smooth',
            block: 'center',
          });

          phoneRef?.current?.focus?.({
            preventScroll: true,
          });

          speakMandatoryError(message);
        }, 180);

        return {
          valid: false,
          normalized: normalizedPhone,
          message,
        };
      }

      checkedPhoneCacheRef.current = {
        value: normalizedPhone,
        valid: true,
        message: '',
      };
      setPhoneRemoteError('');

      return {
        valid: true,
        normalized: normalizedPhone,
        message: '',
      };
    } catch (err) {
      console.error('[JoinClan][checkPhoneAvailability]', err);
      checkedPhoneCacheRef.current = null;
      const info = extractApiErrorInfo(err);
      const message =
        info.status === 429
          ? 'Bác thao tác kiểm tra hơi nhanh. Vui lòng đợi vài giây rồi thử lại.'
          : 'Không kiểm tra được số điện thoại lúc này. Bác vui lòng thử lại.';
      setPhoneRemoteError(message);
      setAttentionMessage(message);
      return {
        valid: false,
        message,
      };
    } finally {
      setPhoneChecking(false);
    }
  };

  const checkEmailAvailability = async (email) => {
    const normalizedEmail = String(email || '').trim();

    if (!normalizedEmail) {
      setEmailRemoteError('');
      return {
        valid: true,
        message: '',
      };
    }

    setEmailChecking(true);

    try {
      const res = await apiClient.get('/auth/check-identity', {
        params: { type: 'email', value: normalizedEmail },
      });

      if (res.data?.available === false) {
        const message = 'Email này đã được sử dụng.';

        setEmailRemoteError(message);
        setAttentionMessage(message);

        guidedFlow.goToField('accountInfo');

        window.setTimeout(() => {
          emailRef?.current?.scrollIntoView?.({
            behavior: 'smooth',
            block: 'center',
          });

          emailRef?.current?.focus?.({
            preventScroll: true,
          });

          speakMandatoryError(message);
        }, 180);

        return {
          valid: false,
          message,
        };
      }

      setEmailRemoteError('');

      return {
        valid: true,
        message: '',
      };
    } catch (err) {
      console.error('[JoinClan][checkEmailAvailability]', err);
      const info = extractApiErrorInfo(err);
      const message =
        info.status === 429
          ? 'Bác thao tác kiểm tra hơi nhanh. Vui lòng đợi vài giây rồi thử lại.'
          : 'Không kiểm tra được email lúc này. Bác vui lòng thử lại.';
      setEmailRemoteError(message);
      setAttentionMessage(message);
      return {
        valid: false,
        message,
      };
    } finally {
      setEmailChecking(false);
    }
  };

  const handleSelectTenant = (tenant) => {
    setSelectedTenant(tenant);
    setValue('tenantId', tenant.id, {
      shouldValidate: true,
      shouldDirty: true,
    });
    setValue('clanName', tenant.name, {
      shouldValidate: true,
      shouldDirty: true,
    });

    // Reset lựa chọn thành viên cũ nếu đổi sang dòng họ khác (giữ nguyên thông tin người giới thiệu đã nhập)
    setProfileDraft((prev) => ({
      ...prev,
      claimed_member_id: '',
      claimed_member_summary: null,
    }));

    setAttentionMessage('');
    setPersonalCardCollapsed(false);

    guidedFlow.markCompleted('clanSearch');
    guidedFlow.goToField('personalInfo');

    // [UAT-IMP2] Giữ nguyên Card 1 phía trên, mở Card 2 và cuộn mượt tới Card 2
    window.setTimeout(() => {
      personalCardRef.current?.scrollIntoView?.({
        behavior: 'smooth',
        block: 'start',
      });
    }, 120);
  };

  // [UAT-IMP2] Kiểm soát hoàn thành từng Card trước khi mở Card tiếp theo
  const isCard1Complete = Boolean(selectedTenant?.id && selectedTenant?.name);

  const isCard2Complete = useMemo(() => {
    if (!isCard1Complete) return false;
    const rName = String(profileDraft.referrer_name || '').trim();
    const rPhone = String(profileDraft.referrer_phone || '').trim();
    const rCountry = profileDraft.referrer_phone_country || 'VN';
    if (!rName || !rPhone) return false;
    if (!validatePhoneWithCountry(rPhone, rCountry).valid) return false;

    if (claimMode === 'CLAIM_EM') {
      if (isClaimHoppingBlocked) return false;
      const emId = String(profileDraft.claimed_member_id || '').trim();
      const ver = profileDraft.claim_verification || {};
      const l1 = String(ver.layer1_lineage || '').trim();
      const l2 = String(ver.layer2_branch_origin || '').trim();
      const l3 = String(ver.layer3_guarantor_note || '').trim();
      return Boolean(emId && l1 && l2 && l3);
    }
    const fName = String(profileDraft.full_name || '').trim();
    const faName = String(profileDraft.father_name || '').trim();
    const bYearRaw = String(profileDraft.birth_year ?? '').trim();
    const noteText = String(profileDraft.note || '').trim();
    const rel = String(profileDraft.temp_relationship || 'CON_DE').trim();
    if (!fName || !faName || !rel || noteText.length <= 10) return false;
    if (bYearRaw && !/^\d{4}$/.test(bYearRaw)) return false;
    return true;
  }, [isCard1Complete, claimMode, isClaimHoppingBlocked, profileDraft]);

  // Tự động mở & định vị Card 3 ("Thông tin tài khoản đăng nhập") khi Card 1 & Card 2 hoàn tất
  const prevCard2CompleteRef = useRef(isCard2Complete);
  useEffect(() => {
    const justCompleted = isCard2Complete && !prevCard2CompleteRef.current;
    prevCard2CompleteRef.current = isCard2Complete;

    if (!justCompleted) return undefined;

    setAccountCardCollapsed(false);
    guidedFlow.markCompleted('personalInfo');
    guidedFlow.goToField('accountInfo');

    const scrollTimer = window.setTimeout(() => {
      accountCardRef.current?.scrollIntoView?.({
        behavior: 'smooth',
        block: 'start',
      });
    }, 550);

    return () => window.clearTimeout(scrollTimer);
  }, [isCard2Complete, guidedFlow]);

  // [UAT-IMP2] Kiểm soát điều kiện mở khóa nút "Tiếp tục rà soát →"
  const reviewGateStatus = useMemo(() => {
    if (effectiveLoading || phoneChecking || emailChecking) {
      return {
        enabled: false,
        reason: 'Hệ thống đang kiểm tra thông tin, bác vui lòng đợi giây lát...',
      };
    }
    if (!isCard1Complete) {
      return {
        enabled: false,
        reason: 'Bác vui lòng hoàn thành Bước 1 (chọn dòng họ gia nhập).',
      };
    }
    if (!isCard2Complete) {
      return {
        enabled: false,
        reason: 'Bác vui lòng hoàn thành đầy đủ Bước 2 (nhận diện nhân thân).',
      };
    }
    const rawPhone = String(formValues.phone || '').trim();
    if (!rawPhone) {
      return {
        enabled: false,
        reason: 'Bác vui lòng nhập số điện thoại đăng nhập ở Bước 3.',
      };
    }
    if (!isRevision) {
      const phoneFmt = validatePhoneWithCountry(rawPhone, phoneCountry);
      if (!phoneFmt.valid) {
        return {
          enabled: false,
          reason: phoneFmt.message || 'Bác vui lòng nhập số điện thoại đúng định dạng.',
        };
      }
      if (phoneRemoteError) {
        return {
          enabled: false,
          reason: phoneRemoteError,
        };
      }
    }
    const rawEmail = String(formValues.email || '').trim();
    if (rawEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      return {
        enabled: false,
        reason: 'Email chưa đúng định dạng (ví dụ: ten@gmail.com).',
      };
    }
    if (!isRevision && emailRemoteError) {
      return {
        enabled: false,
        reason: emailRemoteError,
      };
    }
    if (!String(formValues.password || '').trim()) {
      return {
        enabled: false,
        reason: 'Bác vui lòng nhập mật khẩu đăng nhập ở Bước 3.',
      };
    }
    const isCaptchaDone = Boolean(
      guidedFlow.isCompleted('captcha') ||
        captchaZone?.isVerified ||
        captchaZone?.getToken?.()
    );
    if (!isCaptchaDone) {
      return {
        enabled: false,
        reason: 'Bác vui lòng tích vào ô xác minh bảo mật phía trên để mở nút Tiếp tục rà soát.',
      };
    }
    return {
      enabled: true,
      reason: '',
    };
  }, [
    effectiveLoading,
    phoneChecking,
    emailChecking,
    isCard1Complete,
    isCard2Complete,
    formValues.phone,
    formValues.email,
    formValues.password,
    isRevision,
    phoneCountry,
    phoneRemoteError,
    emailRemoteError,
    guidedFlow,
    captchaZone,
  ]);

  const hasCoreRequiredData = (values) => {
    return (
      !!selectedTenant?.id &&
      !!selectedTenant?.name &&
      !!values?.temp_full_name?.trim?.() &&
      !!values?.temp_father_name?.trim?.() &&
      !!values?.temp_birth_year?.trim?.() &&
      !!values?.temp_relationship &&
      !!values?.temp_note?.trim?.() &&
      !!values?.phone?.trim?.() &&
      !!values?.password?.trim?.()
    );
  };

  const getAttentionFieldFromGate = (gateTarget, values) => {
    if (gateTarget?.field === 'tenantId' || gateTarget?.field === 'clanName') {
      return 'clanSearch';
    }
    if (
      ['temp_full_name', 'temp_father_name', 'temp_relationship', 'temp_note'].includes(
        gateTarget?.field,
      )
    ) {
      return 'personalInfo';
    }

    if (['phone', 'email', 'password'].includes(gateTarget?.field)) {
      return 'accountInfo';
    }

    if (!selectedTenant?.id) return 'clanSearch';
    if (
      !values?.temp_full_name?.trim?.() ||
      !values?.temp_father_name?.trim?.() ||
      !values?.temp_relationship ||
      !values?.temp_note?.trim?.()
    ) {
      return 'personalInfo';
    }

    return 'accountInfo';
  };

  /**
   * Xử lý lỗi nghiệp vụ Phase 2 khi submit (403 Claim-Hopping, 409 LCK Keep State, 409 Already Linked)
   */
  const handleSubmissionApiError = useCallback(
    (err) => {
      const info = extractApiErrorInfo(err);

      // 1. [NFR-03, TC-FE-13] 403 CLAIM_HOPPING_DETECTED: khóa CLAIM_EXISTING, gợi ý CREATE_NEW
      if (info.status === 403 && info.code === 'CLAIM_HOPPING_DETECTED') {
        const msgObj = getPhase2UserMessage('CLAIM_HOPPING_DETECTED', {
          message: info.message,
        });
        setIsClaimHoppingBlocked(true);
        setPhase2Banner({
          type: msgObj.type,
          title: msgObj.title,
          message: msgObj.message,
          actionButton: (
            <button
              type="button"
              onClick={() => {
                setClaimMode('NEW_PROFILE_21');
                setProfileErrors({});
                setPhase2Banner(null);
                guidedFlow.goToField('personalInfo');
              }}
              className="min-h-[48px] h-12 rounded-xl bg-indigo-600 px-5 text-base font-bold text-white hover:bg-indigo-700 whitespace-nowrap"
            >
              Chuyển sang Khai báo hồ sơ mới
            </button>
          ),
        });
        return;
      }

      // 2. [FUNC-06, TC-FE-06] 409 ALREADY_LINKED_TO_TENANT: nút chuyển thẳng vào dòng họ
      if (info.status === 409 && info.code === 'ALREADY_LINKED_TO_TENANT') {
        setPhase2Banner({
          type: 'warning',
          title: 'Tài khoản đã liên kết với dòng họ này',
          message: info.message,
          correlationId: info.correlationId,
          actionButton:
            typeof onNavigateToClan === 'function' ? (
              <button
                type="button"
                onClick={() => onNavigateToClan(selectedTenant?.id)}
                className="min-h-[48px] rounded-xl bg-emerald-600 px-4 py-2.5 text-base font-bold text-white hover:bg-emerald-700"
              >
                Vào không gian dòng họ
              </button>
            ) : null,
        });
        return;
      }

      // 3. [ARCH-01, ARCH-04, TC-FE-14] 409 CONCURRENT_TRANSACTION_LOCKED / 429:
      // Giữ nguyên toàn bộ form state, hiện nút "Thử lại ngay"
      setPhase2Banner({
        type: info.status === 409 || info.status === 429 ? 'warning' : 'error',
        title:
          info.status === 409
            ? 'Hồ sơ đang được xử lý đồng thời'
            : 'Không thể gửi hồ sơ gia nhập',
        message: info.message,
        correlationId: info.correlationId,
        actionButton: (
          <button
            type="button"
            onClick={() => nextStep()}
            className="min-h-[48px] rounded-xl bg-amber-600 px-4 py-2.5 text-base font-bold text-white hover:bg-amber-700"
          >
            Thử lại ngay
          </button>
        ),
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [guidedFlow, onNavigateToClan, selectedTenant?.id]
  );

  /**
   * Submit-gated transition to WaitingPage / Direct Submit (Bypass OTP)
   */
  const nextStep = async () => {
    if (selectedTenant?.id) {
      setValue('tenantId', selectedTenant.id, {
        shouldValidate: true,
        shouldDirty: true,
      });
    }

    if (selectedTenant?.name) {
      setValue('clanName', selectedTenant.name, {
        shouldValidate: true,
        shouldDirty: true,
      });
    }

    setValue('hp_field', formValues.hp_field || '', {
      shouldValidate: true,
      shouldDirty: false,
    });

    const latestValues = {
      ...getValues(),
      tenantId: selectedTenant?.id || '',
      clanName: selectedTenant?.name || '',
      tenantSlug: selectedTenant?.slug || '',
      hp_field: formValues.hp_field || '',
    };

    latestValues.temp_birth_year =
      latestValues.temp_birth_year != null && latestValues.temp_birth_year !== ''
        ? String(latestValues.temp_birth_year).trim()
        : '';
    latestValues.temp_full_name = String(latestValues.temp_full_name || '').trim();
    latestValues.temp_father_name = String(latestValues.temp_father_name || '').trim();
    latestValues.temp_note = String(latestValues.temp_note || '').trim();
    latestValues.temp_relationship = String(latestValues.temp_relationship || '').trim();
    latestValues.phone = String(latestValues.phone || '').trim();
    latestValues.email =
      latestValues.email != null && latestValues.email !== ''
        ? String(latestValues.email).trim()
        : '';

    if (isRevision) {
      latestValues.phone = resolveRevisionPhone(
        lockedIdentifier,
        initialData,
        latestValues.phone
      );
      latestValues.email = resolveRevisionEmail(
        lockedIdentifier,
        initialData,
        latestValues.email
      );
      setValue('phone', latestValues.phone, { shouldValidate: false });
      if (latestValues.email) {
        setValue('email', latestValues.email, { shouldValidate: false });
      }
      if (!selectedTenant?.id && initialData?.tenantId) {
        setSelectedTenant({
          id: initialData.tenantId,
          name: initialData.clanName || '',
          slug: initialData.tenantSlug || '',
        });
      }
    }

    if (!selectedTenant?.id) {
      routeFieldError('clanSearch', 'Bác vui lòng chọn đúng dòng họ cần gia nhập.', 'clanSearch');
      return;
    }

    if (claimMode === 'CLAIM_EM' && isClaimHoppingBlocked) {
      const msg =
        'Chức năng nhận diện thành viên có sẵn đang tạm khóa do bị từ chối nhiều lần trong 90 ngày. Bác vui lòng chuyển sang "Khai báo hồ sơ mới".';
      routeFieldError('personalInfo', msg, 'personalInfo');
      return;
    }

    setProfileErrors({});

    // [UAT-IMP4 Mục 6b] Bắt buộc (*) Họ & tên + Số điện thoại người giới thiệu trong họ
    const rawReferrerName = String(profileDraft.referrer_name || '').trim();
    const rawReferrerPhone = String(profileDraft.referrer_phone || '').trim();
    const refCountry = profileDraft.referrer_phone_country || 'VN';

    if (!rawReferrerName) {
      const msg = 'Bác vui lòng nhập họ và tên người giới thiệu trong họ.';
      setProfileErrors({ referrer_name: msg });
      routeFieldError('referrer_name', msg, 'personalInfo');
      return;
    }
    if (!rawReferrerPhone) {
      const msg = 'Bác vui lòng nhập số điện thoại của người giới thiệu trong họ.';
      setProfileErrors({ referrer_phone: msg });
      routeFieldError('referrer_phone', msg, 'personalInfo');
      return;
    }
    const refPhoneFormatCheck = validatePhoneWithCountry(
      rawReferrerPhone,
      refCountry
    );
    if (!refPhoneFormatCheck.valid) {
      const msg =
        refPhoneFormatCheck.message ||
        'Số điện thoại người giới thiệu chưa đúng định dạng.';
      setProfileErrors({ referrer_phone: msg });
      routeFieldError('referrer_phone', msg, 'personalInfo');
      return;
    }
    const normalizedReferrerPhone = refPhoneFormatCheck.normalized;

    if (claimMode === 'CLAIM_EM') {
      const emId = String(profileDraft.claimed_member_id || '').trim();
      const emSummary = profileDraft.claimed_member_summary || {};
      const ver = profileDraft.claim_verification || {};
      const l1 = String(ver.layer1_lineage || '').trim();
      const l2 = String(ver.layer2_branch_origin || '').trim();
      const l3 = String(ver.layer3_guarantor_note || '').trim();

      if (!emId) {
        const msg =
          'Bác vui lòng tìm và chọn hồ sơ của mình trên cây gia phả (hoặc chuyển sang Khai báo mới).';
        setProfileErrors({ claimed_member_id: msg });
        routeFieldError('claimed_member_id', msg, 'personalInfo');
        return;
      }
      if (!l1) {
        const msg = 'Bác vui lòng nhập Lớp 1 gia mật (họ tên Cha/Mẹ/Ông nội hoặc ngày giỗ tổ).';
        setProfileErrors({ layer1_lineage: msg });
        routeFieldError('layer1_lineage', msg, 'personalInfo');
        return;
      }
      if (!l2) {
        const msg = 'Bác vui lòng nhập Lớp 2 gia mật (tên Chi/Phái hoặc quê quán gia đình).';
        setProfileErrors({ layer2_branch_origin: msg });
        routeFieldError('layer2_branch_origin', msg, 'personalInfo');
        return;
      }
      if (!l3) {
        const msg = 'Bác vui lòng nhập Lớp 3 gia mật (người bảo lãnh trong họ hoặc lời nhắn xác minh).';
        setProfileErrors({ layer3_guarantor_note: msg });
        routeFieldError('layer3_guarantor_note', msg, 'personalInfo');
        return;
      }

      const mappedFullName = String(emSummary.full_name || profileDraft.full_name || '').trim();
      const mappedFatherName = String(emSummary.father_name || l1).trim();
      const mappedBirthYear =
        emSummary.birth_year && /^\d{4}$/.test(String(emSummary.birth_year))
          ? String(emSummary.birth_year)
          : '1900';
      const mappedNote = `Lớp 1: ${l1} | Lớp 2: ${l2} | Lớp 3: ${l3}`;

      latestValues.temp_full_name = mappedFullName;
      latestValues.temp_father_name = mappedFatherName;
      latestValues.temp_birth_year = mappedBirthYear;
      latestValues.temp_relationship = 'CON_DE';
      latestValues.temp_note = mappedNote;

      setValue('temp_full_name', mappedFullName, { shouldValidate: false });
      setValue('temp_father_name', mappedFatherName, { shouldValidate: false });
      setValue('temp_birth_year', mappedBirthYear, { shouldValidate: false });
      setValue('temp_relationship', 'CON_DE', { shouldValidate: false });
      setValue('temp_note', mappedNote, { shouldValidate: false });
    } else {
      const fName = String(profileDraft.full_name || '').trim();
      const faName = String(profileDraft.father_name || '').trim();
      const bYearRaw = String(profileDraft.birth_year ?? '').trim();
      const noteText = String(profileDraft.note || '').trim();
      const rel = String(profileDraft.temp_relationship || 'CON_DE').trim();

      if (!fName) {
        const msg = 'Bác vui lòng nhập họ và tên khai sinh.';
        setProfileErrors({ full_name: msg });
        routeFieldError('full_name', msg, 'personalInfo');
        return;
      }
      if (!faName) {
        const msg = 'Bác vui lòng nhập họ và tên Cha để Ban quản trị đối chiếu.';
        setProfileErrors({ father_name: msg });
        routeFieldError('father_name', msg, 'personalInfo');
        return;
      }
      if (bYearRaw && !/^\d{4}$/.test(bYearRaw)) {
        const msg = 'Bác vui lòng nhập năm sinh gồm 4 chữ số (ví dụ: 1975).';
        setProfileErrors({ birth_year: msg });
        routeFieldError('birth_year', msg, 'personalInfo');
        return;
      }
      if (!noteText || noteText.length <= 10) {
        const msg = 'Bác vui lòng nhập lời nhắn gửi Ban Quản trị tối thiểu 11 ký tự để đủ thông tin xác minh.';
        setProfileErrors({ note: msg });
        routeFieldError('note', msg, 'personalInfo');
        return;
      }

      const mappedBirthYear = bYearRaw || '1900';
      latestValues.temp_full_name = fName;
      latestValues.temp_father_name = faName;
      latestValues.temp_birth_year = mappedBirthYear;
      latestValues.temp_relationship = rel || 'CON_DE';
      latestValues.temp_note = noteText;

      setValue('temp_full_name', fName, { shouldValidate: false });
      setValue('temp_father_name', faName, { shouldValidate: false });
      setValue('temp_birth_year', mappedBirthYear, { shouldValidate: false });
      setValue('temp_relationship', rel || 'CON_DE', { shouldValidate: false });
      setValue('temp_note', noteText, { shouldValidate: false });
    }

    if (!latestValues?.phone?.trim?.()) {
      routeFieldError('phone', 'Bác vui lòng nhập số điện thoại đăng nhập.', 'accountInfo');
      return;
    }

    if (!isRevision) {
      const phoneFormatCheck = validatePhoneWithCountry(
        latestValues.phone,
        phoneCountry
      );
      if (!phoneFormatCheck.valid) {
        routeFieldError('phone', phoneFormatCheck.message, 'accountInfo');
        return;
      }
      latestValues.phone = phoneFormatCheck.normalized;
      setValue('phone', phoneFormatCheck.normalized, { shouldValidate: false });
    }

    if (!latestValues?.password?.trim?.()) {
      routeFieldError('password', 'Bác vui lòng nhập mật khẩu đăng nhập.', 'accountInfo');
      return;
    }
    if (latestValues.password.trim().length < 6) {
      routeFieldError('password', 'Mật khẩu đăng nhập cần tối thiểu 6 ký tự.', 'accountInfo');
      return;
    }

    if (!isRevision) {
      const phoneCheck = await checkPhoneAvailability(latestValues.phone);

      if (!phoneCheck.valid) {
        routeFieldError(
          'phone',
          phoneCheck.message || 'Số điện thoại cần được kiểm tra lại.',
          'accountInfo',
        );
        guidedFlow.unmarkCompleted('accountInfo');
        return;
      }

      const emailCheck = await checkEmailAvailability(latestValues.email);

      if (!emailCheck.valid) {
        routeFieldError(
          'email',
          emailCheck.message || 'Email cần được kiểm tra lại.',
          'accountInfo',
        );
        guidedFlow.unmarkCompleted('accountInfo');
        return;
      }
    }

    const captchaCheck = captchaZone.validateBeforeSubmit();

    if (!captchaCheck.valid) {
      const captchaMessage =
        captchaCheck.message ||
        ttsMessages?.joinClan?.captcha ||
        'Bác hãy bấm vào ô vuông. Khi thấy dấu tích màu xanh là đã xác nhận xong.';

      setAttentionMessage(captchaMessage);

      captchaZone.applyValidationFailure({
        validationResult: captchaCheck,
        guidedFlow,
        speak: speakMandatoryError,
        focus: focusFieldByName,
        focusDelayMs: 520,
      });

      return;
    }

    const gateResult = await runValidationGate({
      values: latestValues,
      requiredFields: [
        'tenantId',
        'clanName',
        'temp_full_name',
        'temp_father_name',
        'temp_birth_year',
        'temp_relationship',
        'temp_note',
        'phone',
        'password',
      ],
      asyncValidationState: {
        phone: phoneChecking,
        email: emailChecking,
      },
      onlineErrors: {
        phone: phoneRemoteError,
        email: emailRemoteError,
      },
      localValidation: async () => {
        const valid = await trigger();
        const freshErrors = {};
        [
          'tenantId',
          'clanName',
          'temp_full_name',
          'temp_father_name',
          'temp_birth_year',
          'temp_relationship',
          'temp_note',
          'phone',
          'email',
          'password',
        ].forEach((fKey) => {
          const st = getFieldState(fKey);
          if (st?.error) {
            freshErrors[fKey] = st.error;
          }
        });

        return {
          valid,
          errors: Object.keys(freshErrors).length > 0 ? freshErrors : errors,
        };
      },
      metadata: {
        form: 'JoinClanForm',
        transition: 'JoinClanForm->WaitingPage',
        lifecycleRuntimeVersion: lifecycleContext?.runtimeVersion || 0,
      },
    });

    if (!gateResult.allowed) {
      const target = buildValidationAttentionTarget(gateResult);
      const attentionField = getAttentionFieldFromGate(target, latestValues);

      const targetField = target.field || attentionField;
      const freshFieldError = targetField ? getFieldState(targetField)?.error : null;
      const fieldSpecificMessage =
        freshFieldError?.message ||
        (targetField && errors?.[targetField]?.message ? errors[targetField].message : '');

      if (targetField === 'temp_note' && fieldSpecificMessage) {
        setProfileErrors((prev) => ({ ...prev, note: fieldSpecificMessage }));
      } else if (targetField === 'temp_full_name' && fieldSpecificMessage) {
        setProfileErrors((prev) => ({ ...prev, full_name: fieldSpecificMessage }));
      } else if (targetField === 'temp_father_name' && fieldSpecificMessage) {
        setProfileErrors((prev) => ({ ...prev, father_name: fieldSpecificMessage }));
      } else if (targetField === 'temp_birth_year' && fieldSpecificMessage) {
        setProfileErrors((prev) => ({ ...prev, birth_year: fieldSpecificMessage }));
      }

      routeFieldError(
        targetField,
        fieldSpecificMessage ||
          target.message ||
          'Thông tin hồ sơ chưa đầy đủ hoặc chưa đúng. Bác vui lòng kiểm tra lại các mục được báo lỗi trên màn hình.',
        attentionField,
      );

      return;
    }

    if (!hasCoreRequiredData(latestValues)) {
      routeFieldError(
        'submit',
        'Thông tin hồ sơ chưa đầy đủ hoặc chưa đúng. Bác vui lòng kiểm tra lại các mục được báo lỗi trên màn hình.',
        'submit',
      );

      return;
    }
    setAttentionMessage('');
    setPhase2Banner(null);

    const resolvedPhone = isRevision
      ? resolveRevisionPhone(lockedIdentifier, initialData, latestValues.phone)
      : latestValues.phone || '';

    const resolvedEmail = isRevision
      ? resolveRevisionEmail(lockedIdentifier, initialData, latestValues.email) || null
      : latestValues.email || null;

    const resolvedChildType = String(
      profileDraft.temp_relationship || latestValues.temp_relationship || 'CON_DE'
    ).trim();

    const builtRegistrationProfile =
      claimMode === 'CLAIM_EM'
        ? {
            claim_mode: 'CLAIM_EM',
            claimed_member_id: profileDraft.claimed_member_id,
            child_type:
              profileDraft.claimed_member_summary?.child_type || undefined,
            full_name:
              profileDraft.claimed_member_summary?.full_name ||
              profileDraft.full_name ||
              latestValues.temp_full_name,
            alias: profileDraft.claimed_member_summary?.alias || undefined,
            gender: profileDraft.gender || 'NAM',
            birth_year: profileDraft.claimed_member_summary?.birth_year
              ? Number(profileDraft.claimed_member_summary.birth_year)
              : undefined,
            branch_name:
              profileDraft.claimed_member_summary?.branch_name ||
              profileDraft.claim_verification?.layer2_branch_origin ||
              undefined,
            father_name:
              profileDraft.claimed_member_summary?.father_name ||
              profileDraft.claim_verification?.layer1_lineage ||
              undefined,
            mother_name:
              profileDraft.claimed_member_summary?.mother_name || undefined,
            generation:
              profileDraft.claimed_member_summary?.generation != null
                ? Number(profileDraft.claimed_member_summary.generation)
                : undefined,
            phone: resolvedPhone || undefined,
            email: resolvedEmail || undefined,
            note: String(
              profileDraft.claim_verification?.layer3_guarantor_note || ''
            ).trim(),
            claim_verification: {
              claimed_member_summary:
                profileDraft.claimed_member_summary || null,
              layer1_lineage: String(
                profileDraft.claim_verification?.layer1_lineage || ''
              ).trim(),
              layer2_branch_origin: String(
                profileDraft.claim_verification?.layer2_branch_origin || ''
              ).trim(),
              layer3_guarantor_note: String(
                profileDraft.claim_verification?.layer3_guarantor_note || ''
              ).trim(),
            },
          }
        : {
            claim_mode: 'NEW_PROFILE_21',
            claimed_member_id: undefined,
            child_type: resolvedChildType,
            temp_relationship: resolvedChildType,
            full_name: String(profileDraft.full_name || '').trim(),
            alias: String(profileDraft.alias || '').trim() || undefined,
            gender: profileDraft.gender || 'NAM',
            birth_day:
              profileDraft.birth_day !== '' && profileDraft.birth_day != null
                ? Number(profileDraft.birth_day)
                : undefined,
            birth_month:
              profileDraft.birth_month !== '' &&
              profileDraft.birth_month != null
                ? Number(profileDraft.birth_month)
                : undefined,
            birth_year:
              profileDraft.birth_year !== '' && profileDraft.birth_year != null
                ? Number(profileDraft.birth_year)
                : undefined,
            birth_place:
              String(profileDraft.birth_place || '').trim() || undefined,
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
            branch_name:
              String(profileDraft.branch_name || '').trim() || undefined,
            father_name:
              String(profileDraft.father_name || '').trim() || undefined,
            mother_name:
              String(profileDraft.mother_name || '').trim() || undefined,
            grandfather_name:
              String(profileDraft.grandfather_name || '').trim() || undefined,
            grandmother_name:
              String(profileDraft.grandmother_name || '').trim() || undefined,
            address: String(profileDraft.address || '').trim() || undefined,
            phone: resolvedPhone || undefined,
            email: resolvedEmail || undefined,
            note: String(profileDraft.note || '').trim(),
            proof_documents: Array.isArray(profileDraft.proof_documents)
              ? profileDraft.proof_documents
              : [],
            social_profiles:
              profileDraft.social_profiles &&
              typeof profileDraft.social_profiles === 'object'
                ? profileDraft.social_profiles
                : {},
          };

    // AMEND-RP-OP-2026-02 V1.5.0 + Phase 2 Contracts [CLAIM_MODES, FUNC-04]
    const finalPayload = {
      isNewClan: false,
      tenantId: selectedTenant.id,
      clanName: selectedTenant.name,
      tenantSlug: selectedTenant.slug || '',
      phone: resolvedPhone,
      phoneCountry,
      email: resolvedEmail,
      password: latestValues.password,
      gender: builtRegistrationProfile.gender,
      claim_mode:
        claimMode === 'CLAIM_EM'
          ? CLAIM_MODES.CLAIM_EXISTING
          : CLAIM_MODES.CREATE_NEW,
      bypass_otp: isMultiHomeBypassOtp,
      skipOtpVerification: isMultiHomeBypassOtp,
      ...(builtRegistrationProfile.claimed_member_id
        ? { claimed_member_id: builtRegistrationProfile.claimed_member_id }
        : {}),
      referrer_name: rawReferrerName,
      referrer_phone: normalizedReferrerPhone,
      registration_profile: {
        ...builtRegistrationProfile,
        referrer_name: rawReferrerName,
        referrer_phone: normalizedReferrerPhone,
        referrer_info: {
          full_name: rawReferrerName,
          phone: normalizedReferrerPhone,
        },
      },
      turnstileToken: captchaCheck.token || captchaZone.getToken(),
      hp_field: latestValues.hp_field || '',
      ...(isRevision
        ? {
            isRevision: true,
            reviewNote: effectiveReviewNote || undefined,
          }
        : {}),
    };

    try {
      // [FUNC-04, TC-FE-04] Multi-Home Bypass OTP: ưu tiên submit trực tiếp nếu có onSubmit
      if (isMultiHomeBypassOtp && typeof onSubmit === 'function') {
        await onSubmit(finalPayload);
        captchaZone.consume({ guidedFlow });
        return;
      }

      if (onGoToWaiting) {
        onGoToWaiting(finalPayload);
        return;
      }

      if (typeof onSubmit === 'function') {
        await onSubmit(finalPayload);
        captchaZone.consume({ guidedFlow });
      }
    } catch (submitErr) {
      handleSubmissionApiError(submitErr);
    }
  };

  /**
   * Field registrations
   */
  const fullNameRegister = register('temp_full_name', {
    onChange: () => clearFieldErrorOnEdit('temp_full_name'),
  });

  const fatherNameRegister = register('temp_father_name', {
    onChange: () => clearFieldErrorOnEdit('temp_father_name'),
  });

  const birthYearRegister = register('temp_birth_year', {
    onChange: () => clearFieldErrorOnEdit('temp_birth_year'),
  });

  const relationshipRegister = register('temp_relationship', {
    onChange: (e) => {
      clearFieldErrorOnEdit('temp_relationship');

      setValue('temp_relationship', e.target.value, {
        shouldValidate: false,
        shouldDirty: true,
      });
    },
  });

  const noteRegister = register('temp_note', {
    onChange: () => clearFieldErrorOnEdit('temp_note'),
  });

  const phoneRegister = register('phone', {
    onChange: () =>
      clearFieldErrorOnEdit('phone', {
        clearPhoneRemoteError: true,
      }),
  });

  const emailRegister = register('email', {
    onChange: () =>
      clearFieldErrorOnEdit('email', {
        clearEmailRemoteError: true,
      }),
  });

  const passwordRegister = register('password', {
    onChange: () => clearFieldErrorOnEdit('password'),
  });

  /**
   * Action footer JSX (không khai báo component con bên trong render để tránh remount mỗi lần gõ phím;
   * tắt autoScroll trên submit wrapper để không kéo màn hình xuống cuối trang khi mở form [UAT Bug 3.2]).
   */
  const renderActionFooter = (isStep1) => (
    <div className="pt-6">
      {isStep1 ? (
        <GuidedFieldWrapper
          fieldKey="submit"
          activeField={guidedFlow.activeField}
          autoScroll={false}
          helperText={
            ttsMessages?.joinClan?.submit || 'Bác bấm nút tiếp tục rà soát để kiểm tra lại hồ sơ.'
          }
          completed={false}
          voiceAction={
            <ZoneVoiceButton
              visible
              text={zoneHelpText.submit}
              label="Nghe"
              disabled={effectiveLoading || phoneChecking || emailChecking}
            />
          }
        >
          <button
            type="button"
            onClick={nextStep}
            disabled={!reviewGateStatus.enabled}
            className={`min-h-[48px] h-12 w-full px-5 text-base rounded-xl font-bold whitespace-nowrap transition-all ${
              !reviewGateStatus.enabled
                ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                : 'bg-emerald-600 text-white shadow-md hover:bg-emerald-700'
            }`}
          >
            {phoneChecking || emailChecking
              ? 'Đang kiểm tra...'
              : isMultiHomeBypassOtp
                ? 'Gửi hồ sơ gia nhập ngay (Bỏ qua OTP) →'
                : 'Tiếp tục rà soát →'}
          </button>

          {/* Inline helper text >= 16px bên dưới nút disabled (cấm dùng tooltip) */}
          {!reviewGateStatus.enabled && reviewGateStatus.reason && (
            <p
              role="status"
              className="mt-2.5 text-base font-semibold leading-relaxed text-amber-800"
            >
              {reviewGateStatus.reason}
            </p>
          )}
        </GuidedFieldWrapper>
      ) : (
        <button
          type="submit"
          disabled={effectiveLoading}
          className="min-h-[48px] h-12 flex-[2] px-5 bg-emerald-600 text-white rounded-xl text-base font-bold whitespace-nowrap"
        >
          {effectiveLoading ? (
            <Loader2 className="animate-spin mx-auto" size={20} />
          ) : (
            'Gửi hồ sơ gia nhập'
          )}
        </button>
      )}
    </div>
  );

  // Tính nhãn ngoại tộc nếu thành viên đang chọn là is_clan === false [ARCH-03]
  const selectedMemberRelation = profileDraft.claimed_member_summary
    ? resolveMemberClanRelation(profileDraft.claimed_member_summary)
    : null;
  const selectedMemberNonClanBadge =
    selectedMemberRelation && !selectedMemberRelation.isClan
      ? selectedMemberRelation.childType === 'CON_DAU'
        ? 'Con dâu'
        : selectedMemberRelation.childType === 'CON_RE'
          ? 'Con rể'
          : 'Con rể / Con dâu'
      : null;

  return (
    <div className={uiSystem.container}>
      {/* Vòng quay chặn màn hình hợp nhất duy nhất [ARCH-04] */}
      <BlockingLoadingOverlay
        isOpen={effectiveLoading}
        message="Đang xử lý hồ sơ xin gia nhập dòng họ..."
      />

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

      <form noValidate onSubmit={handleSubmit(() => {})} className="space-y-6">
        <section className="rounded-3xl border border-emerald-100 bg-emerald-50/80 p-5 text-center shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-600">
            {isRevision ? 'Bổ sung hồ sơ đăng ký' : 'Hồ sơ đăng ký'}
          </p>

          <h2 className="mt-2 text-2xl font-black leading-tight text-slate-900">
            {isRevision ? 'Chỉnh sửa & bổ sung hồ sơ gia nhập' : 'Gia nhập một dòng họ'}
          </h2>

          <p className="mx-auto mt-2 max-w-xl text-base font-semibold leading-relaxed text-slate-600">
            {isRevision
              ? 'Bác vui lòng xem bút phê của Ban Quản trị bên dưới, bổ sung thông tin còn thiếu rồi bấm Tiếp tục rà soát.'
              : 'Bác vui lòng tìm đúng dòng họ, nhập thông tin cá nhân, nhập số điện thoại, email nếu có, và tạo tài khoản để gửi hồ sơ xin gia nhập.'}
          </p>

          <div className="mt-4 flex justify-center">
            <AudioHelpButton
              text={
                ttsMessages?.joinClan?.help ||
                'Bác tìm dòng họ cần gia nhập, nhập thông tin cá nhân, chọn cách liên lạc và tạo tài khoản đăng nhập.'
              }
              label="Nghe hướng dẫn"
              variant="soft"
            />
          </div>
        </section>

        {/* [FUNC-04, TC-FE-04] Huy hiệu thông báo Multi-Home Bypass OTP khi user.status === 'DA_DUYET' */}
        {isMultiHomeBypassOtp && (
          <div
            role="status"
            data-testid="multi-home-bypass-otp-notice"
            className="flex items-start gap-3 rounded-3xl border-2 border-emerald-300 bg-emerald-50 p-4 text-emerald-950"
          >
            <ShieldCheck size={22} className="mt-0.5 shrink-0 text-emerald-700" />
            <div className="text-base font-semibold">
              Tài khoản của bác đã được phê duyệt trước đó: Hệ thống tự động{' '}
              <strong>bỏ qua bước xác thực mã OTP</strong> khi nộp hồ sơ gia nhập.
            </div>
          </div>
        )}

        {/* [UAT-IMP3] Banner thông báo lớp trên cùng — ẩn mã UUID, chỉ đóng khi EU bấm "Đã hiểu" */}
        {phase2Banner && (
          <PersistentMessageBanner
            type={phase2Banner.type}
            mode={phase2Banner.mode || 'fullscreen'}
            autoSpeak
            title={phase2Banner.title}
            message={phase2Banner.message}
            actionButton={phase2Banner.actionButton}
            onClose={() => setPhase2Banner(null)}
          />
        )}

        {isRevision && effectiveReviewNote && (
          <div
            role="region"
            aria-label="Bút phê yêu cầu bổ sung của Ban Quản trị"
            className="rounded-3xl border-2 border-amber-300 bg-amber-50 p-5 text-amber-950 shadow-sm space-y-2"
            data-testid="join-clan-revision-note"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-black uppercase tracking-wider text-amber-800">
                Bút phê / Yêu cầu bổ sung từ Ban Quản trị:
              </p>
              <AudioHelpButton
                text={`Yêu cầu bổ sung từ Ban Quản trị: ${effectiveReviewNote}`}
                label="Nghe bút phê"
                variant="soft"
              />
            </div>
            <p className="whitespace-pre-wrap text-base font-bold leading-relaxed text-amber-950">
              {effectiveReviewNote}
            </p>
          </div>
        )}

        {attentionMessage && (
          <AttentionZone
            active={!!attentionMessage}
            priority="high"
            role="alert"
            ariaLive="assertive"
            autoScroll
            autoFocus
            flash
            lock
            recoveryKey="join-clan-form-attention"
            className="flex items-start gap-3 border-rose-100 bg-rose-50 text-rose-700"
            data-testid="join-clan-attention-message"
          >
            <AlertCircle size={20} className="mt-0.5 shrink-0" />
            <span className="text-base font-bold leading-relaxed">{attentionMessage}</span>
          </AttentionZone>
        )}

        <>
          <>
            {/* =================================================================
                CARD ĐỆM 0: XÁC NHẬN TÀI KHOẢN (Card 2 dòng / 3 cột chuẩn UAT-IMP3)
               ================================================================= */}
            <div ref={accountGateCardRef}>
              <CollapsibleDetailCard
                title="Xác nhận tài khoản"
                statusLabel={accountGateConfirmed ? 'Đã xác nhận' : 'Chưa xác nhận'}
                statusVariant={accountGateConfirmed ? 'complete' : 'default'}
                voiceText={
                  existingSessionUser
                    ? `Trình duyệt đang đăng nhập tài khoản ${existingSessionUser.name || existingSessionUser.phone || ''}. Nếu bác dùng tài khoản hiện tại để xin vào thêm dòng họ khác, bấm nút thứ nhất. Nếu đăng ký tài khoản mới cho người khác, bấm nút thứ hai.`
                    : 'Trước khi khai báo, bác cho biết bác đã có sẵn tài khoản đăng nhập Gia Phả Số chưa? Nếu đã có, bấm nút thứ nhất để đăng nhập. Nếu chưa có, bấm nút thứ hai để bắt đầu đăng ký mới.'
                }
                expanded={!accountGateCollapsed}
                onToggle={(next) => setAccountGateCollapsed(!next)}
                disabled={effectiveLoading}
              >
                {existingSessionUser ? (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
                      <p className="text-base font-bold leading-relaxed">
                        Trình duyệt hiện đang đăng nhập tài khoản:{' '}
                        <strong className="font-black">
                          {existingSessionUser.name ||
                            existingSessionUser.phone ||
                            existingSessionUser.email}
                        </strong>
                        . Bác muốn thực hiện theo cách nào?
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (typeof onNavigateToClan === 'function') {
                            onNavigateToClan();
                          } else if (typeof window !== 'undefined') {
                            window.location.assign('/membership/claim');
                          }
                        }}
                        className="min-h-[56px] rounded-xl border-2 border-emerald-600 bg-emerald-50 p-4 text-left text-emerald-950 shadow-xs transition hover:bg-emerald-100"
                      >
                        <p className="flex items-center gap-2 text-base font-bold text-emerald-900">
                          <LogIn size={18} className="shrink-0" />
                          <span>Tôi đã có tài khoản</span>
                        </p>
                        <p className="mt-1 text-base font-medium text-slate-700">
                          Dùng tài khoản hiện tại để xin gia nhập thêm dòng họ khác.
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (typeof window !== 'undefined') {
                            window.localStorage.removeItem('auth_token');
                            window.localStorage.removeItem('token');
                            window.localStorage.removeItem('active_context');
                            window.localStorage.removeItem('tenantId');
                          }
                          setAccountGateConfirmed(true);
                          setAccountGateCollapsed(true);
                          setClanCardCollapsed(false);
                          guidedFlow.goToField('clanSearch');
                          window.setTimeout(() => {
                            clanCardRef.current?.scrollIntoView?.({
                              behavior: 'smooth',
                              block: 'start',
                            });
                          }, 120);
                        }}
                        className="min-h-[56px] rounded-xl border-2 border-slate-200 bg-white p-4 text-left text-slate-900 transition hover:border-indigo-300 hover:bg-indigo-50/40"
                      >
                        <p className="flex items-center gap-2 text-base font-bold text-indigo-900">
                          <UserPlus size={18} className="shrink-0" />
                          <span>Tôi chưa có tài khoản</span>
                        </p>
                        <p className="mt-1 text-base font-medium text-slate-700">
                          Đăng xuất phiên hiện tại và đăng ký tài khoản mới.
                        </p>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-base font-semibold text-slate-700">
                      Bác đã từng có sẵn tài khoản đăng nhập Gia Phả Số chưa?
                    </p>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (typeof onSwitchToLogin === 'function') {
                            onSwitchToLogin();
                          } else if (typeof window !== 'undefined') {
                            window.location.assign('/auth');
                          }
                        }}
                        className="min-h-[56px] rounded-xl border-2 border-slate-200 bg-white p-4 text-left text-slate-900 transition hover:border-blue-400 hover:bg-blue-50/50"
                      >
                        <p className="flex items-center gap-2 text-base font-bold text-blue-900">
                          <LogIn size={18} className="shrink-0" />
                          <span>Bác đã có sẵn tài khoản</span>
                        </p>
                        <p className="mt-1 text-base font-medium text-slate-700">
                          Chuyển sang màn hình Đăng nhập để vào hệ thống.
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setAccountGateConfirmed(true);
                          setAccountGateCollapsed(true);
                          setClanCardCollapsed(false);
                          guidedFlow.goToField('clanSearch');
                          window.setTimeout(() => {
                            clanCardRef.current?.scrollIntoView?.({
                              behavior: 'smooth',
                              block: 'start',
                            });
                          }, 120);
                        }}
                        className={`min-h-[56px] rounded-xl border-2 p-4 text-left transition ${
                          accountGateConfirmed
                            ? 'border-emerald-600 bg-emerald-50 text-emerald-950 shadow-xs'
                            : 'border-emerald-500 bg-emerald-50/60 text-emerald-950 hover:bg-emerald-100'
                        }`}
                      >
                        <p className="flex items-center gap-2 text-base font-bold text-emerald-900">
                          <UserPlus size={18} className="shrink-0" />
                          <span>Bác chưa có tài khoản</span>
                        </p>
                        <p className="mt-1 text-base font-medium text-slate-700">
                          Bắt đầu tìm dòng họ và tạo tài khoản đăng nhập mới.
                        </p>
                      </button>
                    </div>
                  </div>
                )}
              </CollapsibleDetailCard>
            </div>

            {/* =================================================================
                CARD BƯỚC 1: TÌM DÒNG HỌ GIA NHẬP (Card 2 dòng / 3 cột chuẩn UAT-IMP3)
               ================================================================= */}
            {accountGateConfirmed && (
              <div ref={clanCardRef}>
                <GuidedFieldWrapper
                  fieldKey="clanSearch"
                  activeField={guidedFlow.activeField}
                  autoScroll={false}
                  helperText={zoneHelpText.clanSearch}
                  completed={guidedFlow.isCompleted('clanSearch')}
                >
                  <CollapsibleDetailCard
                    title={
                      selectedTenant
                        ? `Bước 1: Tìm dòng họ gia nhập (${selectedTenant.name})`
                        : 'Bước 1: Tìm dòng họ gia nhập'
                    }
                    statusLabel={isCard1Complete ? 'Đã chọn' : 'Chưa chọn'}
                    statusVariant={isCard1Complete ? 'complete' : 'default'}
                    voiceText={zoneHelpText.clanSearch}
                    expanded={!clanCardCollapsed}
                    onToggle={(next) => setClanCardCollapsed(!next)}
                    disabled={effectiveLoading}
                  >
                    <div className="space-y-3">
                      <div className="relative">
                        <Search
                          className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                          size={18}
                        />

                        {isRevision && selectedTenant ? (
                          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base">
                            Dòng họ: <span className="font-semibold">{selectedTenant.name}</span>
                            <input type="hidden" {...register('tenantId')} />
                          </div>
                        ) : (
                          <input
                            ref={tenantSearchRef}
                            type="text"
                            disabled={searchRateLimitSeconds > 0}
                            value={searchKeyword}
                            onChange={(e) => {
                              setSearchKeyword(e.target.value);
                              setAttentionMessage('');
                              invalidateRuntimeForField('tenantId');
                              guidedFlow.goToField('clanSearch');
                            }}
                            onFocus={() => guidedFlow.goToField('clanSearch')}
                            className={`min-h-[48px] h-12 pl-11 ${uiSystem.input} disabled:bg-slate-100 disabled:text-slate-500`}
                            placeholder="Gõ tên dòng họ cần tìm..."
                          />
                        )}

                        {tenantLoading && (
                          <Loader2
                            className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-blue-500"
                            size={18}
                          />
                        )}
                      </div>

                      {searchRateLimitSeconds > 0 && (
                        <p className="mt-1.5 text-base font-semibold text-amber-800" role="status">
                          Ô tìm kiếm tạm khóa do thao tác quá nhanh. Vui lòng thử lại sau {searchRateLimitSeconds} giây.
                        </p>
                      )}

                      {publicSearchTurnstile.isChallengeVisible && (
                        <div
                          className="mt-3 rounded-xl border-2 border-amber-400 bg-amber-50 p-4"
                          role="region"
                          aria-label="Xác nhận an toàn tìm kiếm dòng họ"
                        >
                          <p className="mb-2 text-base font-bold text-amber-950">
                            Bác vui lòng tích vào ô xác nhận bên dưới để tiếp tục tìm kiếm dòng họ:
                          </p>
                          <div
                            ref={publicSearchTurnstile.containerRef}
                            className="min-h-[65px]"
                          />
                        </div>
                      )}

                      {!selectedTenant && tenantResults.length > 0 && (
                        <div className="mt-3 space-y-2.5 max-h-[400px] overflow-y-auto pr-1">
                          {tenantResults.map((tenant) => (
                            <button
                              key={tenant.id}
                              type="button"
                              onClick={() => handleSelectTenant(tenant)}
                              className="min-h-[48px] w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50"
                            >
                              <div className="flex items-center gap-3">
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                                  <Landmark size={22} />
                                </div>

                                <div>
                                  <p className="text-base font-bold text-slate-900">{tenant.name}</p>
                                  <p className="mt-0.5 text-base text-slate-600">Bấm để chọn dòng họ này</p>
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      {selectedTenant && (
                        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
                          <p className="text-sm font-bold text-emerald-700">
                            Đã chọn dòng họ
                          </p>
                          <p className="mt-1 text-lg font-bold">{selectedTenant.name}</p>

                          {!isRevision && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedTenant(null);
                                setValue('tenantId', '', { shouldValidate: true });
                                setValue('clanName', '', { shouldValidate: true });
                                setProfileDraft((prev) => ({
                                  ...prev,
                                  claimed_member_id: '',
                                  claimed_member_summary: null,
                                }));
                                setAttentionMessage('');
                                invalidateRuntimeForField('tenantId');
                                guidedFlow.goToField('clanSearch');
                              }}
                              className="mt-3 min-h-[48px] h-12 px-4 rounded-xl border border-emerald-400 bg-white text-base font-bold text-emerald-800 whitespace-nowrap hover:bg-emerald-100"
                            >
                              Chọn lại dòng họ
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </CollapsibleDetailCard>
                </GuidedFieldWrapper>
              </div>
            )}

            {/* =================================================================
                CARD BƯỚC 2: NHẬN DIỆN NHÂN THÂN TRONG DÒNG HỌ (Card 2 dòng / 3 cột)
               ================================================================= */}
            {accountGateConfirmed && isCard1Complete && (
              <div ref={personalCardRef}>
                <GuidedFieldWrapper
                  fieldKey="personalInfo"
                  activeField={guidedFlow.activeField}
                  autoScroll={false}
                  helperText={
                    ttsMessages?.joinClan?.personalInfo ||
                    'Bác chọn nhận hồ sơ đã có trong sổ họ hoặc khai báo hồ sơ mới.'
                  }
                  completed={guidedFlow.isCompleted('personalInfo')}
                >
                  <CollapsibleDetailCard
                    title={
                      selectedMemberNonClanBadge
                        ? `Bước 2: Nhận diện nhân thân (${selectedMemberNonClanBadge})`
                        : 'Bước 2: Nhận diện nhân thân trong dòng họ'
                    }
                    statusLabel={isCard2Complete ? 'Hoàn chỉnh' : 'Chưa hoàn chỉnh'}
                    statusVariant={isCard2Complete ? 'complete' : 'pending'}
                    voiceText={zoneHelpText.personalInfo}
                    expanded={!personalCardCollapsed}
                    onToggle={(next) => setPersonalCardCollapsed(!next)}
                    disabled={effectiveLoading}
                  >
                    <div className="space-y-5">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <button
                            type="button"
                            disabled={effectiveLoading || isClaimHoppingBlocked}
                            onClick={() => {
                              setClaimMode('CLAIM_EM');
                              setProfileErrors({});
                              setAttentionMessage('');
                              guidedFlow.goToField('personalInfo');
                            }}
                            className={`min-h-[56px] w-full rounded-xl border-2 p-4 text-left transition ${
                              isClaimHoppingBlocked
                                ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-500'
                                : claimMode === 'CLAIM_EM'
                                  ? 'border-emerald-600 bg-emerald-50 text-emerald-950 shadow-sm'
                                  : 'border-slate-200 bg-white text-slate-800 hover:border-emerald-300 hover:bg-slate-50'
                            }`}
                          >
                            <p className="text-base font-bold leading-relaxed">
                              Bấm vào đây nếu bác{' '}
                              <strong className="font-black text-emerald-800 underline decoration-emerald-400 underline-offset-4">
                                đã có tên
                              </strong>{' '}
                              trong sổ họ{' '}
                              <strong className="font-black text-slate-950">
                                {selectedClanDisplayName || 'đã chọn'}
                              </strong>{' '}
                              để tiếp tục khai báo.
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
                          disabled={effectiveLoading}
                          onClick={() => {
                            setClaimMode('NEW_PROFILE_21');
                            setProfileErrors({});
                            setAttentionMessage('');
                            guidedFlow.goToField('personalInfo');
                          }}
                          className={`min-h-[56px] rounded-xl border-2 p-4 text-left transition ${
                            claimMode === 'NEW_PROFILE_21'
                              ? 'border-indigo-600 bg-indigo-50 text-indigo-950 shadow-sm'
                              : 'border-slate-200 bg-white text-slate-800 hover:border-indigo-300 hover:bg-slate-50'
                          }`}
                        >
                          <p className="text-base font-bold leading-relaxed">
                            Bấm vào đây nếu bác{' '}
                            <strong className="font-black text-indigo-800 underline decoration-indigo-400 underline-offset-4">
                              chưa có tên
                            </strong>{' '}
                            trong sổ họ{' '}
                            <strong className="font-black text-slate-950">
                              {selectedClanDisplayName || 'đã chọn'}
                            </strong>{' '}
                            để tiếp tục khai báo.
                          </p>
                        </button>
                      </div>

                      {claimMode === 'CLAIM_EM' ? (
                        <ClaimMemberWizard
                          tenantId={selectedTenant.id}
                          tenantName={selectedTenant.name}
                          value={profileDraft}
                          disabled={effectiveLoading}
                          errors={profileErrors}
                          claimHoppingBlocked={isClaimHoppingBlocked}
                          focusRequest={childFocusRequest}
                          onSwitchToCreateNew={() => {
                            setClaimMode('NEW_PROFILE_21');
                            setProfileErrors({});
                            setPhase2Banner(null);
                          }}
                          onFocusZone={() => guidedFlow.goToField('personalInfo')}
                          onChange={(nextDraft) => {
                            setProfileDraft(nextDraft);
                            setProfileErrors({});
                            setAttentionMessage('');
                          }}
                        />
                      ) : (
                        <RegistrationProfileForm
                          value={profileDraft}
                          disabled={effectiveLoading}
                          errors={profileErrors}
                          focusRequest={childFocusRequest}
                          onFocusZone={() => guidedFlow.goToField('personalInfo')}
                          onChange={(nextDraft) => {
                            setProfileDraft(nextDraft);
                            setProfileErrors({});
                            setAttentionMessage('');
                          }}
                        />
                      )}

                    </div>
                  </CollapsibleDetailCard>
                </GuidedFieldWrapper>
              </div>
            )}

            {/* =================================================================
                CARD BƯỚC 3: THÔNG TIN TÀI KHOẢN ĐĂNG NHẬP + CAPTCHA + RÀ SOÁT
               ================================================================= */}
            {accountGateConfirmed && isCard1Complete && isCard2Complete && (
              <div ref={accountCardRef} className="space-y-6">
                <GuidedFieldWrapper
                  fieldKey="accountInfo"
                  activeField={guidedFlow.activeField}
                  autoScroll={false}
                  helperText={
                    ttsMessages?.joinClan?.accountInfo ||
                    'Bác nhập số điện thoại và mật khẩu để tạo tài khoản đăng nhập.'
                  }
                  completed={guidedFlow.isCompleted('accountInfo')}
                >
                  <CollapsibleDetailCard
                    title="Bước 3: Thông tin tài khoản đăng nhập"
                    statusLabel={
                      formValues.phone && formValues.password
                        ? 'Hoàn chỉnh'
                        : 'Chưa hoàn chỉnh'
                    }
                    statusVariant={
                      formValues.phone && formValues.password ? 'complete' : 'pending'
                    }
                    voiceText={zoneHelpText.accountInfo}
                    expanded={!accountCardCollapsed}
                    onToggle={(next) => setAccountCardCollapsed(!next)}
                    disabled={effectiveLoading}
                  >
                    <div className="space-y-5">
                      <div className="space-y-1.5">
                        <label className="text-base font-bold text-slate-800">
                          Số điện thoại đăng nhập <span className="text-rose-500">*</span>
                        </label>

                        <div className="flex flex-row items-center gap-2">
                          <select
                            aria-label="Chọn mã quốc gia"
                            value={phoneCountry}
                            disabled={isRevision || effectiveLoading}
                            onFocus={() => guidedFlow.goToField('accountInfo')}
                            onChange={(e) => {
                              setPhoneCountry(e.target.value);
                              checkedPhoneCacheRef.current = null;
                              clearFieldErrorOnEdit('phone', {
                                clearPhoneRemoteError: true,
                              });
                            }}
                            className={`min-h-[48px] h-12 w-[126px] sm:w-[136px] shrink-0 rounded-xl border border-slate-300 bg-white px-2.5 text-base font-bold text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 ${
                              isRevision ? 'opacity-80 cursor-not-allowed bg-slate-50' : ''
                            }`}
                          >
                            {COUNTRY_PHONE_OPTIONS.map((c) => (
                              <option key={c.code} value={c.code}>
                                {c.shortLabel || c.label}
                              </option>
                            ))}
                          </select>

                          <div className="relative flex-1 min-w-0">
                            <Phone
                              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                              size={18}
                            />

                            <input
                              {...phoneRegister}
                              type="tel"
                              ref={(el) => {
                                phoneRegister.ref(el);
                                phoneRef.current = el;
                              }}
                              onFocus={() => guidedFlow.goToField('accountInfo')}
                              onBlur={async (e) => {
                                if (isRevision) return;
                                await checkPhoneAvailability(e.target.value, {
                                  showFormatError: true,
                                });
                              }}
                              readOnly={isRevision}
                              className={`min-h-[48px] h-12 w-full pl-10 pr-3 ${uiSystem.input} ${
                                isRevision ? 'opacity-80 cursor-not-allowed bg-slate-50' : ''
                              }`}
                              placeholder={selectedCountryMeta.placeholder}
                            />

                            {phoneChecking && (
                              <Loader2
                                className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-blue-500"
                                size={18}
                              />
                            )}
                          </div>
                        </div>

                        {errors.phone && (
                          <p className="text-base font-bold text-rose-600">{errors.phone.message}</p>
                        )}

                        {phoneRemoteError && (
                          <div className="mt-1.5 space-y-2">
                            <p className="text-base font-bold text-rose-600">
                              {phoneRemoteError}
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                if (typeof onSwitchToLogin === 'function') {
                                  onSwitchToLogin();
                                } else if (typeof window !== 'undefined') {
                                  window.location.assign('/auth');
                                }
                              }}
                              className="min-h-[48px] h-12 inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-4 text-base font-bold text-blue-800 whitespace-nowrap hover:bg-blue-100"
                            >
                              <span>Chuyển sang màn hình Đăng nhập →</span>
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-base font-bold text-slate-800">
                          Email <span className="font-normal text-slate-500">(không bắt buộc)</span>
                        </label>

                        <div className="relative">
                          <Mail
                            className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                            size={18}
                          />

                          <input
                            {...emailRegister}
                            ref={(el) => {
                              emailRegister.ref(el);
                              emailRef.current = el;
                            }}
                            type="email"
                            onBlur={async (e) => {
                              if (isRevision) return;
                              await checkEmailAvailability(e.target.value);
                            }}
                            readOnly={isRevision}
                            className={`min-h-[48px] h-12 pl-11 ${uiSystem.input} ${
                              isRevision ? 'opacity-80 cursor-not-allowed bg-slate-50' : ''
                            }`}
                            placeholder="Email (không bắt buộc)"
                          />
                        </div>

                        {errors.email && (
                          <p className="text-base font-bold text-rose-600">{errors.email.message}</p>
                        )}

                        {emailRemoteError && (
                          <p className="text-base font-bold text-rose-600">{emailRemoteError}</p>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-base font-bold text-slate-800">
                          Mật khẩu <span className="text-rose-500">*</span>
                        </label>

                        <div className="relative">
                          <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                          <input
                            type={showPassword ? 'text' : 'password'}
                            {...passwordRegister}
                            ref={(el) => {
                              passwordRegister.ref(el);
                              passwordRef.current = el;
                            }}
                            onFocus={() => guidedFlow.goToField('accountInfo')}
                            placeholder="Nhập mật khẩu"
                            autoComplete="new-password"
                            className="min-h-[48px] h-12 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-14 text-base text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                          />

                          <button
                            type="button"
                            onClick={() => setShowPassword((prev) => !prev)}
                            className="min-h-[48px] h-12 min-w-[48px] rounded-xl flex items-center justify-center absolute right-0 top-1/2 -translate-y-1/2 text-slate-600 transition hover:text-slate-900"
                            aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                          >
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        </div>

                        {errors.password && (
                          <p className="text-base font-bold text-rose-600">{errors.password.message}</p>
                        )}
                      </div>

                      <input
                        type="text"
                        name="hp_field"
                        value={formValues.hp_field || ''}
                        onChange={(e) => setValue('hp_field', e.target.value)}
                        tabIndex="-1"
                        autoComplete="off"
                        className="hidden"
                      />
                    </div>
                  </CollapsibleDetailCard>
                </GuidedFieldWrapper>

                <CaptchaAttentionField
                  captchaZone={captchaZone}
                  guidedFlow={guidedFlow}
                  fieldKey="captcha"
                  nextZone=""
                  disabled={effectiveLoading}
                  loading={effectiveLoading}
                  elderAssistMode
                  helperText={zoneHelpText.captcha}
                  voiceText={zoneHelpText.captcha}
                  voiceLabel="Nghe"
                  onFocus={() => guidedFlow.goToField('captcha')}
                />

                {renderActionFooter(true)}
              </div>
            )}

            {onBackToRegister && (
              <button
                type="button"
                onClick={onBackToRegister}
                disabled={effectiveLoading}
                className="min-h-[48px] h-12 mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-base font-bold text-slate-700 shadow-sm whitespace-nowrap transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Quay lại chọn hình thức đăng ký
              </button>
            )}
          </>
        </>
      </form>
    </div>
  );
};

export default JoinClanForm;
