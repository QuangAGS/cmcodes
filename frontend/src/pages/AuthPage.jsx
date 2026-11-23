/**
 * =============================================================================
 * PATH        : frontend/src/pages/AuthPage.jsx
 * DATETIME    : 2026-11-23T16:30:00+07:00
 * VERSION     : 24.9.0-ISO29148-RPOP-NO-TOAST
 * DESCRIPTION : Trang xác thực (Login / Register / Forgot / Reset).
 *               - Giữ redirect sau login.
 *               - 423 ACCOUNT_CHO_DUYET (canEdit === true): nạp caseMetadata.registration_profile
 *                 (EM 3 lớp / 21 trường / CLAN_SETUP) vào pendingFormData cho luồng bổ sung hồ sơ.
 *               - 403 ACCOUNT_PERMANENTLY_REJECTED (canEdit === false): khóa cứng, không mở form sửa.
 * =============================================================================
 * CHANGELOGS:
 * - 24.6.8.R3.3.5-W2: Residual Wave 2 – tenant lifecycle vs lock.
 * - 2026-11-10 (v24.6.9): login dùng result.redirectPath.
 * - 2026-11-11 (v24.6.10): khôi phục toggleAuthMode.
 * - 2026-11-11T22:40:00+07:00 (v24.6.11-AUTH-PAGE-RESTORE-REGISTER-CONTRACT):
 *   + Trả lại onRegisterSubmit, pendingFormData, view waiting/result.
 * - 2026-11-13T09:35:00+07:00 (v24.7.1-MULTIHOME-AMEND02-V15-LAT2):
 *   + Đọc caseMetadata.registration_profile từ 423 ACCOUNT_CHO_DUYET và nạp đủ vào pendingFormData.
 *   + Chặn riêng 403 ACCOUNT_PERMANENTLY_REJECTED (hard-lock, không hiện nút sửa).
 *   + Reset cờ revision khi bấm Quay lại đăng nhập từ revision-notice.
 * - 2026-11-14T22:45:00+07:00 (v24.8.0-UAT-BUG8-REVISION-NOTE-DISPLAY):
 *   + Fix UAT Bug 8: Truyền reviewNote từ revisionContext sang RegisterForm & pendingFormData,
 *     đồng thời nâng cấp thẻ hiển thị bút phê của Quản trị viên trên màn hình revision-notice.
 * =============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4. Không đổi tên LoginForm. Không đổi redirect sau login.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PersistentMessageBanner from '../components/common/PersistentMessageBanner.jsx';

import { useAuth } from '../context/AuthContext.jsx';
import {
  resolveRevisionPhone,
  resolveRevisionEmail,
} from '../features/register-wizard/utils/identityHelpers.js';
import LoginForm from '../features/register-wizard/components/LoginForm.jsx';
import RegisterForm from '../features/register-wizard/components/RegisterForm.jsx';
import ForgotPasswordForm from '../features/register-wizard/components/ForgotPasswordForm.jsx';
import ResetPasswordForm from '../features/register-wizard/components/ResetPasswordForm.jsx';
import VerifyResetCodeForm from '../features/register-wizard/components/VerifyResetCodeForm.jsx';
import ChangePasswordForm from '../features/register-wizard/components/ChangePasswordForm.jsx';

import WaitingPage from './WaitingPage.jsx';
import ResultPage from './ResultPage.jsx';

import { useTts } from '../shared/hooks/useTts.js';
import AudioHelpButton from '../features/elder-doctrine/components/AudioHelpButton.jsx';
import { clearMfoClientOnLogin } from '../features/mfo/lib/mfoDraftStore.js';

const extractBackendMessage = (err) => {
  return (
    err?.message ||
    err?.error ||
    err?.response?.data?.message ||
    err?.response?.data?.error?.message ||
    (typeof err?.response?.data?.error === 'string'
      ? err.response.data.error
      : '') ||
    ''
  );
};

const extractBackendCode = (err) => {
  return (
    err?.code ||
    err?.response?.data?.code ||
    err?.response?.data?.error?.code ||
    'UNKNOWN_ERROR'
  );
};

const extractMinutesLeft = (err) => {
  const raw =
    err?.minutesLeft ??
    err?.retryAfterMinutes ??
    err?.response?.data?.minutesLeft ??
    err?.response?.data?.retryAfterMinutes ??
    null;

  const parsed = Number(raw);

  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.ceil(parsed);
  }

  const message = extractBackendMessage(err);
  const minuteMatch = message.match(/(\d+)\s*phút/i);

  if (minuteMatch?.[1]) {
    const messageMinutes = Number(minuteMatch[1]);
    if (Number.isFinite(messageMinutes) && messageMinutes > 0) {
      return Math.ceil(messageMinutes);
    }
  }

  return null;
};

export default function AuthPage() {
  const navigate = useNavigate();
  const { login, register } = useAuth();
  const { speak, speakError } = useTts?.() || {};

  const [view, setView] = useState('login');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingFormData, setPendingFormData] = useState(null);
  const [bannerState, setBannerState] = useState(null);

  const [loginMessage, setLoginMessage] = useState('');
  const [loginMessageType, setLoginMessageType] = useState('error');
  const [loginSuccessMessage, setLoginSuccessMessage] = useState('');
  const [loginUserStatus, setLoginUserStatus] = useState('');
  const [lockoutInfo, setLockoutInfo] = useState({});

  const [revisionContext, setRevisionContext] = useState(null);
  const [registerRevisionMode, setRegisterRevisionMode] = useState(false);
  const [runtimeVersion, setRuntimeVersion] = useState(1);
  const [reentryContext, setReentryContext] = useState(null);

  const handleSwitchToRegister = () => {
    setLoginMessage('');
    setLoginSuccessMessage('');
    setLoginUserStatus('');
    setRegisterRevisionMode(false);
    setRevisionContext(null);
    setRuntimeVersion((prev) => prev + 1);
    setView('register');
  };

  const handleRegisterSubmit = async (data) => {
    const snap = revisionContext?.tempSnapshot || {};
    const meta = revisionContext?.caseMetadata || {};
    const metaProfile =
      meta.registration_profile && typeof meta.registration_profile === 'object'
        ? meta.registration_profile
        : {};
    const identitySeed = {
      phone: snap.phone || metaProfile.phone || data.phone || '',
      email: snap.email || metaProfile.email || data.email || '',
    };

    const isRev = registerRevisionMode || data?.isRevision === true;
    const lockedPhone = isRev
      ? resolveRevisionPhone(revisionContext?.identifier, identitySeed, data.phone)
      : data.phone;
    const lockedEmail = isRev
      ? resolveRevisionEmail(revisionContext?.identifier, identitySeed, data.email) || null
      : data.email;

    const merged = {
      ...data,
      ...(isRev
        ? {
            isRevision: true,
            reviewNote: revisionContext?.reviewNote || data?.reviewNote || '',
            phone: lockedPhone,
            email: lockedEmail,
            ...(data.registration_profile && typeof data.registration_profile === 'object'
              ? {
                  registration_profile: {
                    ...data.registration_profile,
                    phone: lockedPhone || undefined,
                    email: lockedEmail || undefined,
                  },
                }
              : {}),
            isNewClan:
              data.isNewClan === true ||
              snap.isNewClan === true ||
              metaProfile.claim_mode === 'CLAN_SETUP' ||
              meta.case_type === 'CLAN_SETUP' ||
              snap.role === 'CLAN_ADMIN',
          }
        : {}),
    };

    setPendingFormData(merged);
    setIsSubmitting(true);

    try {
      setBannerState(null);
      setReentryContext(null);
      setView('waiting');
    } catch (err) {
      setBannerState({
        type: 'error',
        mode: 'inline',
        title: 'Chưa thể chuyển sang màn hình rà soát',
        message: err?.message || 'Không thể xử lý hồ sơ lúc này.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleWaitingBack = () => {
    setReentryContext({
      from: 'WaitingPage',
      action: 'edit',
      preserveDraft: true,
      resetRuntime: true,
    });
    setRuntimeVersion((prev) => prev + 1);
    setView('register');
  };

  const handleConfirmSubmit = async (confirmedData) => {
    if (typeof register !== 'function') {
      setBannerState({
        type: 'error',
        mode: 'inline',
        title: 'Lỗi cấu hình đăng ký',
        message: 'Luồng đăng ký chưa được nối. AuthContext chưa export register.',
      });
      return;
    }

    setBannerState(null);
    setIsSubmitting(true);

    try {
      await register(confirmedData || pendingFormData);
      setRegisterRevisionMode(false);
      setBannerState(null);
      setView('result');
    } catch (err) {
      const safeMessage =
        extractBackendMessage(err) || 'Gửi hồ sơ thất bại. Bác vui lòng thử lại.';
      const correlationId =
        err?.response?.headers?.['x-correlation-id'] ||
        err?.response?.data?.correlationId ||
        'Không có';
      setBannerState({
        type: 'error',
        mode: 'inline',
        title: 'Gửi hồ sơ chưa thành công',
        message: safeMessage,
        correlationId,
      });
      speakError?.(safeMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLoginSubmit = async (loginData) => {
    setIsSubmitting(true);
    setLoginMessage('');
    setLoginSuccessMessage('');
    setLoginUserStatus('');
    setLockoutInfo({});

    try {
      const result = await login(loginData);
      clearMfoClientOnLogin();

      const user = result?.user || result;
      const redirectPath = result?.redirectPath;

      if (user) {
        if (user.status === 'CHO_DUYET' && !redirectPath) {
          const pendingMessage = 'Hồ sơ của bác đang chờ Ban Quản trị phê duyệt.';
          setLoginSuccessMessage(pendingMessage);
          setLoginUserStatus('CHO_DUYET');

          requestAnimationFrame(() => {
            if (typeof speak === 'function') speak(pendingMessage, { rate: 0.82 });
            else speakError?.(pendingMessage);
          });
          return;
        }

        const successMessage = 'Chào mừng bạn trở lại!';
        setLoginSuccessMessage(successMessage);
        if (typeof speak === 'function') speak(successMessage, { rate: 0.82 });
        else speakError?.(successMessage);

        if (redirectPath) {
          navigate(redirectPath, { replace: true });
          return;
        }

        const role = String(user?.role || '').toUpperCase();
        if (role === 'CLAN_ADMIN' || role === 'SYSTEM_ADMIN') {
          navigate('/admin');
        } else {
          navigate('/op');
        }
      }
    } catch (err) {
      const backendError = err.response?.data || {};
      const errorCode =
        backendError.code ||
        err?.code ||
        extractBackendCode(err);
      const serverMessage =
        backendError.message ||
        (err?.code && err.code !== 'ERR_BAD_REQUEST' ? err.message : '') ||
        extractBackendMessage(err);

      // Lát 2 (AMEND-RP-OP-2026-02 V1.5.0 Mục 6): Hard-lock 403 ACCOUNT_PERMANENTLY_REJECTED
      if (errorCode === 'ACCOUNT_PERMANENTLY_REJECTED') {
        const hardLockMsg =
          serverMessage ||
          'Hồ sơ đã bị từ chối vĩnh viễn. Không thể sửa hoặc nộp lại.';
        setRevisionContext(null);
        setRegisterRevisionMode(false);
        setLoginMessage(hardLockMsg);
        setLoginMessageType('error');
        requestAnimationFrame(() => speakError?.(hardLockMsg));
        return;
      }

      if (
        errorCode === 'USER_PENDING_APPROVAL' ||
        errorCode === 'ACCOUNT_CHO_DUYET' ||
        errorCode === 'TENANT_CHO_DUYET' ||
        errorCode === 'TENANT_PENDING_ACTIVATION'
      ) {
        const serverData = err?.response?.data || {};
        const canEdit = err?.canEdit === true || serverData.canEdit === true;
        const reviewNote = err?.reviewNote ?? serverData.reviewNote ?? null;
        const tempSnapshot = err?.tempSnapshot ?? serverData.tempSnapshot ?? null;
        const caseMetadata = err?.caseMetadata ?? serverData.caseMetadata ?? null;

        if (errorCode === 'ACCOUNT_CHO_DUYET' && canEdit) {
          setRevisionContext({
            identifier: loginData?.identifier || '',
            canEdit: true,
            reviewNote,
            tempSnapshot,
            caseMetadata,
            caseStatus: err?.caseStatus ?? serverData.caseStatus ?? null,
            caseId: err?.caseId ?? serverData.caseId ?? null,
          });
          setRegisterRevisionMode(true);
          setView('revision-notice');

          const msg = serverMessage || 'Ban Quản trị có góp ý. Bác vui lòng xem và bổ sung hồ sơ.';
          requestAnimationFrame(() => speakError?.(msg));
          return;
        }

        setLoginMessage(serverMessage || 'Hồ sơ đang chờ duyệt.');
        setLoginMessageType('info');
        return;
      }

      const minutes = extractMinutesLeft(err);
      if (minutes) {
        setLockoutInfo({ minutesLeft: minutes });
        setLoginMessage(`Tài khoản tạm khóa. Vui lòng thử lại sau ${minutes} phút.`);
      } else {
        setLoginMessage(serverMessage || 'Đăng nhập thất bại. Vui lòng kiểm tra lại.');
      }
      setLoginMessageType('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-gray-200 p-6 sm:p-8">
        {bannerState && (
          <div className="mb-4">
            <PersistentMessageBanner
              type={bannerState.type}
              mode={bannerState.mode}
              title={bannerState.title}
              message={bannerState.message}
              correlationId={bannerState.correlationId}
              onClose={() => setBannerState(null)}
            />
          </div>
        )}

        {view === 'login' && (
          <LoginForm
            onSubmitLogin={handleLoginSubmit}
            toggleAuthMode={handleSwitchToRegister}
            isSubmitting={isSubmitting}
            onBackHome={() => navigate('/')}
            onForgotPassword={() => setView('forgot')}
            message={loginMessage}
            messageType={loginMessageType}
            successMessage={loginSuccessMessage}
            userStatus={loginUserStatus}
            lockoutInfo={lockoutInfo}
          />
        )}

        {view === 'register' && (
          <RegisterForm
            onRegisterSubmit={handleRegisterSubmit}
            toggleAuthMode={() => {
              setRegisterRevisionMode(false);
              setRevisionContext(null);
              setView('login');
            }}
            isSubmitting={isSubmitting}
            initialData={pendingFormData}
            isRevision={registerRevisionMode}
            reviewNote={revisionContext?.reviewNote || pendingFormData?.reviewNote || ''}
            lockedIdentifier={revisionContext?.identifier || ''}
            reentryContext={reentryContext}
            runtimeVersion={runtimeVersion}
          />
        )}

        {view === 'waiting' && (
          <WaitingPage
            formData={pendingFormData}
            onConfirmSubmit={handleConfirmSubmit}
            onBack={handleWaitingBack}
            loading={isSubmitting}
            runtimeVersion={runtimeVersion}
          />
        )}

        {view === 'result' && <ResultPage formData={pendingFormData} />}

        {view === 'forgot' && (
          <ForgotPasswordForm
            onBack={() => setView('login')}
            onCodeSent={() => setView('verify-code')}
          />
        )}

        {view === 'verify-code' && (
          <VerifyResetCodeForm
            onBack={() => setView('forgot')}
            onVerified={() => setView('reset')}
          />
        )}

        {view === 'reset' && (
          <ResetPasswordForm
            onBack={() => setView('verify-code')}
            onSuccess={() => setView('login')}
          />
        )}

        {view === 'change-password' && (
          <ChangePasswordForm
            onSuccess={() => setView('login')}
          />
        )}

        {view === 'revision-notice' && revisionContext && (
          <div className="space-y-5">
            <div className="text-center space-y-1">
              <span className="inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-black uppercase tracking-wider text-amber-800">
                Yêu cầu bổ sung hồ sơ
              </span>
              <h2 className="text-2xl font-black text-slate-900">
                Hồ sơ cần chỉnh sửa, bổ sung
              </h2>
              <p className="text-xs font-semibold text-slate-500">
                Bác vui lòng đọc kỹ bút phê dưới đây trước khi mở biểu mẫu cập nhật.
              </p>
            </div>

            <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-left text-amber-950 shadow-sm space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-black uppercase tracking-wider text-amber-800">
                  Bút phê của Quản trị viên:
                </p>
                <AudioHelpButton
                  text={`Bút phê của Quản trị viên: ${revisionContext.reviewNote || 'Ban quản trị yêu cầu bổ sung thông tin.'}`}
                  label="Nghe bút phê"
                  variant="soft"
                />
              </div>
              <p className="whitespace-pre-wrap text-sm font-bold leading-relaxed text-amber-950">
                {revisionContext.reviewNote || 'Ban quản trị yêu cầu bổ sung thông tin.'}
              </p>
            </div>

            {revisionContext.canEdit !== false && (
              <button
                type="button"
                onClick={() => {
                  const id = revisionContext?.identifier || '';
                  const snap = revisionContext?.tempSnapshot || {};
                  const meta = revisionContext?.caseMetadata || {};
                  const profile =
                    meta.registration_profile &&
                    typeof meta.registration_profile === 'object'
                      ? meta.registration_profile
                      : meta;

                  const isNewClan =
                    snap.isNewClan === true ||
                    profile.claim_mode === 'CLAN_SETUP' ||
                    meta.case_type === 'CLAN_SETUP' ||
                    meta.registrationType === 'NEW_CLAN' ||
                    snap.role === 'CLAN_ADMIN' ||
                    snap.caseType === 'CLAN_SETUP';

                  const mergedSeed = { ...snap, ...profile };
                  const resolvedPhone = resolveRevisionPhone(
                    id,
                    mergedSeed,
                    snap.phone || profile.phone
                  );
                  const resolvedEmail =
                    resolveRevisionEmail(
                      id,
                      mergedSeed,
                      snap.email || profile.email
                    ) || '';
                  const resolvedClaimedMemberId =
                    meta.claimed_member_id ||
                    profile.claimed_member_id ||
                    snap.claimed_member_id ||
                    null;

                  const hydratedProfile = {
                    ...profile,
                    ...(resolvedClaimedMemberId
                      ? { claimed_member_id: resolvedClaimedMemberId }
                      : {}),
                    ...(resolvedPhone ? { phone: resolvedPhone } : {}),
                    ...(resolvedEmail ? { email: resolvedEmail } : {}),
                  };

                  setPendingFormData({
                    ...snap,
                    ...profile,
                    registration_profile: hydratedProfile,
                    claimed_member_id: resolvedClaimedMemberId,
                    temp_full_name:
                      profile.full_name ||
                      snap.full_name ||
                      snap.temp_full_name ||
                      '',
                    temp_father_name:
                      profile.father_name ||
                      snap.father_name ||
                      snap.temp_father_name ||
                      '',
                    temp_birth_year:
                      profile.birth_year != null && profile.birth_year !== ''
                        ? String(profile.birth_year)
                        : snap.birth_year != null
                          ? String(snap.birth_year)
                          : snap.temp_birth_year || '',
                    temp_relationship:
                      profile.child_type ||
                      profile.temp_relationship ||
                      snap.temp_relationship ||
                      snap.relationship ||
                      'CON_DE',
                    temp_note: profile.note || snap.note || snap.temp_note || '',
                    phone: resolvedPhone,
                    email: resolvedEmail,
                    tenantId: snap.tenantId || snap.tenant_id || meta.tenant_id || '',
                    clanName: snap.clanName || meta.clanName || '',
                    description: snap.description || meta.description || '',
                    tenantSlug: snap.tenantSlug || meta.tenantSlug || '',
                    reviewNote: revisionContext?.reviewNote || '',
                    isRevision: true,
                    isNewClan,
                  });
                  setRegisterRevisionMode(true);
                  setView('register');
                }}
                className="w-full py-3.5 min-h-[48px] bg-amber-600 hover:bg-amber-700 text-white font-black rounded-2xl shadow-md transition"
              >
                Bổ sung hồ sơ ngay →
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setRegisterRevisionMode(false);
                setRevisionContext(null);
                setPendingFormData(null);
                setView('login');
              }}
              className="w-full py-3 min-h-[48px] bg-gray-100 text-gray-800 font-semibold rounded-2xl"
            >
              Quay lại đăng nhập
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
