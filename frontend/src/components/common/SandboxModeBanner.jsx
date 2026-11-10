/**
 * =============================================================================
 * PATH        : frontend/src/components/common/SandboxModeBanner.jsx
 * DATETIME    : 2026-11-10T11:20:00+07:00
 * VERSION     : 1.0.0-SANDBOX-BANNER-ELDER
 * DESCRIPTION : Banner cảnh báo chế độ Khởi tạo / Nháp (Sandbox Mode).
 *               Tự động hiển thị ở đầu trang khi người dùng có activeLinkStatus === 'DRAFT',
 *               nhắc nhở hoàn thiện hồ sơ phả hệ để kích hoạt chính thức.
 * =============================================================================
 * CHANGELOGS:
 * - 2026-11-10T11:20:00+07:00 (v1.0.0-SANDBOX-BANNER-ELDER):
 *   + Khởi tạo mới theo quy chuẩn QX.
 *   + Tối ưu hiển thị cho người cao tuổi với font chữ rõ ràng, màu tương phản cao.
 * =============================================================================
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export const SandboxModeBanner = () => {
  const navigate = useNavigate();
  const { activeContext } = useAuth();

  // Chỉ hiển thị khi ngữ cảnh liên kết hiện tại đang ở trạng thái DRAFT
  if (activeContext?.activeLinkStatus !== 'DRAFT') {
    return null;
  }

  return (
    <aside 
      aria-label="Cảnh báo chế độ khởi tạo nháp"
      className="bg-amber-500 text-slate-950 px-4 py-3 border-b-2 border-amber-600 shadow-sm"
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-600 text-white font-bold text-lg">
            !
          </span>
          <p className="text-sm sm:text-base font-bold leading-snug">
            Bạn đang trong chế độ khởi tạo gia phả 5 đời (Bản nháp). Hoàn tất nộp hồ sơ để mở đầy đủ tính năng dòng họ.
          </p>
        </div>

        <button
          type="button"
          onClick={() => navigate('/op/mfo/plan')}
          className="shrink-0 px-5 py-2 min-h-[44px] bg-slate-950 text-white hover:bg-slate-800 font-extrabold text-sm rounded-xl shadow transition-all focus:outline-none focus:ring-4 focus:ring-amber-300"
        >
          Tiếp tục lập hồ sơ
        </button>
      </div>
    </aside>
  );
};