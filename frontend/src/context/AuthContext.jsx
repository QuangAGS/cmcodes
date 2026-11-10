/**
 * =============================================================================
 * PATH        : frontend/src/context/AuthContext.jsx
 * DATETIME    : 2026-11-10T19:55:00+07:00
 * VERSION     : 2.0.7-AUTH-CONTEXT-LOGIN-PAYLOAD-AND-OP-REDIRECT
 * DESCRIPTION : Quản lý phiên làm việc và Ngữ cảnh dòng họ (Multi-Home Session).
 *               Bóc đúng tầng response login của BE (data.data.user).
 *               DA_DUYET redirect về /op.
 * =============================================================================
 * CHANGELOGS:
 * - 2026-11-10T19:45:00+07:00 (v2.0.6-AUTH-CONTEXT-USER-SHAPE-SAFE):
 *   + setUser an toàn với shape phẳng.
 * - 2026-11-10T19:55:00+07:00 (v2.0.7-AUTH-CONTEXT-LOGIN-PAYLOAD-AND-OP-REDIRECT):
 *   + login: bóc payload = res.data?.data || res.data; user = payload.user.
 *   + Context lấy activeMemberId / activeLinkStatus từ user.
 *   + DA_DUYET → /op (thay vì /tree).
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

  /**
   * Điều phối đường dẫn sau login.
   * - Không có activeMemberId → /membership/claim
   * - CHO_DUYET → /membership/status
   * - DRAFT → /op/mfo/plan
   * - DA_DUYET → /op
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
    // DA_DUYET (và các trạng thái đã gắn member khác)
    return '/op';
  }, []);

  const loadAvailableClans = useCallback(async () => {
    const token = localStorage.getItem('auth_token');
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
      const data = res.data?.data || res.data;
      const userObj = data.user || data;

      setUser(userObj);

      const newContext = {
        activeTenantId: userObj.activeTenantId || userObj.tenantId || userObj.tenant_id || null,
        activeMemberId: userObj.activeMemberId || userObj.member_id || null,
        activeLinkStatus: userObj.activeLinkStatus
          || (userObj.status === 'DA_DUYET' ? 'DA_DUYET' : 'DRAFT'),
        roleInTenant: userObj.role || 'USER',
        linkType: userObj.linkType || 'PRIMARY_PATERNAL',
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

    // BE: { status, data: { token, user: { activeMemberId, activeLinkStatus, ... } } }
    const payload = res.data?.data || res.data;
    const userObj = payload.user || payload;

    if (payload.token) {
      localStorage.setItem('auth_token', payload.token);
    }

    const newContext = {
      activeTenantId: userObj.activeTenantId || userObj.tenantId || userObj.tenant_id || null,
      activeMemberId: userObj.activeMemberId || userObj.member_id || null,
      activeLinkStatus: userObj.activeLinkStatus
        || (userObj.status === 'DA_DUYET' ? 'DA_DUYET' : 'DRAFT'),
      roleInTenant: userObj.role || 'USER',
      linkType: userObj.linkType || 'PRIMARY_PATERNAL',
    };

    setUser(userObj);
    setActiveContext(newContext);
    localStorage.setItem('active_context', JSON.stringify(newContext));

    await loadAvailableClans();

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
      }

      const updatedContext = {
        activeTenantId: payload.activeTenantId,
        activeMemberId: payload.activeMemberId,
        activeLinkStatus: payload.activeLinkStatus,
        roleInTenant: payload.roleInTenant,
        linkType: payload.linkType,
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
