/**
 * =============================================================================
 * PATH       : src/lib/apiClient.js
 * DATETIME   : 2026-11-20T08:20:00+07:00
 * VERSION    : 14.4.1-PHASE2-ISO29148-PROXY-SYNC
 * DESCRIPTION: Chuẩn hóa axios instance cho Gia Phả Số:
 *              - Đồng bộ baseURL với vite.config.js proxy ('/api' -> http://localhost:10000),
 *                ưu tiên VITE_API_URL / VITE_API_BASE_URL nếu cấu hình riêng.
 *              - Đọc token từ 'auth_token' || 'token', tôn trọng Authorization: ''
 *                cho API công khai, xử lý FormData multipart và dọn phiên 401.
 *              - Trích xuất 'x-correlation-id' [ARCH-02, TC-FE-08] và ánh xạ mã lỗi
 *                thân thiện qua PHASE2_ERROR_MAP trên chính đối tượng lỗi Axios
 *                (bảo toàn error.response cho AuthContext và các màn hình hiện hành).
 * =============================================================================
 * CHANGELOGS:
 * - 14.2.0-AUTH-INTERCEPTOR (2026-09-28): Interceptor 401, chỉ xóa token.
 * - 2026-11-11T22:30:00+07:00 (v14.3.0-AUTH-SESSION-CLEAR-BOTH-KEYS):
 *   + Đọc auth_token trước, fallback token.
 *   + Bỏ qua gắn token cho endpoint xác thực công khai.
 *   + 401 xóa cả hai key token và active_context.
 * - 1.1.0-ISO29148 (2026-11-19T17:00:00+07:00):
 *   + HTTP Interceptor bắt lỗi và trích xuất X-Correlation-Id chuẩn Phase 2.S.
 * - 2026-11-20T08:15:00+07:00 (v14.4.0-PHASE2-ISO29148-UAT-BUG2-FIX):
 *   + Khôi phục đọc token auth_token || token, FormData, 401 và error.response.
 * - 2026-11-20T08:20:00+07:00 (v14.4.1-PHASE2-ISO29148-PROXY-SYNC):
 *   + Đồng bộ baseURL mặc định về '/api' để đi qua proxy của vite.config.js
 *     (tránh CORS với custom headers X-Turnstile-Token & X-Correlation-Id).
 * =============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

import axios from 'axios';
import { PHASE2_ERROR_MAP } from '../features/onboarding/constants/phase2ErrorMap';

const API_REQUEST_TIMEOUT = 30000;

const apiClient = axios.create({
  baseURL:
    import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_API_BASE_URL ||
    '/api',

  timeout: API_REQUEST_TIMEOUT,

  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use(
  (config) => {
    const hasExplicitEmptyAuth =
      config.headers &&
      Object.prototype.hasOwnProperty.call(config.headers, 'Authorization') &&
      config.headers.Authorization === '';

    if (hasExplicitEmptyAuth) {
      if (typeof config.headers.delete === 'function') {
        config.headers.delete('Authorization');
      } else {
        delete config.headers.Authorization;
        delete config.headers.authorization;
      }
    } else {
      const token =
        localStorage.getItem('auth_token') ||
        localStorage.getItem('token');

      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }

    /* Logo tenant + avatar /me: không ép application/json lên multipart */
    if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
      if (config.headers && typeof config.headers.delete === 'function') {
        config.headers.delete('Content-Type');
      } else if (config.headers) {
        delete config.headers['Content-Type'];
        delete config.headers['content-type'];
      }
    }

    return config;
  },
  (error) => Promise.reject(error)
);

/**
 * <2026-09-28T08:00:00+07:00> & <2026-11-20T08:20:00+07:00>
 * Purpose:
 * - Trích xuất X-Correlation-Id cho cả response thành công và lỗi [ARCH-02, TC-FE-08].
 * - Bắt lỗi 401 tập trung: dọn sạch phiên hết hạn và chuyển hướng về /auth?mode=login.
 * - Ánh xạ thông điệp lỗi Phase 2 thân thiện (PHASE2_ERROR_MAP) nhưng vẫn bảo toàn
 *   error.response nguyên bản để không phá vỡ AuthContext / các form hiện có.
 */
apiClient.interceptors.response.use(
  (response) => {
    const correlationId = response.headers?.['x-correlation-id'] || null;
    if (correlationId && response.data && typeof response.data === 'object') {
      response.data._correlationId = correlationId;
    }
    return response;
  },
  (error) => {
    const response = error?.response;
    const status = response?.status;

    if (status === 401) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('token');
      localStorage.removeItem('active_context');
      localStorage.removeItem('tenantId');

      if (
        typeof window !== 'undefined' &&
        !window.location.pathname.includes('/auth') &&
        !window.location.pathname.includes('/login')
      ) {
        window.location.href = '/auth?mode=login';
      }
    }

    if (response) {
      const correlationId = response.headers?.['x-correlation-id'] || null;
      const data = response.data && typeof response.data === 'object' ? response.data : {};
      const code = data.code || 'UNKNOWN_ERROR';
      const mappedInfo = PHASE2_ERROR_MAP[code];

      error.isApiError = true;
      error.statusCode = status;
      error.code = code;
      error.correlationId = correlationId;
      error.details = data.details || null;
      error.mappedAction = mappedInfo?.action || null;

      if (mappedInfo?.message) {
        error.message = mappedInfo.message;
        if (response.data && typeof response.data === 'object') {
          response.data.message = mappedInfo.message;
        }
      } else if (data.message) {
        error.message = data.message;
      }
    } else if (error?.request) {
      error.isApiError = true;
      error.statusCode = 0;
      error.code = 'NETWORK_ERROR';
      error.correlationId = null;
      error.message = 'Mất kết nối mạng. Bác vui lòng kiểm tra lại 4G/Wifi.';
    }

    return Promise.reject(error);
  }
);

export default apiClient;
