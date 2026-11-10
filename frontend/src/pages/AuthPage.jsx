/**
 * =============================================================================
 * PATH        : frontend/src/pages/AuthPage.jsx
 * DATETIME    : 2026-11-10T16:10:00+07:00
 * VERSION     : 24.6.9-AUTH-PAGE-MEMBERSHIP-REDIRECT
 * DESCRIPTION : Trang xác thực (Login / Register / Forgot / Reset).
 *               Tích hợp redirect sau login theo AuthContext.resolvePostLoginRedirect
 *               (membership claim / status / DRAFT / tree).
 *               Giữ nguyên các view, error handling, Elder TTS, revision-notice.
 * =============================================================================
 * CHANGELOGS:
 * - 24.6.8.R3.3.5-W2 (2026-07-26): Residual Wave 2 – tenant lifecycle vs lock.
 * - 2026-11-10T16:10:00+07:00 (v24.6.9-AUTH-PAGE-MEMBERSHIP-REDIRECT):
 *   + handleLoginSubmit dùng result.redirectPath từ AuthContext.login().
 *   + Hỗ trợ shape trả về { user, context, redirectPath }.
 *   + Chuẩn hóa QX (Q1–Q4).
 * =============================================================================
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

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
import { clearMfoClientOnLogin } from '../features/mfo/lib/mfoDraftStore.js';

import {
  createTransitionSnapshot,
  resolveReentryType,
  resolveReentryPolicy,
  reconstructRuntimeState,
} from '../features/elder-doctrine/services/navigationLifecycle.service.js';

import {
  createFullRuntimeResetPlan,
  incrementRuntimeVersion,
} from '../features/elder-doctrine/services/runtimeInvalidation.service.js';

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
  const { login } = useAuth();
  const { speak, speakError } = useTts?.() || {};

  const [view, setView] = useState('login');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginMessage, setLoginMessage] = useState('');
  const [loginMessageType, setLoginMessageType] = useState('error');
  const [loginSuccessMessage, setLoginSuccessMessage] = useState('');
  const [loginUserStatus, setLoginUserStatus] = useState('');
  const [lockoutInfo, setLockoutInfo] = useState({});
  const [revisionContext, setRevisionContext] = useState(null);
  const [runtimeVersion, setRuntimeVersion] = useState(1);

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

      // ===== LOG TẠM ĐỂ XÁC NHẬN =====
      console.log('[LOGIN RESULT]', result);
      console.log('[REDIRECT TO]', redirectPath || '(fallback)');
      // ================================

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
        toast.success(successMessage);
        if (typeof speak === 'function') speak(successMessage, { rate: 0.82 });
        else speakError?.(successMessage);

        // Ưu tiên redirectPath từ AuthContext (membership-aware)
        if (redirectPath) {
          navigate(redirectPath, { replace: true });
          return;
        }

        // Fallback theo role (giữ tương thích cũ)
        const role = String(user?.role || '').toUpperCase();
        if (role === 'CLAN_ADMIN' || role === 'SYSTEM_ADMIN') {
          navigate('/admin');
        } else {
          navigate('/op');
        }
      }
    } catch (err) {
      console.error('[Login error:]', err);

      const backendError = err.response?.data;
      const errorCode = err?.code || backendError?.code || extractBackendCode(err);
      const serverMessage = err?.message || backendError?.message || extractBackendMessage(err);

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

        if (errorCode === 'ACCOUNT_CHO_DUYET' && canEdit) {
          setRevisionContext({
            identifier: loginData?.identifier || '',
            reviewNote,
            tempSnapshot,
            caseStatus: err?.caseStatus ?? serverData.caseStatus ?? null,
            caseId: err?.caseId ?? serverData.caseId ?? null,
          });
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
        {view === 'login' && (
          <LoginForm
            onSubmitLogin={handleLoginSubmit}
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
            onBack={() => setView('login')}
            onSuccess={() => setView('login')}
          />
        )}

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
          <div className="space-y-4 text-center">
            <h2 className="text-xl font-bold text-gray-900">Hồ sơ cần bổ sung</h2>
            <p className="text-gray-700">{revisionContext.reviewNote || 'Ban quản trị yêu cầu bổ sung thông tin.'}</p>
            <button
              type="button"
              onClick={() => navigate(`/membership/claim?caseId=${revisionContext.caseId}&mode=revision`)}
              className="w-full py-3 min-h-[48px] bg-amber-600 text-white font-bold rounded-2xl"
            >
              Bổ sung hồ sơ ngay
            </button>
            <button
              type="button"
              onClick={() => setView('login')}
              className="w-full py-3 min-h-[48px] bg-gray-100 text-gray-800 font-semibold rounded-2xl"
            >
              Quay lại đăng nhập
            </button>
          </div>
        )}

        {view === 'waiting' && <WaitingPage />}
        {view === 'result' && <ResultPage />}
      </div>
    </div>
  );
}
