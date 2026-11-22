/**
 * =============================================================================
 * PATH        : frontend/src/features/membership/pages/ClanSetupPage.jsx
 * DATETIME    : 2026-11-22T18:10:00+07:00
 * VERSION     : 2.1.0-ISO29148-UAT-IMP5-RULES
 * DESCRIPTION : Trang Lập dòng họ mới cho người dùng đã có tài khoản (Luồng C1-S):
 *               - Nâng cấp Mức 2:
 *                 1. Trình bày chuẩn Mobile-first bằng CollapsibleDetailCard +
 *                    KeyValueDetailTable + ZoneVoiceButton + AudioHelpButton.
 *                 2. Bổ sung khối "Người cao niên (>= 60 tuổi) xác minh ngoại tuyến"
 *                    (`elder_name`, `elder_phone` kèm bộ chọn mã quốc gia VN/Quốc tế E.164)
 *                    để SYSTEM_ADMIN gọi điện đối chiếu trước khi duyệt.
 *                 3. Bổ sung bước Rà soát hồ sơ trước khi gửi (đồng nhất trải nghiệm
 *                    với luồng C2-S trên WaitingPage).
 *               - Kế thừa tài khoản đang đăng nhập, không làm ảnh hưởng họ gốc A.
 * =============================================================================
 * CHANGELOGS:
 * - 2026-11-13T10:00:00+07:00 (v1.0.0-MULTIHOME-AMEND02-V15-LAT3): Khởi tạo C1-S.
 * - 2026-11-22T15:15:00+07:00 (v2.0.0-ISO29148-CLAN-SETUP-M2): Đồng bộ Mức 2.
 * =============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  CheckCircle2,
  Loader2,
  ArrowLeft,
  AlertCircle,
  Phone,
  Eye,
} from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '../../../context/AuthContext';
import { membershipApi } from '../api/membershipApi';
import CollapsibleDetailCard from '../../../components/common/CollapsibleDetailCard.jsx';
import KeyValueDetailTable from '../../../components/common/KeyValueDetailTable.jsx';
import AudioHelpButton from '../../elder-doctrine/components/AudioHelpButton.jsx';
import ZoneVoiceButton from '../../elder-doctrine/components/ZoneVoiceButton.jsx';
import RulesAgreementCard from '../../onboarding/components/RulesAgreementCard.jsx';
import {
  COUNTRY_PHONE_OPTIONS,
  validatePhoneWithCountry,
  detectPhoneCountry,
} from '../../../shared/utils/validationRules.js';

const GENDER_LABELS = {
  NAM: 'Nam',
  NU: 'Nữ',
  KHAC: 'Khác',
};

export const ClanSetupPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, refreshContext } = useAuth();

  const caseId = searchParams.get('caseId');
  const isRevisionMode =
    searchParams.get('mode') === 'revision' && Boolean(caseId);

  const [clanName, setClanName] = useState('');
  const [description, setDescription] = useState('');
  const [fullName, setFullName] = useState(user?.name || '');
  const [alias, setAlias] = useState('');
  const [gender, setGender] = useState('NAM');
  const [birthYear, setBirthYear] = useState('');
  const [birthPlace, setBirthPlace] = useState('');
  const [address, setAddress] = useState('');
  const [fatherName, setFatherName] = useState('');
  const [elderName, setElderName] = useState('');
  const [elderPhone, setElderPhone] = useState('');
  const [elderPhoneCountry, setElderPhoneCountry] = useState('VN');
  const [note, setNote] = useState('');

  const [rulesAgreement, setRulesAgreement] = useState({
    agreed: false,
    agreed_rules_snapshot: '',
    agreed_tos_version: '1.0',
    agreed_clan_rules_version: 1,
  });

  const [stepMode, setStepMode] = useState('EDIT'); // EDIT | REVIEW
  const [reviewConfirmed, setReviewConfirmed] = useState(false);

  const [loadingRevision, setLoadingRevision] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [revisionFeedback, setRevisionFeedback] = useState('');

  const selectedElderCountryMeta = useMemo(
    () =>
      COUNTRY_PHONE_OPTIONS.find((c) => c.code === elderPhoneCountry) ||
      COUNTRY_PHONE_OPTIONS[0],
    [elderPhoneCountry]
  );

  useEffect(() => {
    if (!isRevisionMode || !caseId) return;

    let cancelled = false;
    setLoadingRevision(true);
    membershipApi
      .getMembershipStatus({ caseId })
      .then((data) => {
        if (cancelled || !data) return;
        if (data.revisionRequest) setRevisionFeedback(data.revisionRequest);
        if (data.tenantName) setClanName(data.tenantName);
        if (data.description) setDescription(data.description);

        const rp =
          data.registration_profile &&
          typeof data.registration_profile === 'object'
            ? data.registration_profile
            : data.caseMetadata?.registration_profile || {};

        if (rp.full_name) setFullName(rp.full_name);
        if (rp.alias) setAlias(rp.alias);
        if (rp.gender) setGender(rp.gender);
        if (rp.birth_year) setBirthYear(String(rp.birth_year));
        if (rp.birth_place) setBirthPlace(rp.birth_place);
        if (rp.address) setAddress(rp.address);
        if (rp.father_name) setFatherName(rp.father_name);
        if (rp.elder_name) setElderName(rp.elder_name);
        if (rp.elder_phone) {
          setElderPhone(rp.elder_phone);
          setElderPhoneCountry(detectPhoneCountry(rp.elder_phone, 'VN'));
        }
        if (rp.note) setNote(rp.note);
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMsg(
            err?.response?.data?.message ||
              'Không tải được dữ liệu hồ sơ lập dòng họ.'
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingRevision(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isRevisionMode, caseId]);

  const validateAndBuildDraft = () => {
    const cleanClanName = String(clanName || '').trim();
    const cleanDesc = String(description || '').trim();
    const cleanFullName = String(fullName || '').trim();
    const cleanFatherName = String(fatherName || '').trim();
    const cleanElderName = String(elderName || '').trim();
    const cleanElderPhoneRaw = String(elderPhone || '').trim();
    const cleanNote = String(note || '').trim();
    const cleanBirthYear = String(birthYear || '').trim();

    if (!cleanClanName || cleanClanName.length < 3) {
      return {
        valid: false,
        message: 'Bác vui lòng nhập tên dòng họ mới (tối thiểu 3 ký tự).',
      };
    }
    if (!cleanDesc || cleanDesc.length < 10) {
      return {
        valid: false,
        message: 'Bác vui lòng nhập mô tả giới thiệu về dòng họ (tối thiểu 10 ký tự).',
      };
    }
    if (!cleanFullName) {
      return {
        valid: false,
        message: 'Bác vui lòng nhập họ và tên người sáng lập (Trưởng họ).',
      };
    }
    if (!cleanFatherName) {
      return {
        valid: false,
        message: 'Bác vui lòng nhập tên cha hoặc mẹ để đối chiếu.',
      };
    }
    if (cleanBirthYear && !/^\d{4}$/.test(cleanBirthYear)) {
      return {
        valid: false,
        message: 'Năm sinh phải gồm 4 chữ số (ví dụ: 1965).',
      };
    }
    if (!cleanElderName) {
      return {
        valid: false,
        message:
          'Bác vui lòng nhập họ và tên người cao niên (từ 60 tuổi trở lên) trong họ để Hệ thống Trung tâm gọi điện xác minh.',
      };
    }
    if (!cleanElderPhoneRaw) {
      return {
        valid: false,
        message:
          'Bác vui lòng nhập số điện thoại của người cao niên xác minh.',
      };
    }
    const elderPhoneCheck = validatePhoneWithCountry(
      cleanElderPhoneRaw,
      elderPhoneCountry
    );
    if (!elderPhoneCheck.valid) {
      return {
        valid: false,
        message:
          elderPhoneCheck.message ||
          'Số điện thoại người cao niên xác minh không đúng định dạng.',
      };
    }
    if (!cleanNote || cleanNote.length < 10) {
      return {
        valid: false,
        message:
          'Bác vui lòng nhập lời nhắn gửi Hệ thống Trung tâm thẩm định (tối thiểu 10 ký tự).',
      };
    }
    if (!rulesAgreement.agreed) {
      return {
        valid: false,
        message:
          'Bác vui lòng đọc và tích cam kết tuân thủ Nội quy chung của nền tảng trước khi tiếp tục.',
      };
    }

    return {
      valid: true,
      payload: {
        clanName: cleanClanName,
        description: cleanDesc,
        agreed_rules: true,
        agreed_rules_snapshot: rulesAgreement.agreed_rules_snapshot || undefined,
        agreed_tos_version: rulesAgreement.agreed_tos_version || '1.0',
        agreed_clan_rules_version: Number(rulesAgreement.agreed_clan_rules_version || 1),
        registration_profile: {
          claim_mode: 'CLAN_SETUP',
          full_name: cleanFullName,
          alias: String(alias || '').trim() || undefined,
          gender: gender || 'NAM',
          birth_year: cleanBirthYear ? Number(cleanBirthYear) : undefined,
          birth_place: String(birthPlace || '').trim() || undefined,
          address: String(address || '').trim() || undefined,
          father_name: cleanFatherName,
          elder_name: cleanElderName,
          elder_phone: elderPhoneCheck.normalized,
          generation: 1,
          member_role: 'TRUONG_HO',
          is_alive: true,
          note: cleanNote,
          agreed_rules: true,
          agreed_rules_snapshot: rulesAgreement.agreed_rules_snapshot || undefined,
          agreed_tos_version: rulesAgreement.agreed_tos_version || '1.0',
          agreed_clan_rules_version: Number(rulesAgreement.agreed_clan_rules_version || 1),
        },
      },
    };
  };

  const handleGoToReview = (e) => {
    e.preventDefault();
    setErrorMsg('');
    const check = validateAndBuildDraft();
    if (!check.valid) {
      setErrorMsg(check.message);
      return;
    }
    setReviewConfirmed(false);
    setStepMode('REVIEW');
    window.scrollTo?.({ top: 0, behavior: 'smooth' });
  };

  const handleFinalSubmit = async () => {
    setErrorMsg('');
    const check = validateAndBuildDraft();
    if (!check.valid) {
      setErrorMsg(check.message);
      setStepMode('EDIT');
      return;
    }
    if (!reviewConfirmed) {
      setErrorMsg(
        'Bác vui lòng tích xác nhận các thông tin rà soát là chính xác trước khi gửi hồ sơ.'
      );
      return;
    }

    try {
      setIsSubmitting(true);
      let res;
      if (isRevisionMode && caseId) {
        res = await membershipApi.submitRevision(caseId, check.payload);
        toast.success('Đã gửi lại hồ sơ bổ sung lập dòng họ!');
      } else {
        res = await membershipApi.submitClanSetup(check.payload);
        toast.success(
          'Đã gửi hồ sơ lập dòng họ mới! Chờ Hệ thống Trung tâm phê duyệt.'
        );
      }

      if (typeof refreshContext === 'function') {
        await refreshContext();
      }

      const targetCaseId = res?.data?.caseId || caseId || '';
      navigate(
        targetCaseId
          ? `/membership/status?caseId=${encodeURIComponent(targetCaseId)}`
          : '/membership/status'
      );
    } catch (err) {
      console.error('[ClanSetupPage] Submit error:', err);
      const msg =
        err?.response?.data?.message ||
        'Gửi hồ sơ lập dòng họ thất bại. Bác vui lòng thử lại.';
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isClanSectionComplete =
    String(clanName || '').trim().length >= 3 &&
    String(description || '').trim().length >= 10;

  const isFounderSectionComplete =
    String(fullName || '').trim().length > 0 &&
    String(fatherName || '').trim().length > 0 &&
    String(note || '').trim().length >= 10;

  const isElderSectionComplete =
    String(elderName || '').trim().length > 0 &&
    validatePhoneWithCountry(elderPhone, elderPhoneCountry).valid;

  if (loadingRevision) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-6">
        <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
        <p className="mt-3 text-base font-bold text-slate-700">
          Đang tải thông tin hồ sơ...
        </p>
      </div>
    );
  }

  const inputClass =
    'min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base font-bold text-slate-900 placeholder:font-normal placeholder:text-slate-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100';
  const labelClass = 'block text-base font-normal text-slate-700 mb-1.5';

  return (
    <div className="mx-auto my-5 max-w-[540px] px-4 pb-16">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xl sm:p-6 space-y-5">
        {/* Header trang */}
        <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-4">
          <div className="min-w-0">
            <span className="inline-block rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-black uppercase tracking-wider text-indigo-700 border border-indigo-200">
              {isRevisionMode
                ? 'Bổ sung hồ sơ lập họ'
                : 'Khởi tạo không gian mới (C1-S)'}
            </span>
            <h1 className="mt-2 text-2xl font-black text-slate-900">
              {stepMode === 'REVIEW'
                ? 'Rà soát hồ sơ lập dòng họ'
                : 'Lập dòng họ mới'}
            </h1>
            <p className="mt-1 text-base font-normal text-slate-600">
              Dùng tài khoản{' '}
              <strong className="font-bold text-slate-900">
                {user?.phone || user?.email}
              </strong>{' '}
              làm Trưởng họ sáng lập (không ảnh hưởng dòng họ hiện tại).
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              stepMode === 'REVIEW' ? setStepMode('EDIT') : navigate('/op')
            }
            className="min-h-[48px] h-12 shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-slate-50 px-3.5 text-base font-bold text-slate-800 whitespace-nowrap hover:bg-slate-100"
          >
            <ArrowLeft size={18} />
            <span>{stepMode === 'REVIEW' ? 'Sửa lại' : 'Quay lại'}</span>
          </button>
        </div>

        <div className="flex justify-center">
          <AudioHelpButton
            text={
              stepMode === 'REVIEW'
                ? 'Bác vui lòng kiểm tra lại toàn bộ thông tin dòng họ mới, hồ sơ Trưởng họ và người cao niên xác minh. Nếu đã đúng, bác tích vào ô xác nhận bên dưới rồi bấm Gửi hồ sơ lập dòng họ mới.'
                : 'Bác điền đầy đủ thông tin dòng họ cần thành lập, thông tin Trưởng họ sáng lập và người cao niên từ 60 tuổi trở lên trong họ để Hệ thống Trung tâm gọi điện xác minh trước khi phê duyệt.'
            }
            label="Nghe hướng dẫn"
            variant="soft"
          />
        </div>

        {revisionFeedback && (
          <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-amber-950 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-black uppercase tracking-wider text-amber-900">
                Bút phê từ Hệ thống Trung tâm:
              </p>
              <ZoneVoiceButton
                visible
                text={`Bút phê từ Hệ thống Trung tâm: ${revisionFeedback}`}
                label="Nghe"
              />
            </div>
            <p className="whitespace-pre-wrap text-base font-bold leading-relaxed">
              {revisionFeedback}
            </p>
          </div>
        )}

        {errorMsg && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-base font-bold text-rose-800"
          >
            <AlertCircle size={20} className="mt-0.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {stepMode === 'REVIEW' ? (
          /* =====================================================================
             BƯỚC 2: RÀ SOÁT HỒ SƠ CHUẨN COLLAPSIBLE DETAIL CARD + KEY-VALUE TABLE
             ===================================================================== */
          <div className="space-y-4">
            <CollapsibleDetailCard
              title="1. Thông tin dòng họ cần thành lập"
              statusLabel="Đã điền"
              statusVariant="complete"
              voiceText={`Mục 1: Tên dòng họ ${clanName}. Mô tả: ${description}`}
              defaultExpanded={true}
            >
              <KeyValueDetailTable
                rows={[
                  { label: 'Hình thức', value: 'Lập dòng họ mới (Multi-Home C1-S)' },
                  { label: 'Tên dòng họ', value: String(clanName).trim() },
                ]}
                notes={[
                  {
                    label: 'Mô tả giới thiệu dòng họ',
                    value: String(description).trim(),
                  },
                ]}
              />
            </CollapsibleDetailCard>

            <CollapsibleDetailCard
              title="2. Hồ sơ người sáng lập (Trưởng họ)"
              statusLabel="Đã điền"
              statusVariant="complete"
              voiceText={`Mục 2: Trưởng họ sáng lập ${fullName}, giới tính ${GENDER_LABELS[gender] || 'Nam'}.`}
              defaultExpanded={true}
            >
              <KeyValueDetailTable
                rows={[
                  { label: 'Họ và tên Trưởng họ', value: String(fullName).trim() },
                  ...(alias
                    ? [{ label: 'Tên tự / Tên hiệu', value: String(alias).trim() }]
                    : []),
                  {
                    label: 'Giới tính',
                    value: GENDER_LABELS[gender] || 'Nam',
                  },
                  {
                    label: 'Họ tên Cha / Mẹ',
                    value: String(fatherName).trim(),
                  },
                  ...(birthYear
                    ? [{ label: 'Năm sinh', value: String(birthYear).trim() }]
                    : []),
                  { label: 'Tài khoản quản trị', value: user?.phone || user?.email || '—' },
                ]}
                notes={[
                  ...(birthPlace
                    ? [
                        {
                          label: 'Nguyên quán / Quê gốc',
                          value: String(birthPlace).trim(),
                        },
                      ]
                    : []),
                  ...(address
                    ? [
                        {
                          label: 'Địa chỉ hiện tại',
                          value: String(address).trim(),
                        },
                      ]
                    : []),
                  {
                    label: 'Lời nhắn gửi Hệ thống Trung tâm',
                    value: String(note).trim(),
                  },
                ]}
              />
            </CollapsibleDetailCard>

            <CollapsibleDetailCard
              title="3. Người cao niên (>= 60 tuổi) xác minh"
              statusLabel="Đã điền"
              statusVariant="complete"
              voiceText={`Mục 3: Người cao niên xác minh ${elderName}, số điện thoại ${elderPhone}.`}
              defaultExpanded={true}
            >
              <KeyValueDetailTable
                rows={[
                  {
                    label: 'Họ và tên người cao niên',
                    value: String(elderName).trim(),
                  },
                  {
                    label: 'Số điện thoại liên hệ',
                    value:
                      validatePhoneWithCountry(elderPhone, elderPhoneCountry)
                        .normalized || String(elderPhone).trim(),
                  },
                ]}
              />
            </CollapsibleDetailCard>

            <CollapsibleDetailCard
              title="4. Cam kết tuân thủ Nội quy chung & Trách nhiệm Trưởng họ"
              statusLabel="Đã cam kết"
              statusVariant="complete"
              voiceText="Mục 4: Đã đọc và cam kết tuân thủ Nội quy chung của nền tảng Gia Phả Số."
              defaultExpanded={true}
            >
              <KeyValueDetailTable
                rows={[
                  {
                    label: 'Trạng thái cam kết',
                    value: 'Đã đọc và cam kết tuân thủ Nội quy chung (v1.0)',
                  },
                ]}
              />
            </CollapsibleDetailCard>

            <label className="flex items-start gap-3 rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-4 text-emerald-950 cursor-pointer">
              <input
                type="checkbox"
                checked={reviewConfirmed}
                onChange={(e) => {
                  setReviewConfirmed(e.target.checked);
                  setErrorMsg('');
                }}
                className="mt-1 h-5 w-5 shrink-0 rounded border-emerald-400 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-base font-bold leading-snug">
                Tôi đã rà soát kỹ và xác nhận toàn bộ thông tin lập dòng họ mới trên là trung thực, chính xác.
              </span>
            </label>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setStepMode('EDIT')}
                className="min-h-[48px] h-12 rounded-xl border border-slate-300 bg-white px-5 text-base font-bold text-slate-800 whitespace-nowrap hover:bg-slate-50 sm:flex-1"
              >
                Quay lại chỉnh sửa
              </button>

              <button
                type="button"
                disabled={isSubmitting || !reviewConfirmed}
                onClick={handleFinalSubmit}
                className={`min-h-[48px] h-12 rounded-xl px-5 text-base font-bold text-white whitespace-nowrap inline-flex items-center justify-center gap-2 sm:flex-[1.5] transition ${
                  isSubmitting || !reviewConfirmed
                    ? 'cursor-not-allowed bg-slate-300 text-slate-600'
                    : 'bg-emerald-600 hover:bg-emerald-700 shadow-md'
                }`}
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
                        ? 'Gửi lại hồ sơ lập dòng họ'
                        : 'Gửi hồ sơ lập dòng họ mới'}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* =====================================================================
             BƯỚC 1: BIỂU MẪU KHAI BÁO (3 COLLAPSIBLE DETAIL CARDS)
             ===================================================================== */
          <form onSubmit={handleGoToReview} className="space-y-4" noValidate>
            <CollapsibleDetailCard
              title="1. Thông tin dòng họ cần thành lập"
              statusLabel={isClanSectionComplete ? 'Hoàn chỉnh' : 'Chưa hoàn chỉnh'}
              statusVariant={isClanSectionComplete ? 'complete' : 'pending'}
              voiceText="Mục 1: Nhập tên dòng họ mới cần thành lập và mô tả giới thiệu nguồn gốc, địa bàn cư trú của dòng họ."
              defaultExpanded={true}
              disabled={isSubmitting}
            >
              <div className="space-y-4">
                <div>
                  <label className={labelClass}>
                    Tên dòng họ <span className="font-bold text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    disabled={isSubmitting}
                    value={clanName}
                    onChange={(e) => setClanName(e.target.value)}
                    placeholder="Ví dụ: Nguyễn Tộc - Chi Phái 2"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>
                    Mô tả giới thiệu dòng họ{' '}
                    <span className="font-bold text-rose-600">*</span>
                  </label>
                  <textarea
                    disabled={isSubmitting}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Nguồn gốc, địa bàn cư trú gốc, quy mô chi phái (tối thiểu 10 ký tự)..."
                    className={`${inputClass} min-h-[100px] resize-y`}
                  />
                </div>
              </div>
            </CollapsibleDetailCard>

            <CollapsibleDetailCard
              title="2. Hồ sơ người sáng lập (Trưởng họ)"
              statusLabel={
                isFounderSectionComplete ? 'Hoàn chỉnh' : 'Chưa hoàn chỉnh'
              }
              statusVariant={isFounderSectionComplete ? 'complete' : 'pending'}
              voiceText="Mục 2: Nhập họ tên Trưởng họ sáng lập, giới tính, năm sinh, họ tên cha mẹ, quê gốc, địa chỉ và lời nhắn gửi Hệ thống Trung tâm."
              defaultExpanded={true}
              disabled={isSubmitting}
            >
              <div className="space-y-4">
                <div>
                  <label className={labelClass}>
                    Họ và tên Trưởng họ{' '}
                    <span className="font-bold text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    disabled={isSubmitting}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Nguyễn Văn A"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>
                    Tên tự / Tên hiệu / Tên thường gọi
                  </label>
                  <input
                    type="text"
                    disabled={isSubmitting}
                    value={alias}
                    onChange={(e) => setAlias(e.target.value)}
                    placeholder="Nhập tên tự, tên hiệu hoặc tên thường gọi (nếu có)"
                    className={inputClass}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Giới tính</label>
                    <select
                      disabled={isSubmitting}
                      value={gender}
                      onChange={(e) => setGender(e.target.value)}
                      className={inputClass}
                    >
                      <option value="NAM">Nam</option>
                      <option value="NU">Nữ</option>
                      <option value="KHAC">Khác</option>
                    </select>
                  </div>

                  <div>
                    <label className={labelClass}>Năm sinh</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      disabled={isSubmitting}
                      value={birthYear}
                      onChange={(e) => setBirthYear(e.target.value)}
                      placeholder="Ví dụ: 1965"
                      className={inputClass}
                    />
                  </div>
                </div>

                <div>
                  <label className={labelClass}>
                    Họ tên Cha / Mẹ{' '}
                    <span className="font-bold text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    disabled={isSubmitting}
                    value={fatherName}
                    onChange={(e) => setFatherName(e.target.value)}
                    placeholder="Nhập họ tên đầy đủ của cha hoặc mẹ"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>Nguyên quán / Quê gốc</label>
                  <textarea
                    rows={2}
                    disabled={isSubmitting}
                    value={birthPlace}
                    onChange={(e) => setBirthPlace(e.target.value)}
                    placeholder="Thôn/Xóm, Xã/Phường, Huyện/Quận, Tỉnh/Thành phố"
                    className={`${inputClass} min-h-[76px] py-2.5 resize-y`}
                  />
                </div>

                <div>
                  <label className={labelClass}>Địa chỉ cư trú hiện tại</label>
                  <textarea
                    rows={2}
                    disabled={isSubmitting}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Số nhà, đường/xóm, xã/phường, quận/huyện, tỉnh/thành phố"
                    className={`${inputClass} min-h-[76px] py-2.5 resize-y`}
                  />
                </div>

                <div>
                  <label className={labelClass}>
                    Lời nhắn gửi Hệ thống Trung tâm{' '}
                    <span className="font-bold text-rose-600">*</span>
                  </label>
                  <textarea
                    disabled={isSubmitting}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Thông tin xác minh tư cách đại diện thành lập dòng họ (tối thiểu 10 ký tự)..."
                    className={`${inputClass} min-h-[92px] resize-y`}
                  />
                </div>
              </div>
            </CollapsibleDetailCard>

            <CollapsibleDetailCard
              title="3. Người cao niên (>= 60 tuổi) xác minh"
              statusLabel={
                isElderSectionComplete ? 'Hoàn chỉnh' : 'Chưa hoàn chỉnh'
              }
              statusVariant={isElderSectionComplete ? 'complete' : 'pending'}
              voiceText="Mục 3: Nhập họ tên và số điện thoại của một người cao niên từ 60 tuổi trở lên trong dòng họ để Hệ thống Trung tâm liên hệ xác minh ngoại tuyến."
              defaultExpanded={true}
              disabled={isSubmitting}
            >
              <div className="space-y-4">
                <p className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-3 text-base font-normal text-indigo-950">
                  Để đảm bảo tính chính danh khi thành lập dòng họ mới, Hệ thống Trung tâm sẽ gọi điện xác minh qua một vị cao niên (từ 60 tuổi trở lên) trong họ.
                </p>

                <div>
                  <label className={labelClass}>
                    Họ và tên người cao niên xác minh{' '}
                    <span className="font-bold text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    disabled={isSubmitting}
                    value={elderName}
                    onChange={(e) => setElderName(e.target.value)}
                    placeholder="Ví dụ: Cụ Nguyễn Đình Văn (Trưởng chi / Cao niên)"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>
                    Số điện thoại người cao niên{' '}
                    <span className="font-bold text-rose-600">*</span>
                  </label>
                  <div className="flex flex-row items-center gap-2">
                    <select
                      aria-label="Chọn mã quốc gia người cao niên"
                      value={elderPhoneCountry}
                      disabled={isSubmitting}
                      onChange={(e) => setElderPhoneCountry(e.target.value)}
                      className="min-h-[48px] h-12 w-[126px] sm:w-[136px] shrink-0 rounded-xl border border-slate-300 bg-white px-2.5 text-base font-bold text-slate-900 outline-none focus:border-emerald-500"
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
                        disabled={isSubmitting}
                        value={elderPhone}
                        onChange={(e) => setElderPhone(e.target.value)}
                        placeholder={selectedElderCountryMeta.placeholder}
                        className={`${inputClass} pl-10`}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CollapsibleDetailCard>

            <RulesAgreementCard
              mode="CLAN_SETUP"
              clanName={clanName}
              agreed={rulesAgreement.agreed}
              disabled={isSubmitting}
              title="4. Cam kết tuân thủ Nội quy chung & Trách nhiệm Trưởng họ"
              onChange={(nextRules) => {
                setRulesAgreement(nextRules);
                if (nextRules.agreed) setErrorMsg('');
              }}
            />

            <button
              type="submit"
              disabled={isSubmitting}
              className="min-h-[48px] h-12 w-full rounded-xl bg-indigo-600 px-5 text-base font-bold text-white whitespace-nowrap shadow-md transition hover:bg-indigo-700 inline-flex items-center justify-center gap-2"
            >
              <Eye size={18} />
              <span>Tiếp tục rà soát hồ sơ</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ClanSetupPage;
