/**
 * PATH       : src/lib/apiClient.js
 * DATETIME   : 2026-09-28T08:00:00+07:00
 * VERSION    : 14.2.0-AUTH-INTERCEPTOR
 * DESCRIPTION: Chuẩn hóa axios instance cho frontend auth.
 *              - Bổ sung Response Interceptor tự động xử lý khi gặp lỗi HTTP 401 (UNAUTHORIZED).
 * REFERENCE  : Rule applied to AI_3.md & SSOT BFA
 */

import axios from 'axios';

const API_REQUEST_TIMEOUT = 30000;

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
    const token = localStorage.getItem('token');

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
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
 * <2026-09-28T08:00:00+07:00>
 * Purpose: Bắt lỗi 401 tập trung. Nếu Token hết hạn hoặc thiếu Token, tự động xóa Token
 *          và chuyển hướng về trang đăng nhập để không gửi thêm request rác.
 */
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    if (status === 401) {
      // Dọn dẹp phiên làm việc hết hạn
      localStorage.removeItem('token');
      localStorage.removeItem('tenantId');
      
      // Chuyển hướng người dùng về màn hình xác thực nếu không ở trang login
      if (!window.location.pathname.includes('/auth') && !window.location.pathname.includes('/login')) {
        window.location.href = '/auth?mode=login';
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;
