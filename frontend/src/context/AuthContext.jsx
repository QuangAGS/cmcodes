/**
 * PATH: src/context/AuthContext.jsx
 * DATETIME: 2026-008-01T09:00:00+07:00
 * VERSION: 20.3.0-PR-OP-4
 * DESCRIPTION:
 * - FE: xem bút phê + chỉnh sửa hồ sơ khi CHO_DUYET
 * - Phase 20.2.1: Redirect sau login cho Admin.
 * - [20.3.0-W2] Residual Wave 2:
 *   + Giữ nguyên code backend (ACCOUNT_CHO_DUYET, TENANT_NOT_ACTIVATED…).
 *   + CLAN_ADMIN + tenantStatus != HOAT_DONG → /tree (không vào Approval).
 * - Q1 bảo tồn API surface (login/register/logout/…).
 * - Q2 header + changelog.
 *
 * CHANGELOG:
 * - 20.2.1: Redirect Admin sau login.
 * - 20.3.0-W2 (2026-07-26): tenantStatus gate + preserve backend error codes.
 * CHANGE LOGS:
 * 20.3.0-PR-OP-4: FE: AuthPage / LoginForm — hiện note + nút sửa → RegisterForm prefill → submit isRevision.
 * 1) Login nhận 423 ACCOUNT_CHO_DUYET + canEdit: true + reviewNote
 * 2) Hiện góp ý + nút “Chỉnh sửa hồ sơ”
 * 3) Mở RegisterForm prefill tempSnapshot (khóa phone/email)
 * 4) Submit { isRevision: true, phone, password, temp_*, ... }
 * 5) Waiting / Result như đăng ký mới
 */

import { createContext, useContext, useEffect, useState } from 'react';
import apiClient from '../lib/apiClient.js';

const AuthContext = createContext();

/**
 * Normalize error từ backend — ƯU TIÊN code server (không ghi đè ACCOUNT_CHO_DUYET → ACCOUNT_LOCKED).
 */
const normalizeAuthError = (err) => {
  const responseStatus = err?.response?.status;
  const serverError = err?.response?.data || {};

  // Dual-contract: code có thể ở root hoặc error.code
  let normalizedCode =
    serverError?.code ||
    serverError?.error?.code ||
    '';

  if (!normalizedCode) {
    if (responseStatus === 423) normalizedCode = 'ACCOUNT_LOCKED';
    else if (responseStatus === 401) normalizedCode = 'INVALID_AUTH';
    else if (responseStatus === 429) normalizedCode = 'RATE_LIMITED';
    else if (responseStatus === 403) normalizedCode = 'FORBIDDEN';
    else normalizedCode = 'UNKNOWN_ERROR';
  }

  const message =
    serverError?.message ||
    serverError?.error?.message ||
    (typeof serverError?.error === 'string' ? serverError.error : null) ||
    'Không thể kết nối tới máy chủ.';

  const customError = new Error(message);
  customError.code = normalizedCode;
  customError.status = responseStatus;
  customError.remainingAttempts = serverError.remainingAttempts || 0;
  customError.minutesLeft = serverError.minutesLeft || 0;
  customError.isPermanent = serverError.isPermanent || false;
  customError.lockType = serverError.lockType;
  customError.reasonCode = serverError.reasonCode;
  customError.tenantStatus = serverError.tenantStatus;
  // Giữ response để AuthPage extractBackendCode vẫn đọc được
  customError.response = err.response;

  // PR-OP-4: CHO_DUYET revision surface (3A body)
  customError.reviewNote = serverError.reviewNote ?? null;
  customError.canEdit = serverError.canEdit === true;
  customError.caseStatus = serverError.caseStatus ?? null;
  customError.caseId = serverError.caseId ?? null;
  customError.tempSnapshot = serverError.tempSnapshot ?? null;

  return customError;
};

