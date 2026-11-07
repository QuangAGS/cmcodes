/**
 * PATH: src/context/AuthContext.jsx
 * DATETIME: 2026-11-02T19:10:00+07:00
 * VERSION: 20.4.0-OP-REDIRECT-FIX
 * DESCRIPTION:
 * - Sửa redirect sau login: user chưa có member_id → /op/base-profile (bắt đầu OP).
 * - Giữ nguyên logic admin và các redirect khác.
 */

import { createContext, useContext, useEffect, useState } from 'react';
import apiClient from '../lib/apiClient.js';
import {
  fetchTenantLogo,
  withTenantLogoUrl,
  isHttpUrl,
} from '../lib/tenantLogo.js';

const AuthContext = createContext();

const normalizeAuthError = (err) => {
  const responseStatus = err?.response?.status;
  const serverError = err?.response?.data || {};

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
  customError.response = err.response;

  customError.reviewNote = serverError.reviewNote ?? null;
  customError.canEdit = serverError.canEdit === true;
  customError.caseStatus = serverError.caseStatus ?? null;
  customError.caseId = serverError.caseId ?? null;
  customError.tempSnapshot = serverError.tempSnapshot ?? null;

  return customError;
};

/** 
 * Resolve redirect sau login.
 * - Admin → /admin
 * - User chưa có member → /op/base-profile (bắt đầu OP)
 * - User đã có member → /op
 */
const resolvePostLoginRedirect = (userData) => {
  const savedRedirect = localStorage.getItem('redirectAfterLogin');
  if (savedRedirect) {
    localStorage.removeItem('redirectAfterLogin');
    return savedRedirect;
  }

  if (userData?.role === 'SYSTEM_ADMIN' || userData?.role === 'CLAN_ADMIN') {
    return '/admin';
  }

  // User thường: chưa có member_id → bắt đầu OP tại base-profile
  if (!userData?.member_id && !userData?.memberId) {
    return '/op/base-profile';
  }

  // Đã có member → vào hub OP
  return '/op';
};

async function enrichUserTenantLogo(userData) {
  if (!userData) return userData;
  const tenantId =
    userData.tenant?.id ||
    userData.tenantId ||
    userData.tenant_id ||
    null;
  if (!tenantId) return userData;

  try {
    const logoUrl = await fetchTenantLogo(tenantId);
    if (logoUrl && isHttpUrl(logoUrl)) {
      return withTenantLogoUrl(userData, logoUrl);
    }
  } catch (_) {
    // ignore
  }
  return userData;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }

    apiClient
      .get('/auth/me')
      .then(async (res) => {
        const data = res.data?.data || res.data;
        const enriched = await enrichUserTenantLogo(data?.user || data);
        setUser(enriched);
      })
      .catch(() => {
        localStorage.removeItem('token');
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (loginData) => {
    console.log('[AuthContext] Login payload:', loginData);
    try {
      const res = await apiClient.post('/auth/login', loginData);
      console.log('[AuthContext] Login success');

      const data = res.data?.data || res.data;
      localStorage.setItem('token', data.token);

      const userData = await enrichUserTenantLogo(data.user || null);
      setUser(userData);

      const redirectPath = resolvePostLoginRedirect(userData);
      console.log(`[AuthContext] Redirecting to: ${redirectPath}`, {
        role: userData?.role,
        member_id: userData?.member_id || userData?.memberId,
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
    const res = await apiClient.post('/auth/register', payload);
    return res.data;
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
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
