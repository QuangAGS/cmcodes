/**
 * PATH       : src/lib/apiClient.js
 * DATETIME   : 2026-11-11T12:12:00+07:00
 * VERSION    : 14.3.0-MULTIHOME-TOKEN-SYNC
 * DESCRIPTION: Axios Instance tập trung:
 *              - Đọc song song auth_token / token.
 *              - Tự động xóa phiên và đưa về /auth?mode=login khi gặp HTTP 401.
 */

import axios from 'axios';

const API_REQUEST_TIMEOUT = 30000;

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:10000/api',
  timeout: API_REQUEST_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use(
  (config) => {
    const token =
      localStorage.getItem('auth_token') ||
      localStorage.getItem('token');

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

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

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    if (status === 401) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('token');
      localStorage.removeItem('active_context');
      localStorage.removeItem('tenantId');

      if (
        !window.location.pathname.includes('/auth') &&
        !window.location.pathname.includes('/login')
      ) {
        window.location.href = '/auth?mode=login';
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;