/** CLAN_ADMIN chỉ vào Approval khi tenant đã HOAT_DONG */
const resolvePostLoginRedirect = (userData) => {
  const savedRedirect = localStorage.getItem('redirectAfterLogin');
  if (savedRedirect) {
    localStorage.removeItem('redirectAfterLogin');
    return savedRedirect;
  }

  if (userData?.role === 'SYSTEM_ADMIN') {
    return '/admin/approval';
  }

  if (userData?.role === 'CLAN_ADMIN') {
    const tenantStatus =
      userData.tenantStatus || userData.tenant_status || null;

    if (tenantStatus === 'HOAT_DONG') {
      return '/admin/approval';
    }

    // TAM_NGUNG / CHO_DUYET / BI_KHOA / null → hoàn thiện tenant, không duyệt thành viên
    return '/tree';
  }

  return '/tree';
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const verify = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const res = await apiClient.get('/auth/me');
        setUser(res.data?.user || null);
      } catch (err) {
        logout();
      } finally {
        setLoading(false);
      }
    };
    verify();
  }, []);

  const login = async (loginData) => {
    console.log('[AuthContext] Login payload:', loginData);
    try {
      const res = await apiClient.post('/auth/login', loginData);
      console.log('[AuthContext] Login success');

      const data = res.data?.data || res.data;
      localStorage.setItem('token', data.token);

      // Giữ nguyên tenantStatus từ backend (PR-W2-1)
      const userData = data.user || null;
      setUser(userData);

      const redirectPath = resolvePostLoginRedirect(userData);
      console.log(`[AuthContext] Redirecting to: ${redirectPath}`, {
        role: userData?.role,
        tenantStatus: userData?.tenantStatus,
      });

      window.location.href = redirectPath;

      return userData;
    } catch (err) {
      console.error('[AuthContext] Login failed:', err?.response?.data);
      throw normalizeAuthError(err);
    }
  };

  const register = async (payload) => {
    console.log('[AuthContext] Register payload received:', payload);
    console.log(
      '[AuthContext] turnstileToken length:',
      payload.turnstileToken?.length || 0
    );

    try {
      const res = await apiClient.post('/auth/register', payload);
      console.log('[AuthContext] Register success');
      return res.data;
    } catch (err) {
      console.error(
        '[AuthContext] Register failed:',
        err?.response?.data || err
      );
      throw normalizeAuthError(err);
    }
  };

  const forgotPassword = async (payload) => {
    console.log('[AuthContext] ForgotPassword payload received:', {
      identifier: payload?.identifier,
      hasTurnstileToken: !!payload?.turnstileToken,
      hasHpField: !!payload?.hp_field,
    });

    try {
      const res = await apiClient.post('/auth/forgot-password', payload);
      console.log('[AuthContext] ForgotPassword request success');
      return res.data;
    } catch (err) {
      console.error(
        '[AuthContext] ForgotPassword request failed:',
        err?.response?.data || err
      );
      throw normalizeAuthError(err);
    }
  };

  const verifyResetCode = async (payload) => {
    console.log('[AuthContext] VerifyResetCode payload received:', {
      identifier: payload?.identifier,
      hasOtp: !!payload?.otp,
      hasTurnstileToken: !!payload?.turnstileToken,
      hasHpField: !!payload?.hp_field,
    });

    try {
      const res = await apiClient.post('/auth/verify-reset-code', payload);
      console.log('[AuthContext] VerifyResetCode success');
      return res.data?.data || res.data;
    } catch (err) {
      console.error(
        '[AuthContext] VerifyResetCode failed:',
        err?.response?.data || err
      );
      throw normalizeAuthError(err);
    }
  };

  const changePasswordAfterReset = async (payload) => {
    console.log('[AuthContext] ChangePasswordAfterReset payload received:', {
      identifier: payload?.identifier,
      hasResetToken: !!payload?.resetToken,
      hasNewPassword: !!payload?.newPassword,
      hasHpField: !!payload?.hp_field,
    });

    try {
      const res = await apiClient.post(
        '/auth/change-password-after-reset',
        payload
      );
      console.log('[AuthContext] ChangePasswordAfterReset success');
      return res.data;
    } catch (err) {
      console.error(
        '[AuthContext] ChangePasswordAfterReset failed:',
        err?.response?.data || err
      );
      throw normalizeAuthError(err);
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('tenantId');
    localStorage.removeItem('redirectAfterLogin');
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        forgotPassword,
        verifyResetCode,
        changePasswordAfterReset,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};