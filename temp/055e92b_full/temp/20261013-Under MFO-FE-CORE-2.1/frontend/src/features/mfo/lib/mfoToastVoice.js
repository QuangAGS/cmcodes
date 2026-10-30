/**
 * PATH       : frontend/src/features/mfo/lib/mfoToastVoice.js
 * DATETIME   : 2026-10-10T07:40:00+07:00
 * VERSION    : 1.0.0-ELDER-TOAST-VOICE
 * DESCRIPTION: Toast kèm đọc tiếng Việt. Không tự đọc lúc render.
 */
import { toast } from 'sonner';

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

function say(kind, text) {
  toast[kind](text);
  speak(text);
}

export const mfoToast = {
  success: (text) => say('success', text),
  error: (text) => say('error', text),
  warning: (text) => say('warning', text),
  info: (text) => say('info', text),
};

export default mfoToast;
