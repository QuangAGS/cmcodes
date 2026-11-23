/**
 * PATH       : frontend/src/features/register-wizard/components/CreateClanForm.jsx
 * OLD PATH   : src/features/auth/components/CreateClanForm.jsx
 * DATETIME   : 2026-11-23T15:50:00+07:00
 * VERSION    : 24.15.0-ISO29148-UAT-BUG12
 * DESCRIPTION:
 * PURPOSE
 * - Create a new clan registration flow.
 *
 * RESPONSIBILITIES
 * - Collect clan information
 * - Collect administrator information
 * - Validate identity uniqueness (phone/email)
 * - Validate captcha
 * - Transition to WaitingPage for review
 *
 * ARCHITECTURE
 * - Submit-gated validation (R3.3 doctrine)
 * - Shared captcha zone
 * - User-controlled voice guidance
 * - WaitingPage review lifecycle
 *
 * NON-NEGOTIABLE RULES
 * - Q1: Do not break working business flow
 * - Q2: Preserve UX/UI
 * - Q3: Prefer anchor-level patch
 * CHANGELOGS:
 * - PR-OP-4: reopen TU_CHOI; cycle CHO_DUYET -> TU_CHOI -> CHO_DUYET; Final rejection handling.
 * - 2026-11-13T18:05:00+07:00 (v24.7.1-MULTIHOME-UAT-BUG3-RELATIONSHIP):
 *   + Bổ sung child_type & temp_relationship vào founderRegistrationProfile.
 * - 2026-11-14T13:07:00+07:00 (v24.8.0-MULTIHOME-UAT-BUG5-CHECK-IDENTITY-FIX):
 *   + Fix UAT Bug 5 (429 Too Many Requests khi kiểm tra phone/email):
 *     * Gỡ 2 useEffect bắn GET /auth/check-identity trên từng phím gõ (30+ request/2s).
 *     * Kiểm tra định dạng phone/email cục bộ trước khi gọi API, cache kết quả kiểm tra
 *       hợp lệ giữa onBlur và nextStep, và báo rõ khi server trả 429.
 * - 2026-11-14T20:14:00+07:00 (v24.9.0-INTL-PHONE-COUNTRY-SELECTOR):
 *   + Thêm bộ chọn quốc gia (mặc định Việt Nam +84) kết hợp chuẩn hóa số điện thoại quốc tế
 *     ITU-T E.164 bằng libphonenumber-js/min (COUNTRY_PHONE_OPTIONS, validatePhoneWithCountry).
 * - 2026-11-14T21:55:00+07:00 (v24.9.1-RESTORE-WAITING-DRAFT):
 *   + Fix UAT Bug 6: Trích xuất đầy đủ dữ liệu từ data.registration_profile trong normalizeCreateDraft
 *     và đồng bộ lại founderGender, founderAlias, founderBirthPlace, founderAddress khi bấm
 *     "Quay lại chỉnh sửa" từ WaitingPage.
 * - 2026-11-22T15:45:00+07:00 (v24.11.0-ISO29148-CLAN-SETUP-M2):
 *   + Bổ sung Card "Người cao niên (>= 60 tuổi) xác minh" (`elder_name`, `elder_phone` + mã quốc gia E.164)
 *     đồng bộ với ClanSetupPage (C1-S), WaitingPage, UserApprovalForm và Backend ARCH-06.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Loader2,
  Phone,
  LockKeyhole,
  ShieldCheck,
  Eye,
  EyeOff,
  Landmark,
  Mail,
  User,
  AlertCircle,
} from 'lucide-react';

import AudioHelpButton from '../../elder-doctrine/components/AudioHelpButton.jsx';
import { ttsMessages } from '../../../features/elder-doctrine/constants/ttsMessages.js';
import { useTts } from '../../../shared/hooks/useTts.js';
import ZoneVoiceButton from '../../elder-doctrine/components/ZoneVoiceButton.jsx';

import GuidedFieldWrapper from '../../elder-doctrine/components/GuidedFieldWrapper.jsx';
//import StepCoachBar from '../../a11y/guided/StepCoachBar.jsx';
import useGuidedFlow from '../../../shared/hooks/useGuidedFlow.js';
import useProactiveVoiceGuidance from '../../elder-doctrine/hooks/useProactiveVoiceGuidance.js';

import {
  determineNextAttentionTarget,
  buildAttentionInstruction,
} from '../../elder-doctrine/services/guidedProgression.service.js';

import {
  runValidationGate,
  buildValidationAttentionTarget,
} from '../../elder-doctrine/services/validationGate.service.js';

import {
  createInvalidationPlan,
  shouldClearOnlineValidation,
  shouldClearCompletedField,
} from '../../elder-doctrine/services/runtimeInvalidation.service.js';

import AttentionZone from  '../../../components/AttentionZone.jsx';
import CollapsibleDetailCard from '../../../components/common/CollapsibleDetailCard.jsx';
import RulesAgreementCard from '../../onboarding/components/RulesAgreementCard.jsx';
import ClanNameDuplicateAlert, {
  fetchSimilarClanNames,
} from '../../onboarding/components/ClanNameDuplicateAlert.jsx';
import {
  SETUP_PURPOSE_OPTIONS,
  KNOWN_GENERATIONS_OPTIONS,
} from '../../onboarding/constants/platformRulesCatalog.js';

import apiClient from '../../../lib/apiClient.js';
import { createClanSchema } from '../utils/createClanValidation.js';
import {
  COUNTRY_PHONE_OPTIONS,
  validatePhoneWithCountry,
  detectPhoneCountry,
} from '../../../shared/utils/validationRules.js';
import {
  resolveRevisionPhone,
  resolveRevisionEmail,
} from '../utils/identityHelpers.js';
/**
 * Shared captcha runtime
 * - No local Turnstile state
 * - Validation occurs at nextStep()
 * - Token consumed only after safe transition
 */
import useCaptchaZone from '../../elder-doctrine/hooks/useCaptchaZone.js';
import CaptchaAttentionField from '../../elder-doctrine/components/CaptchaAttentionField.jsx';
import { CAPTCHA_RESET_REASONS } from '../../elder-doctrine/services/captchaZone.service.js';
// --------------------------------------------------------------------------------

/**
 * Static relationship options
 * - UI-only labels
 * - No business logic
 */
const RELATIONSHIP_OPTIONS = [
  { value: '', label: 'Chọn quan hệ với dòng họ' },
  { value: 'CON_DE', label: 'Con đẻ' },
  { value: 'CON_DAU', label: 'Con dâu' },
  { value: 'CON_RE', label: 'Con rể' },
  { value: 'CON_NUOI', label: 'Con nuôi' },
  { value: 'CON_DO_DAU', label: 'Con đỡ đầu' },
  { value: 'KHAC', label: 'Loại Khác' },
];

/**
 * Attention zone model
 * Used by guided progression service
 * to determine next attention target.
 *
 * R3.3:
 * no forced sequential flow
 * only routing assistance.
 */
const GUIDED_PROGRESSION_ZONES = [
  {
    id: 'clanInfo',
    label: 'Thông tin dòng họ',
    fields: ['clanInfo'],
    required: true,
    enabled: true,
    priority: 'high',
  },
  {
    id: 'personalInfo',
    label: 'Thông tin quản trị viên',
    fields: ['personalInfo'],
    required: true,
    enabled: true,
    priority: 'medium',
  },
  {
    id: 'elderInfo',
    label: 'Người cao niên xác minh',
    fields: ['elderInfo'],
    required: true,
    enabled: true,
    priority: 'medium',
  },
  {
    id: 'contactInfo',
    label: 'Thông tin liên hệ',
    fields: ['contactInfo'],
    required: true,
    enabled: true,
    priority: 'medium',
  },
  {
    id: 'securityInfo',
    label: 'Bảo mật',
    fields: ['securityInfo'],
    required: true,
    enabled: true,
    priority: 'high',
  },
  {
    id: 'rulesInfo',
    label: 'Cam kết nội quy',
    fields: ['rulesInfo'],
    required: true,
    enabled: true,
    priority: 'high',
  },
];

/**
 * Default visual system
 * Parent may override styles,
 * but business logic must stay identical.
 * [UAT-IMP5 Mục 2]: Phân tách rõ Label (font-normal text-slate-600) và Data (font-bold text-slate-900).
 */
const DEFAULT_UI_SYSTEM = {
  container: 'w-full space-y-6',
  section:
    'space-y-4 rounded-3xl border border-slate-100 bg-white p-4 shadow-sm',
  label: 'block text-base font-normal text-slate-600 mb-1.5',
  input:
    'min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base font-bold text-slate-900 placeholder:font-normal placeholder:text-slate-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100',
  select:
    'min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base font-bold text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100',
  footer: 'pt-8',
};

/**
 * PR-OP-4 C2: chuẩn hóa draft revision (tránh number.prefill fail .trim)
 */
const normalizeCreateDraft = (data) => {
  if (!data || typeof data !== 'object') return data || {};
  const rp =
    data.registration_profile && typeof data.registration_profile === 'object'
      ? data.registration_profile
      : {};

  const resolvedFullName = data.temp_full_name ?? rp.full_name;
  const resolvedFatherName = data.temp_father_name ?? rp.father_name;
  const resolvedMotherName = data.temp_mother_name ?? rp.mother_name;
  const resolvedBirthYear = data.temp_birth_year ?? rp.birth_year;
  const resolvedRelationship =
    data.temp_relationship ?? rp.temp_relationship ?? rp.child_type;
  const resolvedNote = data.temp_note ?? rp.note;
  const resolvedElderName = data.elder_name ?? rp.elder_name;
  const resolvedElderPhone = data.elder_phone ?? rp.elder_phone;
  const resolvedSetupPurpose = data.setup_purpose ?? rp.setup_purpose;
  const resolvedKnownGenerations = data.known_generations ?? rp.known_generations;
  const resolvedEarliestAncestor =
    data.earliest_ancestor_name ?? rp.earliest_ancestor_name;
  const resolvedClanOriginPlace = data.clan_origin_place ?? rp.clan_origin_place;

  return {
    ...data,
    clanName: data.clanName != null ? String(data.clanName) : '',
    description:
      data.description != null
        ? String(data.description)
        : data.clanDescription != null
          ? String(data.clanDescription)
          : '',
    temp_full_name:
      resolvedFullName != null ? String(resolvedFullName) : '',
    temp_father_name:
      resolvedFatherName != null ? String(resolvedFatherName) : '',
    temp_mother_name:
      resolvedMotherName != null ? String(resolvedMotherName) : '',
    temp_birth_year:
      resolvedBirthYear != null && resolvedBirthYear !== ''
        ? String(resolvedBirthYear)
        : '',
    temp_relationship:
      resolvedRelationship != null ? String(resolvedRelationship) : '',
    temp_note: resolvedNote != null ? String(resolvedNote) : '',
    elder_name: resolvedElderName != null ? String(resolvedElderName) : '',
    elder_phone: resolvedElderPhone != null ? String(resolvedElderPhone) : '',
    setup_purpose: resolvedSetupPurpose != null ? String(resolvedSetupPurpose) : '',
    known_generations:
      resolvedKnownGenerations != null ? String(resolvedKnownGenerations) : '',
    earliest_ancestor_name:
      resolvedEarliestAncestor != null ? String(resolvedEarliestAncestor) : '',
    clan_origin_place:
      resolvedClanOriginPlace != null ? String(resolvedClanOriginPlace) : '',
    phone: data.phone != null ? String(data.phone) : '',
    email: data.email != null ? String(data.email) : '',
    password: data.password != null ? String(data.password) : '',
  };
};

