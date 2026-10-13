/**
 * PATH       : src/features/mfo/components/MfoAlarmOverlay.jsx
 * DATETIME   : 2026-10-13T10:35:00+07:00
 * VERSION    : 3.0.0-LAT1-ALARM
 * DESCRIPTION: Alarm giữa màn. Một lần đọc. Nút Đóng.
 */
import { useEffect } from 'react';

/**
 * <2026-10-13T10:35:00+07:00>
 * Purpose: Hiện một câu cho người dùng. Không tự viết câu.
 */
export default function MfoAlarmOverlay({ open, message, onClose }) {
  useEffect(() => {
    if (!open || !message || !window.speechSynthesis) return undefined;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(message));
    return () => window.speechSynthesis.cancel();
  }, [open, message]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-xl">
        <p className="text-lg font-bold text-slate-900">{message}</p>
        <button type="button" onClick={onClose} className="mt-4 min-h-[48px] w-full rounded-2xl bg-indigo-700 font-bold text-white">
          Đóng
        </button>
      </div>
    </div>
  );
}
