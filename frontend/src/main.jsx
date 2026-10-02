/**
 * PATH       : src/main.jsx
 * DATETIME   : 2026-05-11T00:00:00+07:00
 * VERSION    : 12.8.5
 * DESCRIPTION:
 * - Sprint 2.1: Bọc toàn bộ App bằng TtsProvider.
 * - Không thay đổi App, routing, auth logic, UI/UX hiện có.
 * - Bổ sung Frontend Accessibility Layer cho TTS.
 * - Tuân thủ Q1/Q2.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// ============================================================================
// GLOBAL PATCH DEBUG: Chống sập trắng trang do lỗi "Cannot convert object to primitive value"
// Bọc an toàn hàm String() toàn cục trước khi bất kỳ Component/Provider nào khởi tạo.
// ============================================================================
if (typeof window !== 'undefined' && !window.__GLOBAL_STRING_PATCHED__) {
  window.__GLOBAL_STRING_PATCHED__ = true;
  const originalString = window.String;
  window.String = function (val) {
    try {
      return originalString(val);
    } catch (e) {
      if (val && typeof val === 'object') {
        try {
          return JSON.stringify(val);
        } catch (jsonErr) {
          return '[Unconvertible Object]';
        }
      }
      return '[Primitive Conversion Failure]';
    }
  };
}

/**
 * <2026-05-11T00:00:00+07:00>
 * Import TtsProvider:
 * - Provider frontend-only cho Text-to-Speech.
 * - Không phụ thuộc backend, database, Prisma hay Supabase.
 */
import { TtsProvider } from './features/elder-doctrine/components/TtsProvider.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <TtsProvider>
      <App />
    </TtsProvider>
  </React.StrictMode>
);
