/**
 * PATH       : frontend/src/features/mfo/api/mfoApi.js
 * DATETIME   : 2026-09-24T13:15:00+07:00
 * VERSION    : 1.1.0-W1
 * DESCRIPTION: Cửa /api/mfo — PLAN + 6 lệnh xưởng. Không abort (B1).
 *              Lỗi để trang gọi toMfoUserMessage.
 */

import apiClient from '../../../lib/apiClient.js';

export function listMyPlans(params = {}) {
  return apiClient.get('/mfo/plans', { params: { mine: 1, ...params } });
}

export function listAdminPlans(params = {}) {
  return apiClient.get('/mfo/plans', { params: { ...params } });
}

export function approvePlan(id, body = {}) {
  return apiClient.post(`/mfo/plans/${id}/approve`, body);
}

export function rejectPlan(id, body = {}) {
  return apiClient.post(`/mfo/plans/${id}/reject`, body);
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

/** Cây theo gốc — cửa GFL khi đã có sổ. */
export function getOriginTree(originId) {
  return apiClient.get(`/mfo/origins/${originId}/tree`);
}

export function createMemberInPlan(planId, body) {
  return apiClient.post(`/mfo/plans/${planId}/members`, body);
}

export function patchMemberInPlan(planId, memberId, body) {
  const b = { ...(body || {}) };
  delete b.gender;
  delete b.is_alive;
  delete b.phone;
  delete b.phone_number;
  delete b.email;
  return apiClient.patch(`/mfo/plans/${planId}/members/${memberId}`, b);
}

export function deleteMemberInPlan(planId, memberId) {
  return apiClient.delete(`/mfo/plans/${planId}/members/${memberId}`);
}

export function createSpouseInPlan(planId, body) {
  return apiClient.post(`/mfo/plans/${planId}/spouses`, body);
}

export function linkFounder(planId, body) {
  return apiClient.patch(`/mfo/plans/${planId}/founder`, body);
}

export function submitResult(planId, body = {}) {
  return apiClient.post(`/mfo/plans/${planId}/result`, body);
}

export function approveResult(id, body = {}) {
  return apiClient.post(`/mfo/plans/${id}/result/approve`, body);
}

export function rejectResult(id, body = {}) {
  return apiClient.post(`/mfo/plans/${id}/result/reject`, body);
}
