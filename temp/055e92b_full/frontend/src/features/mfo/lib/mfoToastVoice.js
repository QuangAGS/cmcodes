/**
 * PATH       : frontend/src/features/mfo/lib/mfoToastVoice.js
 * DATETIME   : 2026-10-13T19:41:00+07:00
 * VERSION    : 3.2.0-REUSE-REACT-ALARM
 * DESCRIPTION: Giữ exports legacy; chỉ enqueue, renderer/TTS ở MfoAlarmOverlay.
 * RULE       : Q1 giữ UI/API ngoài alarm; Q2 metadata và chú thích thời gian.
 */
/**
 * PATH       : frontend/src/features/mfo/lib/mfoToastVoice.js
 * DATETIME   : 2026-10-10T07:40:00+07:00
 * VERSION    : 1.0.0-ELDER-TOAST-VOICE
 * DESCRIPTION: Toast kèm đọc tiếng Việt. Không tự đọc lúc render.
 */
import { enqueueMfoAlarm } from './mfoAlarmStore.js';

/** <2026-10-13T19:41:00+07:00> Mục đích: Bảo tồn tên hàm legacy; không gọi ở đường say để tránh TTS kép. */
function speak(text) {
  if (typeof window === 'undefined' || !window.speechSynthesis || !text) return;
  const synth = window.speechSynthesis;
  const utterance = new SpeechSynthesisUtterance(String(text));
  utterance.lang = 'vi-VN';
  utterance.rate = 0.92;
  const voice = synth.getVoices().find((item) => item.lang === 'vi-VN' || item.lang.startsWith('vi'));
  if (voice) utterance.voice = voice;
  synth.cancel();
  synth.speak(utterance);
}

/** <2026-10-13T19:41:00+07:00> Mục đích: Giữ API và giá trị trả về undefined; bỏ Sonner, chỉ gửi dữ liệu tới host React. */
function say(kind, text) {
  enqueueMfoAlarm(text, { kind });
}

export const mfoToast = {
  success: (text) => say('success', text),
  error: (text) => say('error', text),
  warning: (text) => say('warning', text),
  info: (text) => say('info', text),
};

export default mfoToast;
