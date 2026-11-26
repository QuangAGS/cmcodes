/**
 * PATH       : src/lib/apiClient.js
 * DATETIME   : 2026-11-26T09:10:00+07:00
 * VERSION    : 14.5.0-PHASE1-CANONICAL-REDIRECT
 * DESCRIPTION: Chuẩn hóa axios instance cho Gia Phả Số.
 *              Bổ sung gắn canonical redirect interceptor (FE-03).
 * CHANG LOGS:
 *             - FE-03: gắn interceptor canonical redirect.
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

import axios from 'axios';
import { PHASE2_ERROR_MAP } from '../features/onboarding/constants/phase2ErrorMap';
import { attachCanonicalRedirectInterceptor } from './canonicalRedirectInterceptor';

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

// FE-03: gắn interceptor canonical redirect
attachCanonicalRedirectInterceptor(apiClient);

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

export { apiClient };
export default apiClient;
