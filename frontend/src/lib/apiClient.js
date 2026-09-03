/**
 * PPATH      : src/lib/apiClient.js
 * OLD PATH   : src/lib/axios.js
 * DATETIME   : 2026-09-02T22:30:00+07:00
 * VERSION    : 14.1.0-FORMDATA
 * DESCRIPTION:
 * - Chuẩn hóa axios instance cho frontend auth.
 * - FormData: xóa Content-Type mặc định để browser gắn boundary (multer).
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

apiClient.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(error)
);

export default apiClient;
