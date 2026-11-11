/**
 * =============================================================================
 * PATH        : frontend/src/context/AuthContext.jsx
 * DATETIME    : 2026-11-11T12:00:00+07:00
 * VERSION     : 2.1.0-AUTH-CONTEXT-MULTIHOME-ROLE-SWITCH
 * DESCRIPTION : Quản lý phiên làm việc và Ngữ cảnh dòng họ (Multi-Home Session).
 *               - Bổ sung redirectUrl cho switchContext: window.location.href = redirectUrl.
 *               - Seed availableClans trực tiếp từ login payload, không gọi API thừa.
 *               - Điều hướng sau login: DA_DUYET có member vào thẳng /op.
 *               - Role SSOT: roleInTenant lấy từ user_member_links.
 * =============================================================================
 * CHANGELOGS:
 * - 2026-11-10T21:40:00+07:00 (v2.0.8): Redirect /membership/select-tenant.
 * - 2026-11-11T12:00:00+07:00 (v2.1.0-AUTH-CONTEXT-MULTIHOME-ROLE-SWITCH):
 *   + Hỗ trợ switchContext(targetTenantId, redirectUrl = null).
 *   + DA_DUYET vào thẳng /op (bỏ ép buộc select-tenant vì đã có HeaderClanSwitcher).
 * =============================================================================
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import apiClient from '../lib/apiClient';
import { membershipApi } from '../features/membership/api/membershipApi';

const AuthContext = createContext(null);

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
   * Điều phối đường dẫn sau đăng nhập:
   * - Chưa gắn member -> /membership/claim
   * - Chờ duyệt -> /membership/status
   * - Nháp Onboarding -> /op/mfo/plan
   * - Đã duyệt (DA_DUYET) -> /op
   */
  const resolvePostLoginRedirect = useCallback((currentUser, currentContext) => {
    if (!currentContext?.activeMemberId) {
      return '/membership/claim';
    }
    if (currentContext?.activeLinkStatus === 'CHO_DUYET') {
      return '/membership/status';
    }
    if (currentContext?.activeLinkStatus === 'DRAFT') {
      return '/op/mfo/plan';
    }
    return '/op';
  }, []);

  const loadAvailableClans = useCallback(async () => {
    const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
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
    const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
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

      const activeLinkRole =
        userObj.roleInTenant ||
        userObj.role_in_tenant ||
        userObj.role ||
        'USER';

      const newContext = {
        activeTenantId: userObj.activeTenantId || userObj.tenantId || userObj.tenant_id || null,
        activeMemberId: userObj.activeMemberId || userObj.member_id || null,
        activeLinkStatus: userObj.activeLinkStatus
          || (userObj.status === 'DA_DUYET' ? 'DA_DUYET' : 'DRAFT'),
        roleInTenant: activeLinkRole,
        linkType: userObj.linkType || 'PRIMARY_PATERNAL',
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
      localStorage.removeItem('auth_token');
      localStorage.removeItem('token');
      localStorage.removeItem('active_context');
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
    const res = await apiClient.post('/auth/login', credentials);

    const payload = res.data?.data || res.data;
    const userObj = payload.user || payload;

    if (payload.token) {
      localStorage.setItem('auth_token', payload.token);
      localStorage.setItem('token', payload.token);
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${payload.token}`;
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
      activeMemberId: userObj.activeMemberId || userObj.member_id || null,
      activeLinkStatus: userObj.activeLinkStatus
        || (userObj.status === 'DA_DUYET' ? 'DA_DUYET' : 'DRAFT'),
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
        localStorage.setItem('auth_token', payload.token);
        localStorage.setItem('token', payload.token);
        apiClient.defaults.headers.common['Authorization'] = `Bearer ${payload.token}`;
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

      // Lát 2: Nếu có redirectUrl thì dùng window.location.href, không reload() rồi navigate()
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

  const logout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('token');
    localStorage.removeItem('active_context');
    delete apiClient.defaults.headers.common['Authorization'];
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
    logout,
    switchContext,
    resolvePostLoginRedirect,
    refreshContext: loadUser,
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

export default AuthContext;
