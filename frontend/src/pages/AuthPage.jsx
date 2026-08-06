/**
 * PATH       : src/pages/AuthPage.jsx
 * DATETIME   : 2026-08-05T21:35:00+07:00
 * VERSION    : 24.6.8.R3.3.5-W2-PR-OP-4-identity
 * DESCRIPTION:
 * - VÁ TOÀN DIỆN CHỐT CHẶN FRONTEND THEO QUY HOẠCH VẾT CẠN.
 * - Đón đầu mã lỗi ACCOUNT_DISABLED / ACCOUNT_CHO_DUYET / TENANT_*.
 * - [24.6.8-W2] Residual Wave 2:
 *   + 423 lifecycle (ACCOUNT_CHO_DUYET) ≠ security lock.
 *   + TENANT_PENDING_ACTIVATION trong block chờ duyệt.
 *   + Ưu tiên err.code từ normalizeAuthError.
 * - Q1: Không đổi tên hàm, cấu trúc view, LoginForm contract.
 * - Q2: Header + changelog.
 *
 * CHANGELOG:
 * - 24.6.7.R3.3.4: Exhaustive ACCOUNT_DISABLED / CHO_DUYET early return.
 * - 24.6.8.R3.3.5-W2 (2026-07-26): tenant lifecycle vs lock + tenant pending codes.
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

/**
 * Security lock ≠ lifecycle chờ duyệt.
 * ACCOUNT_CHO_DUYET / TENANT_* không được map thành "tạm khoá".
 */
const isSecurityLockSignal = (err) => {
  const code = extractBackendCode(err);
  const message = extractBackendMessage(err);
  const status = err?.status || err?.response?.status;

  if (
    code === 'ACCOUNT_CHO_DUYET' ||
    code === 'USER_PENDING_APPROVAL' ||
    code === 'TENANT_CHO_DUYET' ||
    code === 'TENANT_PENDING_ACTIVATION'
  ) {
    return false;
  }

  return (
    code === 'ACCOUNT_LOCKED' ||
    code === 'ACCOUNT_BANNED' ||
    code === 'IP_BLOCKED' ||
    code === 'LOGIN_RATE_LIMITED' ||
    code === 'RATE_LIMITED' ||
    (status === 423 &&
      (code === 'ACCOUNT_LOCKED' ||
        code === 'ACCOUNT_BANNED' ||
        message.includes('IP của bạn đang bị tạm khóa') ||
        message.includes('Quá nhiều lần thử đăng nhập') ||
        message.includes('Tài khoản tạm khóa')))
  );
};

const buildNeutralSecurityLockFeedback = (err) => {
  const code = extractBackendCode(err);
  const minutesLeft = extractMinutesLeft(err);
  const lockUntilAt =
    Number.isFinite(minutesLeft) && minutesLeft > 0
      ? Date.now() + minutesLeft * 60 * 1000
      : null;

  const isPermanent = err?.isPermanent === true;

  if (isPermanent) {
    return {
      msg: 'Tài khoản tạm thời bị khoá. Xin vui lòng liên hệ hỗ trợ trực tiếp.',
      type: 'error',
      code: 'ACCOUNT_LOCKED',
      meta: {
        code: 'ACCOUNT_LOCKED',
        isPermanent: true,
        minutesLeft: 0,
        lockType: 'PERMANENT',
        reasonCode: 'SECURITY_LOCK_INTERNAL',
        internalCode: code,
      },
    };
  }

  const neutralMessage =
    Number.isFinite(minutesLeft) && minutesLeft > 0
      ? `Tài khoản tạm thời bị khoá trong ${minutesLeft} phút. Thời gian còn lại: ${minutesLeft} phút.`
      : 'Tài khoản tạm thời bị khoá. Vui lòng thử lại sau.';

  return {
    msg: neutralMessage,
    type: 'warning',
    code: 'ACCOUNT_LOCKED',
    meta: {
      code: 'ACCOUNT_LOCKED',
      isPermanent: false,
      minutesLeft,
      lockUntilAt,
      lockType: 'TEMPORARY',
      reasonCode: 'SECURITY_LOCK_INTERNAL',
      internalCode: code,
    },
  };
};

const WAITING_CAPTCHA_EXPIRED_MESSAGE =
  'Bác đã rà soát hơi lâu nên hệ thống cần bác xác minh lại. Bác vui lòng bấm nút Quay lại chỉnh sửa, sau đó xác minh lại để gửi hồ sơ.';