const CreateClanForm = ({
  onGoToWaiting,
  onSubmit,
  uiSystem: uiSystemProp,
  loading = false,
  isSubmitting = false,
  initialData = null,
  lifecycleContext = null,
  runtimeSessionId = 0,
  onBackToRegister,
  onSwitchToJoinClan,
  // PR-OP-4 C1
  isRevision = false,
  reviewNote = '',
  lockedIdentifier = '',
}) => {
  const effectiveReviewNote = String(
    reviewNote || initialData?.reviewNote || ''
  ).trim();
  const uiSystem = uiSystemProp || DEFAULT_UI_SYSTEM;

  /**
   * Local runtime state
   *
   * - isChecking: async phone/email validation
   * - onlineErrors: uniqueness validation errors
   * - attentionMessage: single authoritative attention
   * - attentionField: current routed field
   * - showPassword: password visibility
   */
  const effectiveLoading = loading || isSubmitting;

  const step = 1;

  const captchaZone = useCaptchaZone({
    scope: 'createClan',
  });

  const [isChecking, setIsChecking] = useState({
      phone: false,
      email: false,
  });

  const [onlineErrors, setOnlineErrors] = useState({
    phone: '',
    email: '',
  });

  
  const [showPassword, setShowPassword] = useState(false);
  const [phoneCountry, setPhoneCountry] = useState(() =>
    detectPhoneCountry(initialData?.phone, 'VN')
  );
  const selectedCountryMeta = useMemo(
    () =>
      COUNTRY_PHONE_OPTIONS.find((c) => c.code === phoneCountry) ||
      COUNTRY_PHONE_OPTIONS[0],
    [phoneCountry]
  );
  const [founderGender, setFounderGender] = useState(
    initialData?.registration_profile?.gender || initialData?.gender || 'NAM'
  );
  const [founderAlias, setFounderAlias] = useState(
    initialData?.registration_profile?.alias || initialData?.alias || ''
  );
  const [founderBirthPlace, setFounderBirthPlace] = useState(
    initialData?.registration_profile?.birth_place ||
      initialData?.birth_place ||
      ''
  );
  const [founderAddress, setFounderAddress] = useState(
    initialData?.registration_profile?.address || initialData?.address || ''
  );
  const [setupPurpose, setSetupPurpose] = useState(
    initialData?.registration_profile?.setup_purpose ||
      initialData?.setup_purpose ||
      ''
  );
  const [knownGenerations, setKnownGenerations] = useState(
    initialData?.registration_profile?.known_generations ||
      initialData?.known_generations ||
      ''
  );
  const [earliestAncestorName, setEarliestAncestorName] = useState(
    initialData?.registration_profile?.earliest_ancestor_name ||
      initialData?.earliest_ancestor_name ||
      ''
  );
  const [clanOriginPlace, setClanOriginPlace] = useState(
    initialData?.registration_profile?.clan_origin_place ||
      initialData?.clan_origin_place ||
      ''
  );
  const [elderName, setElderName] = useState(
    initialData?.registration_profile?.elder_name ||
      initialData?.elder_name ||
      ''
  );
  const [elderPhone, setElderPhone] = useState(
    initialData?.registration_profile?.elder_phone ||
      initialData?.elder_phone ||
      ''
  );
  const [elderPhoneCountry, setElderPhoneCountry] = useState(() =>
    detectPhoneCountry(
      initialData?.registration_profile?.elder_phone ||
        initialData?.elder_phone,
      'VN'
    )
  );
  const selectedElderCountryMeta = useMemo(
    () =>
      COUNTRY_PHONE_OPTIONS.find((c) => c.code === elderPhoneCountry) ||
      COUNTRY_PHONE_OPTIONS[0],
    [elderPhoneCountry]
  );
  const [rulesAgreement, setRulesAgreement] = useState({
    agreed: Boolean(
      initialData?.agreed_rules || initialData?.registration_profile?.agreed_rules
    ),
    agreed_rules_snapshot:
      initialData?.agreed_rules_snapshot ||
      initialData?.registration_profile?.agreed_rules_snapshot ||
      '',
    agreed_tos_version:
      initialData?.agreed_tos_version ||
      initialData?.registration_profile?.agreed_tos_version ||
      '1.0',
    agreed_clan_rules_version:
      initialData?.agreed_clan_rules_version ||
      initialData?.registration_profile?.agreed_clan_rules_version ||
      1,
  });
  const [rulesError, setRulesError] = useState('');
  const [clanNameChecking, setClanNameChecking] = useState(false);
  const [clanNameDupResult, setClanNameDupResult] = useState(null);
  const lastCheckedClanNameRef = useRef('');
  const [attentionMessage, setAttentionMessage] = useState('');
  const [attentionField, setAttentionField] = useState('');
  const { speak } = useTts();

  /**
   * Mandatory speech helper
   *
   * Safari-safe:
   * use speak() instead of speakError()
   * for more stable playback.
   *
   * Elder UX:
   * slower speech rate = 0.82
   */
  const speakMandatoryError = useCallback(
    (text, options = {}) => {
      if (!text) return false;

      return speak?.(text, {
        rate: 0.82,
        ...options,
      });
    },
    [speak]
  );

  /**
   * <2026-05-15T16:00:00+07:00>
   * EGAL-6.6.1:
   * Critical attention message must be spoken every time,
   * even when the same validation error repeats.
   *
   * Q1/Q2 safe:
   * - UI guidance only
   * - no validation change
   * - no payload/API change
   */
  const speakCriticalAttention = useCallback(
    (message) => {
      if (!message) return;

      setAttentionMessage('');

      requestAnimationFrame(() => {
        setAttentionMessage(message);

        window.setTimeout(() => {
          speakMandatoryError(message);
        }, 250);
      });
    },
    [speakMandatoryError]
  );

  const lastLifecycleVersionRef = useRef(lifecycleContext?.runtimeVersion || 0);
  const lastRuntimeSessionIdRef = useRef(null);
  /**
   * <2026-05-17T10:00:00+07:00>
   * VERSION: 24.6.7.R1.9
   * PURPOSE:
   * - SecurityInfo chỉ được coi là hoàn thành nếu người dùng hoàn thành
   *   trong session hiện tại.
   * - Chặn Turnstile auto-verify kéo attention thẳng tới submit
   *   khi form vừa mount lại.
   */
  const securityInfoCompletedInSessionRef = useRef(false);

  const formRef = useRef(null);
  const clanInfoRef = useRef(null);
  const personalInfoRef = useRef(null);
  const elderInfoRef = useRef(null);
  const contactInfoRef = useRef(null);
  const securityInfoRef = useRef(null);
  const rulesInfoRef = useRef(null);
  /**
   * Field refs for routing
   * Used by routeFieldError()
   * to scroll/focus correct section.
   */
  /**
   * React Hook Form contract
   *
   * Validation:
   * - submit-gated
   * - revalidate on change after submit
   *
   * Browser native validation:
   * disabled via noValidate
   */
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    trigger,
    getValues,
    getFieldState,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(createClanSchema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: {
      temp_relationship: '',
      hp_field: '',
      ...normalizeCreateDraft(initialData || {}), //PR-OP-4 C2: normalize draft data
    },
  });

  const formValues = watch();
  /**
   * Zone voice guidance
   * Used by ZoneVoiceButton
   * and captcha helper speech.
   */
  const zoneHelpText = useMemo(
    () => ({
      clanInfo:
        ttsMessages?.createClan?.clanNameFocus ||
        'Bác nhập tên dòng họ cần tạo và mô tả ngắn về dòng họ.',
      personalInfo:
        ttsMessages?.createClan?.personalInfo ||
        'Bác nhập thông tin cá nhân của người quản trị.',
      elderInfo:
        'Bác chọn mục đích tạo dòng họ mới, số đời dự kiến ghi chép, vị tiền nhân cao nhất được biết và địa bàn gốc của gia đình hoặc dòng họ.',
      contactInfo:
        ttsMessages?.createClan?.contactInfo ||
        'Bác nhập số điện thoại đăng nhập và email nhận thông báo.',
      securityInfo:
        ttsMessages?.createClan?.passwordFocus ||
        'Bác nhập mật khẩu đăng nhập.',
      rulesInfo:
        'Bác vui lòng đọc kỹ Nội quy chung của nền tảng và tích cam kết tuân thủ trước khi tiếp tục.',
      captcha:
        ttsMessages?.createClan?.captcha ||
        'Bác hãy bấm vào ô vuông. Khi thấy dấu tích màu xanh là đã xác nhận xong.',
      submit:
        ttsMessages?.createClan?.submit ||
        'Bác bấm nút tiếp tục rà soát để kiểm tra lại hồ sơ.',
    }),
    []
  );

  //Auto-clear inline errors (R3.3 standard)
  useEffect(() => {
    const subscription = watch((_, { name }) => {
      if (!name) return;

      if (errors?.[name]) {
        trigger(name);
      }
    });

    return () => subscription.unsubscribe();
  }, [watch, trigger, errors]);

  // [UAT-IMP7] Kiểm tra mềm trùng tên dòng họ (debounce 650ms + onBlur)
  const checkDuplicateClanName = useCallback(async (rawName, { force = false } = {}) => {
    const cleanName = String(rawName || '').trim().replace(/\s+/g, ' ');
    if (cleanName.length < 3) {
      lastCheckedClanNameRef.current = '';
      setClanNameDupResult(null);
      setClanNameChecking(false);
      return;
    }
    if (!force && lastCheckedClanNameRef.current === cleanName.toLowerCase()) {
      return;
    }
    lastCheckedClanNameRef.current = cleanName.toLowerCase();
    setClanNameChecking(true);
    try {
      const res = await fetchSimilarClanNames(cleanName);
      setClanNameDupResult(res);
    } finally {
      setClanNameChecking(false);
    }
  }, []);

  useEffect(() => {
    const currentClanName = String(formValues.clanName || '').trim();
    if (currentClanName.length < 3) {
      setClanNameDupResult(null);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      checkDuplicateClanName(currentClanName);
    }, 650);
    return () => window.clearTimeout(timer);
  }, [formValues.clanName, checkDuplicateClanName]);
  /**
   * Attention step model
   *
   * Used only for:
   * - active attention zone
   * - helper text
   * - voice guidance
   *
   * No forced progression.
   */
  const guidedSteps = useMemo(
    () => [
      {
        fieldKey: 'clanInfo',
        title: 'Nhập thông tin dòng họ',
        description:
          ttsMessages?.createClan?.clanNameFocus ||
          'Bác nhập tên dòng họ cần tạo.',
        nextLabel: 'Tiếp theo: nhập thông tin quản trị viên.',
      },
      {
        fieldKey: 'personalInfo',
        title: 'Nhập thông tin quản trị viên',
        description:
          ttsMessages?.createClan?.personalInfo ||
          'Bác nhập thông tin cá nhân của người quản trị.',
        nextLabel: 'Tiếp theo: nhập thông tin người cao niên xác minh.',
      },
      {
        fieldKey: 'elderInfo',
        title: 'Thẩm định khởi tạo dòng họ',
        description:
          'Bác cho biết mục đích tạo dòng họ, số đời dự kiến, vị tiền nhân cao nhất và địa bàn gốc.',
        nextLabel: 'Tiếp theo: nhập số điện thoại và email.',
      },
      {
        fieldKey: 'contactInfo',
        title: 'Nhập thông tin liên hệ',
        description:
          ttsMessages?.createClan?.contactInfo ||
          'Bác nhập số điện thoại đăng nhập và email nhận thông báo.',
        nextLabel: 'Tiếp theo: tạo mật khẩu.',
      },
      {
        fieldKey: 'securityInfo',
        title: 'Tạo mật khẩu',
        description:
          ttsMessages?.createClan?.passwordFocus ||
          'Bác nhập mật khẩu đăng nhập.',
        nextLabel: 'Tiếp theo: đọc và cam kết nội quy.',
      },
      {
        fieldKey: 'rulesInfo',
        title: 'Cam kết tuân thủ nội quy',
        description:
          'Bác đọc Nội quy chung của nền tảng và tích vào ô cam kết tuân thủ.',
        nextLabel: 'Tiếp theo: xác minh.',
      },
      /**
       * <2026-05-16T20:30:00+07:00>
       * VERSION: 24.6.7.R1.5
       * PURPOSE:
       * - CAPTCHA có guided field riêng để proactive voice guidance đọc đúng.
       * - Không thay đổi Turnstile, validation, payload hoặc API contract.
       */
      {
        fieldKey: 'captcha',
        title: 'Xác minh',
        description:
          ttsMessages?.createClan?.captcha ||
          'Bác hãy bấm vào ô vuông. Khi thấy dấu tích màu xanh là đã xác nhận xong.',
        nextLabel: 'Tiếp theo: rà soát hồ sơ.',
      },
      {
        fieldKey: 'submit',
        title: 'Rà soát hồ sơ',
        description:
          ttsMessages?.createClan?.submit ||
          'Bác bấm nút tiếp tục rà soát để kiểm tra lại hồ sơ.',
        nextLabel: '',
      },
    ],
    []
  );

  const guidedFlow = useGuidedFlow(guidedSteps, {
    initialStepIndex: 0,
    initialFieldKey: 'clanInfo',
    enabled: true,

    /**
     * <2026-05-17T10:00:00+07:00>
     * VERSION: 24.6.7.R1.9
     * PURPOSE:
     * - CreateClanForm trong Register flow không restore activeField cũ.
     * - Refresh hoặc quay lại từ selector luôn bắt đầu lại từ clanInfo.
     */
    persistRecovery: false,
  });
  /**
   * Only show voice button
   * for active attention zone.
   */
  const showAzVoiceButton = (zoneId) => guidedFlow.activeField === zoneId;

  /**
   * <2026-05-16T20:00:00+07:00>
   * VERSION: 24.6.7.R1.4
   * PURPOSE:
   * - EGAL-6.7 proactive spoken guidance cho CreateClanForm.
   * - Đọc hướng dẫn thao tác theo activeField.
   * - Safari-safe initial voice guidance dùng default delay từ hook.
   *
   * Q1 SAFE:
   * - Không đổi validation.
   * - Không đổi payload/API contract.
   * - Không đổi Turnstile/Honeypot.
   * - Không đổi WaitingPage transition.
   */
  useProactiveVoiceGuidance({
    activeField: guidedFlow.activeField,
    guidedSteps,
    scope: 'createClan',
    enabled: true,
    speakOnMount: true,
  });
  /**
   * <2026-05-17T10:00:00+07:00>
   * VERSION: 24.6.7.R1.9.1
   * PURPOSE:
   * - Fresh runtime boundary phải chạy lại theo runtimeSessionId.
   * - RegisterForm -> CreateClanForm
   * - Browser refresh
   * - Back-forward navigation
   * đều phải reset runtime sạch.
   *
   * Q1/Q2 SAFE:
   * - Không đổi draft data
   * - Không đổi payload/API
   * - Không đổi validation
   * - Chỉ reset runtime state
   */
  /**
   * Fresh runtime boundary
   *
   * RegisterForm → CreateClanForm
   * refresh
   * back-forward
   *
   * reset runtime only:
   * - captcha
   * - attention
   * - online validation
   * - activeField
   */
  useEffect(() => {
    const isInitialMount = lastRuntimeSessionIdRef.current === null;
    lastRuntimeSessionIdRef.current = runtimeSessionId;

    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }

    if (!isInitialMount) {
      captchaZone.reset();
    }

    setAttentionMessage('');
    setAttentionField('');
    setOnlineErrors({
      phone: '',
      email: '',
    });

    setIsChecking({
      phone: false,
      email: false,
    });

    securityInfoCompletedInSessionRef.current = false;
    checkedIdentityCacheRef.current = { phone: null, email: null };
    if (!initialData?.phone) {
      setPhoneCountry('VN');
    }

    if (guidedFlow.resetGuidedFlow) {
      guidedFlow.resetGuidedFlow();
    } else if (guidedFlow.resetFlow) {
      guidedFlow.resetFlow();
    }

    guidedFlow.goToField('clanInfo');

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtimeSessionId]);

  /**
   * WaitingPage → Edit reconstruction
   *
   * Preserve draft values
   * but reset runtime state.
   */
  useEffect(() => {
    const nextVersion = lifecycleContext?.runtimeVersion || 0;
    const versionChanged = nextVersion !== lastLifecycleVersionRef.current;
    const shouldReconstruct =
      lifecycleContext?.reconstructRuntime === true ||
      lifecycleContext?.reentryContext?.resetRuntime === true;

    const isEditFromWaiting =
      lifecycleContext?.reentryContext?.from === 'WaitingPage' &&
      lifecycleContext?.reentryContext?.action === 'edit';

    if (versionChanged && shouldReconstruct) {
      /**
       * <2026-05-17T10:00:00+07:00>
       * VERSION: 24.6.7.R1.9.1
       * PURPOSE:
       * WaitingPage -> Edit:
       * giữ draft data
       * nhưng reset runtime sạch.
       *
       * reset:
       * - captcha
       * - attention
       * - online validation runtime
       * - security progression state
       */
      captchaZone.reset();

      securityInfoCompletedInSessionRef.current = false;

      setAttentionMessage('');
      setAttentionField('');

      setOnlineErrors({
        phone: '',
        email: '',
      });

      setIsChecking({
        phone: false,
        email: false,
      });

      if (guidedFlow.resetGuidedFlow) {
        guidedFlow.resetGuidedFlow();
      } else if (guidedFlow.resetFlow) {
        guidedFlow.resetFlow();
      }

      /**
       * EGAL-6.5.4.1:
       * WaitingPage -> Edit phải quay về đầu review context.
       * Không restore activeField/progression cũ.
       */
      requestAnimationFrame(() => {
        guidedFlow.goToField(isEditFromWaiting ? 'clanInfo' : 'clanInfo');
      });
    }

    lastLifecycleVersionRef.current = nextVersion;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lifecycleContext?.runtimeVersion]);

  useEffect(() => {
    const isEditFromWaiting =
      lifecycleContext?.reentryContext?.from === 'WaitingPage' &&
      lifecycleContext?.reentryContext?.action === 'edit';

    // Revision hoặc back từ Waiting → giữ draft
    const shouldRestoreDraft =
      (isRevision && initialData) || (isEditFromWaiting && initialData);

    if (shouldRestoreDraft) {
      const mappedInitialData = Object.keys(initialData).reduce((acc, key) => {
        const mappedKey = key === 'clanDescription' ? 'description' : key;
        acc[mappedKey] = initialData[key];
        return acc;
      }, {});

      // C2: normalize string (temp_birth_year number, …)
      const normalized = normalizeCreateDraft(mappedInitialData);
      const rp =
        initialData?.registration_profile &&
        typeof initialData.registration_profile === 'object'
          ? initialData.registration_profile
          : {};

      setPhoneCountry(
        initialData?.phoneCountry || detectPhoneCountry(normalized.phone, 'VN')
      );
      setFounderGender(rp.gender || initialData?.gender || 'NAM');
      setFounderAlias(rp.alias || initialData?.alias || '');
      setFounderBirthPlace(rp.birth_place || initialData?.birth_place || '');
      setFounderAddress(rp.address || initialData?.address || '');
      setSetupPurpose(rp.setup_purpose || initialData?.setup_purpose || '');
      setKnownGenerations(
        rp.known_generations || initialData?.known_generations || ''
      );
      setEarliestAncestorName(
        rp.earliest_ancestor_name || initialData?.earliest_ancestor_name || ''
      );
      setClanOriginPlace(
        rp.clan_origin_place || initialData?.clan_origin_place || ''
      );
      const restoredElderName = rp.elder_name || initialData?.elder_name || '';
      const restoredElderPhone = rp.elder_phone || initialData?.elder_phone || '';
      setElderName(restoredElderName);
      setElderPhone(restoredElderPhone);
      setElderPhoneCountry(detectPhoneCountry(restoredElderPhone, 'VN'));

      reset(
        {
          temp_relationship: '',
          hp_field: '',
          ...normalized,
        },
        {
          keepErrors: false,
          keepDirty: false,
          keepTouched: false,
        }
      );
      return;
    }

    // Fresh CreateClan
    setPhoneCountry('VN');
    setSetupPurpose('');
    setKnownGenerations('');
    setEarliestAncestorName('');
    setClanOriginPlace('');
    setElderName('');
    setElderPhone('');
    setElderPhoneCountry('VN');
    setRulesAgreement((prev) => ({ ...prev, agreed: false }));
    setRulesError('');
    reset(
      {
        temp_relationship: '',
        hp_field: '',
      },
      {
        keepErrors: false,
        keepDirty: false,
        keepTouched: false,
      }
    );
  }, [
    initialData,
    isRevision,
    lifecycleContext?.reentryContext?.from,
    lifecycleContext?.reentryContext?.action,
    reset,
  ]);

  //PR-OP-4 C2: runtime invalidation plan
  const applyInvalidationPlan = useCallback(
    (plan) => {
      if (!plan?.invalidated) return;

      setOnlineErrors((prev) => ({
        phone: shouldClearOnlineValidation(plan, 'phone') ? '' : prev.phone,
        email: shouldClearOnlineValidation(plan, 'email') ? '' : prev.email,
      }));

      if (
        shouldClearOnlineValidation(plan, 'phone') ||
        shouldClearOnlineValidation(plan, 'email')
      ) {
        setIsChecking({ phone: false, email: false });
      }

      ['clanInfo', 'personalInfo', 'elderInfo', 'contactInfo', 'securityInfo', 'captcha'].forEach(
        (fieldKey) => {
          if (shouldClearCompletedField(plan, fieldKey)) {
            guidedFlow.unmarkCompleted(fieldKey);
          }
        }
      );

      if (plan.affectedZones?.[0]) {
        guidedFlow.goToField(plan.affectedZones[0]);
      }
    },
    [guidedFlow]
  );

  const invalidateRuntimeForField = useCallback(
    (fieldKey) => {
      const plan = createInvalidationPlan([fieldKey]);
      applyInvalidationPlan(plan);
    },
    [applyInvalidationPlan]
  );

  /**
   * Error routing authority
   *
   * Responsibilities:
   * - show attention message
   * - move active attention zone
   * - scroll/focus target
   * - Safari-safe delayed speech
   */
  const routeFieldError = useCallback(
    (fieldName, message = '') => {
      const finalMessage =
        message ||
        'Thông tin hồ sơ chưa đầy đủ hoặc chưa đúng. Bác vui lòng kiểm tra lại.';

      const routingMap = {
        clanName: { zone: 'clanInfo', ref: clanInfoRef },
        description: { zone: 'clanInfo', ref: clanInfoRef },

        temp_full_name: { zone: 'personalInfo', ref: personalInfoRef },
        temp_father_name: { zone: 'personalInfo', ref: personalInfoRef },
        temp_mother_name: { zone: 'personalInfo', ref: personalInfoRef },
        temp_birth_year: { zone: 'personalInfo', ref: personalInfoRef },
        temp_relationship: { zone: 'personalInfo', ref: personalInfoRef },
        temp_note: { zone: 'personalInfo', ref: personalInfoRef },

        setup_purpose: { zone: 'elderInfo', ref: elderInfoRef },
        known_generations: { zone: 'elderInfo', ref: elderInfoRef },
        earliest_ancestor_name: { zone: 'elderInfo', ref: elderInfoRef },
        clan_origin_place: { zone: 'elderInfo', ref: elderInfoRef },
        elder_name: { zone: 'elderInfo', ref: elderInfoRef },
        elder_phone: { zone: 'elderInfo', ref: elderInfoRef },

        phone: { zone: 'contactInfo', ref: contactInfoRef },
        email: { zone: 'contactInfo', ref: contactInfoRef },

        password: { zone: 'securityInfo', ref: securityInfoRef },
        agreed_rules: { zone: 'rulesInfo', ref: rulesInfoRef },
        captcha: { zone: 'captcha', ref: null },
        submit: { zone: 'submit', ref: null },
      };

      const target = routingMap[fieldName];

      setAttentionField(fieldName);
      setAttentionMessage('');

      requestAnimationFrame(() => {
        setAttentionMessage(finalMessage);

        if (target?.zone) {
          guidedFlow.goToField(target.zone);
        }

        const controlEl = fieldName
          ? formRef.current?.querySelector?.(`[name="${fieldName}"]`)
          : null;
        const scrollTarget = controlEl || target?.ref?.current;

        scrollTarget?.scrollIntoView?.({
          behavior: 'smooth',
          block: 'center',
        });

        if (controlEl && typeof controlEl.focus === 'function') {
          window.setTimeout(() => {
            try {
              controlEl.focus({ preventScroll: true });
            } catch (_) {
              controlEl.focus();
            }
          }, 120);
        }

        window.setTimeout(() => {
          speakMandatoryError(finalMessage);
        }, 250);
      });
    },
    [guidedFlow, speakMandatoryError]
  );

  const clearAttentionForField = useCallback(
    (fieldName) => {
      if (attentionField !== fieldName) return;

      setAttentionMessage('');
      setAttentionField('');
    },
    [attentionField]
  );

  /**
   * Online uniqueness validation
   *
   * Used for:
   * - phone uniqueness
   * - email uniqueness
   *
   * Fail-safe:
   * network error does not block transition.
   */
  const checkedIdentityCacheRef = useRef({
    phone: null,
    email: null,
  });

  /**
   * Online uniqueness validation
   * - Chỉ gọi API khi giá trị đạt định dạng hợp lệ theo quốc gia được chọn (tránh spam request gây 429).
   * - Tái sử dụng kết quả đã kiểm tra hợp lệ của cùng giá trị giữa onBlur và nextStep.
   * - Network/429 error: KHÔNG fail-open (chặn sang Waiting và báo rõ để bác thử lại).
   */
  const checkIdentityOnline = useCallback(async (type, value, options = {}) => {
    const { force = false, showFormatError = false, countryOverride } = options;
    const activeCountry = countryOverride || phoneCountry;
    const raw = String(value || '').trim();

    if (!raw) {
      checkedIdentityCacheRef.current[type] = null;
      setOnlineErrors((prev) => ({ ...prev, [type]: '' }));
      return {
        valid: false,
        message: '',
      };
    }

    let normalizedValue = '';
    if (type === 'phone') {
      const phoneCheck = validatePhoneWithCountry(raw, activeCountry);
      if (!phoneCheck.valid) {
        checkedIdentityCacheRef.current.phone = null;
        setOnlineErrors((prev) => ({
          ...prev,
          phone: showFormatError ? phoneCheck.message : '',
        }));
        return {
          valid: false,
          message: phoneCheck.message,
        };
      }
      normalizedValue = phoneCheck.normalized;
    } else {
      normalizedValue = raw.toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedValue)) {
        checkedIdentityCacheRef.current.email = null;
        setOnlineErrors((prev) => ({ ...prev, email: '' }));
        return {
          valid: false,
          message: '',
        };
      }
    }

    const cached = checkedIdentityCacheRef.current[type];
    if (!force && cached && cached.value === normalizedValue) {
      setOnlineErrors((prev) => ({
        ...prev,
        [type]: cached.valid ? '' : cached.message,
      }));
      return {
        valid: cached.valid,
        normalized: normalizedValue,
        message: cached.message,
      };
    }

    setIsChecking((prev) => ({ ...prev, [type]: true }));

    try {
      const res = await apiClient.get('/auth/check-identity', {
        params: {
          type,
          value: normalizedValue,
          ...(type === 'phone' ? { country: activeCountry } : {}),
        },
      });

      if (res.data?.available === false) {
        const message =
          res.data?.message ||
          `${type === 'phone' ? 'Số điện thoại' : 'Email'} này đã được sử dụng.`;

        checkedIdentityCacheRef.current[type] = {
          value: normalizedValue,
          valid: false,
          message,
        };

        setOnlineErrors((prev) => ({
          ...prev,
          [type]: message,
        }));

        return {
          valid: false,
          normalized: normalizedValue,
          message,
        };
      }

      checkedIdentityCacheRef.current[type] = {
        value: normalizedValue,
        valid: true,
        message: '',
      };

      setOnlineErrors((prev) => ({
        ...prev,
        [type]: '',
      }));

      return {
        valid: true,
        normalized: normalizedValue,
        message: '',
      };
    } catch (err) {
      console.error(`[CreateClan][checkIdentityOnline][${type}]`, err);
      checkedIdentityCacheRef.current[type] = null;
      const isRateLimited = err?.response?.status === 429;
      const message = isRateLimited
        ? 'Bác thao tác kiểm tra hơi nhanh. Vui lòng đợi vài giây rồi thử lại.'
        : type === 'phone'
          ? 'Không kiểm tra được số điện thoại lúc này. Bác vui lòng thử lại.'
          : 'Không kiểm tra được email lúc này. Bác vui lòng thử lại.';

      setOnlineErrors((prev) => ({
        ...prev,
        [type]: message,
      }));

      return {
        valid: false,
        message,
      };
    } finally {
      setIsChecking((prev) => ({ ...prev, [type]: false }));
    }
  }, [phoneCountry]);

  const getProgressionValidationState = useCallback(
    (values = getValues()) => {
      const clanInfoOk =
        !!values?.clanName?.trim?.() && !!values?.description?.trim?.();

      const personalInfoOk =
        !!values?.temp_full_name?.trim?.() &&
        !!values?.temp_father_name?.trim?.() &&
        !!values?.temp_mother_name?.trim?.() &&
        !!values?.temp_relationship &&
        !!values?.temp_note?.trim?.();

      const elderInfoOk =
        !!String(setupPurpose || '').trim() &&
        !!String(knownGenerations || '').trim() &&
        String(earliestAncestorName || '').trim().length >= 2 &&
        String(clanOriginPlace || '').trim().length >= 3;

      // PR-OP-4: revision — phone/email đã thuộc user, không bắt uniqueness
      const contactInfoOk =
        !!values?.phone?.trim?.() &&
        !!values?.email?.trim?.() &&
        (isRevision ||
          (!onlineErrors.phone &&
            !onlineErrors.email &&
            !isChecking.phone &&
            !isChecking.email));

      const securityInfoOk =
        !!values?.password?.trim?.() &&
        (isRevision || (!isChecking.phone && !isChecking.email));

      return {
        validFields: {
          clanInfo: clanInfoOk,
          personalInfo: personalInfoOk,
          elderInfo: elderInfoOk,
          contactInfo: contactInfoOk,
          securityInfo: securityInfoOk,
        },
        completedFields: {
          clanInfo: guidedFlow.isCompleted('clanInfo'),
          personalInfo: guidedFlow.isCompleted('personalInfo'),
          elderInfo: guidedFlow.isCompleted('elderInfo'),
          contactInfo: guidedFlow.isCompleted('contactInfo'),
          securityInfo: guidedFlow.isCompleted('securityInfo'),
        },
        invalidFields: {
          clanInfo: !clanInfoOk,
          personalInfo: !personalInfoOk,
          elderInfo: !elderInfoOk,
          contactInfo: !contactInfoOk,
          securityInfo: !securityInfoOk,
        },
      };
    },
    [getValues, guidedFlow, isChecking, onlineErrors, isRevision, setupPurpose, knownGenerations, earliestAncestorName, clanOriginPlace]
  );

  const advanceAttentionByProgression = useCallback(
    (values = getValues(), options = {}) => {
      const validationState = getProgressionValidationState(values);

      const target = determineNextAttentionTarget(
        GUIDED_PROGRESSION_ZONES,
        validationState
      );

      const instruction = buildAttentionInstruction(target, {
        message:
          options.message ||
          'Bác tiếp tục sang phần tiếp theo để hoàn tất hồ sơ.',
        completionMessage: 'Thông tin hồ sơ đã đủ để rà soát.',
      });

      if (instruction.type === 'MOVE' && instruction.field) {
        if (instruction.field !== guidedFlow.activeField) {
          guidedFlow.goToField(instruction.field);
        }

        return instruction;
      }

      return instruction;
    },
    [getProgressionValidationState, getValues, guidedFlow]
  );
