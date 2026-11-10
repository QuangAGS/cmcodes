/**
 * =============================================================================
 * PATH        : frontend/src/features/membership/api/membershipApi.js
 * DATETIME    : 2026-11-10T15:02:00+07:00
 * VERSION     : 1.0.2-MEMBERSHIP-API-REMOVE-DOUBLE-PREFIX
 * DESCRIPTION : HTTP Client cho phân hệ Membership & Multi-Home.
 *               Chuẩn hóa loại bỏ tiền tố '/api' trùng lặp khi gọi qua apiClient.
 * =============================================================================
 * CHANGELOGS:
 * - 2026-11-10T14:23:00+07:00 (v1.0.1-MEMBERSHIP-API-FIX-IMPORT):
 *   + Sửa import apiClient về ../../../lib/apiClient.
 * - 2026-11-10T15:02:00+07:00 (v1.0.2-MEMBERSHIP-API-REMOVE-DOUBLE-PREFIX):
 *   + Loại bỏ prefix '/api' ở tất cả các path để tránh lỗi 404.
 * =============================================================================
 */

import apiClient from '../../../lib/apiClient';

export const membershipApi = {
  getMyClans: async () => {
    const response = await apiClient.get('/auth/available-clans');
    return response.data;
  },

  switchContext: async (targetTenantId) => {
    const response = await apiClient.post('/auth/switch-context', {
      targetTenantId,
    });
    return response.data;
  },

  getMembershipStatus: async () => {
    const response = await apiClient.get('/membership/status');
    return response.data;
  },

  submitClaim: async (payload) => {
    const response = await apiClient.post('/membership/claim', payload);
    return response.data;
  },

  submitRevision: async (caseId, payload) => {
    const response = await apiClient.post(`/onboarding/cases/${caseId}/revision`, payload);
    return response.data;
  },

  reopenCase: async (userId) => {
    const response = await apiClient.post('/onboarding/reopen', { userId });
    return response.data;
  },
};