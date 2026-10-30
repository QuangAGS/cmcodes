/**
 * PATH       : src/features/mfo/components/alarms/MfoCentralAlarmOverlay.jsx
 * DATETIME   : 2026-10-12T15:20:00+07:00
 * VERSION    : 2.1.1-DOCTRINE211-ALARM
 * DESCRIPTION:
 * - Alarm chiếm 2/3 màn hình, lớp trên cùng. Một alarm tại một thời điểm.
 * - Được tự động đọc 1 lần khi mở qua Web Speech API[cite: 18, 20].
 * - Nút Đóng cao ít nhất 48px cho ngón tay cái Elder[cite: 18, 20].
 * REFERENCE  : MFO-FE-DOCTRINE-2.1 Section 5; Patch Plan 2.1.1 Section 3
 */

import React, { useEffect, useCallback } from 'react';
import { OctagonX, CheckCircle2, AlertTriangle, Info, Volume2, X } from 'lucide-react';
import { resolveMfoErrorMessage, MFO_SUCCESS_ALARM_CATALOG } from '../../constants/mfoUserErrors';

function speakElderText(text) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    if (!text) return;

    const cleanText = String(text)
      .replace(/<[^>]*>/g, '')
      .replace(/[🛑⚠️⏱️🔄💾🚀🎉📑📜🗑️🔒]/g, '')
      .trim();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'vi-VN';
    utterance.rate = 0.88; // Đọc chậm rãi, rõ ràng cho Elder[cite: 18]
    utterance.pitch = 1.0;

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('[ELDER_AUDIO_WARN] SpeechSynthesis failed:', err);
  }
}

export function MfoCentralAlarmOverlay({
  isOpen,
  type = 'ERROR', // 'ERROR' | 'SUCCESS' | 'WARNING' | 'INFO'
  code = null,
  message = null,
  expiresAt = null,
  onClose,
}) {
  let displayMessage = '';

  if (type === 'SUCCESS') {
    displayMessage = MFO_SUCCESS_ALARM_CATALOG[code] || message || 'Thao tác thành công.';
  } else {
    displayMessage = resolveMfoErrorMessage(code, message, expiresAt);
  }

  const handleClose = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (onClose) onClose();
  }, [onClose]);

  useEffect(() => {
    if (isOpen && displayMessage) {
      const timer = setTimeout(() => {
        speakElderText(displayMessage);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isOpen, displayMessage]);

  if (!isOpen) return null;

  let iconComponent = <AlertTriangle className="w-8 h-8 text-amber-600" />;
  let iconBgClass = 'bg-amber-100 text-amber-600';
  let borderColorClass = 'border-amber-400';
  let titleText = 'THÔNG BÁO TỪ HỆ THỐNG';

  if (type === 'ERROR') {
    iconComponent = <OctagonX className="w-8 h-8 text-rose-600" />;
    iconBgClass = 'bg-rose-100 text-rose-600';
    borderColorClass = 'border-rose-500';
    titleText = 'CẢNH BÁO TỪ HỆ THỐNG';
  } else if (type === 'SUCCESS') {
    iconComponent = <CheckCircle2 className="w-8 h-8 text-emerald-600" />;
    iconBgClass = 'bg-emerald-100 text-emerald-600';
    borderColorClass = 'border-emerald-500';
    titleText = 'XÁC NHẬN THÀNH CÔNG';
  } else if (type === 'INFO') {
    iconComponent = <Info className="w-8 h-8 text-indigo-600" />;
    iconBgClass = 'bg-indigo-100 text-indigo-600';
    borderColorClass = 'border-indigo-400';
    titleText = 'THÔNG TIN CHỈ DẪN';
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className={`w-full max-w-[440px] max-h-[70vh] bg-white rounded-3xl p-6 shadow-2xl border-2 ${borderColorClass} flex flex-col justify-between space-y-4`}>
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <span className="text-[11px] font-black uppercase text-slate-400 tracking-wider">
            Thông báo Dòng họ
          </span>
          <button
            type="button"
            onClick={handleClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 min-h-[48px] min-w-[48px] flex items-center justify-center transition-all"
            title="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-3 text-center my-auto overflow-y-auto max-h-[40vh] px-1">
          <div className={`w-16 h-16 rounded-full ${iconBgClass} flex items-center justify-center mx-auto shadow-inner`}>
            {iconComponent}
          </div>

          <h2 className="text-base font-black text-slate-900 tracking-tight">
            {titleText}
          </h2>

          <div className="text-xs font-extrabold text-slate-800 leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-200 shadow-inner">
            {displayMessage}
          </div>
        </div>

        {/* Footer Actions (Touch target >= 48px) */}
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => speakElderText(displayMessage)}
            className="w-full min-h-[48px] bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-98"
          >
            <Volume2 className="w-4 h-4 text-indigo-600" />
            <span>Nghe lại âm thanh</span>
          </button>

          <button
            type="button"
            onClick={handleClose}
            className="w-full min-h-[52px] bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-sm uppercase tracking-wider shadow-lg active:scale-98 transition-all flex items-center justify-center"
          >
            Đóng thông báo
          </button>
        </div>

      </div>
    </div>
  );
}

export default MfoCentralAlarmOverlay;