/**
 * =============================================================================
 * PATH        : frontend/src/context/AuthContext.jsx
 * DATETIME    : 2026-11-13T11:20:00+07:00
 * VERSION     : 2.2.0-MULTIHOME-AMEND02-V15-LAT5
 * DESCRIPTION : Quản lý phiên làm việc và ngữ cảnh dòng họ (Multi-Home Session).
 *               - Giữ switchContext(targetTenantId, redirectUrl).
 *               - Seed availableClans từ login payload.
 *               - Role SSOT: roleInTenant từ user_member_links.
 *               - clearSession xóa đủ auth_token, token, active_context.
 *               - register gọi POST /auth/register, không ghi token.
 *               - login chuẩn hóa 423 ACCOUNT_CHO_DUYET (canEdit, reviewNote, caseMetadata, tempSnapshot).
 *               - Lát 5: Chuẩn hóa resolvePostLoginRedirect theo đúng thứ tự Mục 4 V1.5.0:
 *                 1. DRAFT -> /op/mfo/plan
 *                 2. CHO_DUYET -> /membership/status
 *                 3. TU_CHOI -> /membership/status
 *                 4. !activeMemberId -> /membership/claim
 *                 5. DA_DUYET + activeMemberId -> /op (SYSTEM_ADMIN -> /admin)
 * =============================================================================
 * CHANGELOGS:
 * - 2026-11-11T23:00:00+07:00 (v2.1.3-AUTH-CONTEXT-LOGIN-423): Chuẩn hóa lỗi 423.
 * - 2026-11-13T11:20:00+07:00 (v2.2.0-MULTIHOME-AMEND02-V15-LAT5):
 *   + Cập nhật resolvePostLoginRedirect đúng 5 bước chuẩn Mục 4 AMEND-RP-OP-2026-02-FE-V1.5.0.
 *   + Không fallback mù activeLinkStatus sang 'DRAFT' trong loadUser và login.
 *   + Gắn caseMetadata vào normalized error của login().
 * =============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4. Không đổi shape login() khi thành công.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import apiClient from '../lib/apiClient';
import { membershipApi } from '../features/membership/api/membershipApi';

const AuthContext = createContext(null);

function readStoredToken() {
  return localStorage.getItem('auth_token') || localStorage.getItem('token') || '';
}

function writeStoredToken(token) {
  localStorage.setItem('auth_token', token);
  localStorage.setItem('token', token);
  apiClient.defaults.headers.common.Authorization = `Bearer ${token}`;
}

function clearSession() {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('token');
  localStorage.removeItem('active_context');
  localStorage.removeItem('tenantId');
  delete apiClient.defaults.headers.common.Authorization;
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const [activeContext, setActiveContext] = useState(() => {
    try {
      const saved = localStorage.getItem('active_context');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [availableClans, setAvailableClans] = useState([]);
  const [isSwitchingContext, setIsSwitchingContext] = useState(false);

  /**
   * Điều phối đường dẫn sau đăng nhập (AMEND-RP-OP-2026-02-FE-V1.5.0 Mục 4):
   * 0. SYSTEM_ADMIN -> /admin
   * 1. activeLinkStatus === 'DRAFT' -> /op/mfo/plan (Clan-setup sandbox)
   * 2. activeLinkStatus === 'CHO_DUYET' -> /membership/status
   * 3. activeLinkStatus === 'TU_CHOI' -> /membership/status
   * 4. Không có activeMemberId -> /membership/claim
   * 5. DA_DUYET và có activeMemberId -> /op
   */
  const resolvePostLoginRedirect = useCallback((currentUser, currentContext) => {
    const sysRole = String(currentUser?.role || '').toUpperCase();
    if (sysRole === 'SYSTEM_ADMIN') {
      return '/admin';
    }

    const linkStatus = String(currentContext?.activeLinkStatus || '').toUpperCase();
    if (linkStatus === 'DRAFT') {
      return '/op/mfo/plan';
    }
    if (linkStatus === 'CHO_DUYET') {
      return '/membership/status';
    }
    if (linkStatus === 'TU_CHOI') {
      return '/membership/status';
    }
    if (!currentContext?.activeMemberId) {
      return '/membership/claim';
    }
    return '/op';
  }, []);

  const loadAvailableClans = useCallback(async () => {
    const token = readStoredToken();
    if (!token) {
      setAvailableClans([]);
      return;
    }

    try {
      const res = await membershipApi.getMyClans();
      const list = res?.data?.data || res?.data || res || [];
      setAvailableClans(Array.isArray(list) ? list : []);
    } catch (err) {
      console.warn('Không thể tải danh sách available-clans:', err);
    }
  }, []);

  const loadUser = useCallback(async () => {
    const token = readStoredToken();
    if (!token) {
      setUser(null);
      setActiveContext(null);
      setAvailableClans([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const res = await apiClient.get('/auth/me');
      const data = res.data?.data || res.data;
      const userObj = data.user || data;

      setUser(userObj);

      const clansFromUser = Array.isArray(userObj.availableClans)
        ? userObj.availableClans
        : [];
      const resolvedTenantId =
        userObj.activeTenantId || userObj.tenantId || userObj.tenant_id || null;
      const matchedLink =
        clansFromUser.find((c) => c.tenantId === resolvedTenantId) ||
        clansFromUser.find((c) => c.isDefault) ||
        clansFromUser[0] ||
        null;

      const activeLinkRole =
        userObj.roleInTenant ||
        userObj.role_in_tenant ||
        matchedLink?.roleInTenant ||
        userObj.role ||
        'USER';

      const resolvedLinkStatus =
        userObj.activeLinkStatus ||
        matchedLink?.status ||
        (userObj.status === 'DA_DUYET' ? 'DA_DUYET' : 'CHO_DUYET');

      const newContext = {
        activeTenantId: resolvedTenantId,
        activeMemberId: userObj.activeMemberId ?? matchedLink?.memberId ?? null,
        activeLinkStatus: resolvedLinkStatus,
        roleInTenant: activeLinkRole,
        linkType: userObj.linkType || matchedLink?.linkType || 'PRIMARY_PATERNAL',
      };

      setActiveContext(newContext);
      localStorage.setItem('active_context', JSON.stringify(newContext));

      if (Array.isArray(userObj.availableClans) && userObj.availableClans.length > 0) {
        setAvailableClans(userObj.availableClans);
      } else {
        await loadAvailableClans();
      }
    } catch (err) {
      console.error('Phiên đăng nhập hết hạn hoặc không hợp lệ:', err);
      clearSession();
      setUser(null);
      setActiveContext(null);
      setAvailableClans([]);
    } finally {
      setLoading(false);
    }
  }, [loadAvailableClans]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const login = async (credentials) => {
    let res;
    try {
      res = await apiClient.post('/auth/login', credentials);
    } catch (err) {
      const data = err?.response?.data || {};
      const normalized = new Error(
        data.message || 'Đăng nhập thất bại. Vui lòng kiểm tra lại.'
      );
      normalized.code = data.code || 'LOGIN_FAILED';
      normalized.status = err?.response?.status || null;
      normalized.canEdit = data.canEdit === true;
      normalized.reviewNote = data.reviewNote ?? null;
      normalized.tempSnapshot = data.tempSnapshot ?? null;
      normalized.caseMetadata = data.caseMetadata ?? null;
      normalized.caseStatus = data.caseStatus ?? null;
      normalized.caseId = data.caseId ?? null;
      normalized.response = err?.response;
      throw normalized;
    }

    const payload = res.data?.data || res.data;
    const userObj = payload.user || payload;

    if (payload.token) {
      writeStoredToken(payload.token);
    }

    const clans = Array.isArray(userObj.availableClans) ? userObj.availableClans : [];
    const activeLink =
      clans.find((c) => c.tenantId === (userObj.activeTenantId || userObj.tenantId)) ||
      clans.find((c) => c.isDefault) ||
      clans[0];

    const activeLinkRole =
      activeLink?.roleInTenant ||
      activeLink?.role_in_tenant ||
      userObj.roleInTenant ||
      userObj.role_in_tenant ||
      'USER';

    const newContext = {
      activeTenantId: userObj.activeTenantId || userObj.tenantId || userObj.tenant_id || null,
      activeMemberId: userObj.activeMemberId ?? activeLink?.memberId ?? null,
      activeLinkStatus:
        userObj.activeLinkStatus ||
        activeLink?.status ||
        (userObj.status === 'DA_DUYET' ? 'DA_DUYET' : 'CHO_DUYET'),
      roleInTenant: activeLinkRole,
      linkType: userObj.linkType || activeLink?.linkType || 'PRIMARY_PATERNAL',
    };

    setUser(userObj);
    setActiveContext(newContext);
    setAvailableClans(clans);
    localStorage.setItem('active_context', JSON.stringify(newContext));

    return {
      user: userObj,
      context: newContext,
      redirectPath: resolvePostLoginRedirect(userObj, newContext),
    };
  };

  /**
   * Chuyển đổi dòng họ và điều hướng dứt khoát
   * @param {string} targetTenantId
   * @param {string|null} redirectUrl - URL đích (ví dụ: '/op' hoặc '/admin')
   */
  const switchContext = async (targetTenantId, redirectUrl = null) => {
    try {
      setIsSwitchingContext(true);
      const data = await membershipApi.switchContext(targetTenantId);
      const payload = data?.data || data;

      if (payload.token) {
        writeStoredToken(payload.token);
      }

      const updatedContext = {
        activeTenantId: payload.activeTenantId || targetTenantId,
        activeMemberId: payload.activeMemberId || null,
        activeLinkStatus: payload.activeLinkStatus || 'DA_DUYET',
        roleInTenant: payload.roleInTenant || payload.role_in_tenant || 'USER',
        linkType: payload.linkType || 'PRIMARY_PATERNAL',
      };

      setActiveContext(updatedContext);
      localStorage.setItem('active_context', JSON.stringify(updatedContext));

      if (redirectUrl) {
        window.location.href = redirectUrl;
        return updatedContext;
      }

      window.location.reload();
      return updatedContext;
    } catch (err) {
      console.error('Lỗi khi chuyển đổi ngữ cảnh dòng họ:', err);
      throw err;
    } finally {
      setIsSwitchingContext(false);
    }
  };

  /**
   * Đăng ký / gửi lại hồ sơ revision.
   * Không ghi token. Phiên hiện tại không đổi.
   * BE tự rẽ revision khi payload.isRevision === true.
   */
  const register = async (payload) => {
    const res = await apiClient.post('/auth/register', payload || {});
    return res.data?.data || res.data;
  };

  const logout = () => {
    clearSession();
    setUser(null);
    setActiveContext(null);
    setAvailableClans([]);
    window.location.href = '/auth?mode=login';
  };

  const value = {
    user,
    loading,
    activeContext,
    availableClans,
    isSwitchingContext,
    login,
    register,
    logout,
    switchContext,
    resolvePostLoginRedirect,
    refreshContext: loadUser,
    clearSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth phải được sử dụng bên trong AuthProvider');
  }
  return context;
};

export { clearSession };
export default AuthContext;