/**
 * ============================================================================
 * PATH       : src/components/common/PersistentMessageBanner.jsx
 * DATETIME   : 2026-11-21T09:45:00+07:00
 * VERSION    : 1.3.0-ISO29148-UAT-IMP3
 * DESCRIPTION:
 * - Hợp nhất duy nhất hiển thị thông báo lỗi/thành công, thay thế Toast.
 * - [UAT-IMP3]:
 *   1. Tuyệt đối KHÔNG tự động đóng theo thời gian; chỉ đóng khi EU chủ động
 *      bấm nút "Đã hiểu".
 *   2. Ẩn hoàn toàn mã UUID / Mã tra cứu đối với EU (showTechnicalCode = false
 *      mặc định) để tránh gây hoang mang hoặc suy ngược dữ liệu.
 *   3. Đồng bộ 100% style nút bấm: min-h-[48px] h-12 rounded-xl text-base
 *      font-bold whitespace-nowrap (khắc phục lỗi rớt dòng nút Nghe thông báo).
 * ============================================================================
 * CHANGELOGS:
 * - 2026-11-19T16:30:00+07:00 (v1.0.0-ISO29148): Khởi tạo Banner hợp nhất.
 * - 2026-11-20T07:15:00+07:00 (v1.1.0-ISO29148-SPRINT-FE4): Bổ sung mode = 'inline' | 'modal'.
 * - 2026-11-20T18:15:00+07:00 (v1.2.0-ISO29148-UAT-IMP1): Bổ sung mode = 'fullscreen' + autoSpeak.
 * - 2026-11-21T09:45:00+07:00 (v1.3.0-ISO29148-UAT-IMP3): Áp dụng chuẩn UAT-IMP3.
 * ============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */
import React, { useEffect, useRef } from 'react';
import { AlertCircle, CheckCircle2, XCircle, Info } from 'lucide-react';
import AudioHelpButton from '../../features/elder-doctrine/components/AudioHelpButton';
import { useTts } from '../../shared/hooks/useTts';

const iconMap = {
  success: <CheckCircle2 className="w-7 h-7 text-green-600" />,
  error: <XCircle className="w-7 h-7 text-red-600" />,
  warning: <AlertCircle className="w-7 h-7 text-amber-600" />,
  info: <Info className="w-7 h-7 text-blue-600" />,
};

const bgMap = {
  success: 'bg-green-50 border-green-400 text-green-950',
  error: 'bg-red-50 border-red-400 text-red-950',
  warning: 'bg-amber-50 border-amber-400 text-amber-950',
  info: 'bg-blue-50 border-blue-400 text-blue-950',
};

export default function PersistentMessageBanner({
  type = 'info',
  title,
  message,
  correlationId,
  showTechnicalCode = false,
  onClose,
  actionButton,
  mode = 'inline',
  autoSpeak,
}) {
  const { speak, stop } = useTts();
  const lastAutoSpokenKeyRef = useRef('');

  const isOverlayMode = mode === 'fullscreen' || mode === 'modal';
  const shouldAutoSpeak =
    typeof autoSpeak === 'boolean' ? autoSpeak : isOverlayMode;

  const resolvedTitle =
    title || (type === 'error' ? 'Chưa thể thực hiện lúc này' : 'Thông báo');
  const spokenText = message ? `${resolvedTitle}. ${message}` : '';

  useEffect(() => {
    if (!message || !shouldAutoSpeak) return undefined;

    const speakKey = `${mode}|${type}|${resolvedTitle}|${message}`;
    if (lastAutoSpokenKeyRef.current === speakKey) return undefined;
    lastAutoSpokenKeyRef.current = speakKey;

    const timer = window.setTimeout(() => {
      speak?.(spokenText, {
        rate: 0.82,
        interrupt: true,
      });
    }, 120);

    return () => {
      window.clearTimeout(timer);
    };
  }, [message, shouldAutoSpeak, mode, type, resolvedTitle, spokenText, speak]);

  useEffect(() => {
    if (!message) {
      lastAutoSpokenKeyRef.current = '';
    }
  }, [message]);

  if (!message) return null;

  const handleDismiss = () => {
    stop?.();
    onClose?.();
  };

  if (mode === 'fullscreen') {
    return (
      <div
        className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/85 p-3 sm:p-6 backdrop-blur-md"
        role="dialog"
        aria-modal="true"
        aria-labelledby="persistent-banner-fullscreen-title"
      >
        <div
          className={`w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col justify-between gap-5 p-5 sm:p-8 rounded-2xl border-4 shadow-2xl ${
            bgMap[type] || bgMap.info
          }`}
          role="alert"
          aria-live="assertive"
        >
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-black/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
                  {iconMap[type] || iconMap.info}
                </div>
                <h3
                  id="persistent-banner-fullscreen-title"
                  className="text-xl sm:text-2xl font-black leading-snug"
                >
                  {resolvedTitle}
                </h3>
              </div>

              <div className="shrink-0">
                <AudioHelpButton
                  text={spokenText}
                  label="Nghe thông báo"
                  variant="soft"
                />
              </div>
            </div>

            <div className="text-lg sm:text-xl font-bold leading-relaxed whitespace-pre-wrap">
              {message}
            </div>

            {showTechnicalCode && correlationId && (
              <div className="rounded-xl bg-white/75 px-4 py-3 text-base font-mono">
                Mã tra cứu: {correlationId}
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 border-t border-black/10 pt-4">
            {actionButton && (
              <div className="flex flex-wrap gap-2">
                {actionButton}
              </div>
            )}

            {onClose && (
              <button
                type="button"
                onClick={handleDismiss}
                className="min-h-[48px] h-12 px-6 rounded-xl font-bold text-base whitespace-nowrap bg-slate-900 text-white hover:bg-slate-800 shadow-md transition-colors focus:ring-4 focus:ring-slate-400 focus:outline-none"
              >
                Đã hiểu
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const bannerCard = (
    <div
      className={`flex flex-col gap-4 p-4 sm:p-5 rounded-2xl border-2 shadow-sm ${
        mode === 'modal' ? 'mb-0 max-w-lg w-full shadow-2xl' : 'mb-6'
      } ${bgMap[type] || bgMap.info}`}
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 pt-0.5">
          {iconMap[type] || iconMap.info}
        </div>

        <div className="flex-grow space-y-2">
          <h3 className="text-lg font-bold leading-snug">
            {resolvedTitle}
          </h3>

          <div className="text-base font-medium leading-relaxed whitespace-pre-wrap">
            {message}
          </div>

          {showTechnicalCode && correlationId && (
            <div className="text-sm opacity-80 font-mono pt-1">
              Mã tra cứu: {correlationId}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-black/10 pt-3">
        <AudioHelpButton
          text={spokenText}
          label="Nghe thông báo"
          variant="soft"
        />

        {actionButton && (
          <div className="flex flex-wrap gap-2">
            {actionButton}
          </div>
        )}

        {onClose && (
          <button
            type="button"
            onClick={handleDismiss}
            className="min-h-[48px] h-12 px-5 rounded-xl font-bold text-base whitespace-nowrap bg-slate-900 text-white hover:bg-slate-800 transition-colors focus:ring-2 focus:ring-offset-2 focus:outline-none"
          >
            Đã hiểu
          </button>
        )}
      </div>
    </div>
  );

  if (mode === 'modal') {
    return (
      <div
        className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md"
        role="dialog"
        aria-modal="true"
      >
        {bannerCard}
      </div>
    );
  }

  return bannerCard;
}
