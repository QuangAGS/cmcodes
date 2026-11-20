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
import PersistentMessageBanner from '../../../components/common/PersistentMessageBanner.jsx';
import BlockingLoadingOverlay from '../../../components/common/BlockingLoadingOverlay.jsx';
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
}) => {
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

  const zoneHelpText = useMemo(
    () => ({
      clanSearch: ttsMessages?.joinClan?.clanSearch || 'Bác nhập tên dòng họ cần tìm.',
      personalInfo:
        ttsMessages?.joinClan?.personalInfo ||
        'Bác nhập thông tin cá nhân để Ban quản trị xác minh.',
      accountInfo:
        ttsMessages?.joinClan?.accountInfo ||
        'Bác nhập số điện thoại, email nếu có, và mật khẩu để tạo tài khoản đăng nhập.',
      captcha:
        ttsMessages?.joinClan?.captcha ||
        'Bác hãy bấm vào ô vuông. Khi thấy dấu tích màu xanh là đã xác nhận xong.',
      submit:
        ttsMessages?.joinClan?.submit || 'Bác bấm nút tiếp tục rà soát để kiểm tra lại hồ sơ.',
    }),
    [],
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
      });
    }

    requestAnimationFrame(() => {
      captchaZone.reset({
        reason: 'runtime-reset',
        remount: true,
      });
      setAttentionMessage('');
      setPhoneRemoteError('');
      setPhoneChecking(false);

      if (guidedFlow.resetGuidedFlow) {
        guidedFlow.resetGuidedFlow();
      } else if (guidedFlow.resetFlow) {
        guidedFlow.resetFlow();
      }

      guidedFlow.goToField('clanSearch');
    });

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
    const refMap = {
      clanSearch: tenantSearchRef,
      tenantId: tenantSearchRef,
      clanName: tenantSearchRef,
      temp_full_name: fullNameRef,
      temp_birth_year: birthYearRef,
      temp_father_name: fatherNameRef,
      temp_relationship: relationshipRef,
      temp_note: noteRef,
      phone: phoneRef,
      email: emailRef,
      password: passwordRef,
    };

    const targetRef = refMap[fieldName];

    requestAnimationFrame(() => {
      targetRef?.current?.scrollIntoView?.({
        behavior: 'smooth',
        block: 'center',
      });

      targetRef?.current?.focus?.({
        preventScroll: true,
      });
    });
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

        focusFieldByName(fieldName);

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
      setPhase2Banner({
        type: 'error',
        title: 'Xác thực bảo mật chưa thành công',
        message: captchaErr?.message,
        correlationId: 'Không có',
      });
    },
  });

  const searchTenant = useCallback(
    async (keyword, options = {}) => {
      const { turnstileToken: overrideToken, isAutoRetry = false } = options;
      const q = keyword?.trim();

      if (!q || q.length < 2) {
        setTenantResults([]);
        return;
      }

      if (searchRateLimitSeconds > 0 && !isAutoRetry) {
        return;
      }

      lastPublicSearchKeywordRef.current = q;
      if (!isAutoRetry) {
        publicSearchTurnstile.resetRetryBudget();
      }

      setTenantLoading(true);
      const activeToken =
        overrideToken || publicSearchTurnstile.turnstileToken || '';
      const requestHeaders = activeToken
        ? { 'X-Turnstile-Token': activeToken }
        : {};

      try {
        const res = await apiClient.get('/public/tenants/search', {
          params: { q },
          headers: requestHeaders,
        });
        setTenantResults(res.data?.data || []);
        setPhase2Banner(null);
        publicSearchTurnstile.dismissChallenge();
      } catch (err) {
        // 1. Bắt 403 Turnstile Fail-Closed [NFR-02, TC-FE-12]
        if (isTurnstileChallengeError(err)) {
          const info = extractApiErrorInfo(err);
          publicSearchTurnstile.triggerChallenge();
          setPhase2Banner({
            type: 'warning',
            title: 'Yêu cầu xác minh bảo mật tìm kiếm',
            message: info.message,
            correlationId: info.correlationId,
          });
          setTenantResults([]);
          return;
        }

        // 2. Bắt 429 Rate Limit [NFR-02, ARCH-01]
        const info = extractApiErrorInfo(err);
        if (info.status === 429) {
          const retryAfter = Number(
            info.details?.retryAfter || info.details?.retry_after || 30
          );
          setSearchRateLimitSeconds(retryAfter > 0 ? retryAfter : 30);
          setPhase2Banner({
            type: 'warning',
            title: 'Tạm giới hạn tần suất tìm kiếm',
            message: info.message,
            correlationId: info.correlationId,
          });
          return;
        }

        // Fallback endpoint nội bộ nếu public search trả lỗi khác 403/429
        try {
          const fallbackRes = await apiClient.get('/tenants/search', {
            params: { q, field: 'name' },
            headers: requestHeaders,
          });
          setTenantResults(fallbackRes.data?.data || []);
          setPhase2Banner(null);
        } catch (fallbackErr) {
          if (isTurnstileChallengeError(fallbackErr)) {
            const fbInfo = extractApiErrorInfo(fallbackErr);
            publicSearchTurnstile.triggerChallenge();
            setPhase2Banner({
              type: 'warning',
              title: 'Yêu cầu xác minh bảo mật tìm kiếm',
              message: fbInfo.message,
              correlationId: fbInfo.correlationId,
            });
          }
          setTenantResults([]);
        }
      } finally {
        setTenantLoading(false);
      }
    },
    [searchRateLimitSeconds, publicSearchTurnstile]
  );

  useEffect(() => {
    searchTenantRef.current = searchTenant;
  }, [searchTenant]);

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    searchTimerRef.current = setTimeout(() => searchTenant(searchKeyword), 450);

    return () => clearTimeout(searchTimerRef.current);
  }, [searchKeyword, searchTenant]);

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

    setAttentionMessage('');
    setPhase2Banner(null);

    guidedFlow.markCompleted('clanSearch');
  };

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
        setIsClaimHoppingBlocked(true);
        setPhase2Banner({
          type: 'error',
          title: 'Tạm khóa nhận diện thành viên có sẵn',
          message: info.message,
          correlationId: info.correlationId,
          actionButton: (
            <button
              type="button"
              onClick={() => {
                setClaimMode('NEW_PROFILE_21');
                setProfileErrors({});
                setPhase2Banner(null);
                guidedFlow.goToField('personalInfo');
              }}
              className="min-h-[48px] rounded-xl bg-indigo-600 px-4 py-2.5 text-base font-bold text-white hover:bg-indigo-700"
            >
              Chuyển sang Khai báo hồ sơ mới (CREATE_NEW)
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

    if (claimMode === 'CLAIM_EM') {
      const emId = String(profileDraft.claimed_member_id || '').trim();
      const emSummary = profileDraft.claimed_member_summary || {};
      const ver = profileDraft.claim_verification || {};
      const l1 = String(ver.layer1_lineage || '').trim();
      const l2 = String(ver.layer2_branch_origin || '').trim();
      const l3 = String(ver.layer3_guarantor_note || '').trim();

      if (!emId) {
        const msg =
          'Bác vui lòng tìm và chọn hồ sơ của mình trên cây gia phả (hoặc chuyển sang Khai báo mới 21 trường).';
        setProfileErrors({ claimed_member_id: msg });
        routeFieldError('personalInfo', msg, 'personalInfo');
        return;
      }
      if (!l1) {
        const msg = 'Bác vui lòng nhập Lớp 1 gia mật (họ tên Cha/Mẹ/Ông nội hoặc ngày giỗ tổ).';
        setProfileErrors({ layer1_lineage: msg });
        routeFieldError('personalInfo', msg, 'personalInfo');
        return;
      }
      if (!l2) {
        const msg = 'Bác vui lòng nhập Lớp 2 gia mật (tên Chi/Phái hoặc quê quán gia đình).';
        setProfileErrors({ layer2_branch_origin: msg });
        routeFieldError('personalInfo', msg, 'personalInfo');
        return;
      }
      if (!l3) {
        const msg = 'Bác vui lòng nhập Lớp 3 gia mật (người bảo lãnh trong họ hoặc lời nhắn xác minh).';
        setProfileErrors({ layer3_guarantor_note: msg });
        routeFieldError('personalInfo', msg, 'personalInfo');
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
        routeFieldError('personalInfo', msg, 'personalInfo');
        return;
      }
      if (!faName) {
        const msg = 'Bác vui lòng nhập họ và tên Cha để Ban quản trị đối chiếu.';
        setProfileErrors({ father_name: msg });
        routeFieldError('personalInfo', msg, 'personalInfo');
        return;
      }
      if (bYearRaw && !/^\d{4}$/.test(bYearRaw)) {
        const msg = 'Bác vui lòng nhập năm sinh gồm 4 chữ số (ví dụ: 1975).';
        setProfileErrors({ birth_year: msg });
        routeFieldError('personalInfo', msg, 'personalInfo');
        return;
      }
      if (!noteText) {
        const msg = 'Bác vui lòng nhập lời nhắn gửi Ban quản trị xác minh.';
        setProfileErrors({ note: msg });
        routeFieldError('personalInfo', msg, 'personalInfo');
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

        return {
          valid,
          errors,
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

      const fieldSpecificMessage =
        targetField && errors?.[targetField]?.message ? errors[targetField].message : '';

      routeFieldError(
        targetField,
        target.message ||
          fieldSpecificMessage ||
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
      registration_profile: builtRegistrationProfile,
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
   * Action footer
   */
  const ActionFooter = ({ isStep1 }) => (
    <div className="pt-8">
      {isStep1 ? (
        <GuidedFieldWrapper
          fieldKey="submit"
          activeField={guidedFlow.activeField}
          helperText={
            ttsMessages?.joinClan?.submit || 'Bác bấm nút tiếp tục rà soát để kiểm tra lại hồ sơ.'
          }
          completed={false}
          voiceAction={
            <ZoneVoiceButton
              visible={showAzVoiceButton('submit')}
              text={zoneHelpText.submit}
              label="Nghe"
              disabled={effectiveLoading || phoneChecking || emailChecking}
            />
          }
        >
          <button
            type="button"
            onClick={nextStep}
            disabled={
              effectiveLoading ||
              phoneChecking ||
              emailChecking ||
              (claimMode === 'CLAIM_EM' && isClaimHoppingBlocked)
            }
            className={`min-h-[48px] w-full py-4 text-base rounded-3xl font-bold transition-all ${
              effectiveLoading ||
              phoneChecking ||
              emailChecking ||
              (claimMode === 'CLAIM_EM' && isClaimHoppingBlocked)
                ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                : 'bg-emerald-600 text-white hover:bg-emerald-700'
            }`}
          >
            {phoneChecking || emailChecking
              ? 'Đang kiểm tra...'
              : isMultiHomeBypassOtp
                ? 'Gửi hồ sơ gia nhập ngay (Bỏ qua OTP) →'
                : 'Tiếp tục rà soát →'}
          </button>

          {/* Inline helper text >= 16px bên dưới nút disabled (cấm dùng tooltip) */}
          {claimMode === 'CLAIM_EM' && isClaimHoppingBlocked && (
            <p className="mt-2 text-base font-semibold text-rose-700">
              Chức năng nhận diện thành viên có sẵn tạm khóa do từ chối nhiều lần trong 90 ngày. Bác vui lòng chọn &ldquo;Cách 2 (Khai báo mới)&rdquo; ở phía trên.
            </p>
          )}
        </GuidedFieldWrapper>
      ) : (
        <button
          type="submit"
          disabled={effectiveLoading}
          className="min-h-[48px] flex-[2] py-4 bg-emerald-600 text-white rounded-3xl text-base font-bold"
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

        {/* Banner thông báo nghiệp vụ hợp nhất duy nhất (hiển thị Mã tra cứu X-Correlation-Id) */}
        {phase2Banner && (
          <PersistentMessageBanner
            type={phase2Banner.type}
            title={phase2Banner.title}
            message={phase2Banner.message}
            correlationId={phase2Banner.correlationId}
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
            <GuidedFieldWrapper
              fieldKey="clanSearch"
              activeField={guidedFlow.activeField}
              helperText={zoneHelpText.clanSearch}
              completed={guidedFlow.isCompleted('clanSearch')}
              voiceAction={
                <ZoneVoiceButton
                  visible={showAzVoiceButton('clanSearch')}
                  text={zoneHelpText.clanSearch}
                  label="Nghe"
                  disabled={effectiveLoading}
                />
              }
            >
              <div className={uiSystem.section}>
                <div className="space-y-1">
                  <label className={uiSystem.label}>
                    Tìm dòng họ gia nhập <span className="text-rose-500">*</span>
                  </label>

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
                        className={`min-h-[48px] pl-11 ${uiSystem.input} disabled:bg-slate-100 disabled:text-slate-500`}
                        placeholder="Gõ tên dòng họ hoặc định danh."
                      />
                    )}

                    {tenantLoading && (
                      <Loader2
                        className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-blue-500"
                        size={18}
                      />
                    )}
                  </div>

                  {/* Inline helper text >= 16px khi dính Rate Limit 429 trên Public Search */}
                  {searchRateLimitSeconds > 0 && (
                    <p className="mt-1.5 text-base font-semibold text-amber-800" role="status">
                      Ô tìm kiếm tạm khóa do thao tác quá nhanh. Vui lòng thử lại sau {searchRateLimitSeconds} giây.
                    </p>
                  )}

                  {/* [NFR-02, TC-FE-12] Khung Cloudflare Turnstile Fail-Closed cho Public Search */}
                  {publicSearchTurnstile.isChallengeVisible && (
                    <div
                      className="mt-3 rounded-2xl border-2 border-amber-400 bg-amber-50 p-4"
                      role="region"
                      aria-label="Xác minh bảo mật tìm kiếm dòng họ"
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
                </div>

                {!selectedTenant && tenantResults.length > 0 && (
                  <div className="mt-3 space-y-3 max-h-[400px] overflow-y-auto pr-1">
                    {tenantResults.map((tenant) => (
                      <button
                        key={tenant.id}
                        type="button"
                        onClick={() => handleSelectTenant(tenant)}
                        className="min-h-[48px] w-full rounded-3xl border border-slate-100 bg-white p-4 text-left shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                            <Landmark size={22} />
                          </div>

                          <div>
                            <p className="text-base font-black text-slate-900">{tenant.name}</p>
                            <p className="mt-1 text-sm text-slate-500">Bấm để chọn dòng họ này</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {selectedTenant && (
                  <div className="mt-3 rounded-3xl border border-emerald-100 bg-emerald-50 p-4 text-emerald-800">
                    <p className="text-xs font-black uppercase tracking-widest">Đã chọn dòng họ</p>
                    <p className="mt-1 text-lg font-black">{selectedTenant.name}</p>

                    {!isRevision && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTenant(null);
                          setValue('tenantId', '', { shouldValidate: true });
                          setValue('clanName', '', { shouldValidate: true });
                          setAttentionMessage('');
                          invalidateRuntimeForField('tenantId');
                          guidedFlow.goToField('clanSearch');
                        }}
                        className="mt-3 min-h-[48px] px-3 py-2 text-base font-bold text-emerald-700 underline"
                      >
                        Chọn lại dòng họ
                      </button>
                    )}
                  </div>
                )}
              </div>
            </GuidedFieldWrapper>

            <GuidedFieldWrapper
              fieldKey="personalInfo"
              activeField={guidedFlow.activeField}
              helperText={
                ttsMessages?.joinClan?.personalInfo ||
                'Bác chọn nhận hồ sơ đã có trên cây gia phả hoặc khai báo hồ sơ nhân thân 21 trường.'
              }
              completed={guidedFlow.isCompleted('personalInfo')}
              voiceAction={
                <ZoneVoiceButton
                  visible={showAzVoiceButton('personalInfo')}
                  text={zoneHelpText.personalInfo}
                  label="Nghe"
                  disabled={effectiveLoading}
                />
              }
            >
              <div className={uiSystem.section}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slate-500">
                    <User size={18} />
                    Nhận diện nhân thân trong dòng họ
                  </h3>
                  {selectedMemberNonClanBadge && (
                    <span className="rounded-lg border border-indigo-300 bg-indigo-100 px-2.5 py-0.5 text-base font-bold text-indigo-900">
                      {selectedMemberNonClanBadge}
                    </span>
                  )}
                </div>

                {/* Bộ chọn 2 nhánh C2 theo AMEND-RP-OP-2026-02 V1.5.0 */}
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
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
                      className={`min-h-[48px] w-full rounded-2xl border p-3.5 text-left transition ${
                        isClaimHoppingBlocked
                          ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-500'
                          : claimMode === 'CLAIM_EM'
                            ? 'border-emerald-600 bg-emerald-50 text-emerald-950 shadow-sm'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <p className="text-xs font-black uppercase tracking-wider text-emerald-700">
                        Cách 1 (Khuyên dùng)
                      </p>
                      <p className="mt-1 text-base font-black">
                        Đã có tên trên cây gia phả
                      </p>
                      <p className="mt-0.5 text-sm font-medium text-slate-600">
                        Tìm hồ sơ có sẵn (bao gồm cả con rể/con dâu) và trả lời 3 lớp gia mật.
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
                    className={`min-h-[48px] rounded-2xl border p-3.5 text-left transition ${
                      claimMode === 'NEW_PROFILE_21'
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-950 shadow-sm'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <p className="text-xs font-black uppercase tracking-wider text-indigo-700">
                      Cách 2 (Khai báo mới)
                    </p>
                    <p className="mt-1 text-base font-black">
                      Chưa có tên trên cây (21 trường)
                    </p>
                    <p className="mt-0.5 text-sm font-medium text-slate-600">
                      Điền đầy đủ hồ sơ nhân thân & tiền nhân 3 đời để lập mới.
                    </p>
                  </button>
                </div>

                {claimMode === 'CLAIM_EM' ? (
                  selectedTenant?.id ? (
                    <ClaimMemberWizard
                      tenantId={selectedTenant.id}
                      tenantName={selectedTenant.name}
                      value={profileDraft}
                      disabled={effectiveLoading}
                      errors={profileErrors}
                      claimHoppingBlocked={isClaimHoppingBlocked}
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
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-base font-bold text-amber-800">
                      Bác vui lòng tìm và chọn dòng họ ở mục phía trên trước để
                      tra cứu danh sách thành viên trên cây.
                    </div>
                  )
                ) : (
                  <RegistrationProfileForm
                    value={profileDraft}
                    disabled={effectiveLoading}
                    errors={profileErrors}
                    onFocusZone={() => guidedFlow.goToField('personalInfo')}
                    onChange={(nextDraft) => {
                      setProfileDraft(nextDraft);
                      setProfileErrors({});
                      setAttentionMessage('');
                    }}
                  />
                )}
              </div>
            </GuidedFieldWrapper>

            <GuidedFieldWrapper
              fieldKey="accountInfo"
              activeField={guidedFlow.activeField}
              helperText={
                ttsMessages?.joinClan?.accountInfo ||
                'Bác nhập số điện thoại và mật khẩu để tạo tài khoản đăng nhập.'
              }
              completed={guidedFlow.isCompleted('accountInfo')}
              voiceAction={
                <ZoneVoiceButton
                  visible={showAzVoiceButton('accountInfo')}
                  text={zoneHelpText.accountInfo}
                  label="Nghe"
                  disabled={effectiveLoading}
                />
              }
            >
              <div className={uiSystem.section}>
                <div className="space-y-5">
                  <div className="space-y-1">
                    <label className={uiSystem.label}>
                      Số điện thoại đăng nhập <span className="text-rose-500">*</span>
                    </label>

                    <div className="flex flex-col gap-2 sm:flex-row">
                      <select
                        aria-label="Chọn quốc gia"
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
                        className={`min-h-[48px] sm:w-52 shrink-0 ${uiSystem.select || uiSystem.input} ${
                          isRevision ? 'opacity-80 cursor-not-allowed bg-slate-50' : ''
                        }`}
                      >
                        {COUNTRY_PHONE_OPTIONS.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.label}
                          </option>
                        ))}
                      </select>

                      <div className="relative flex-1">
                        <Phone
                          className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
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
                          className={`min-h-[48px] pl-11 ${uiSystem.input} ${
                            isRevision ? 'opacity-80 cursor-not-allowed bg-slate-50' : ''
                          }`}
                          placeholder={selectedCountryMeta.placeholder}
                        />

                        {phoneChecking && (
                          <Loader2
                            className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-blue-500"
                            size={18}
                          />
                        )}
                      </div>
                    </div>

                    {errors.phone && (
                      <p className="text-base font-bold text-rose-600">{errors.phone.message}</p>
                    )}

                    {phoneRemoteError && (
                      <p className="text-rose-600 text-base mt-1">{phoneRemoteError}</p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className={uiSystem.label}>
                      Email <span className="text-slate-400">(không bắt buộc)</span>
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
                        className={`min-h-[48px] pl-11 ${uiSystem.input} ${
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

                  <div className="space-y-1">
                    <label className={uiSystem.label}>
                      Mật khẩu <span className="text-rose-500">*</span>
                    </label>

                    <div className="relative">
                      <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

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
                        className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-12 text-base text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                      />

                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="min-h-[48px] min-w-[48px] flex items-center justify-center absolute right-1 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-slate-700"
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
              </div>
            </GuidedFieldWrapper>

            <CaptchaAttentionField
              captchaZone={captchaZone}
              guidedFlow={guidedFlow}
              fieldKey="captcha"
              nextZone="submit"
              disabled={effectiveLoading}
              loading={effectiveLoading}
              elderAssistMode
              helperText={zoneHelpText.captcha}
              voiceText={zoneHelpText.captcha}
              voiceLabel="Nghe"
              onFocus={() => guidedFlow.goToField('captcha')}
            />

            <ActionFooter isStep1={true} />
            {onBackToRegister && (
              <button
                type="button"
                onClick={onBackToRegister}
                disabled={effectiveLoading}
                className="min-h-[48px] mt-4 inline-flex w-full items-center justify-center gap-2 rounded-3xl border border-slate-200 bg-white px-4 py-4 text-base font-black text-slate-700 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
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
