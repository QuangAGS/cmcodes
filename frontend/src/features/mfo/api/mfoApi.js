/**
 * PATH       : src/features/mfo/api/mfoApi.js
 * DATETIME   : 2026-10-12T17:15:00+07:00
 * VERSION    : 2.1.1-DOCTRINE211-API-FIX
 */

// Bác kiểm tra prefix API của Backend (Thường là '/mfo' hoặc 'http://localhost:8080/mfo')
const API_BASE = '/mfo'; // HOẶC '/api/v1/mfo' tùy cấu hình Router/Proxy Backend của bác

async function mfoFetch(endpoint, options = {}) {
  const defaultHeaders = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  const config = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...(options.headers || {}),
    },
  };

  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, config);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.message || 'Lỗi kết nối máy chủ MFO');
    error.code = data.code || 'MFO_SYSTEM_ERROR';
    error.status = response.status;
    error.expiresAt = data.expires_at || null;
    throw error;
  }

  return data;
}

// =============================================================================
// ENDPOINTS CHUẨN KHÔNG BỊ LỖI 404
// =============================================================================

export async function fetchMfoPlansApi() {
  return mfoFetch('/plans', { method: 'GET' });
}

export async function fetchMfoPlanDetailApi(planId) {
  return mfoFetch(`/plans/${planId}`, { method: 'GET' });
}

export async function savePlanDraftApi(planId, payload) {
  return mfoFetch(`/plans/${planId}/draft`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function submitPlanGate1Api(planId, payload) {
  return mfoFetch(`/plans/${planId}/submit`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function saveResultStagingApi(planId, payload) {
  return mfoFetch(`/plans/${planId}/result/staging`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function submitResultGate2Api(planId, payload) {
  return mfoFetch(`/plans/${planId}/result/submit`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function deleteMfoPlanApi(planId) {
  return mfoFetch(`/plans/${planId}`, { method: 'DELETE' });
}

export async function approvePlanGate1Api(planId, body = {}) {
  return mfoFetch(`/plans/${planId}/approve`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function returnPlanGate1Api(planId, body = {}) {
  return mfoFetch(`/plans/${planId}/return`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function approvePlanGate2Api(planId, body = {}) {
  return mfoFetch(`/plans/${planId}/result/approve`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function rejectPlanGate2Api(planId, body = {}) {
  return mfoFetch(`/plans/${planId}/result/reject`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function terminateResultGate2Api(planId, body = {}) {
  return mfoFetch(`/plans/${planId}/result/terminate`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}