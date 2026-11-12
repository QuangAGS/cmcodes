/**
 * =============================================================================
 * PATH       : frontend/src/lib/apiClient.js
 * DATETIME   : 2026-11-11T22:30:00+07:00
 * VERSION    : 14.3.0-AUTH-SESSION-CLEAR-BOTH-KEYS
 * DESCRIPTION: Axios instance cho frontend auth.
 *              - Đọc token từ auth_token hoặc token (cùng nguồn với AuthContext).
 *              - Không gắn Authorization lên route công khai (login / register / forgot / reset).
 *              - 401 xóa đủ auth_token, token, active_context, tenantId.
 * =============================================================================
 * CHANGELOGS:
 * - 14.2.0-AUTH-INTERCEPTOR (2026-09-28): Interceptor 401, chỉ xóa token.
 * - 2026-11-11T22:30:00+07:00 (v14.3.0-AUTH-SESSION-CLEAR-BOTH-KEYS):
 *   + Đọc auth_token trước, fallback token.
 *   + Bỏ qua gắn token cho endpoint xác thực công khai.
 *   + 401 xóa cả hai key token và active_context.
 * =============================================================================
 * QX: Tuân thủ chặt chẽ. Không đổi baseURL, timeout, xử lý FormData.
 */

import axios from 'axios';

const API_REQUEST_TIMEOUT = 30000;

const PUBLIC_PATHS = [
  '/auth/login',
  '/auth/register',
  '/auth/check-identity',
  '/auth/forgot-password',
  '/auth/verify-reset-code',
  '/auth/change-password-after-reset',
  '/tenants/search',
  '/public/tenants', // <-- Bổ sung: không gắn token cũ & không redirect 401 khi Guest tra cứu
];

function readStoredToken() {
  return localStorage.getItem('auth_token') || localStorage.getItem('token') || '';
}

function clearStoredSession() {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('token');
  localStorage.removeItem('active_context');
  localStorage.removeItem('tenantId');
}

function isPublicAuthRequest(url) {
  const path = String(url || '');
  // return PUBLIC_AUTH_PATHS.some((item) => path.includes(item)); // Không có biến này
  return PUBLIC_PATHS.some((item) => path.includes(item));
}

const apiClient = axios.create({
  baseURL:
    import.meta.env.VITE_API_URL ||
    'http://localhost:10000/api',

  timeout: API_REQUEST_TIMEOUT,

  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use(
  (config) => {
    if (!isPublicAuthRequest(config.url)) {
      const token = readStoredToken();
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
 * 401: xóa đủ phiên rồi đưa về /auth nếu chưa ở đó.
 * Không redirect khi đang ở /auth hoặc /login để form đăng ký không bị đẩy vòng.
 */
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    if (status === 401) {
      clearStoredSession();
      delete apiClient.defaults.headers.common.Authorization;

      const path = window.location.pathname || '';
      if (!path.includes('/auth') && !path.includes('/login')) {
        window.location.href = '/auth?mode=login';
      }
    }
    return Promise.reject(error);
  }
);

export { clearStoredSession, readStoredToken };
export default apiClient;
