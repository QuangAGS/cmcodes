/**
 * =============================================================================
 * PATH        : frontend/src/context/AuthContext.jsx
 * DATETIME    : 2026-11-10T21:40:00+07:00
 * VERSION     : 2.0.8-AUTH-CONTEXT-SELECT-TENANT-REDIRECT
 * DESCRIPTION : Quản lý phiên làm việc và Ngữ cảnh dòng họ (Multi-Home Session).
 *               Seed availableClans từ login payload.
 *               Redirect /membership/select-tenant khi ≥ 2 clan DA_DUYET
 *               hoặc khi có role_in_tenant là admin (để chọn vai trò).
 *               Role SSOT: role_in_tenant của user_member_links.
 * =============================================================================
 * CHANGELOGS:
 * - 2026-11-10T19:55:00+07:00 (v2.0.7-AUTH-CONTEXT-LOGIN-PAYLOAD-AND-OP-REDIRECT):
 *   + Bóc payload login; DA_DUYET → /op.
 * - 2026-11-10T21:40:00+07:00 (v2.0.8-AUTH-CONTEXT-SELECT-TENANT-REDIRECT):
 *   + Seed availableClans từ user.availableClans, không gọi API trong login.
 *   + ≥ 2 clan DA_DUYET hoặc có admin role_in_tenant → /membership/select-tenant.
 *   + roleInTenant lấy từ link (roleInTenant / role_in_tenant), không dùng users.role.
 *   + Chuẩn hóa QX.
 * =============================================================================
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import apiClient from '../lib/apiClient';
import { membershipApi } from '../features/membership/api/membershipApi';

const AuthContext = createContext(null);

const ADMIN_ROLES = new Set([
  'SYSTEM_ADMIN',
  'CLAN_ADMIN',
  'TRUONG_HO',
  'TRUONG_TOC',
  'TRUONG_NGANH',
  'TRUONG_CHI',
]);

const getLinkRole = (clan) =>
  String(clan?.roleInTenant || clan?.role_in_tenant || '').toUpperCase();

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
   * Điều phối đường dẫn sau login.
   * - Không có activeMemberId → /membership/claim
   * - CHO_DUYET → /membership/status
   * - DRAFT → /op/mfo/plan
   * - ≥ 2 clan DA_DUYET hoặc có role_in_tenant admin → /membership/select-tenant
   * - Còn lại (1 clan USER) → /op
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

    const approved = (currentUser?.availableClans || []).filter(
      (c) => (c.status || 'DA_DUYET') === 'DA_DUYET'
    );
    const hasAdmin = approved.some((c) => ADMIN_ROLES.has(getLinkRole(c)));

    if (approved.length >= 2 || hasAdmin) {
      return '/membership/select-tenant';
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

  const switchContext = async (targetTenantId) => {
    try {
      setIsSwitchingContext(true);
      const data = await membershipApi.switchContext(targetTenantId);
      const payload = data?.data || data;

      if (payload.token) {
        localStorage.setItem('auth_token', payload.token);
        localStorage.setItem('token', payload.token);
      }

      const updatedContext = {
        activeTenantId: payload.activeTenantId,
        activeMemberId: payload.activeMemberId,
        activeLinkStatus: payload.activeLinkStatus,
        roleInTenant: payload.roleInTenant || payload.role_in_tenant,
        linkType: payload.linkType,
      };

      setActiveContext(updatedContext);
      localStorage.setItem('active_context', JSON.stringify(updatedContext));

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
    setUser(null);
    setActiveContext(null);
    setAvailableClans([]);
    window.location.href = '/auth';
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
