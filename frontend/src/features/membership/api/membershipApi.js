/**
 * =============================================================================
 * PATH        : frontend/src/features/membership/api/membershipApi.js
 * DATETIME    : 2026-11-13T10:45:00+07:00
 * VERSION     : 1.3.0-MULTIHOME-AMEND02-V15-LAT3-LAT4
 * DESCRIPTION : HTTP Client cho phân hệ Membership & Multi-Home (C1 & C1-S).
 *               - getMyClans -> GET /auth/available-clans
 *               - switchContext -> POST /auth/switch-context
 *               - getMembershipStatus -> GET /membership/status (fallback /onboarding/my-op)
 *               - submitClaim (C1) -> POST /membership/cases
 *               - submitClanSetup (C1-S) -> POST /membership/clan-setup
 *               - submitRevision -> POST /membership/cases/:caseId/revision
 *               - reopenCase -> POST /membership/cases/:caseId/reopen
 *               - approveCase (Admin C1/C1-S) -> POST /membership/cases/:caseId/approve
 *               - returnForRevision (Admin C1/C1-S) -> POST /membership/cases/:caseId/return-revision
 * =============================================================================
 * CHANGELOGS:
 * - 2026-11-10T15:55:00+07:00 (v1.1.0): Map cơ bản sang /onboarding/*.
 * - 2026-11-13T10:00:00+07:00 (v1.2.0): Đấu nối /membership/cases, /clan-setup, /status.
 * - 2026-11-13T10:45:00+07:00 (v1.3.0): Thêm approveCase & returnForRevision cho cổng Admin Lát 4.
 * =============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4.
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

  getMembershipStatus: async ({ caseId = null, tenantId = null } = {}) => {
    const params = {};
    if (caseId) params.caseId = caseId;
    if (tenantId) params.tenantId = tenantId;

    const response = await apiClient.get('/membership/status', { params });
    const payload = response.data?.data ?? response.data;
    if (payload) {
      return payload;
    }

    const fallback = await apiClient.get('/onboarding/my-op');
    return fallback.data?.data ?? fallback.data;
  },

  submitClaim: async (payload) => {
    const response = await apiClient.post('/membership/cases', payload);
    return response.data;
  },

  submitClanSetup: async (payload) => {
    const response = await apiClient.post('/membership/clan-setup', payload);
    return response.data;
  },

  submitRevision: async (caseId, payload) => {
    const response = await apiClient.post(
      `/membership/cases/${encodeURIComponent(caseId)}/revision`,
      payload
    );
    return response.data;
  },

  reopenCase: async (caseId) => {
    const response = await apiClient.post(
      `/membership/cases/${encodeURIComponent(caseId)}/reopen`
    );
    return response.data;
  },

  approveCase: async (caseId, payload) => {
    const response = await apiClient.post(
      `/membership/cases/${encodeURIComponent(caseId)}/approve`,
      payload
    );
    return response.data;
  },

  returnForRevision: async (caseId, payload) => {
    const response = await apiClient.post(
      `/membership/cases/${encodeURIComponent(caseId)}/return-revision`,
      payload
    );
    return response.data;
  },
};
