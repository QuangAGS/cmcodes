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

/**
 * <2026-05-11T00:00:00+07:00>
 * Import TtsProvider:
 * - Provider frontend-only cho Text-to-Speech.
 * - Không phụ thuộc backend, database, Prisma hay Supabase.
 */
import { TtsProvider } from './features/a11y/tts/TtsProvider.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <TtsProvider>
      <App />
    </TtsProvider>
  </React.StrictMode>
);
