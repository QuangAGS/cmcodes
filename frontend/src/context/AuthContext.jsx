/**
 * =============================================================================
 * PATH        : frontend/src/context/AuthContext.jsx
 * DATETIME    : 2026-11-10T15:55:00+07:00
 * VERSION     : 2.0.5-AUTH-CONTEXT-CLANS-DATA-EXTRACT
 * DESCRIPTION : Quản lý phiên làm việc và Ngữ cảnh dòng họ (Multi-Home Session).
 *               Chuẩn hóa bóc tách response của getMyClans để HeaderClanSwitcher
 *               nhận đúng mảng availableClans.
 * =============================================================================
 * CHANGELOGS:
 * - 2026-11-10T14:22:00+07:00 (v2.0.2-AUTH-CONTEXT-FIX-IMPORT-PATH):
 *   + Sửa import apiClient về ../lib/apiClient.
 * - 2026-11-10T15:55:00+07:00 (v2.0.5-AUTH-CONTEXT-CLANS-DATA-EXTRACT):
 *   + Bóc tách res.data?.data || res.data || res cho getMyClans.
 *   + Chỉ load availableClans khi có token.
 *   + Chuẩn hóa QX.
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
    return '/tree';
  }, []);

  const loadAvailableClans = useCallback(async () => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      setAvailableClans([]);
      return;
    }

    try {
      const res = await membershipApi.getMyClans();
      // BE trả { status, data: [...], message }
      const list = res?.data?.data || res?.data || res || [];
      setAvailableClans(Array.isArray(list) ? list : []);
    } catch (err) {
      console.warn('Không thể tải danh sách available-clans:', err);
      setAvailableClans([]);
    }
  }, []);

  const loadUser = useCallback(async () => {
    const token = localStorage.getItem('auth_token');
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
      const data = res.data;

      setUser(data.user || data);

      const newContext = {
        activeTenantId: data.activeTenantId || data.tenant_id || null,
        activeMemberId: data.activeMemberId || data.member_id || null,
        activeLinkStatus: data.activeLinkStatus || 'DRAFT',
        roleInTenant: data.roleInTenant || data.role || 'USER',
        linkType: data.linkType || 'PRIMARY_PATERNAL',
      };

      setActiveContext(newContext);
      localStorage.setItem('active_context', JSON.stringify(newContext));

      await loadAvailableClans();
    } catch (err) {
      console.error('Phiên đăng nhập hết hạn hoặc không hợp lệ:', err);
      localStorage.removeItem('auth_token');
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
    const data = res.data;

    if (data.token) {
      localStorage.setItem('auth_token', data.token);
    }

    const newContext = {
      activeTenantId: data.activeTenantId || null,
      activeMemberId: data.activeMemberId || null,
      activeLinkStatus: data.activeLinkStatus || 'DRAFT',
      roleInTenant: data.roleInTenant || 'USER',
      linkType: data.linkType || 'PRIMARY_PATERNAL',
    };

    setUser(data.user);
    setActiveContext(newContext);
    localStorage.setItem('active_context', JSON.stringify(newContext));

    await loadAvailableClans();

    return {
      user: data.user,
      context: newContext,
      redirectPath: resolvePostLoginRedirect(data.user, newContext),
    };
  };

  const switchContext = async (targetTenantId) => {
    try {
      setIsSwitchingContext(true);
      const data = await membershipApi.switchContext(targetTenantId);

      if (data.token) {
        localStorage.setItem('auth_token', data.token);
      }

      const updatedContext = {
        activeTenantId: data.activeTenantId,
        activeMemberId: data.activeMemberId,
        activeLinkStatus: data.activeLinkStatus,
        roleInTenant: data.roleInTenant,
        linkType: data.linkType,
      };

      setActiveContext(updatedContext);
      localStorage.setItem('active_context', JSON.stringify(updatedContext));

      await loadAvailableClans();

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
