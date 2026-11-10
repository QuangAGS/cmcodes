/**
 * =============================================================================
 * PATH        : frontend/src/context/AuthContext.jsx
 * DATETIME    : 2026-11-10T15:10:00+07:00
 * VERSION     : 2.0.4-AUTH-CONTEXT-FALLBACK-AVAILABLE-CLANS
 * DESCRIPTION : Quản lý phiên làm việc và Ngữ cảnh dòng họ (Multi-Home Session).
 *               Bổ sung cơ chế Fallback an toàn cho availableClans:
 *               Khi endpoint /auth/available-clans trả về 404, tự động trích xuất
 *               dòng họ mặc định từ thông tin User/Token để tránh làm gián đoạn
 *               giao diện của CLAN_ADMIN.
 * =============================================================================
 * CHANGELOGS:
 * - 2026-11-10T15:00:00+07:00 (v2.0.3-AUTH-CONTEXT-FIX-DOUBLE-API-PREFIX):
 *   + Xóa tiền tố /api dư thừa.
 * - 2026-11-10T15:10:00+07:00 (v2.0.4-AUTH-CONTEXT-FALLBACK-AVAILABLE-CLANS):
 *   + Bổ sung Fallback cho loadAvailableClans khi Backend trả về 404.
 * =============================================================================
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import apiClient from '../lib/apiClient';
import { membershipApi } from '../features/membership/api/membershipApi';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Lưu trữ Context liên kết dòng họ đang kích hoạt
  const [activeContext, setActiveContext] = useState(() => {
    try {
      const saved = localStorage.getItem('active_context');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Danh sách các dòng họ mà người dùng sở hữu liên kết (availableClans)
  const [availableClans, setAvailableClans] = useState([]);
  const [isSwitchingContext, setIsSwitchingContext] = useState(false);

  /**
   * Điều phối đường dẫn sau khi đăng nhập (resolvePostLoginRedirect)
   * - SYSTEM_ADMIN / CLAN_ADMIN -> vào thẳng /op hoặc /admin
   * - Chưa có activeMemberId -> /membership/claim
   * - activeLinkStatus === 'CHO_DUYET' -> /membership/status
   * - activeLinkStatus === 'DRAFT' -> /op/mfo/plan
   * - activeLinkStatus === 'DA_DUYET' -> /tree
   */
  const resolvePostLoginRedirect = useCallback((currentUser, currentContext) => {
    // Nếu là Admin, ưu tiên vào /op hoặc /admin
    if (currentUser?.role === 'SYSTEM_ADMIN' || currentUser?.role === 'CLAN_ADMIN') {
      return '/op';
    }

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

  /**
   * Tải danh sách dòng họ liên kết kèm cơ chế Fallback nếu endpoint 404
   */
  const loadAvailableClans = useCallback(async (fallbackUser = null, fallbackContext = null) => {
    try {
      const clans = await membershipApi.getMyClans();
      if (Array.isArray(clans) && clans.length > 0) {
        setAvailableClans(clans);
        return;
      }
    } catch (err) {
      console.warn('Backend chưa sẵn sàng endpoint available-clans (404), kích hoạt Fallback:', err?.message);
    }

    // FALLBACK AN TOÀN: Tạo 1 clan từ thông tin tài khoản hiện tại
    const targetUser = fallbackUser || user;
    const targetCtx = fallbackContext || activeContext;

    if (targetUser || targetCtx) {
      const defaultClan = [
        {
          tenantId: targetCtx?.activeTenantId || targetUser?.tenant_id || 'default-tenant',
          clanName: targetUser?.clan_name || targetUser?.tenant_name || 'Dòng họ của tôi',
          roleInTenant: targetCtx?.roleInTenant || targetUser?.role || 'CLAN_ADMIN',
          linkType: targetCtx?.linkType || 'PRIMARY_PATERNAL',
          isDefault: true,
        },
      ];
      setAvailableClans(defaultClan);
    }
  }, [user, activeContext]);

  /**
   * Khởi tạo thông tin phiên làm việc từ endpoint /auth/me
   */
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

      const userData = data.user || data;
      setUser(userData);

      const newContext = {
        activeTenantId: data.activeTenantId || userData.tenant_id || null,
        activeMemberId: data.activeMemberId || userData.member_id || null,
        activeLinkStatus: data.activeLinkStatus || 'DA_DUYET', // Nếu là CLAN_ADMIN đã active thì mặc định DA_DUYET
        roleInTenant: data.roleInTenant || userData.role || 'CLAN_ADMIN',
        linkType: data.linkType || 'PRIMARY_PATERNAL',
      };

      setActiveContext(newContext);
      localStorage.setItem('active_context', JSON.stringify(newContext));

      // Nạp danh sách dòng họ với dữ liệu fallback
      await loadAvailableClans(userData, newContext);
    } catch (err) {
      console.error('Phiên đăng nhập hết hạn hoặc không hợp lệ:', err);
      localStorage.removeItem('auth_token');
      localStorage.removeItem('active_context');
      setUser(null);
      setActiveContext(null);
    } finally {
      setLoading(false);
    }
  }, [loadAvailableClans]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  /**
   * Đăng nhập người dùng qua endpoint /auth/login
   */
  const login = async (credentials) => {
    const res = await apiClient.post('/auth/login', credentials);
    const data = res.data;

    if (data.token) {
      localStorage.setItem('auth_token', data.token);
    }

    const userData = data.user || {};
    const newContext = {
      activeTenantId: data.activeTenantId || userData.tenant_id || null,
      activeMemberId: data.activeMemberId || userData.member_id || null,
      activeLinkStatus: data.activeLinkStatus || (userData.status === 'DA_DUYET' ? 'DA_DUYET' : 'DRAFT'),
      roleInTenant: data.roleInTenant || userData.role || 'USER',
      linkType: data.linkType || 'PRIMARY_PATERNAL',
    };

    setUser(userData);
    setActiveContext(newContext);
    localStorage.setItem('active_context', JSON.stringify(newContext));

    // Nạp danh sách dòng họ
    await loadAvailableClans(userData, newContext);

    return {
      user: userData,
      context: newContext,
      redirectPath: resolvePostLoginRedirect(userData, newContext),
    };
  };

  /**
   * Chuyển đổi ngữ cảnh sang tenant mục tiêu (Switch Context)
   */
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

      await loadAvailableClans(user, updatedContext);

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
   * Đăng xuất và làm sạch dữ liệu phiên
   */
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