const isWaitingCaptchaExpiredError = (err) => {
  const code = String(
    err?.code || err?.response?.data?.code || ''
  ).toUpperCase();

  const message = String(
    err?.message ||
    err?.error ||
    err?.response?.data?.message ||
    err?.response?.data?.error ||
    ''
  ).toLowerCase();

  return (
    code.includes('CAPTCHA') ||
    message.includes('captcha') ||
    message.includes('turnstile') ||
    message.includes('timeout-or-duplicate') ||
    message.includes('invalid-input-response') ||
    message.includes('captcha không hợp lệ')
  );
};

const AuthPage = () => {
  const { speak, speakError } = useTts();
  const navigate = useNavigate();

  const {
    login,
    register,
    forgotPassword,
    verifyResetCode,
    changePasswordAfterReset,
  } = useAuth();

  const [view, setView] = useState('login');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingFormData, setPendingFormData] = useState(null);

  const [runtimeVersion, setRuntimeVersion] = useState(0);
  const [reentryContext, setReentryContext] = useState(null);
  const [transitionSnapshot, setTransitionSnapshot] = useState(null);
  const [runtimeReconstruction, setRuntimeReconstruction] = useState(null);

  const [resetIdentifier, setResetIdentifier] = useState('');
  const [resetToken, setResetToken] = useState('');

  const [loginMessage, setLoginMessage] = useState('');
  const [loginMessageType, setLoginMessageType] = useState('error');

  const [lockoutInfo, setLockoutInfo] = useState({});

  const [loginSuccessMessage, setLoginSuccessMessage] = useState('');
  const [loginUserStatus, setLoginUserStatus] = useState('');

  //PR-OP-4: CHO_DUYET revision 
  const [revisionContext, setRevisionContext] = useState(null);
  // { identifier, reviewNote, tempSnapshot, caseStatus, caseId }
  const [registerRevisionMode, setRegisterRevisionMode] = useState(false);

  const mapLoginErrorToFeedback = (err) => {
    if (isSecurityLockSignal(err)) {
      return buildNeutralSecurityLockFeedback(err);
    }

    const code = extractBackendCode(err);

    switch (code) {
      case 'INVALID_AUTH': {
        const remaining = err.remainingAttempts || 0;

        return {
          msg:
            remaining > 0
              ? `Thông tin đăng nhập không chính xác. Còn ${remaining} lần thử.`
              : 'Thông tin đăng nhập không chính xác.',
          type: 'error',
          code,
          meta: {
            code,
            remainingAttempts: remaining,
            attemptCount: err.attemptCount || 0,
          },
        };
      }

      default:
        return {
          msg: extractBackendMessage(err) || 'Hệ thống đang bận, vui lòng thử lại sau.',
          type: 'error',
          code,
          meta: {},
        };
    }
  };

  const recordTransition = (payload = {}) => {
    const snapshot = createTransitionSnapshot(payload);
    setTransitionSnapshot(snapshot);
    return snapshot;
  };

  const reconstructRuntimeForReentry = (context = {}, draftData = pendingFormData) => {
    const reentryType = resolveReentryType(context);
    const policy = resolveReentryPolicy(reentryType);
    const resetPlan = createFullRuntimeResetPlan(reentryType);
    const reconstructedRuntime = reconstructRuntimeState(draftData || {}, {
      context,
      policy,
      resetPlan,
    });

    setReentryContext({
      ...context,
      reentryType,
      policy,
      resetPlan,
      reconstructedAt: Date.now(),
    });

    setRuntimeReconstruction(reconstructedRuntime);

    setRuntimeVersion((prev) => incrementRuntimeVersion(prev, resetPlan));

    return {
      reentryType,
      policy,
      resetPlan,
      reconstructedRuntime,
    };
  };

  const createFreshAuthRuntime = (context = {}) => {
    recordTransition({
      from: context.from || view,
      to: context.to || view,
      intent: context.intent || 'auth-form-fresh-runtime',
      source: context.from || view,
      target: context.to || view,
      metadata: {
        runtimeVersion,
        reason: context.reason || 'auth-view-change',
      },
    });

    setRuntimeVersion((prev) => incrementRuntimeVersion(prev));
  };

  const handleLoginSubmit = async (loginData) => {
    setIsSubmitting(true);

    setLoginMessage('');
    setLoginSuccessMessage('');
    setLoginUserStatus('');
    setLockoutInfo({});

    try {
      const user = await login(loginData);

      // AuthContext thường đã window.location.href — khối này là safety net
      if (user) {
        if (user.status === 'CHO_DUYET') {
          const pendingMessage =
            'Hồ sơ của bác đang chờ Ban Quản trị phê duyệt.';

          setLoginMessage('');
          setLoginSuccessMessage(pendingMessage);
          setLoginUserStatus('CHO_DUYET');

          requestAnimationFrame(() => {
            if (typeof speak === 'function') {
              speak(pendingMessage, { rate: 0.82 });
              return;
            }
            speakError?.(pendingMessage);
          });

          return;
        }

        const successMessage = 'Chào mừng bạn trở lại!';
        toast.success(successMessage);
        if (typeof speak === 'function') {
          speak(successMessage, { rate: 0.82 });
        } else {
          speakError?.(successMessage);
        }

        navigate('/tree');
      }
    } catch (err) {
      console.error('[Login error:]', err);

      const backendError = err.response?.data;
      const errorCode =
        err?.code || backendError?.code || extractBackendCode(err);
      const serverMessage =
        err?.message || backendError?.message || extractBackendMessage(err);

      // Lifecycle chờ duyệt / tenant pending — KHÔNG map thành lock
      // PR-OP-4: ACCOUNT_CHO_DUYET + canEdit → màn revision-notice
      if (
        errorCode === 'USER_PENDING_APPROVAL' ||
        errorCode === 'ACCOUNT_CHO_DUYET' ||
        errorCode === 'TENANT_CHO_DUYET' ||
        errorCode === 'TENANT_PENDING_ACTIVATION'
      ) {
        const serverData = err?.response?.data || {};
        const canEdit =
          err?.canEdit === true || serverData.canEdit === true;
        const reviewNote =
          err?.reviewNote ?? serverData.reviewNote ?? null;
        const tempSnapshot =
          err?.tempSnapshot ?? serverData.tempSnapshot ?? null;

        if (errorCode === 'ACCOUNT_CHO_DUYET' && canEdit) {
          setRevisionContext({
            identifier: loginData?.identifier || '',
            reviewNote,
            tempSnapshot,
            caseStatus: err?.caseStatus ?? serverData.caseStatus ?? null,
            caseId: err?.caseId ?? serverData.caseId ?? null,
          });
          setView('revision-notice');

          const msg =
            serverMessage ||
            (reviewNote
              ? 'Ban Quản trị có góp ý. Bác vui lòng xem và bổ sung hồ sơ.'
              : 'Hồ sơ của bác đang chờ Ban Quản trị phê duyệt.');

          requestAnimationFrame(() => {
            speakError(msg);
          });
          return;
        }

        const standardPendingNotice =
          serverMessage ||
          'Hồ sơ của bác đang chờ Ban Quản trị phê duyệt.';

        setLoginSuccessMessage('');
        setLoginUserStatus('');
        setLoginMessage(standardPendingNotice);
        setLoginMessageType('error');

        requestAnimationFrame(() => {
          speakError(standardPendingNotice);
        });
        return;
      }

      if (errorCode === 'ACCOUNT_DISABLED' || errorCode === 'USER_REJECTED') {
        const standardDisabledNotice =
          serverMessage ||
          'Tài khoản không thể truy cập. Xin vui lòng liên hệ với Quản trị viên để được hỗ trợ trực tiếp.';

        setLoginSuccessMessage('');
        setLoginUserStatus('');
        setLoginMessage(standardDisabledNotice);
        setLoginMessageType('error');

        requestAnimationFrame(() => {
          speakError(standardDisabledNotice);
        });

        return;
      }

      const feedback = mapLoginErrorToFeedback(err);

      setLoginMessage(feedback.msg);
      setLoginMessageType(feedback.type);
      setLockoutInfo(feedback.meta || {});

      requestAnimationFrame(() => {
        speakError(feedback.msg);
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (data) => {
    console.log('[AuthPage] handleRegisterSubmit data:', { fullData: data });

    const snap = revisionContext?.tempSnapshot || {};
    const identitySeed = {
      phone: data.phone || snap.phone || '',
      email: data.email || snap.email || '',
    };

    const merged = {
      ...data,
      ...(registerRevisionMode || data?.isRevision
        ? {
            isRevision: true,
            phone: resolveRevisionPhone(
              revisionContext?.identifier,
              identitySeed,
              data.phone
            ),
            email:
              resolveRevisionEmail(
                revisionContext?.identifier,
                identitySeed,
                data.email
              ) || null,
            isNewClan:
              data.isNewClan === true ||
              snap.isNewClan === true ||
              snap.role === 'CLAN_ADMIN',
          }
        : {}),
    };

    setPendingFormData(merged);
    setIsSubmitting(true);

    try {
      recordTransition({
        from: 'RegisterForm',
        to: 'WaitingPage',
        intent: registerRevisionMode
          ? 'review-registration-revision'
          : 'review-registration',
        source: 'RegisterForm',
        target: 'WaitingPage',
        metadata: {
          runtimeVersion,
          hasDraft: !!merged,
          isRevision: !!merged.isRevision,
        },
      });

      setReentryContext(null);
      setView('waiting');
    } catch (err) {
      toast.error(err.message || 'Không thể xử lý');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleWaitingBack = (context = {}) => {
    const editContext = {
      from: 'WaitingPage',
      action: 'edit',
      preserveDraft: true,
      resetRuntime: true,
      ...(context || {}),
    };

    recordTransition({
      from: 'WaitingPage',
      to: 'RegisterForm',
      intent: 'edit-registration-draft',
      source: 'WaitingPage',
      target: 'RegisterForm',
      metadata: {
        runtimeVersion,
        preserveDraft: true,
        resetRuntime: true,
      },
    });

    reconstructRuntimeForReentry(editContext, pendingFormData);

    setView('register');
  };

  const handleConfirmSubmit = async (confirmedData) => {
    setIsSubmitting(true);

    try {
      if (!confirmedData) {
        toast.error('Dữ liệu đăng ký bị mất. Vui lòng thử lại.');
        return;
      }

      recordTransition({
        from: 'WaitingPage',
        to: 'ResultPage',
        intent: 'submit-registration',
        source: 'WaitingPage',
        target: 'ResultPage',
        hard: true,
        metadata: {
          runtimeVersion,
        },
      });

      const snap = revisionContext?.tempSnapshot || {};
      const identitySeed = {
        phone: confirmedData.phone || snap.phone || '',
        email: confirmedData.email || snap.email || '',
      };

      const finalPayload = {
        ...confirmedData,
        turnstileToken: confirmedData.turnstileToken,
        hp_field: confirmedData.hp_field || '',
        ...(registerRevisionMode || confirmedData.isRevision
          ? {
              isRevision: true,
              phone: resolveRevisionPhone(
                revisionContext?.identifier,
                identitySeed,
                confirmedData.phone
              ),
              email:
                resolveRevisionEmail(
                  revisionContext?.identifier,
                  identitySeed,
                  confirmedData.email
                ) || null,
              isNewClan:
                confirmedData.isNewClan === true ||
                snap.isNewClan === true ||
                snap.role === 'CLAN_ADMIN',
            }
          : {}),
      };

      await register(finalPayload);

      toast.success(
        registerRevisionMode || confirmedData.isRevision
          ? 'Hồ sơ bổ sung đã được gửi lại!'
          : 'Hồ sơ đã được gửi thành công!'
      );
      //PR-OP-4: clear cờ revision sau khi gửi thành công
      setRegisterRevisionMode(false);
      // setRevisionContext(null); // optional — xóa note/context; có thể giữ nếu Result còn cần
      setView('result');
    } catch (err) {
      console.error('[AuthPage] Register error:', err);

      if (isWaitingCaptchaExpiredError(err)) {
        toast.error(WAITING_CAPTCHA_EXPIRED_MESSAGE);

        requestAnimationFrame(() => {
          if (typeof speak === 'function') {
            speak(WAITING_CAPTCHA_EXPIRED_MESSAGE, { rate: 0.82 });
            return;
          }
          speakError?.(WAITING_CAPTCHA_EXPIRED_MESSAGE);
        });

        return;
      }

      const safeMessage =
        err?.message || 'Gửi hồ sơ thất bại. Bác vui lòng thử lại.';

      toast.error(safeMessage);

      requestAnimationFrame(() => {
        if (typeof speak === 'function') {
          speak(safeMessage, { rate: 0.82 });
          return;
        }
        speakError?.(safeMessage);
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSwitchToRegister = () => {
    recordTransition({
      from: 'LoginForm',
      to: 'RegisterForm',
      intent: 'auth-mode-switch',
      source: 'LoginForm',
      target: 'RegisterForm',
      metadata: {
        runtimeVersion,
      },
    });

    reconstructRuntimeForReentry(
      {
        authModeSwitch: true,
        from: 'LoginForm',
        action: 'switch-to-register',
      },
      pendingFormData
    );

    setView('register');
  };

  const handleSwitchToLogin = () => {
    recordTransition({
      from: 'RegisterForm',
      to: 'LoginForm',
      intent: 'auth-mode-switch',
      source: 'RegisterForm',
      target: 'LoginForm',
      metadata: {
        runtimeVersion,
      },
    });

    reconstructRuntimeForReentry(
      {
        authModeSwitch: true,
        from: 'RegisterForm',
        action: 'switch-to-login',
      },
      pendingFormData
    );

    setLoginMessage('');
    setLoginSuccessMessage('');
    setLoginUserStatus('');

    setView('login');
  };

  const handleForgotPasswordSuccess = (identifier) => {
    setResetIdentifier(identifier);
    setResetToken('');

    recordTransition({
      from: 'ForgotPasswordForm',
      to: 'VerifyResetCodeForm',
      intent: 'verify-reset-code',
      source: 'ForgotPasswordForm',
      target: 'VerifyResetCodeForm',
      metadata: {
        identifier,
      },
    });

    setView('verify-reset-code');
  };

  const handleVerifyResetCode = async (payload) => {
    setIsSubmitting(true);

    try {
      if (!verifyResetCode) {
        toast.error('Chức năng xác minh mã chưa được cấu hình.');
        return;
      }

      const result = await verifyResetCode(payload);

      const token =
        result?.resetToken ||
        result?.reset_token ||
        result?.token ||
        result?.data?.resetToken ||
        '';

      setResetToken(token);

      toast.success('Mã xác nhận hợp lệ.');

      recordTransition({
        from: 'VerifyResetCodeForm',
        to: 'ChangePasswordForm',
        intent: 'change-password-after-reset',
        source: 'VerifyResetCodeForm',
        target: 'ChangePasswordForm',
      });

      setView('change-password');
    } catch (err) {
      console.error('[AuthPage] VerifyResetCode error:', err);
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChangePasswordAfterReset = async (payload) => {
    setIsSubmitting(true);

    try {
      if (!changePasswordAfterReset) {
        toast.error('Chức năng đặt mật khẩu mới chưa được cấu hình.');
        return;
      }

      await changePasswordAfterReset(payload);

      const successMessage =
        'Đổi mật khẩu thành công. Bác sử dụng mật khẩu mới để đăng nhập.';

      toast.success(successMessage);

      if (typeof speak === 'function') {
        speak(successMessage, { rate: 0.82 });
      } else {
        speakError?.(successMessage);
      }

      window.setTimeout(() => {
        setResetIdentifier('');
        setResetToken('');

        recordTransition({
          from: 'ChangePasswordForm',
          to: 'LoginForm',
          intent: 'password-reset-success',
          source: 'ChangePasswordForm',
          target: 'LoginForm',
        });

        createFreshAuthRuntime({
          from: 'ChangePasswordForm',
          to: 'LoginForm',
          intent: 'password-reset-success-fresh-login',
          reason: 'password-reset-success',
        });

        setLoginMessage('');
        setLoginSuccessMessage('');
        setLoginUserStatus('');

        setView('login');
      }, 1800);
    } catch (err) {
      console.error('[AuthPage] ChangePasswordAfterReset error:', err);
      toast.error(
        err.message || 'Không thể đặt lại mật khẩu. Vui lòng thử lại.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendResetCode = async (identifier) => {
    try {
      if (!forgotPassword) {
        toast.error('Chức năng gửi lại mã chưa được cấu hình.');
        return;
      }

      await forgotPassword({
        identifier,
        turnstileToken: 'RESEND_FLOW',
        hp_field: '',
      });

      toast.success('Mã xác nhận đã được gửi lại.');
    } catch (err) {
      console.error('[AuthPage] ResendResetCode error:', err);

      const safeMessage =
        err?.code === 'FORBIDDEN'
          ? 'Không thể gửi lại mã xác nhận. Vui lòng thử lại sau.'
          : err?.message || 'Không thể gửi lại mã xác nhận.';

      toast.error(safeMessage);
      throw err;
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 md:p-6">
      <div className="w-full max-w-[480px] space-y-6">
        <main className="rounded-[32px] bg-white p-4 shadow-2xl shadow-slate-200/50 md:p-6">
          {view === 'login' && (
            <LoginForm
              runtimeSessionId={runtimeVersion}
              onSubmitLogin={handleLoginSubmit}
              toggleAuthMode={handleSwitchToRegister}
              onBackHome={() => navigate('/')}
              onForgotPassword={() => {
                createFreshAuthRuntime({
                  from: 'LoginForm',
                  to: 'ForgotPasswordForm',
                  intent: 'login-to-forgot-fresh-runtime',
                  reason: 'login-to-forgot',
                });

                setView('forgot');
              }}
              loading={isSubmitting}
              message={loginMessage}
              messageType={loginMessageType}
              lockoutInfo={lockoutInfo}
              successMessage={loginSuccessMessage}
              userStatus={loginUserStatus}
            />
          )}

          {/* PR-OP-4: CHO_DUYET revision notice */}
          {view === 'revision-notice' && (
            <div className="w-full max-w-[480px] mx-auto space-y-4 p-1">
              <h2 className="text-lg font-semibold text-slate-800">
                Hồ sơ đang chờ bổ sung
              </h2>

              {revisionContext?.reviewNote ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-slate-800">
                  <p className="font-medium mb-2">Góp ý từ Ban Quản trị:</p>
                  <p className="whitespace-pre-wrap leading-relaxed">
                    {revisionContext.reviewNote}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-slate-600">
                  Hồ sơ của bác đang chờ Ban Quản trị phê duyệt.
                </p>
              )}

              <button
                type="button"
                className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700"
                onClick={() => {
                  const id = revisionContext?.identifier || '';
                  const snap = revisionContext?.tempSnapshot || {};

                  const isNewClan =
                    snap.isNewClan === true ||
                    snap.role === 'CLAN_ADMIN' ||
                    snap.caseType === 'CLAN_SETUP';

                  setPendingFormData({
                    ...snap,
                    phone: resolveRevisionPhone(id, snap, snap.phone),
                    email: resolveRevisionEmail(id, snap, snap.email) || '',
                    tenantId: snap.tenantId || snap.tenant_id || '',
                    clanName: snap.clanName || '',
                    description: snap.description || '',
                    tenantSlug: snap.tenantSlug || '',
                    isRevision: true,
                    isNewClan,
                  });
                  setRegisterRevisionMode(true);
                  setView('register');
                }}
              >
                Chỉnh sửa hồ sơ
              </button>

              <button
                type="button"
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  setRevisionContext(null);
                  setRegisterRevisionMode(false);
                  setView('login');
                }}
              >
                Để sau / Quay lại đăng nhập
              </button>
            </div>
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
              lockedIdentifier={revisionContext?.identifier || ''}
              reentryContext={reentryContext}
              runtimeVersion={runtimeVersion}
              runtimeReconstruction={runtimeReconstruction}
              transitionSnapshot={transitionSnapshot}
            />
          )}

          {view === 'waiting' && (
            <WaitingPage
              formData={pendingFormData}
              onConfirmSubmit={handleConfirmSubmit}
              onBack={handleWaitingBack}
              loading={isSubmitting}
              runtimeVersion={runtimeVersion}
              transitionSnapshot={transitionSnapshot}
              reentryContext={reentryContext}
            />
          )}

          {view === 'result' && <ResultPage formData={pendingFormData} />}

          {view === 'forgot' && (
            <ForgotPasswordForm
              runtimeSessionId={runtimeVersion}
              onBackToLogin={() => {
                createFreshAuthRuntime({
                  from: 'ForgotPasswordForm',
                  to: 'LoginForm',
                  intent: 'forgot-back-to-login-fresh-runtime',
                  reason: 'forgot-back-to-login',
                });

                setLoginMessage('');
                setLoginSuccessMessage('');
                setLoginUserStatus('');

                setView('login');
              }}
              onSuccess={handleForgotPasswordSuccess}
            />
          )}

          {view === 'verify-reset-code' && (
            <VerifyResetCodeForm
              runtimeSessionId={runtimeVersion}
              identifier={resetIdentifier}
              onVerifyCode={handleVerifyResetCode}
              onBackToForgot={() => setView('forgot')}
              onResendCode={handleResendResetCode}
              loading={isSubmitting}
            />
          )}

          {view === 'change-password' && (
            <ChangePasswordForm
              runtimeSessionId={runtimeVersion}
              identifier={resetIdentifier}
              resetToken={resetToken}
              onChangePassword={handleChangePasswordAfterReset}
              onBackToVerify={() => setView('verify-reset-code')}
              loading={isSubmitting}
            />
          )}

          {view === 'reset' && <ResetPasswordForm email={resetIdentifier} />}
        </main>
      </div>
    </div>
  );
};

export default AuthPage;