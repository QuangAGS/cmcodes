/**
 * PATH       : src/features/onboarding/components/BaseProfileForm.jsx
 * DATETIME   : 2026-08-17T21:10:00+07:00
 * VERSION    : 1.0.1-FE-OP-B1-UI2
 * DESCRIPTION:
 * - Form Hồ sơ cơ sở OP (MEMBER_PROMOTE).
 * - Zod + react-hook-form; labels opFieldLabels; Elder zones + FormErrorSpeaker.
 * - Lưu: PUT /members/:id. Gửi duyệt: PUT rồi POST /onboarding/cases/:caseId/submit.
 * - Address không thuộc hard BP (đã chốt). generation luôn hiện.
 * - 1.0.1: onInvalid đúng chỗ; is_alive watch/setValue; log API error.
 * - Q1: không đụng RP forms.
 */

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import apiClient from '../../../lib/apiClient.js';
import AttentionZone from '../../../components/AttentionZone.jsx';
import AudioHelpButton from '../../elder-doctrine/components/AudioHelpButton.jsx';
import ZoneVoiceButton from '../../elder-doctrine/components/ZoneVoiceButton.jsx';
import FormErrorSpeaker from '../../elder-doctrine/components/FormErrorSpeaker.jsx';

import { labelField } from '../constants/opFieldLabels.js';
import {
  OP_BASE_PROFILE_AUDIO_HELP,
  OP_BASE_PROFILE_ZONE,
  OP_BASE_PROFILE_TOAST,
} from '../constants/opMessages.js';

const optionalInt = (min, max) =>
  z.preprocess(
    (v) => {
      if (v === '' || v === null || v === undefined) return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : v;
    },
    z
      .number({ invalid_type_error: 'Phải là số' })
      .int()
      .min(min)
      .max(max)
      .nullable()
      .optional()
  );

const baseProfileSchema = z.object({
  full_name: z
    .string({ required_error: 'Vui lòng nhập họ và tên' })
    .trim()
    .min(2, 'Họ và tên quá ngắn')
    .max(255, 'Họ và tên quá dài'),
  gender: z.enum(['NAM', 'NU', 'KHAC'], {
    required_error: 'Vui lòng chọn giới tính',
  }),
  is_alive: z.boolean().default(true),
  birth_year: z.preprocess(
    (v) => {
      if (v === '' || v === null || v === undefined) return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : v;
    },
    z
      .number({
        required_error: 'Vui lòng nhập năm sinh',
        invalid_type_error: 'Năm sinh không hợp lệ',
      })
      .int()
      .min(1800, 'Năm sinh không hợp lệ')
      .max(new Date().getFullYear(), 'Năm sinh không hợp lệ')
  ),
  birth_month: optionalInt(1, 12),
  birth_day: optionalInt(1, 31),
  generation: optionalInt(1, 50),
});

function toFormDefaults(primary) {
  return {
    full_name: primary?.full_name || '',
    gender: primary?.gender || 'KHAC',
    is_alive: primary?.is_alive !== false,
    birth_year: primary?.birth_year ?? '',
    birth_month: primary?.birth_month ?? '',
    birth_day: primary?.birth_day ?? '',
    generation: primary?.generation ?? '',
  };
}

function buildMemberPayload(values) {
  return {
    full_name: values.full_name.trim(),
    gender: values.gender,
    is_alive: values.is_alive,
    birth_year: values.birth_year,
    birth_month: values.birth_month ?? null,
    birth_day: values.birth_day ?? null,
    generation: values.generation ?? null,
  };
}

/** Lỗi thân thiện — không đọc nguyên văn BE */
function mapApiError(err) {
  const code = err?.response?.data?.code || err?.response?.data?.error?.code;
  const status = err?.response?.status;
  if (status === 401) return 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.';
  if (status === 403) return 'Bạn không có quyền thực hiện thao tác này.';
  if (code === 'ONBOARDING_PROFILE_INCOMPLETE') {
    return 'Hồ sơ chưa đủ thông tin bắt buộc để gửi duyệt.';
  }
  if (code === 'ONBOARDING_CASE_NOT_EDITABLE' || code === 'DENIED') {
    return 'Hồ sơ hiện không thể chỉnh sửa. Vui lòng quay lại danh mục công việc.';
  }
  return OP_BASE_PROFILE_TOAST.saveFailed;
}

const fieldClass =
  'mt-1.5 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';

