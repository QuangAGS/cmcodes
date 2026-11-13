/**
 * =============================================================================
 * PATH        : frontend/src/features/membership/components/HeaderClanSwitcher.jsx
 * DATETIME    : 2026-11-12T21:50:00+07:00
 * VERSION     : 1.4.0-MULTIHOME-AMEND02-V15-LAT3
 * DESCRIPTION : Dropdown Multi-Home trên header.
 *               - Mỗi họ: "Thành viên" -> /op (hoặc /membership/status nếu CHO_DUYET / TU_CHOI).
 *               - Nếu roleInTenant là admin (CLAN_ADMIN, SYSTEM_ADMIN, TRUONG_*) và DA_DUYET -> thêm "Quản trị" -> /admin.
 *               - Khác tenant: switchContext(tenantId, path) -> window.location.href = path.
 *               - Cùng tenant: chỉ gọi navigate(path), không gọi switchContext thừa.
 *               - Bổ sung 2 lối rẽ Multi-Home: "+ Gia nhập dòng họ khác" (C1) và "+ Lập dòng họ mới" (C1-S).
 * =============================================================================
 * CHANGELOGS:
 * - 2026-11-10T22:00:00+07:00 (v1.3.0): Chọn tenant và vai trò.
 * - 2026-11-11T12:05:00+07:00 (v1.3.1-CLAN-SWITCHER-ONE-WAY-NAV):
 *   + Khác họ: switchContext có truyền path để chuyển trang nguyên tử.
 *   + Cùng họ: chỉ navigate, không trigger reload.
 * - 2026-11-12T21:50:00+07:00 (v1.4.0-MULTIHOME-AMEND02-V15-LAT3):
 *   + Thêm nút "+ Gia nhập dòng họ khác" -> /membership/claim?mode=add-clan.
 *   + Thêm nút "+ Lập dòng họ mới" -> /membership/setup.
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

const resolveMemberEntryPath = (clan) => {
  const st = String(clan?.status || 'DA_DUYET').toUpperCase();
  if (st === 'DRAFT') return '/op/mfo/plan';
  if (st === 'CHO_DUYET' || st === 'TU_CHOI') return '/membership/status';
  return '/op';
};

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

  /**
   * Xử lý chuyển đổi ngữ cảnh hoặc đổi vai trò tác nghiệp
   */
  const enterClanAs = async (clan, path) => {
    try {
      setError('');
      const sameTenant = clan.tenantId === activeContext?.activeTenantId;

      if (!sameTenant) {
        // Khác họ: Gọi switchContext kèm path đích (tự động chuyển trang dứt khoát)
        await switchContext(clan.tenantId, path);
        return;
      }

      // Cùng họ: Đóng dropdown và dùng client router chuyển trang
      setIsOpen(false);
      navigate(path, { replace: true });
    } catch (err) {
      console.error('Không thể chuyển dòng họ / vai trò:', err);
      setError(err?.response?.data?.message || 'Không thể chuyển. Vui lòng thử lại.');
    }
  };

  /**
   * Điều hướng sang cổng Multi-Home C1 (+ Gia nhập dòng họ khác) hoặc C1-S (+ Lập dòng họ mới)
   * Không gọi switchContext hay auth/register để bảo toàn phiên của họ gốc.
   */
  const handleMultiHomeAction = (targetPath) => {
    setError('');
    setIsOpen(false);
    navigate(targetPath);
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
          {currentClan?.isDefault && (
            <span className="text-amber-500 font-bold" title="Dòng họ mặc định">
              ★
            </span>
          )}
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
              const linkStatus = String(clan?.status || 'DA_DUYET').toUpperCase();
              const isApproved = linkStatus === 'DA_DUYET';
              const admin = isApproved && isAdminRole(role);
              const isSelected = clan.tenantId === activeContext?.activeTenantId;
              const linkMeta = getLinkTypeMeta(clan.linkType);
              const memberEntryPath = resolveMemberEntryPath(clan);

              return (
                <div
                  key={clan.tenantId}
                  className={`px-4 py-3 border-l-4 ${
                    isSelected ? 'bg-blue-50 border-blue-600' : 'border-transparent'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        {clan.isDefault && (
                          <span className="text-amber-500 text-sm font-bold" title="Dòng họ mặc định">
                            ★
                          </span>
                        )}
                        <span className="text-base font-semibold text-gray-900 leading-snug">
                          {clan.clanName}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
                        <span>Vai trò: {role}</span>
                        {linkStatus === 'CHO_DUYET' && (
                          <span className="inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold text-[11px]">
                            Chờ duyệt
                          </span>
                        )}
                        {linkStatus === 'TU_CHOI' && (
                          <span className="inline-block px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-semibold text-[11px]">
                            Từ chối
                          </span>
                        )}
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded border font-medium ${linkMeta.color}`}>
                      {linkMeta.short}
                    </span>
                  </div>

                  <div className="mt-2.5 flex flex-col gap-2">
                    <button
                      type="button"
                      disabled={isSwitchingContext}
                      onClick={() => enterClanAs(clan, memberEntryPath)}
                      className="w-full text-left px-3 py-2 min-h-[44px] rounded-xl bg-white border border-gray-200 hover:border-blue-400 hover:bg-blue-50 text-sm font-semibold text-gray-800 transition-colors"
                    >
                      {linkStatus === 'CHO_DUYET' || linkStatus === 'TU_CHOI'
                        ? 'Xem trạng thái hồ sơ gia nhập'
                        : 'Vào với tư cách Thành viên'}
                    </button>
                    {admin && (
                      <button
                        type="button"
                        disabled={isSwitchingContext}
                        onClick={() => enterClanAs(clan, '/admin')}
                        className="w-full text-left px-3 py-2 min-h-[44px] rounded-xl bg-slate-900 text-white hover:bg-slate-800 text-sm font-semibold transition-colors"
                      >
                        Vào với tư cách Quản trị
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-3 border-t border-gray-100 bg-gray-50/80 space-y-2 rounded-b-2xl">
            <button
              type="button"
              disabled={isSwitchingContext}
              onClick={() => handleMultiHomeAction('/membership/claim?mode=add-clan')}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold shadow-sm transition-colors"
            >
              <span>+ Gia nhập dòng họ khác</span>
            </button>
            <button
              type="button"
              disabled={isSwitchingContext}
              onClick={() => handleMultiHomeAction('/membership/setup')}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 min-h-[40px] rounded-xl bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-bold transition-colors"
            >
              <span>+ Lập dòng họ mới</span>
            </button>
            {currentIsAdmin && (
              <div className="pt-1 text-[11px] text-gray-500 text-center">
                Đang ở: <span className="font-semibold">{currentClan?.clanName}</span> (có thể vào Thành viên hoặc Quản trị)
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default HeaderClanSwitcher;