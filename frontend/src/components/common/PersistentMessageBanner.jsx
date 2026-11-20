/**
 * PATH       : src/components/common/PersistentMessageBanner.jsx
 * DATETIME   : 2026-11-20T07:15:00+07:00
 * VERSION    : 1.1.0-ISO29148-SPRINT-FE4
 * DESCRIPTION: Hợp nhất duy nhất hiển thị thông báo lỗi/thành công, thay thế Toast.
 *              Hỗ trợ Elder Support và chế độ hiển thị inline hoặc modal (TC-FE-02).
 * CHANGELOGS:
 * - 2026-11-19T16:30:00+07:00 (v1.0.0-ISO29148): Khởi tạo Banner hợp nhất.
 * - 2026-11-20T07:15:00+07:00 (v1.1.0-ISO29148-SPRINT-FE4):
 *   + Bổ sung prop tùy chọn mode = 'inline' | 'modal' phục vụ TC-FE-02 (400 REFERRER_DECEASED)
 *     mà vẫn giữ nguyên 100% hành vi mặc định mode = 'inline'.
 */
import React from 'react';
import { AlertCircle, CheckCircle2, XCircle, Info, X } from 'lucide-react';
import AudioHelpButton from '../../features/elder-doctrine/components/AudioHelpButton';

const iconMap = {
  success: <CheckCircle2 className="w-6 h-6 text-green-600" />,
  error: <XCircle className="w-6 h-6 text-red-600" />,
  warning: <AlertCircle className="w-6 h-6 text-amber-600" />,
  info: <Info className="w-6 h-6 text-blue-600" />,
};

const bgMap = {
  success: 'bg-green-50 border-green-200 text-green-900',
  error: 'bg-red-50 border-red-200 text-red-900',
  warning: 'bg-amber-50 border-amber-200 text-amber-900',
  info: 'bg-blue-50 border-blue-200 text-blue-900',
};

export default function PersistentMessageBanner({ 
  type = 'info', 
  title, 
  message, 
  correlationId, 
  onClose,
  actionButton,
  mode = 'inline',
}) {
  if (!message) return null;

  const bannerCard = (
    <div
      className={`flex flex-col sm:flex-row gap-4 p-4 rounded-xl border-2 shadow-sm ${
        mode === 'modal' ? 'mb-0 max-w-lg w-full shadow-2xl' : 'mb-6'
      } ${bgMap[type] || bgMap.info}`}
      role="alert"
      aria-live="assertive"
    >
      <div className="flex-shrink-0 pt-1">
        {iconMap[type] || iconMap.info}
      </div>
      
      <div className="flex-grow space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-lg font-bold leading-tight flex flex-wrap items-center gap-2">
            <span>{title || (type === 'error' ? 'Có lỗi xảy ra' : 'Thông báo')}</span>
            <AudioHelpButton text={message} ariaLabel="Nghe thông báo" />
          </h3>
          {onClose && (
            <button 
              type="button"
              onClick={onClose}
              className="p-1 -mt-1 -mr-2 rounded-full hover:bg-black/5 transition-colors focus:ring-2 focus:ring-offset-2 focus:outline-none min-h-[48px] min-w-[48px] flex items-center justify-center sm:hidden"
              aria-label="Đóng thông báo"
            >
              <X className="w-6 h-6 opacity-70" />
            </button>
          )}
        </div>
        
        <div className="text-base font-medium opacity-90 whitespace-pre-wrap">
          {message}
        </div>
        
        <div className="text-sm opacity-80 font-mono pt-1">
          Mã tra cứu: {correlationId || 'Không có'}
        </div>
        
        {actionButton && (
          <div className="pt-2 flex flex-wrap gap-2">
            {actionButton}
          </div>
        )}
      </div>
      
      {onClose && (
        <div className="hidden sm:block flex-shrink-0">
          <button 
            type="button"
            onClick={onClose}
            className="px-4 py-2 min-h-[48px] rounded-md font-bold text-base bg-white/70 border hover:bg-white transition-colors focus:ring-2 focus:ring-offset-2 focus:outline-none"
          >
            Đã hiểu
          </button>
        </div>
      )}
    </div>
  );

  if (mode === 'modal') {
    return (
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
      >
        {bannerCard}
      </div>
    );
  }

  return bannerCard;
}