/*
  const handleClanInfoProgression = () => {
    const values = getValues();

    if (values?.clanName?.trim?.() && values?.description?.trim?.()) {
      guidedFlow.markCompleted('clanInfo');
      advanceAttentionByProgression(values);
    }
  };
*/
/*
  const handlePersonalInfoProgression = () => {
    const values = getValues();

    if (
      values?.temp_full_name?.trim?.() &&
      values?.temp_father_name?.trim?.() &&
      values?.temp_relationship &&
      values?.temp_note?.trim?.()
    ) {
      guidedFlow.markCompleted('personalInfo');
      advanceAttentionByProgression(values);
    }
  };
*/
  const handleContactInfoProgression = () => {
    const values = getValues();

    if (
      values?.phone?.trim?.() &&
      values?.email?.trim?.() &&
      !onlineErrors.phone &&
      !onlineErrors.email &&
      !isChecking.phone &&
      !isChecking.email
    ) {
      guidedFlow.markCompleted('contactInfo');
      advanceAttentionByProgression(values);
    }
  };

  const hasCoreRequiredData = (values) => {
    return (
      !!values?.clanName?.trim?.() &&
      !!values?.description?.trim?.() &&
      !!values?.temp_full_name?.trim?.() &&
      !!values?.temp_father_name?.trim?.() &&
      !!values?.temp_mother_name?.trim?.() &&
      !!values?.temp_relationship &&
      !!values?.temp_note?.trim?.() &&
      !!String(setupPurpose || '').trim() &&
      !!String(knownGenerations || '').trim() &&
      String(earliestAncestorName || '').trim().length >= 2 &&
      String(clanOriginPlace || '').trim().length >= 3 &&
      !!values?.phone?.trim?.() &&
      !!values?.email?.trim?.() &&
      !!values?.password?.trim?.()
    );
  };

  const getAttentionFieldFromGate = (gateTarget, values) => {
    if (['clanName', 'description'].includes(gateTarget?.field)) {
      return 'clanInfo';
    }

    if (
      [
        'temp_full_name',
        'temp_father_name',
        'temp_mother_name',
        'temp_relationship',
        'temp_note',
      ].includes(gateTarget?.field)
    ) {
      return 'personalInfo';
    }

    if (
      [
        'setup_purpose',
        'known_generations',
        'earliest_ancestor_name',
        'clan_origin_place',
        'elder_name',
        'elder_phone',
      ].includes(gateTarget?.field)
    ) {
      return 'elderInfo';
    }

    if (['phone', 'email'].includes(gateTarget?.field)) {
      return 'contactInfo';
    }

    if (gateTarget?.field === 'password') {
      return 'securityInfo';
    }

    if (!values?.clanName?.trim?.() || !values?.description?.trim?.()) {
      return 'clanInfo';
    }

    if (
      !values?.temp_full_name?.trim?.() ||
      !values?.temp_father_name?.trim?.() ||
      !values?.temp_mother_name?.trim?.() ||
      !values?.temp_relationship ||
      !values?.temp_note?.trim?.()
    ) {
      return 'personalInfo';
    }

    if (
      !String(setupPurpose || '').trim() ||
      !String(knownGenerations || '').trim() ||
      String(earliestAncestorName || '').trim().length < 2 ||
      String(clanOriginPlace || '').trim().length < 3
    ) {
      return 'elderInfo';
    }

    if (!values?.phone?.trim?.() || !values?.email?.trim?.()) {
      return 'contactInfo';
    }

    return 'securityInfo';
  };

  /**
   * Submit-gated transition authority
   *
   * Order:
   * 1. Sync latest values
   * 2. Required field validation
   * 3. Online uniqueness re-check
   * 4. Captcha validation
   * 5. Validation gate
   * 6. Build finalPayload
   * 7. Transition to WaitingPage
   */
  const nextStep = async () => {
    setValue('hp_field', formValues.hp_field || '', {
      shouldValidate: true,
      shouldDirty: false,
    });

    const latestValues = {
      ...getValues(),
      hp_field: formValues.hp_field || '',
    };

   // PR-OP-4C2: ép string
    latestValues.clanName = String(latestValues.clanName || '').trim();
    latestValues.description = String(latestValues.description || '').trim();
    latestValues.temp_full_name = String(latestValues.temp_full_name || '').trim();
    latestValues.temp_father_name = String(
      latestValues.temp_father_name || ''
    ).trim();
    latestValues.temp_mother_name = String(
      latestValues.temp_mother_name || ''
    ).trim();
    latestValues.temp_birth_year =
      latestValues.temp_birth_year != null && latestValues.temp_birth_year !== ''
        ? String(latestValues.temp_birth_year).trim()
        : '';
    latestValues.temp_note = String(latestValues.temp_note || '').trim();
    latestValues.phone = String(latestValues.phone || '').trim();
    latestValues.email = String(latestValues.email || '').trim();

    // C1: revision — ép identity từ draft/lock
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
    }

    if (!latestValues?.clanName?.trim?.()) {
      routeFieldError(
        'clanName',
        'Bác vui lòng nhập tên dòng họ cần tạo.',
        // 'clanName'
      );
      return;
    }

    if (!latestValues?.description?.trim?.() || latestValues.description.trim().length < 10) {
      routeFieldError(
        'description',
        'Bác vui lòng nhập mô tả dòng họ (tối thiểu 10 ký tự).'
      );
      return;
    }

    if (!latestValues?.temp_full_name?.trim?.()) {
      routeFieldError(
        'temp_full_name',
        'Bác vui lòng nhập họ và tên người quản trị.',
        //'personalInfo'
      );
      return;
    }

    if (!latestValues?.temp_father_name?.trim?.()) {
      routeFieldError(
        'temp_father_name',
        'Bác vui lòng nhập Họ và tên Cha.'
      );
      return;
    }

    if (!latestValues?.temp_mother_name?.trim?.()) {
      routeFieldError(
        'temp_mother_name',
        'Bác vui lòng nhập Họ và tên Mẹ.'
      );
      return;
    }

    if (!latestValues?.temp_relationship) {
      routeFieldError(
        'temp_relationship',
        'Bác vui lòng chọn quan hệ với dòng họ.',
        //'personalInfo'
      );
      return;
    }

    if (!latestValues?.temp_note?.trim?.() || latestValues.temp_note.trim().length < 10) {
      routeFieldError(
        'temp_note',
        'Bác vui lòng nhập lời nhắn tới Ban quản trị (tối thiểu 10 ký tự).'
      );
      return;
    }

    const cleanSetupPurpose = String(setupPurpose || '').trim();
    const cleanKnownGenerations = String(knownGenerations || '').trim();
    const cleanEarliestAncestor = String(earliestAncestorName || '').trim();
    const cleanClanOriginPlace = String(clanOriginPlace || '').trim();

    if (!cleanSetupPurpose) {
      routeFieldError(
        'setup_purpose',
        'Bác vui lòng chọn mục đích khởi tạo dòng họ mới.'
      );
      return;
    }
    if (!cleanKnownGenerations) {
      routeFieldError(
        'known_generations',
        'Bác vui lòng chọn phạm vi số đời dự kiến ghi chép.'
      );
      return;
    }
    if (cleanEarliestAncestor.length < 2) {
      routeFieldError(
        'earliest_ancestor_name',
        'Bác vui lòng nhập họ tên vị tiền nhân cao nhất được biết (hoặc Cha/Mẹ nếu lập từ gia đình nhỏ).'
      );
      return;
    }
    if (cleanClanOriginPlace.length < 3) {
      routeFieldError(
        'clan_origin_place',
        'Bác vui lòng nhập địa bàn gốc hoặc nơi cư trú chính (Tỉnh/Thành phố).'
      );
      return;
    }

    const cleanElderName = String(elderName || '').trim();
    const cleanElderPhoneRaw = String(elderPhone || '').trim();
    let normalizedOptionalElderPhone = '';
    if (cleanElderPhoneRaw) {
      const elderPhoneCheck = validatePhoneWithCountry(
        cleanElderPhoneRaw,
        elderPhoneCountry
      );
      if (!elderPhoneCheck.valid) {
        routeFieldError(
          'elder_phone',
          elderPhoneCheck.message ||
            'Số điện thoại người thân tham chiếu không đúng định dạng.'
        );
        return;
      }
      normalizedOptionalElderPhone = elderPhoneCheck.normalized;
    }

    latestValues.setup_purpose = cleanSetupPurpose;
    latestValues.known_generations = cleanKnownGenerations;
    latestValues.earliest_ancestor_name = cleanEarliestAncestor;
    latestValues.clan_origin_place = cleanClanOriginPlace;
    latestValues.elder_name = cleanElderName || undefined;
    latestValues.elder_phone = normalizedOptionalElderPhone || undefined;

    setValue('setup_purpose', cleanSetupPurpose, { shouldValidate: false });
    setValue('known_generations', cleanKnownGenerations, { shouldValidate: false });
    setValue('earliest_ancestor_name', cleanEarliestAncestor, { shouldValidate: false });
    setValue('clan_origin_place', cleanClanOriginPlace, { shouldValidate: false });
    setValue('elder_name', cleanElderName || '', { shouldValidate: false });
    setValue('elder_phone', normalizedOptionalElderPhone || '', { shouldValidate: false });

    if (!latestValues?.phone?.trim?.()) {
      routeFieldError(
        'phone',
        'Bác vui lòng nhập số điện thoại đăng nhập.',
        //'contactInfo'
      );
      return;
    }

    const phoneFormatCheck = validatePhoneWithCountry(latestValues.phone, phoneCountry);
    if (!phoneFormatCheck.valid) {
      routeFieldError('phone', phoneFormatCheck.message, 'contactInfo');
      return;
    }
    latestValues.phone = phoneFormatCheck.normalized;
    setValue('phone', phoneFormatCheck.normalized, { shouldValidate: false });

    if (!latestValues?.email?.trim?.()) {
      routeFieldError(
        'email',
        'Bác vui lòng nhập email nhận thông báo.',
        //'contactInfo'
      );
      return;
    }

    /*
    const phoneCheck = await checkIdentityOnline('phone', latestValues.phone);

    if (!phoneCheck.valid) {
      routeFieldError(
        'phone',
        phoneCheck.message || 'Số điện thoại cần được kiểm tra lại.',
        'contactInfo'
      );
      //guidedFlow.unmarkCompleted('contactInfo');
      //guidedFlow.goToField('contactInfo');
      return;
    }

    const emailCheck = await checkIdentityOnline('email', latestValues.email);

    if (!emailCheck.valid) {
      routeFieldError(
        'email',
        emailCheck.message || 'Email cần được kiểm tra lại.',
        //'contactInfo'
      );
      //guidedFlow.unmarkCompleted('contactInfo');
      //guidedFlow.goToField('contactInfo');
      return;
    }
   ******* */


    // C1: revision — phone/email đã thuộc user, không check uniqueness
    if (!isRevision) {
      const phoneCheck = await checkIdentityOnline('phone', latestValues.phone);
      if (!phoneCheck.valid) {
        routeFieldError(
          'phone',
          phoneCheck.message || 'Số điện thoại cần được kiểm tra lại.',
          'contactInfo'
        );
        return;
      }

      const emailCheck = await checkIdentityOnline('email', latestValues.email);
      if (!emailCheck.valid) {
        routeFieldError(
          'email',
          emailCheck.message || 'Email cần được kiểm tra lại.',
          'contactInfo'
        );
        return;
      }
    }

    if (!latestValues?.password?.trim?.()) {
      routeFieldError(
        'password',
        'Bác vui lòng nhập mật khẩu đăng nhập.',
        //'securityInfo'
      );
      return;
    }

    if (!rulesAgreement.agreed) {
      const msg =
        'Bác vui lòng đọc và tích cam kết tuân thủ Nội quy chung của nền tảng trước khi tiếp tục.';
      setRulesError(msg);
      routeFieldError('agreed_rules', msg);
      return;
    }

    const captchaCheck = captchaZone.validateBeforeSubmit();

    if (!captchaCheck.valid) {
      const captchaMessage =
        captchaCheck.message ||
        ttsMessages?.createClan?.captcha ||
        'Bác vui lòng hoàn tất phần xác minh ở bên trên. Khi thấy dấu tích màu xanh, bác bấm lại nút Tiếp tục rà soát.';

      setAttentionMessage(captchaMessage);

      captchaZone.applyValidationFailure({
        validationResult: captchaCheck,
        guidedFlow,
        speak: speakMandatoryError,
        focusDelayMs: 520,
      });

      return;
    }

    const gateResult = await runValidationGate({
      values: latestValues,
      requiredFields: [
        'clanName',
        'description',
        'temp_full_name',
        'temp_father_name',
        'temp_mother_name',
        'temp_relationship',
        'temp_note',
        'phone',
        'email',
        'password',
      ],
      asyncValidationState: {
        phone: isChecking.phone,
        email: isChecking.email,
      },
      onlineErrors,
      localValidation: async () => {
        const valid = await trigger();
        const freshErrors = {};
        [
          'clanName',
          'description',
          'temp_full_name',
          'temp_father_name',
          'temp_mother_name',
          'temp_birth_year',
          'temp_relationship',
          'temp_note',
          'setup_purpose',
          'known_generations',
          'earliest_ancestor_name',
          'clan_origin_place',
          'elder_name',
          'elder_phone',
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
        form: 'CreateClanForm',
        transition: 'CreateClanForm->WaitingPage',
        lifecycleRuntimeVersion: lifecycleContext?.runtimeVersion || 0,
      },
    });

    if (!gateResult.allowed) {
      const target = buildValidationAttentionTarget(gateResult);
      const attentionField = getAttentionFieldFromGate(target, latestValues);
      const targetField = target.field || attentionField;
      const freshMsg = targetField ? getFieldState(targetField)?.error?.message : '';

      routeFieldError(
        targetField,
        freshMsg ||
          target.message ||
          'Thông tin hồ sơ chưa đầy đủ hoặc chưa đúng. Bác vui lòng kiểm tra lại các mục được báo lỗi trên màn hình.'
      );
      return;
    }

    if (!hasCoreRequiredData(latestValues)) {
      speakCriticalAttention(
        'Thông tin hồ sơ chưa đầy đủ hoặc chưa đúng. Bác vui lòng kiểm tra lại các mục được báo lỗi trên màn hình.'
      );

      advanceAttentionByProgression(latestValues, {
        message: 'Bác vui lòng kiểm tra lại phần còn thiếu.',
      });

      return;
    }

    setAttentionMessage('');
    setAttentionField('');

    const resolvedPhone = isRevision
      ? resolveRevisionPhone(lockedIdentifier, initialData, latestValues.phone)
      : latestValues.phone || '';
    const resolvedEmail = isRevision
      ? resolveRevisionEmail(lockedIdentifier, initialData, latestValues.email) || null
      : latestValues.email || null;

    const founderRegistrationProfile = {
      claim_mode: 'CLAN_SETUP',
      child_type: latestValues.temp_relationship || 'CON_DE',
      temp_relationship: latestValues.temp_relationship || 'CON_DE',
      full_name: latestValues.temp_full_name,
      alias: String(founderAlias || '').trim() || undefined,
      gender: founderGender || 'NAM',
      birth_year:
        latestValues.temp_birth_year &&
        /^\d{4}$/.test(String(latestValues.temp_birth_year).trim())
          ? Number(String(latestValues.temp_birth_year).trim())
          : undefined,
      birth_place: String(founderBirthPlace || '').trim() || undefined,
      address: String(founderAddress || '').trim() || undefined,
      father_name: latestValues.temp_father_name || undefined,
      mother_name: latestValues.temp_mother_name || undefined,
      setup_purpose: cleanSetupPurpose,
      known_generations: cleanKnownGenerations,
      earliest_ancestor_name: cleanEarliestAncestor,
      clan_origin_place: cleanClanOriginPlace,
      elder_name: cleanElderName || undefined,
      elder_phone: normalizedOptionalElderPhone || undefined,
      generation: 1,
      member_role: 'TRUONG_HO',
      is_alive: true,
      phone: resolvedPhone || undefined,
      email: resolvedEmail || undefined,
      note: latestValues.temp_note || undefined,
      agreed_rules: true,
      agreed_rules_snapshot: rulesAgreement.agreed_rules_snapshot || undefined,
      agreed_tos_version: rulesAgreement.agreed_tos_version || '1.0',
      agreed_clan_rules_version: Number(rulesAgreement.agreed_clan_rules_version || 1),
    };

    // AMEND-RP-OP-2026-02 V1.5.0: Payload sạch cho C2-S, KHÔNG rải temp_*
    const finalPayload = {
      isNewClan: true,
      clanName: latestValues.clanName,
      description: latestValues.description,
      phone: resolvedPhone,
      phoneCountry,
      email: resolvedEmail,
      password: latestValues.password,
      gender: founderGender || 'NAM',
      setup_purpose: cleanSetupPurpose,
      known_generations: cleanKnownGenerations,
      earliest_ancestor_name: cleanEarliestAncestor,
      clan_origin_place: cleanClanOriginPlace,
      elder_name: cleanElderName || undefined,
      elder_phone: normalizedOptionalElderPhone || undefined,
      agreed_rules: true,
      agreed_rules_snapshot: rulesAgreement.agreed_rules_snapshot || undefined,
      agreed_tos_version: rulesAgreement.agreed_tos_version || '1.0',
      agreed_clan_rules_version: Number(rulesAgreement.agreed_clan_rules_version || 1),
      registration_profile: founderRegistrationProfile,
      turnstileToken: captchaCheck.token || captchaZone.getToken(),
      hp_field: latestValues.hp_field || '',
      ...(isRevision
        ? {
            isRevision: true,
            reviewNote: effectiveReviewNote || undefined,
          }
        : {}),
    };

    if (onGoToWaiting) {
      onGoToWaiting(finalPayload);
      return;
    }

    if (onSubmit) {
      onSubmit(finalPayload);
    }
  };
  
  const hasOnlineError = !!onlineErrors.phone || !!onlineErrors.email;
  const isPendingCheck = isChecking.phone || isChecking.email;

  /**
   * Submit action footer
   *
   * Must call nextStep().
   * Never bypass using native submit.
   */
  const renderActionFooter = () => (
    <div className="pt-8">
      <GuidedFieldWrapper
        fieldKey="submit"
        activeField={guidedFlow.activeField}
        autoScroll={false}
        helperText={
          ttsMessages?.createClan?.submit ||
          'Bác bấm nút tiếp tục rà soát để kiểm tra lại hồ sơ.'
        }
        completed={false}
        voiceAction={
          <ZoneVoiceButton
          visible={showAzVoiceButton('submit')}
          text={zoneHelpText.submit}
          label="Nghe"
          />
        }
      >
        <button
          type="button"
          onClick={nextStep}
          disabled={effectiveLoading || isPendingCheck}
          className={`min-h-[48px] h-12 w-full px-5 rounded-xl text-base font-bold whitespace-nowrap transition-all ${
            effectiveLoading || isPendingCheck
              ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
              : 'bg-amber-600 text-white hover:bg-amber-700'
          }`}
        >
          {isPendingCheck ? 'Đang kiểm tra...' : 'Tiếp tục rà soát →'}
        </button>
      </GuidedFieldWrapper>
    </div>
  );

  const completedStepLabels = useMemo(() => {
    const labels = [];

    if (guidedFlow.isCompleted('clanInfo')) labels.push('Đã nhập dòng họ');
    if (guidedFlow.isCompleted('personalInfo')) labels.push('Đã nhập cá nhân');
    if (guidedFlow.isCompleted('elderInfo')) labels.push('Đã nhập người xác minh');
    if (guidedFlow.isCompleted('contactInfo')) labels.push('Đã nhập liên hệ');
    if (guidedFlow.isCompleted('securityInfo')) labels.push('Đã nhập mật khẩu');
    if (guidedFlow.isCompleted('captcha')) labels.push('Đã xác minh');

    return labels;
  }, [guidedFlow]);

  //const currentStep = guidedFlow.currentStep || guidedSteps[0];

  return (
    <div className={uiSystem.container}>
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

      <form
        ref={formRef}
        onSubmit={handleSubmit(() => {})}
        noValidate
        className="space-y-6"
      >
        {/*
        <div className="flex justify-center">
          <AudioHelpButton
            text={
              ttsMessages?.createClan?.help ||
              'Bác đang tạo mới một dòng họ, nhập thông tin dòng họ, thông tin quản trị viên, thông tin liên hệ và mật khẩu đăng nhập.'
            }
            label="Nghe hướng dẫn"
            variant="soft"
          />
        </div>
        */}

        <section className="rounded-3xl border border-indigo-100 bg-indigo-50/80 p-5 text-center shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-indigo-600">
            {isRevision ? 'Bổ sung hồ sơ đăng ký' : 'Hồ sơ đăng ký'}
          </p>

          <h2 className="mt-2 text-2xl font-black leading-tight text-slate-900">
            {isRevision ? 'Chỉnh sửa & bổ sung dòng họ mới' : 'Tạo mới một dòng họ'}
          </h2>

          <p className="mx-auto mt-2 max-w-xl text-sm font-semibold leading-relaxed text-slate-600">
            {isRevision
              ? 'Bác vui lòng xem bút phê của Quản trị viên bên dưới, chỉnh sửa các mục cần bổ sung rồi bấm Tiếp tục rà soát.'
              : 'Bác vui lòng nhập thông tin dòng họ, thông tin người quản trị, cách liên hệ và tạo tài khoản để gửi hồ sơ tạo dòng họ mới.'}
          </p>

          <div className="mt-4 flex justify-center">
            <AudioHelpButton
              text={
                ttsMessages?.createClan?.help ||
                'Bác nhập thông tin dòng họ, thông tin người quản trị, cách liên hệ và tạo tài khoản để gửi hồ sơ tạo dòng họ mới.'
              }
              label="Nghe hướng dẫn"
              variant="soft"
            />
          </div>
        </section>

        {isRevision && effectiveReviewNote && (
          <div
            role="region"
            aria-label="Bút phê yêu cầu bổ sung của Quản trị viên"
            className="rounded-3xl border-2 border-amber-300 bg-amber-50 p-5 text-amber-950 shadow-sm space-y-2"
            data-testid="create-clan-revision-note"
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
            <p className="whitespace-pre-wrap text-sm font-bold leading-relaxed text-amber-950">
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
            autoScroll={false}
            autoFocus={false}
            flash
            lock
            recoveryKey="create-clan-form-attention"
            className="flex items-start gap-3 border-rose-100 bg-rose-50 text-rose-700"
            data-testid="create-clan-attention-message"
          >
            <AlertCircle size={20} className="mt-0.5 shrink-0" />
            <span className="text-sm font-bold leading-relaxed">
              {attentionMessage}
            </span>
          </AttentionZone>
        )}

        <>
          <>
            <GuidedFieldWrapper
              fieldKey="clanInfo"
              activeField={guidedFlow.activeField}
              helperText={
                ttsMessages?.createClan?.clanNameFocus ||
                'Bác nhập tên dòng họ cần tạo và mô tả ngắn về dòng họ của bác'
              }
              voiceAction={
                <ZoneVoiceButton
                  visible={showAzVoiceButton('clanInfo')}
                  text={zoneHelpText.clanInfo}
                  label="Nghe"
                  disabled={effectiveLoading}
                />
              }
              completed={guidedFlow.isCompleted('clanInfo')}
            >
              <div ref={clanInfoRef}>
                <CollapsibleDetailCard
                  title="Thông tin dòng họ"
                  statusLabel={guidedFlow.isCompleted('clanInfo') ? 'Hoàn chỉnh' : 'Chưa hoàn chỉnh'}
                  statusVariant={guidedFlow.isCompleted('clanInfo') ? 'complete' : 'pending'}
                  voiceText={zoneHelpText.clanInfo}
                  defaultExpanded={true}
                  disabled={effectiveLoading}
                >
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className={uiSystem.label}>
                      Tên dòng họ <span className="text-rose-500">*</span>
                    </label>

                    <input
                      {...register('clanName', {
                        onChange: () => {
                          invalidateRuntimeForField('clanName');
                          clearAttentionForField('clanName');
                        },
                      })}
                      onFocus={() => guidedFlow.goToField('clanInfo')}
                      onBlur={(e) => {
                        checkDuplicateClanName(e.target.value, { force: true });
                      }}
                      className={uiSystem.input}
                      placeholder="Nguyễn Tộc - Chi Phái 2"
                    />

                    {errors.clanName && (
                      <p className="text-[11px] font-bold text-rose-600">
                        {errors.clanName.message}
                      </p>
                    )}

                    <ClanNameDuplicateAlert
                      clanName={formValues.clanName}
                      checking={clanNameChecking}
                      result={clanNameDupResult}
                      disabled={effectiveLoading}
                      onSelectJoinExisting={(matchedClan) => {
                        if (typeof onSwitchToJoinClan === 'function') {
                          onSwitchToJoinClan(matchedClan);
                          return;
                        }
                        if (typeof onBackToRegister === 'function') {
                          onBackToRegister({
                            from: 'CreateClanForm',
                            action: 'joinExistingClan',
                            suggestedTenant: matchedClan,
                          });
                        }
                      }}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className={uiSystem.label}>
                      Mô tả dòng họ <span className="text-rose-500">*</span>
                    </label>

                    <textarea
                      {...register('description', {
                        onChange: () => {
                          invalidateRuntimeForField('description');
                          clearAttentionForField('description');
                        },
                      })}
                      onFocus={() => guidedFlow.goToField('clanInfo')}
                      className={`${uiSystem.input} min-h-[100px] resize-none`}
                      placeholder="Thông tin giới thiệu ngắn về dòng họ..."
                    />

                    {errors.description && (
                      <p className="text-base font-bold text-rose-600">
                        {errors.description.message}
                      </p>
                    )}
                  </div>
                </div>
                </CollapsibleDetailCard>
              </div>
            </GuidedFieldWrapper>

            <GuidedFieldWrapper
              fieldKey="personalInfo"
              activeField={guidedFlow.activeField}
              helperText={
                ttsMessages?.createClan?.personalInfo ||
                'Bác nhập thông tin cá nhân của người quản trị.'
              }
              voiceAction={
                <ZoneVoiceButton
                  visible={showAzVoiceButton('personalInfo')}
                  text={zoneHelpText.personalInfo}
                  label="Nghe"
                  disabled={effectiveLoading}
                />
              }
              completed={guidedFlow.isCompleted('personalInfo')}
            >
              <div ref={personalInfoRef}>
                <CollapsibleDetailCard
                  title="Thông tin quản trị viên"
                  statusLabel={guidedFlow.isCompleted('personalInfo') ? 'Hoàn chỉnh' : 'Chưa hoàn chỉnh'}
                  statusVariant={guidedFlow.isCompleted('personalInfo') ? 'complete' : 'pending'}
                  voiceText={zoneHelpText.personalInfo}
                  defaultExpanded={true}
                  disabled={effectiveLoading}
                >
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className={uiSystem.label}>
                      Họ và tên <span className="text-rose-500">*</span>
                    </label>

                    <input
                      {...register('temp_full_name', {
                        onChange: () => {
                          invalidateRuntimeForField('temp_full_name');
                          clearAttentionForField('temp_full_name');
                        },
                      })}
                      onFocus={() => guidedFlow.goToField('personalInfo')}
                      className={uiSystem.input}
                      placeholder="Nguyễn Văn A"
                    />

                    {errors.temp_full_name && (
                      <p className="text-xs font-bold text-rose-600">
                        {errors.temp_full_name.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className={uiSystem.label}>
                      Tên tự / Tên hiệu / Tên thường gọi
                    </label>
                    <input
                      type="text"
                      value={founderAlias}
                      onFocus={() => guidedFlow.goToField('personalInfo')}
                      onChange={(e) => setFounderAlias(e.target.value)}
                      className={uiSystem.input}
                      placeholder="Nhập tên tự, tên hiệu hoặc tên thường gọi (nếu có)"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className={uiSystem.label}>
                      Giới tính <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={founderGender}
                      onFocus={() => guidedFlow.goToField('personalInfo')}
                      onChange={(e) => setFounderGender(e.target.value)}
                      className={uiSystem.select || uiSystem.input}
                    >
                      <option value="NAM">Nam</option>
                      <option value="NU">Nữ</option>
                      <option value="KHAC">Khác</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className={uiSystem.label}>Nguyên quán / Quê gốc</label>
                    <textarea
                      rows={2}
                      value={founderBirthPlace}
                      onFocus={() => guidedFlow.goToField('personalInfo')}
                      onChange={(e) => setFounderBirthPlace(e.target.value)}
                      className={`${uiSystem.input} min-h-[76px] resize-y`}
                      placeholder="Thôn/Xóm, Xã/Phường, Huyện/Quận, Tỉnh/Thành phố"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className={uiSystem.label}>Địa chỉ cư trú hiện tại</label>
                    <textarea
                      rows={2}
                      value={founderAddress}
                      onFocus={() => guidedFlow.goToField('personalInfo')}
                      onChange={(e) => setFounderAddress(e.target.value)}
                      className={`${uiSystem.input} min-h-[76px] resize-y`}
                      placeholder="Số nhà, đường/xóm, xã/phường, quận/huyện, tỉnh/thành phố"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className={uiSystem.label}>
                      Họ và tên Cha <span className="text-rose-500">*</span>
                    </label>
                    <input
                      {...register('temp_father_name', {
                        onChange: () => {
                          invalidateRuntimeForField('temp_father_name');
                          clearAttentionForField('temp_father_name');
                        },
                      })}
                      onFocus={() => guidedFlow.goToField('personalInfo')}
                      className={`${uiSystem.input} ${
                        attentionField === 'temp_father_name' ? 'border-rose-500 ring-2 ring-rose-200' : ''
                      }`}
                      placeholder="Nhập họ và tên Cha"
                    />
                    {errors.temp_father_name && (
                      <p className="text-xs font-bold text-rose-600">
                        {errors.temp_father_name.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className={uiSystem.label}>
                      Họ và tên Mẹ <span className="text-rose-500">*</span>
                    </label>
                    <input
                      {...register('temp_mother_name', {
                        onChange: () => {
                          invalidateRuntimeForField('temp_mother_name');
                          clearAttentionForField('temp_mother_name');
                        },
                      })}
                      onFocus={() => guidedFlow.goToField('personalInfo')}
                      className={`${uiSystem.input} ${
                        attentionField === 'temp_mother_name' ? 'border-rose-500 ring-2 ring-rose-200' : ''
                      }`}
                      placeholder="Nhập họ và tên Mẹ"
                    />
                    {errors.temp_mother_name && (
                      <p className="text-xs font-bold text-rose-600">
                        {errors.temp_mother_name.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className={uiSystem.label}>Năm sinh</label>
                    <input
                      {...register('temp_birth_year', {
                        onChange: () => {
                          invalidateRuntimeForField('temp_birth_year');
                          clearAttentionForField('temp_birth_year');
                        },
                      })}
                      onFocus={() => guidedFlow.goToField('personalInfo')}
                      className={uiSystem.input}
                      placeholder="Ví dụ: 1960"
                    />

                    {errors.temp_birth_year && (
                      <p className="text-xs font-bold text-rose-600">
                        {errors.temp_birth_year.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className={uiSystem.label}>
                      Quan hệ với họ tộc <span className="text-rose-500">*</span>
                    </label>
                    <select
                      {...register('temp_relationship', {
                        onChange: () => {
                          invalidateRuntimeForField('temp_relationship');
                          clearAttentionForField('temp_relationship');
                        },
                      })}
                      onFocus={() => guidedFlow.goToField('personalInfo')}
                      className={uiSystem.select || uiSystem.input}
                    >
                      {RELATIONSHIP_OPTIONS.map((item) => (
                        <option key={item.value || 'empty'} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>

                    {errors.temp_relationship && (
                      <p className="text-xs font-bold text-rose-600">
                        {errors.temp_relationship.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className={uiSystem.label}>
                      Lời nhắn tới Ban quản trị{' '}
                      <span className="text-rose-500">*</span>
                    </label>
                    <textarea
                      {...register('temp_note', {
                        onChange: () => {
                          invalidateRuntimeForField('temp_note');
                          clearAttentionForField('temp_note');
                        },
                      })}
                      onFocus={() => guidedFlow.goToField('personalInfo')}
                      className={`${uiSystem.input} min-h-[100px] resize-none`}
                      placeholder="Bác ghi thông tin để Ban quản trị dễ xác minh..."
                    />

                    {errors.temp_note && (
                      <p className="text-base font-bold text-rose-600">
                        {errors.temp_note.message}
                      </p>
                    )}
                  </div>
                </div>
                </CollapsibleDetailCard>
              </div>
            </GuidedFieldWrapper>

            <GuidedFieldWrapper
              fieldKey="elderInfo"
              activeField={guidedFlow.activeField}
              helperText={zoneHelpText.elderInfo}
              voiceAction={
                <ZoneVoiceButton
                  visible={showAzVoiceButton('elderInfo')}
                  text={zoneHelpText.elderInfo}
                  label="Nghe"
                  disabled={effectiveLoading}
                />
              }
              completed={
                Boolean(String(setupPurpose || '').trim()) &&
                Boolean(String(knownGenerations || '').trim()) &&
                String(earliestAncestorName || '').trim().length >= 2 &&
                String(clanOriginPlace || '').trim().length >= 3
              }
            >
              <div ref={elderInfoRef}>
                <CollapsibleDetailCard
                  title="Thông tin thẩm định khởi tạo dòng họ"
                  statusLabel={
                    Boolean(String(setupPurpose || '').trim()) &&
                    Boolean(String(knownGenerations || '').trim()) &&
                    String(earliestAncestorName || '').trim().length >= 2 &&
                    String(clanOriginPlace || '').trim().length >= 3
                      ? 'Hoàn chỉnh'
                      : 'Chưa hoàn chỉnh'
                  }
                  statusVariant={
                    Boolean(String(setupPurpose || '').trim()) &&
                    Boolean(String(knownGenerations || '').trim()) &&
                    String(earliestAncestorName || '').trim().length >= 2 &&
                    String(clanOriginPlace || '').trim().length >= 3
                      ? 'complete'
                      : 'pending'
                  }
                  voiceText={zoneHelpText.elderInfo}
                  defaultExpanded={true}
                  disabled={effectiveLoading}
                >
                  <div className="space-y-4">
                    <p className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-3 text-base font-normal text-indigo-950">
                      Dòng họ mới được cấp <strong>30 ngày dùng thử miễn phí (Sandbox)</strong> để dựng cây phả hệ ban đầu. Bác trả lời 4 ý ngắn gọn dưới đây để Hệ thống Trung tâm đối chiếu và mở không gian khởi tạo.
                    </p>

                    <div className="space-y-1">
                      <label className={uiSystem.label}>
                        1. Mục đích khởi tạo dòng họ{' '}
                        <span className="font-bold text-rose-600">*</span>
                      </label>
                      <select
                        name="setup_purpose"
                        value={setupPurpose}
                        disabled={effectiveLoading}
                        onFocus={() => guidedFlow.goToField('elderInfo')}
                        onChange={(e) => {
                          setSetupPurpose(e.target.value);
                          setValue('setup_purpose', e.target.value, { shouldValidate: false });
                          clearAttentionForField('setup_purpose');
                        }}
                        className={`${uiSystem.select || uiSystem.input} ${
                          attentionField === 'setup_purpose'
                            ? 'border-rose-500 ring-2 ring-rose-200'
                            : ''
                        }`}
                      >
                        <option value="">-- Chọn mục đích tạo dòng họ --</option>
                        {SETUP_PURPOSE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className={uiSystem.label}>
                        2. Phạm vi số đời dự kiến ghi chép{' '}
                        <span className="font-bold text-rose-600">*</span>
                      </label>
                      <select
                        name="known_generations"
                        value={knownGenerations}
                        disabled={effectiveLoading}
                        onFocus={() => guidedFlow.goToField('elderInfo')}
                        onChange={(e) => {
                          setKnownGenerations(e.target.value);
                          setValue('known_generations', e.target.value, { shouldValidate: false });
                          clearAttentionForField('known_generations');
                        }}
                        className={`${uiSystem.select || uiSystem.input} ${
                          attentionField === 'known_generations'
                            ? 'border-rose-500 ring-2 ring-rose-200'
                            : ''
                        }`}
                      >
                        <option value="">-- Chọn số đời dự kiến --</option>
                        {KNOWN_GENERATIONS_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className={uiSystem.label}>
                        3. Vị tiền nhân cao nhất (xa nhất) được biết{' '}
                        <span className="font-bold text-rose-600">*</span>
                      </label>
                      <input
                        name="earliest_ancestor_name"
                        type="text"
                        disabled={effectiveLoading}
                        value={earliestAncestorName}
                        onFocus={() => guidedFlow.goToField('elderInfo')}
                        onChange={(e) => {
                          setEarliestAncestorName(e.target.value);
                          setValue('earliest_ancestor_name', e.target.value, { shouldValidate: false });
                          clearAttentionForField('earliest_ancestor_name');
                        }}
                        className={`${uiSystem.input} ${
                          attentionField === 'earliest_ancestor_name'
                            ? 'border-rose-500 ring-2 ring-rose-200'
                            : ''
                        }`}
                        placeholder="Ví dụ: Cụ Nguyễn Văn Tổ, Ông nội, hoặc Cha/Mẹ (nếu lập từ gia đình nhỏ)"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className={uiSystem.label}>
                        4. Địa bàn gốc / Nơi cư trú chính{' '}
                        <span className="font-bold text-rose-600">*</span>
                      </label>
                      <input
                        name="clan_origin_place"
                        type="text"
                        disabled={effectiveLoading}
                        value={clanOriginPlace}
                        onFocus={() => guidedFlow.goToField('elderInfo')}
                        onChange={(e) => {
                          setClanOriginPlace(e.target.value);
                          setValue('clan_origin_place', e.target.value, { shouldValidate: false });
                          clearAttentionForField('clan_origin_place');
                        }}
                        className={`${uiSystem.input} ${
                          attentionField === 'clan_origin_place'
                            ? 'border-rose-500 ring-2 ring-rose-200'
                            : ''
                        }`}
                        placeholder="Ví dụ: Xã Phương Cáp, Tỉnh Thái Bình (hoặc Tỉnh/Thành phố)"
                      />
                    </div>

                    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                      <p className="text-base font-normal text-slate-700">
                        Người thân / Cao niên cùng biết việc{' '}
                        <span className="text-slate-500">(Không bắt buộc — điền thêm nếu có)</span>
                      </p>

                      <div className="space-y-1">
                        <label className={uiSystem.label}>
                          Họ và tên người thân / cao niên
                        </label>
                        <input
                          name="elder_name"
                          type="text"
                          disabled={effectiveLoading}
                          value={elderName}
                          onFocus={() => guidedFlow.goToField('elderInfo')}
                          onChange={(e) => {
                            setElderName(e.target.value);
                            setValue('elder_name', e.target.value, { shouldValidate: false });
                            clearAttentionForField('elder_name');
                          }}
                          className={uiSystem.input}
                          placeholder="Ví dụ: Cụ Nguyễn Đình Văn (tùy chọn)"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className={uiSystem.label}>
                          Số điện thoại liên hệ
                        </label>
                        <div className="flex flex-row items-center gap-2">
                          <select
                            aria-label="Chọn mã quốc gia người thân tham chiếu"
                            value={elderPhoneCountry}
                            disabled={effectiveLoading}
                            onFocus={() => guidedFlow.goToField('elderInfo')}
                            onChange={(e) => {
                              setElderPhoneCountry(e.target.value);
                              clearAttentionForField('elder_phone');
                            }}
                            className="min-h-[48px] w-[126px] sm:w-[136px] shrink-0 rounded-xl border border-slate-300 bg-white px-2.5 py-3 text-base font-bold text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                          >
                            {COUNTRY_PHONE_OPTIONS.map((c) => (
                              <option key={c.code} value={c.code}>
                                {c.shortLabel || c.label}
                              </option>
                            ))}
                          </select>

                          <div className="relative flex-1 min-w-0">
                            <Phone
                              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                              size={18}
                            />
                            <input
                              name="elder_phone"
                              type="tel"
                              disabled={effectiveLoading}
                              value={elderPhone}
                              onFocus={() => guidedFlow.goToField('elderInfo')}
                              onChange={(e) => {
                                setElderPhone(e.target.value);
                                setValue('elder_phone', e.target.value, { shouldValidate: false });
                                clearAttentionForField('elder_phone');
                              }}
                              className={`pl-11 ${uiSystem.input} ${
                                attentionField === 'elder_phone'
                                  ? 'border-rose-500 ring-2 ring-rose-200'
                                  : ''
                              }`}
                              placeholder={selectedElderCountryMeta.placeholder}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CollapsibleDetailCard>
              </div>
            </GuidedFieldWrapper>

            <GuidedFieldWrapper
              fieldKey="contactInfo"
              activeField={guidedFlow.activeField}
              helperText={
                ttsMessages?.createClan?.contactInfo ||
                'Bác nhập số điện thoại đăng nhập và email nhận thông báo.'
              }
              voiceAction={
                <ZoneVoiceButton
                  visible={showAzVoiceButton('contactInfo')}
                  text={zoneHelpText.contactInfo}
                  label="Nghe"
                  disabled={effectiveLoading}
                />
              }
              completed={guidedFlow.isCompleted('contactInfo')}
            >
              <div ref={contactInfoRef}>
                <CollapsibleDetailCard
                  title="Thông tin liên hệ"
                  statusLabel={guidedFlow.isCompleted('contactInfo') ? 'Hoàn chỉnh' : 'Chưa hoàn chỉnh'}
                  statusVariant={guidedFlow.isCompleted('contactInfo') ? 'complete' : 'pending'}
                  voiceText={zoneHelpText.contactInfo}
                  defaultExpanded={true}
                  disabled={effectiveLoading}
                >
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className={uiSystem.label}>
                      Số điện thoại <span className="text-rose-500">*</span>
                    </label>

                    <div className="flex flex-row items-center gap-2">
                      <select
                        aria-label="Chọn mã quốc gia"
                        value={phoneCountry}
                        disabled={isRevision || effectiveLoading}
                        onFocus={() => guidedFlow.goToField('contactInfo')}
                        onChange={(e) => {
                          const nextCountry = e.target.value;
                          setPhoneCountry(nextCountry);
                          checkedIdentityCacheRef.current.phone = null;
                          invalidateRuntimeForField('phone');
                          clearAttentionForField('phone');
                        }}
                        className={`min-h-[48px] w-[126px] sm:w-[136px] shrink-0 rounded-xl border border-slate-300 bg-white px-2.5 py-3 text-base font-bold text-slate-900 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100 ${
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
                          className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                          size={18}
                        />

                        <input
                          {...register('phone', {
                            onChange: () => {
                              checkedIdentityCacheRef.current.phone = null;
                              invalidateRuntimeForField('phone');
                              clearAttentionForField('phone');
                            },
                          })}
                          type="tel"
                          onFocus={() => guidedFlow.goToField('contactInfo')}
                          onBlur={async (e) => {
                            if (isRevision) return; // KHÔNG check uniqueness khi đang revision
                            const result = await checkIdentityOnline('phone', e.target.value, {
                              showFormatError: true,
                            });

                            if (!result.valid && result.message) {
                              routeFieldError('phone', result.message);
                            }
                          }}
                          readOnly={isRevision}  // KHÔNG dùng disabled={isRevision}
                          className={`pl-11 ${uiSystem.input} ${
                            isRevision ? 'opacity-80 cursor-not-allowed bg-slate-50' : ''
                          }`}
                          placeholder={selectedCountryMeta.placeholder}
                        />

                        {isChecking.phone && (
                          <Loader2
                            className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-blue-500"
                            size={18}
                          />
                        )}
                      </div>
                    </div>

                    {errors.phone && (
                      <p className="text-xs font-bold text-rose-600">
                        {errors.phone.message}
                      </p>
                    )}

                    {onlineErrors.phone && (
                      <p className="text-xs font-bold text-rose-600">
                        {onlineErrors.phone}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className={uiSystem.label}>
                      Email <span className="text-rose-500">*</span>
                    </label>

                    <div className="relative">
                      <Mail
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                        size={18}
                      />

                      <input
                        {...register('email', {
                          onChange: () => {
                            invalidateRuntimeForField('email');
                            clearAttentionForField('email');
                          },
                        })}
                        onFocus={() => guidedFlow.goToField('contactInfo')}
                        onBlur={async (e) => {
                          if (isRevision) return; // KHÔNG check uniqueness khi đang revision
                          const result = await checkIdentityOnline('email', e.target.value);
                          if (!result.valid && result.message) {
                            routeFieldError('email', result.message);
                          }
                          
                        }}
                        readOnly={isRevision} // KHÔNG dùng disabled={isRevision}
                        className={`pl-11 ${uiSystem.input} ${
                          isRevision ? 'opacity-80 cursor-not-allowed bg-slate-50' : ''
                        }`}
                        placeholder="email@example.com"
                      />

                      {isChecking.email && (
                        <Loader2
                          className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-blue-500"
                          size={18}
                        />
                      )}
                    </div>

                    {errors.email && (
                      <p className="text-xs font-bold text-rose-600">
                        {errors.email.message}
                      </p>
                    )}

                    {onlineErrors.email && (
                      <p className="text-base font-bold text-rose-600">
                        {onlineErrors.email}
                      </p>
                    )}
                  </div>
                </div>
                </CollapsibleDetailCard>
              </div>
            </GuidedFieldWrapper>

            <GuidedFieldWrapper
              fieldKey="securityInfo"
              activeField={guidedFlow.activeField}
              helperText={
                ttsMessages?.createClan?.passwordFocus ||
                'Bác nhập mật khẩu đăng nhập.'
              }
              voiceAction={
                <ZoneVoiceButton
                  visible={showAzVoiceButton('securityInfo')}
                  text={zoneHelpText.securityInfo}
                  label="Nghe"
                  disabled={effectiveLoading}
                />
              }
              completed={guidedFlow.isCompleted('securityInfo')}
            >
              <div ref={securityInfoRef}>
                <CollapsibleDetailCard
                  title="Bảo mật"
                  statusLabel={guidedFlow.isCompleted('securityInfo') ? 'Hoàn chỉnh' : 'Chưa hoàn chỉnh'}
                  statusVariant={guidedFlow.isCompleted('securityInfo') ? 'complete' : 'pending'}
                  voiceText={zoneHelpText.securityInfo}
                  defaultExpanded={true}
                  disabled={effectiveLoading}
                >
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className={uiSystem.label}>
                      Mật khẩu <span className="text-rose-500">*</span>
                    </label>

                    <div className="relative">
                      <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                      <input
                        type={showPassword ? 'text' : 'password'}
                        {...register('password', {
                          onChange: () => {
                            invalidateRuntimeForField('password');
                            clearAttentionForField('password');
                          },
                        })}
                        onFocus={() => guidedFlow.goToField('securityInfo')}
                        placeholder="Nhập mật khẩu"
                        autoComplete="new-password"
                        className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-10 text-base font-bold text-slate-900 placeholder:font-normal placeholder:text-slate-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                      />

                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-slate-700"
                        aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                        title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>

                    {errors.password && (
                      <p className="text-xs font-bold text-rose-600">
                        {errors.password.message}
                      </p>
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
              </div>
            </GuidedFieldWrapper>

            <GuidedFieldWrapper
              fieldKey="rulesInfo"
              activeField={guidedFlow.activeField}
              helperText={zoneHelpText.rulesInfo}
              voiceAction={
                <ZoneVoiceButton
                  visible={showAzVoiceButton('rulesInfo')}
                  text={zoneHelpText.rulesInfo}
                  label="Nghe"
                  disabled={effectiveLoading}
                />
              }
              completed={rulesAgreement.agreed}
            >
              <div ref={rulesInfoRef}>
                <RulesAgreementCard
                  mode="CLAN_SETUP"
                  clanName={formValues.clanName}
                  agreed={rulesAgreement.agreed}
                  disabled={effectiveLoading}
                  error={rulesError}
                  onChange={(nextRules) => {
                    setRulesAgreement(nextRules);
                    if (nextRules.agreed) {
                      setRulesError('');
                      clearAttentionForField('agreed_rules');
                      guidedFlow.markCompleted('rulesInfo');
                    } else {
                      guidedFlow.unmarkCompleted('rulesInfo');
                    }
                  }}
                />
              </div>
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

            {renderActionFooter()}
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

export default CreateClanForm;