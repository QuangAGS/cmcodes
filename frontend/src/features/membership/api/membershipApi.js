/**
 * =============================================================================
 * PATH        : frontend/src/features/membership/api/membershipApi.js
 * DATETIME    : 2026-11-10T15:55:00+07:00
 * VERSION     : 1.1.0-MEMBERSHIP-API-MAP-TO-EXISTING-BE
 * DESCRIPTION : HTTP Client cho phân hệ Membership & Multi-Home.
 *               Map các hàm FE sang đúng endpoint Backend hiện có
 *               (không còn gọi /membership/* chưa tồn tại).
 * =============================================================================
 * CHANGELOGS:
 * - 2026-11-10T15:02:00+07:00 (v1.0.2-MEMBERSHIP-API-REMOVE-DOUBLE-PREFIX):
 *   + Loại bỏ prefix '/api' trùng lặp.
 * - 2026-11-10T15:55:00+07:00 (v1.1.0-MEMBERSHIP-API-MAP-TO-EXISTING-BE):
 *   + Map getMembershipStatus → GET /onboarding/my-op.
 *   + Map submitClaim → POST /onboarding/cases.
 *   + Map reopenCase → POST /onboarding/cases/:caseId/reopen.
 *   + Map submitRevision → POST /onboarding/cases/:caseId/revision.
 *   + Chuẩn hóa QX (Q1–Q4).
 * =============================================================================
 */

import apiClient from '../../../lib/apiClient';

export const membershipApi = {
  /**
   * Lấy danh sách dòng họ liên kết của user hiện tại.
   * BE: GET /api/auth/available-clans
   * @returns {Promise<{status: string, data: Array, message: string}>}
   */
  getMyClans: async () => {
    const response = await apiClient.get('/auth/available-clans');
    return response.data;
  },

  /**
   * Chuyển ngữ cảnh sang tenant khác.
   * BE: POST /api/auth/switch-context
   * @param {string} targetTenantId
   * @returns {Promise<object>}
   */
  switchContext: async (targetTenantId) => {
    const response = await apiClient.post('/auth/switch-context', {
      targetTenantId,
    });
    return response.data;
  },

  /**
   * Lấy trạng thái hồ sơ / Onboarding Case hiện tại.
   * BE: GET /api/onboarding/my-op
   * @returns {Promise<object>}
   */
  getMembershipStatus: async () => {
    const response = await apiClient.get('/onboarding/my-op');
    return response.data;
  },

  /**
   * Nộp hồ sơ Claim / tạo case mới.
   * BE: POST /api/onboarding/cases
   * @param {object} payload
   * @returns {Promise<object>}
   */
  submitClaim: async (payload) => {
    const response = await apiClient.post('/onboarding/cases', payload);
    return response.data;
  },

  /**
   * Nộp lại hồ sơ khi bị yêu cầu bổ sung (NEEDS_REVISION).
   * BE: POST /api/onboarding/cases/:caseId/revision
   * @param {string} caseId
   * @param {object} payload
   * @returns {Promise<object>}
   */
  submitRevision: async (caseId, payload) => {
    const response = await apiClient.post(`/onboarding/cases/${caseId}/revision`, payload);
    return response.data;
  },

  /**
   * Mở lại hồ sơ bị từ chối mềm (soft rejection).
   * BE: POST /api/onboarding/cases/:caseId/reopen
   * @param {string} caseId
   * @returns {Promise<object>}
   */
  reopenCase: async (caseId) => {
    const response = await apiClient.post(`/onboarding/cases/${caseId}/reopen`);
    return response.data;
  },
};
