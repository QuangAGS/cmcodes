/**
 * PATH       : src/components/common/BlockingLoadingOverlay.jsx
 * DATETIME   : 2026-11-19T17:00:00+07:00
 * VERSION    : 1.0.0-ISO29148
 * DESCRIPTION: Vòng quay chặn màn hình chuyên dụng cho các thao tác có transaction khóa hàng.
 */
import React from 'react';
import { Loader2 } from 'lucide-react';
import AudioHelpButton from '../../features/elder-doctrine/components/AudioHelpButton';

export default function BlockingLoadingOverlay({ 
  isOpen, 
  message = "Đang xử lý, bác vui lòng chờ giây lát..." 
}) {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm transition-opacity"
      role="dialog"
      aria-modal="true"
      aria-labelledby="loading-message"
    >
      <div className="bg-white rounded-xl shadow-2xl p-6 md:p-8 flex flex-col items-center max-w-sm w-11/12 text-center animate-in fade-in zoom-in-95 duration-200">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" aria-hidden="true" />
        
        <div className="flex items-center justify-center gap-2 mb-2">
           <h3 id="loading-message" className="text-lg md:text-xl font-bold text-slate-800">
             {message}
           </h3>
           <AudioHelpButton text={message} ariaLabel="Nghe thông báo trạng thái" />
        </div>
        
        <p className="text-slate-500 text-sm md:text-base mt-2">
          Hệ thống đang lưu dữ liệu an toàn. Bác vui lòng không đóng trang này.
        </p>
      </div>
    </div>
  );
}