/**
 * @param {object} props
 * @param {object} props.myOpData - payload GET /onboarding/my-op
 * @param {() => void} [props.onSuccessDraft]
 * @param {() => void} [props.onSuccessSubmit]
 */
export default function BaseProfileForm({
  myOpData,
  onSuccessDraft,
  onSuccessSubmit,
}) {
  const memberId = myOpData?.primary?.id;
  const caseId = myOpData?.case?.id;
  const [formError, setFormError] = useState('');
  const [speakerErrors, setSpeakerErrors] = useState({});

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(baseProfileSchema),
    defaultValues: toFormDefaults(myOpData?.primary),
    mode: 'onSubmit',
  });

  useEffect(() => {
    reset(toFormDefaults(myOpData?.primary));
  }, [myOpData?.primary, reset]);

  useEffect(() => {
    const next = {};
    Object.entries(errors).forEach(([k, v]) => {
      if (v?.message) next[k] = v.message;
    });
    if (formError) next._form = formError;
    setSpeakerErrors(next);
  }, [errors, formError]);

  const validationLabels = useMemo(
    () => ({
      full_name: labelField('full_name'),
      gender: labelField('gender'),
      is_alive: labelField('is_alive'),
      birth_year: labelField('birth_year'),
      birth_month: labelField('birth_month'),
      birth_day: labelField('birth_day'),
      generation: labelField('generation'),
    }),
    []
  );

  const saveMember = async (values) => {
    if (!memberId) {
      throw new Error('MISSING_MEMBER');
    }
    const payload = buildMemberPayload(values);
    await apiClient.put(`/members/${memberId}`, payload);
    return payload;
  };

  /** Tham số 2 của handleSubmit — chạy khi Zod fail */
  const onInvalid = (formErrors) => {
    const first = Object.values(formErrors)[0];
    const msg = first?.message || 'Vui lòng kiểm tra lại thông tin đã nhập.';
    setFormError(msg);
    toast.error(msg);
    console.warn('[BaseProfileForm] validation', formErrors);
  };

  const onSaveDraft = handleSubmit(async (values) => {
    setFormError('');
    try {
      await saveMember(values);
      toast.success(OP_BASE_PROFILE_TOAST.draftSaved);
      onSuccessDraft?.();
    } catch (err) {
      console.error(
        '[BaseProfileForm] save draft',
        err?.response?.status,
        err?.response?.data || err
      );
      const msg =
        err?.message === 'MISSING_MEMBER'
          ? 'Không tìm thấy hồ sơ thành viên.'
          : mapApiError(err);
      setFormError(msg);
      toast.error(msg);
    }
  }, onInvalid);

  const onSubmitForReview = handleSubmit(async (values) => {
    setFormError('');
    try {
      await saveMember(values);

      if (!caseId) {
        const msg =
          'Không tìm thấy hồ sơ xét duyệt. Vui lòng quay lại danh mục.';
        setFormError(msg);
        toast.error(msg);
        return;
      }

      try {
        await apiClient.post(`/onboarding/cases/${caseId}/submit`, {});
      } catch (submitErr) {
        console.error(
          '[BaseProfileForm] submit',
          submitErr?.response?.status,
          submitErr?.response?.data || submitErr
        );
        const msg =
          mapApiError(submitErr) || OP_BASE_PROFILE_TOAST.submitFailed;
        setFormError(msg);
        toast.error(msg);
        onSuccessDraft?.();
        return;
      }

      toast.success(OP_BASE_PROFILE_TOAST.submitted);
      onSuccessSubmit?.();
    } catch (err) {
      console.error(
        '[BaseProfileForm] save before submit',
        err?.response?.status,
        err?.response?.data || err
      );
      const msg =
        err?.message === 'MISSING_MEMBER'
          ? 'Không tìm thấy hồ sơ thành viên.'
          : mapApiError(err);
      setFormError(msg);
      toast.error(msg);
    }
  }, onInvalid);

  if (!memberId) {
    return (
      <p className="text-center text-sm text-rose-600">
        Không tìm thấy thành viên dự bị. Vui lòng quay lại danh mục công việc.
      </p>
    );
  }

  return (
    <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
      <FormErrorSpeaker errors={speakerErrors} />

      <AudioHelpButton
        text={OP_BASE_PROFILE_AUDIO_HELP}
        label="Nghe hướng dẫn trang"
        size="md"
      />

      {formError ? (
        <AttentionZone
          active
          priority="high"
          className="rounded-3xl border p-4 text-sm"
          recoveryKey="op-base-profile-error"
        >
          {formError}
        </AttentionZone>
      ) : null}

      {/* Khối thông tin cơ bản */}
      <AttentionZone
        active
        priority="medium"
        className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4"
        recoveryKey="op-bp-basic"
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-slate-700">Thông tin cơ bản</p>
          <ZoneVoiceButton
            visible
            text={OP_BASE_PROFILE_ZONE.basic}
            label="Nghe"
          />
        </div>
        <p className="text-xs text-slate-500">{OP_BASE_PROFILE_ZONE.basic}</p>

        <label className="block text-sm font-medium text-slate-700">
          {validationLabels.full_name}
          <input
            type="text"
            autoComplete="name"
            className={fieldClass}
            {...register('full_name')}
          />
          {errors.full_name && (
            <span className="mt-1 block text-xs text-rose-600">
              {errors.full_name.message}
            </span>
          )}
        </label>

        <label className="block text-sm font-medium text-slate-700">
          {validationLabels.gender}
          <select className={fieldClass} {...register('gender')}>
            <option value="NAM">Nam</option>
            <option value="NU">Nữ</option>
            <option value="KHAC">Khác</option>
          </select>
          {errors.gender && (
            <span className="mt-1 block text-xs text-rose-600">
              {errors.gender.message}
            </span>
          )}
        </label>

        <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            className="h-5 w-5 rounded border-slate-300"
            checked={!!watch('is_alive')}
            onChange={(e) =>
              setValue('is_alive', e.target.checked, {
                shouldValidate: true,
                shouldDirty: true,
              })
            }
          />
          {validationLabels.is_alive}
        </label>
      </AttentionZone>

      {/* Khối ngày sinh */}
      <AttentionZone
        active
        priority="medium"
        className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4"
        recoveryKey="op-bp-birth"
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-slate-700">Ngày sinh</p>
          <ZoneVoiceButton
            visible
            text={OP_BASE_PROFILE_ZONE.birth}
            label="Nghe"
          />
        </div>
        <p className="text-xs text-slate-500">{OP_BASE_PROFILE_ZONE.birth}</p>

        <div className="grid grid-cols-3 gap-2">
          <label className="block text-sm font-medium text-slate-700">
            {validationLabels.birth_year}
            <input
              type="number"
              inputMode="numeric"
              className={fieldClass}
              {...register('birth_year')}
            />
            {errors.birth_year && (
              <span className="mt-1 block text-xs text-rose-600">
                {errors.birth_year.message}
              </span>
            )}
          </label>
          <label className="block text-sm font-medium text-slate-700">
            {validationLabels.birth_month}
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={12}
              placeholder="1–12"
              className={fieldClass}
              {...register('birth_month')}
            />
            {errors.birth_month && (
              <span className="mt-1 block text-xs text-rose-600">
                {errors.birth_month.message}
              </span>
            )}
          </label>
          <label className="block text-sm font-medium text-slate-700">
            {validationLabels.birth_day}
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={31}
              placeholder="1–31"
              className={fieldClass}
              {...register('birth_day')}
            />
            {errors.birth_day && (
              <span className="mt-1 block text-xs text-rose-600">
                {errors.birth_day.message}
              </span>
            )}
          </label>
        </div>
      </AttentionZone>

      {/* Thế hệ — luôn hiện */}
      <AttentionZone
        active
        priority="low"
        className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4"
        recoveryKey="op-bp-generation"
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-slate-700">
            {validationLabels.generation}
          </p>
          <ZoneVoiceButton
            visible
            text={OP_BASE_PROFILE_ZONE.generation}
            label="Nghe"
          />
        </div>
        <p className="text-xs text-slate-500">{OP_BASE_PROFILE_ZONE.generation}</p>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={50}
          placeholder="Ví dụ: 5"
          className={fieldClass}
          {...register('generation')}
        />
        {errors.generation && (
          <span className="mt-1 block text-xs text-rose-600">
            {errors.generation.message}
          </span>
        )}
      </AttentionZone>

      <div className="flex flex-col gap-3 pt-2">
        <button
          type="button"
          disabled={isSubmitting}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onSubmitForReview(e);
          }}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-200 disabled:opacity-60 active:scale-[0.98]"
        >
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Gửi duyệt
        </button>
        <button
          type="button"
          disabled={isSubmitting}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onSaveDraft(e);
          }}
          className="flex w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-semibold text-slate-700 disabled:opacity-60 active:scale-[0.98]"
        >
          Lưu nháp
        </button>
      </div>
    </form>
  );
}