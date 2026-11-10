/**
 * =============================================================================
 * PATH        : frontend/src/components/common/SandboxModeBanner.jsx
 * DATETIME    : 2026-11-10T11:52:00+07:00
 * VERSION     : 1.1.0-SANDBOX-BANNER-ELDER-STANDARDIZED
 * DESCRIPTION : Banner cảnh báo chế độ Khởi tạo / Nháp (Sandbox Mode).
 *               Hiển thị khi activeLinkStatus === 'DRAFT'.
 *               Nâng cấp nút bấm đạt chuẩn Elder Doctrine (min-h-[48px]),
 *               tối ưu logic điều hướng linh hoạt theo vị trí trang hiện tại.
 * =============================================================================
 * CHANGELOGS:
 * - 2026-11-10T11:20:00+07:00 (v1.0.0-SANDBOX-BANNER-ELDER):
 *   + Khởi tạo mới theo quy chuẩn QX.
 * - 2026-11-10T11:52:00+07:00 (v1.1.0-SANDBOX-BANNER-ELDER-STANDARDIZED):
 *   + Nâng chiều cao nút bấm từ 44px lên chuẩn min-h-[48px] phục vụ người cao tuổi.
 *   + Kiểm tra route hiện tại, ẩn nút điều hướng nếu người dùng đã ở trang /op/mfo/plan.
 * =============================================================================
 */

import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export const SandboxModeBanner = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { activeContext } = useAuth();

  // Chỉ hiển thị khi ngữ cảnh liên kết hiện tại đang ở trạng thái DRAFT
  if (activeContext?.activeLinkStatus !== 'DRAFT') {
    return null;
  }

  const isAlreadyOnPlanPage = location.pathname.startsWith('/op/mfo/plan');

  return (
    <aside 
      aria-label="Cảnh báo chế độ khởi tạo gia phả"
      className="bg-amber-500 text-slate-950 px-4 py-3 border-b-2 border-amber-600 shadow-sm"
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
        <div className="flex items-center gap-3">
          <span 
            aria-hidden="true" 
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-600 text-white font-extrabold text-lg shadow-sm"
          >
            !
          </span>
          <p className="text-sm sm:text-base font-bold leading-snug">
            Bác/Bạn đang trong chế độ khởi tạo gia phả 5 đời (Bản nháp). Hoàn tất nộp hồ sơ để mở đầy đủ tính năng dòng họ.
          </p>
        </div>

        {!isAlreadyOnPlanPage && (
          <button
            type="button"
            onClick={() => navigate('/op/mfo/plan')}
            className="shrink-0 px-6 py-2.5 min-h-[48px] bg-slate-950 text-white hover:bg-slate-800 active:bg-black font-extrabold text-base rounded-xl shadow-md transition-all focus:outline-none focus:ring-4 focus:ring-amber-300 flex items-center justify-center"
          >
            Tiếp tục lập hồ sơ
          </button>
        )}
      </div>
    </aside>
  );
};