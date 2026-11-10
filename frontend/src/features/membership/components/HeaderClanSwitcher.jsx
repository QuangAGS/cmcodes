/**
 * =============================================================================
 * PATH        : frontend/src/features/membership/components/HeaderClanSwitcher.jsx
 * DATETIME    : 2026-11-10T11:06:00+07:00
 * VERSION     : 1.1.0-CLAN-SWITCHER-ELDER
 * DESCRIPTION : Dropdown chọn và chuyển đổi dòng họ (Multi-Home Switcher) trên Header.
 *               Hiển thị đầy đủ tên dòng họ, vai trò, huy hiệu phân loại dòng họ
 *               (Nội/Ngoại/Dâu/Rể) và tích hợp hỗ trợ âm thanh trợ lý ảo Elder TTS.
 * =============================================================================
 * CHANGELOGS:
 * - 2026-11-10T10:45:00+07:00 (v1.0.0-CLAN-SWITCHER):
 *   + Khởi tạo component dropdown cơ bản.
 * - 2026-11-10T11:06:00+07:00 (v1.1.0-CLAN-SWITCHER-ELDER):
 *   + Chuẩn hóa theo tiêu chí QX.
 *   + Tích hợp helpers getLinkTypeMeta từ membershipLabels.js.
 *   + Tối ưu kích thước cảm ứng ≥ 48px và hỗ trợ phát âm Elder TTS khi chuyển đổi thành công.
 * =============================================================================
 */

import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { getLinkTypeMeta, ELDER_MEMBERSHIP_MESSAGES } from '../constants/membershipLabels';

export const HeaderClanSwitcher = () => {
  const { activeContext, availableClans, switchContext, isSwitchingContext } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  /**
   * Xử lý đóng Dropdown khi người dùng chạm hoặc click ra ngoài vùng hiển thị
   */
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Không hiển thị nếu người dùng chưa có dòng họ nào hoặc danh sách rỗng
  if (!availableClans || availableClans.length === 0) {
    return null;
  }

  // Tìm dòng họ hiện đang hoạt động theo activeTenantId
  const currentClan = availableClans.find(
    (clan) => clan.tenantId === activeContext?.activeTenantId
  ) || availableClans[0];

  const currentLinkMeta = getLinkTypeMeta(activeContext?.linkType || currentClan?.linkType);

  /**
   * Xử lý khi người dùng chọn dòng họ khác
   */
  const handleSelectClan = async (tenantId, clanName) => {
    if (tenantId === activeContext?.activeTenantId) {
      setIsOpen(false);
      return;
    }
    try {
      await switchContext(tenantId);
      setIsOpen(false);

      // Trợ lý âm thanh Elder Doctrine (nếu trình duyệt hỗ trợ SpeechSynthesis)
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(
          ELDER_MEMBERSHIP_MESSAGES.SWITCH_SUCCESS(clanName)
        );
        utterance.lang = 'vi-VN';
        window.speechSynthesis.speak(utterance);
      }
    } catch (err) {
      console.error('Lỗi khi thực hiện switch-context:', err);
    }
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Nút bấm chuyển đổi chính trên Header: Chiều cao tối thiểu 48px phục vụ người cao tuổi */}
      <button
        type="button"
        disabled={isSwitchingContext}
        onClick={() => setIsOpen((prev) => !prev)}
        className="inline-flex items-center justify-between gap-3 px-3.5 py-2 min-h-[48px] text-base font-semibold text-gray-900 bg-white border-2 border-gray-200 rounded-xl shadow-sm hover:bg-gray-50 hover:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100 transition-all duration-150"
        title="Bấm để đổi sang dòng họ khác"
      >
        <div className="flex items-center gap-2 text-left">
          <span className="truncate max-w-[140px] sm:max-w-[180px] md:max-w-[220px]">
            {isSwitchingContext ? 'Đang chuyển đổi...' : currentClan?.clanName || 'Chọn dòng họ'}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-md border font-semibold ${currentLinkMeta.color}`}>
            {currentLinkMeta.short}
          </span>
        </div>

        <svg
          className={`w-5 h-5 text-gray-600 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Danh sách dropdown các dòng họ */}
      {isOpen && (
        <div className="absolute right-0 z-50 w-80 mt-2 origin-top-right bg-white rounded-2xl shadow-2xl ring-1 ring-black ring-opacity-10 divide-y divide-gray-100 focus:outline-none animate-in fade-in zoom-in-95 duration-100">
          <div className="px-4 py-3 bg-gray-50 rounded-t-2xl flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Dòng họ của bạn ({availableClans.length})
            </span>
            <span className="text-xs text-blue-600 font-medium">Bấm để đổi</span>
          </div>

          <div className="py-2 max-h-72 overflow-y-auto">
            {availableClans.map((clan) => {
              const isSelected = clan.tenantId === activeContext?.activeTenantId;
              const linkMeta = getLinkTypeMeta(clan.linkType);

              return (
                <button
                  key={clan.tenantId}
                  disabled={isSwitchingContext}
                  onClick={() => handleSelectClan(clan.tenantId, clan.clanName)}
                  className={`w-full text-left px-4 py-3.5 flex items-center justify-between min-h-[52px] transition-colors border-l-4 ${
                    isSelected
                      ? 'bg-blue-50 border-blue-600 text-blue-950 font-bold'
                      : 'border-transparent text-gray-800 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex flex-col pr-2">
                    <span className="text-base leading-snug">{clan.clanName}</span>
                    <span className="text-xs text-gray-500 mt-0.5">
                      Vai trò: {clan.roleInTenant || 'Thành viên'}
                    </span>
                  </div>

                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded border font-medium ${linkMeta.color}`}>
                      {linkMeta.short}
                    </span>
                    {isSelected && (
                      <span className="text-[11px] text-blue-700 font-medium">Đang chọn</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};