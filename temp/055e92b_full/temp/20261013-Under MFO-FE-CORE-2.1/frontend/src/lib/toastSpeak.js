/**
 * PATH       : src/lib/toastSpeak.js
 * DATETIME   : 2026-09-04T07:55:00+07:00
 * VERSION    : 1.0.0-M05
 * DESCRIPTION: Toast + đọc nội dung (Elder Support). Lỗi và thành công đều đọc.
 */

import { toast } from 'sonner';

function speakVi(message) {
  const text = String(message || '').trim();
  if (!text || typeof window === 'undefined') return;
  if (!('speechSynthesis' in window) || typeof window.SpeechSynthesisUtterance === 'undefined') {
    return;
  }
  try {
    window.speechSynthesis.cancel();
    const u = new window.SpeechSynthesisUtterance(text);
    u.lang = 'vi-VN';
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  } catch (_) {
    /* ignore */
  }
}

export function toastSpeak(kind, message) {
  const text = String(message || '').trim() || 'Có thông báo.';
  if (kind === 'error') toast.error(text);
  else toast.success(text);
  speakVi(text);
}
