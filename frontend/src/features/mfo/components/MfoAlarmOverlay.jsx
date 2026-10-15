/**
 * PATH       : frontend/src/features/mfo/components/MfoAlarmOverlay.jsx
 * DATETIME   : 2026-10-14T21:55:00+07:00
 * VERSION    : 3.6.0-FIX-TTS-VOICE-SPEAKER
 * DESCRIPTION:
 * - Vá dứt điểm lỗi Alarm không đọc tiếng cho EU nghe.
 * - Bổ sung Fallback TTS Reader cho cả Local Instance & Host Instance.
 * - Tự động nhận diện Voice Pack tiếng Việt hoặc giọng mặc định của trình duyệt.
 * RULE COMPLIANCE:
 * - Q1 (Bảo tồn): Giữ nguyên interface props, queue store integration, accessibility focus lock, portal.
 * - Q2 (Code Format): Đầy đủ docstring header và chú thích thời gian <2026-10-14T21:55:00+07:00>.
 */

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { XCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { enqueueMfoAlarm, claimMfoAlarmSpeech } from '../lib/mfoAlarmStore.js';

// <2026-10-14T21:55:00+07:00> Hàm trợ lý phát giọng đọc an toàn cho Web Speech API
function speakTextForEU(textToSpeak) {
  if (typeof window === 'undefined' || !window.speechSynthesis || !textToSpeak) return;

  try {
    window.speechSynthesis.cancel(); // Dừng câu đọc cũ nếu có

    const utterance = new window.SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = 'vi-VN';
    utterance.rate = 0.90; // Tốc độ thong thả cho người lớn tuổi
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices?.() || [];
    const viVoice = voices.find((v) => String(v.lang).toLowerCase().startsWith('vi'));
    if (viVoice) {
      utterance.voice = viVoice;
    }

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('[MFO_ALARM_TTS_SPEAKER_ERROR]', err);
  }
}

export default function MfoAlarmOverlay({
  open,
  message,
  type = 'INFO',
  code,
  onClose,
  host = false,
  alarmId
}) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const closeButtonRef = useRef(null);

  // <2026-10-14T21:55:00+07:00> Local Instance: Đẩy vào Queue & Kích hoạt Fallback TTS phát tiếng trực tiếp
  useEffect(() => {
    if (host || !open || !message) return undefined;

    // Phát tiếng trực tiếp ở Local Instance nếu không dùng Host Queue
    speakTextForEU(message);

    return enqueueMfoAlarm(message, { type, code, onClose: () => closeRef.current?.() });
  }, [host, open, message, type, code]);

  // <2026-10-14T21:55:00+07:00> Host Instance: Quản lý phát giọng nói 1 lần duy nhất từ Queue Store
  useEffect(() => {
    if (!host || !open || !message) return undefined;

    const timer = setTimeout(() => {
      if (alarmId && !claimMfoAlarmSpeech(alarmId)) return;
      speakTextForEU(message);
    }, 50);

    return () => {
      clearTimeout(timer);
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, [host, open, message, alarmId]);

  // Host Instance: Quản lý Focus Lock & Khóa Scroll Body cho Elder User
  useEffect(() => {
    if (!host || !open || typeof document === 'undefined') return undefined;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current?.();
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        closeButtonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus?.();
    };
  }, [host, open, alarmId]);

  if (!host || !open || typeof document === 'undefined') return null;

  // Cấu hình Ma trận Định tính Visual Identity cao cấp
  const visualConfig = {
    ERROR: {
      title: 'CẢNH BÁO LỖI',
      icon: XCircle,
      iconColor: 'text-rose-600',
      iconBg: 'bg-rose-50 border-rose-200/80 shadow-rose-100',
      badgeBg: 'bg-rose-100/80 text-rose-950 border-rose-300',
      btnBg: 'bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white shadow-lg shadow-rose-200',
      ringColor: 'focus:ring-rose-200',
    },
    WARN: {
      title: 'LƯU Ý CẦN KIỂM TRA',
      icon: AlertTriangle,
      iconColor: 'text-amber-600',
      iconBg: 'bg-amber-50 border-amber-200/80 shadow-amber-100',
      badgeBg: 'bg-amber-100/80 text-amber-950 border-amber-300',
      btnBg: 'bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white shadow-lg shadow-amber-200',
      ringColor: 'focus:ring-amber-200',
    },
    SUCCESS: {
      title: 'THAO TÁC THÀNH CÔNG',
      icon: CheckCircle2,
      iconColor: 'text-emerald-600',
      iconBg: 'bg-emerald-50 border-emerald-200/80 shadow-emerald-100',
      badgeBg: 'bg-emerald-100/80 text-emerald-950 border-emerald-300',
      btnBg: 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-lg shadow-emerald-200',
      ringColor: 'focus:ring-emerald-200',
    },
    INFO: {
      title: 'THÔNG BÁO HƯỚNG DẪN',
      icon: Info,
      iconColor: 'text-indigo-600',
      iconBg: 'bg-indigo-50 border-indigo-200/80 shadow-indigo-100',
      badgeBg: 'bg-indigo-100/80 text-indigo-950 border-indigo-300',
      btnBg: 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white shadow-lg shadow-indigo-200',
      ringColor: 'focus:ring-indigo-200',
    },
  };

  const config = visualConfig[type] || visualConfig.INFO;
  const IconComponent = config.icon;

  return createPortal(
    <div className="fixed inset-0 z-[2147483647] grid place-items-center bg-slate-950/60 backdrop-blur-md p-4 select-none animate-in fade-in duration-200">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mfo-alarm-message"
        className="flex max-h-[85dvh] min-h-[260px] w-[calc(100%-2rem)] max-w-[380px] sm:max-w-[420px] flex-col justify-between rounded-[2.25rem] bg-white p-5 sm:p-6 shadow-2xl border border-slate-100/80 animate-in zoom-in-95 duration-200"
      >
        {/* HEADER: ICON VÀ BADGE TRẠNG THÁI */}
        <div className="flex flex-col items-center text-center space-y-2.5 pt-1 shrink-0">
          <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full border-2 flex items-center justify-center shadow-md ${config.iconBg}`}>
            <IconComponent className={`w-8 h-8 sm:w-9 sm:h-9 ${config.iconColor}`} />
          </div>

          <span className={`px-4 py-1 rounded-full text-[11px] font-black uppercase tracking-wider border shadow-sm ${config.badgeBg}`}>
            {config.title}
          </span>

          {code && (
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest -mt-1">
              MÃ: {code}
            </span>
          )}
        </div>

        {/* BODY: KHU VỰC CHỮ AN TOÀN CHỐNG TRÀN VỚI THANH CUỘN MỀM */}
        <div className="my-3 flex-1 min-h-0 overflow-y-auto px-2 py-1 text-center scrollbar-thin scrollbar-thumb-slate-200">
          <p
            id="mfo-alarm-message"
            className="whitespace-pre-wrap break-words text-base sm:text-lg font-black text-slate-900 leading-relaxed tracking-tight"
          >
            {message}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => speakTextForEU(message)}
            className="min-h-[52px] flex-1 rounded-2xl border border-slate-300 bg-white font-black text-base text-slate-800"
          >
            Nghe lại
          </button>
          <button
          ref={closeButtonRef}
          type="button"
          onClick={() => {
            if (typeof window !== 'undefined' && window.speechSynthesis) {
              window.speechSynthesis.cancel(); // Tắt tiếng khi bấm đóng
            }
            onClose?.();
          }}
          className={`min-h-[52px] flex-1 rounded-2xl font-black text-base uppercase tracking-wider transition-all active:scale-[0.98] outline-none focus:ring-4 ${config.ringColor} ${config.btnBg}`}
        >
          Đóng
        </button>
        </div>
      </div>
    </div>,
    document.body
  );
}