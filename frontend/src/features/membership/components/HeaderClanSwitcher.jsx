/**
 * =============================================================================
 * PATH        : frontend/src/features/membership/components/HeaderClanSwitcher.jsx
 * DATETIME    : 2026-11-10T22:00:00+07:00
 * VERSION     : 1.3.0-CLAN-SWITCHER-TENANT-AND-ROLE
 * DESCRIPTION : Dropdown Multi-Home trên header.
 *               - Chọn dòng họ (tenant) → switch-context.
 *               - Với dòng họ có role_in_tenant admin: chọn Thành viên (/op)
 *                 hoặc Quản trị (/admin) mà không cần logout.
 *               Role SSOT: role_in_tenant của user_member_links.
 * =============================================================================
 * CHANGELOGS:
 * - 2026-11-10T11:06:00+07:00 (v1.1.0-CLAN-SWITCHER-ELDER):
 *   + Dropdown + TTS cơ bản.
 * - 2026-11-10T22:00:00+07:00 (v1.3.0-CLAN-SWITCHER-TENANT-AND-ROLE):
 *   + Chọn tenant và vai trò (Thành viên / Quản trị) trong cùng dropdown.
 *   + Cùng tenant chỉ navigate; khác tenant thì switchContext rồi vào path.
 *   + Chuẩn hóa QX.
 * =============================================================================
 */

import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { getLinkTypeMeta } from '../constants/membershipLabels';

const ADMIN_ROLES = new Set([
  'SYSTEM_ADMIN',
  'CLAN_ADMIN',
  'TRUONG_HO',
  'TRUONG_TOC',
  'TRUONG_NGANH',
  'TRUONG_CHI',
]);

const getRoleInTenant = (clan) =>
  String(clan?.roleInTenant || clan?.role_in_tenant || 'USER').toUpperCase();

const isAdminRole = (role) => ADMIN_ROLES.has(role);

export const HeaderClanSwitcher = () => {
  const navigate = useNavigate();
  const {
    user,
    activeContext,
    availableClans,
    switchContext,
    isSwitchingContext,
  } = useAuth();

  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState('');
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user || !availableClans || availableClans.length === 0) {
    return null;
  }

  const currentClan =
    availableClans.find((c) => c.tenantId === activeContext?.activeTenantId) ||
    availableClans[0];

  const currentRole = getRoleInTenant(currentClan);
  const currentLinkMeta = getLinkTypeMeta(activeContext?.linkType || currentClan?.linkType);
  const currentIsAdmin = isAdminRole(currentRole);

  const enterClanAs = async (clan, path) => {
    try {
      setError('');
      const sameTenant = clan.tenantId === activeContext?.activeTenantId;

      if (!sameTenant) {
        await switchContext(clan.tenantId);
      }

      setIsOpen(false);
      navigate(path, { replace: true });
    } catch (err) {
      console.error('Không thể chuyển dòng họ / vai trò:', err);
      setError(err?.response?.data?.message || 'Không thể chuyển. Vui lòng thử lại.');
    }
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        type="button"
        disabled={isSwitchingContext}
        onClick={() => setIsOpen((prev) => !prev)}
        className="inline-flex items-center justify-between gap-3 px-3.5 py-2 min-h-[48px] text-base font-semibold text-gray-900 bg-white border-2 border-gray-200 rounded-xl shadow-sm hover:bg-gray-50 hover:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100"
        title="Bấm để đổi dòng họ hoặc vai trò"
      >
        <div className="flex items-center gap-2 text-left">
          <span className="truncate max-w-[140px] sm:max-w-[180px] md:max-w-[220px]">
            {isSwitchingContext ? 'Đang chuyển...' : currentClan?.clanName || 'Chọn dòng họ'}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-md border font-semibold ${currentLinkMeta.color}`}>
            {currentLinkMeta.short}
          </span>
        </div>
        <svg
          className={`w-5 h-5 text-gray-600 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 w-80 mt-2 origin-top-right bg-white rounded-2xl shadow-2xl ring-1 ring-black ring-opacity-10 focus:outline-none">
          <div className="px-4 py-3 bg-gray-50 rounded-t-2xl">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Dòng họ của bạn ({availableClans.length})
            </span>
          </div>

          {error && (
            <div className="px-4 py-2 text-sm text-red-700 bg-red-50">{error}</div>
          )}

          <div className="py-2 max-h-80 overflow-y-auto">
            {availableClans.map((clan) => {
              const role = getRoleInTenant(clan);
              const admin = isAdminRole(role);
              const isSelected = clan.tenantId === activeContext?.activeTenantId;
              const linkMeta = getLinkTypeMeta(clan.linkType);

              return (
                <div
                  key={clan.tenantId}
                  className={`px-4 py-3 border-l-4 ${
                    isSelected ? 'bg-blue-50 border-blue-600' : 'border-transparent'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-base font-semibold text-gray-900">
                        {clan.clanName}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        Vai trò trong họ: {role}
                        {clan.isDefault ? ' · Mặc định' : ''}
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded border font-medium ${linkMeta.color}`}>
                      {linkMeta.short}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-col gap-2">
                    <button
                      type="button"
                      disabled={isSwitchingContext}
                      onClick={() => enterClanAs(clan, '/op')}
                      className="w-full text-left px-3 py-2 min-h-[44px] rounded-xl bg-white border border-gray-200 hover:border-blue-400 hover:bg-blue-50 text-sm font-semibold text-gray-800"
                    >
                      Vào với tư cách Thành viên
                    </button>
                    {admin && (
                      <button
                        type="button"
                        disabled={isSwitchingContext}
                        onClick={() => enterClanAs(clan, '/admin')}
                        className="w-full text-left px-3 py-2 min-h-[44px] rounded-xl bg-slate-900 text-white hover:bg-slate-800 text-sm font-semibold"
                      >
                        Vào với tư cách Quản trị
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {currentIsAdmin && (
            <div className="px-4 py-2 text-[11px] text-gray-500 border-t border-gray-100">
              Đang ở: {currentClan?.clanName} · có thể vào Thành viên hoặc Quản trị
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default HeaderClanSwitcher;
