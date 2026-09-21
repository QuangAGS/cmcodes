/**
 * PATH       : frontend/src/features/mfo/api/mfoApi.js
 * DATETIME   : 2026-09-20T10:50:00+07:00
 * VERSION    : 1.0.0-C1
 * DESCRIPTION: Cửa /api/mfo — C1 chỉ POST/GET plans.
 *              Lỗi để trang gọi toMfoUserMessage.
 */

import apiClient from '../../../lib/apiClient.js';

export function listMyPlans(params = {}) {
  return apiClient.get('/mfo/plans', { params: { mine: 1, ...params } });
}

export function getPlan(id) {
  return apiClient.get(`/mfo/plans/${id}`);
}

export function createPlan(body) {
  return apiClient.post('/mfo/plans', body);
}

/** BE GET /members không nhận q — lấy sổ CHINH_THUC, FE lọc tên. */
export function listBookMembers() {
  return apiClient.get('/members', { params: { status: 'CHINH_THUC' } });
}

export function searchBookMembers(q) {
  return listBookMembers();
}

export function getMember(id) {
  return apiClient.get(`/members/${id}`);
}
