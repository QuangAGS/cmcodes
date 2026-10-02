/**
 * PATH       : frontend/src/features/mfo/api/mfoApi.js
 * DATETIME   : 2026-10-01T17:00:00+07:00
 * VERSION    : 1.0.0-COMPLETE-5L-CANVAS
 * DESCRIPTION: API Client MFO 5L với hàm parse k an toàn (chấp nhận 0..4).
 * REFERENCE  : Technical Spec MFO (5L) v1.1.0-MFO-CANONICAL
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

export function listBookMembers() {
  return apiClient.get('/members', { params: { status: 'CHINH_THUC' } });
}

export function searchBookMembers(q) {
  return listBookMembers();
}

export function getMember(id) {
  return apiClient.get(`/members/${id}`);
}

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

export function abortPlan(id, body = {}) {
  return apiClient.post(`/mfo/plans/${id}/abort`, body);
}

export function adminPatchMember(memberId, body = {}) {
  const b = { ...(body || {}) };
  delete b.gender;
  delete b.is_alive;
  delete b.phone;
  delete b.phone_number;
  delete b.email;
  return apiClient.put(`/members/${memberId}`, b);
}

export function adminCreateMember(body = {}) {
  return apiClient.post('/members', body);
}

function parseK(k) {
  const num = Number(k);
  if (Number.isFinite(num) && num >= 0 && num <= 4) {
    return Math.floor(num);
  }
  return 0;
}

export async function getFullMfoSet(targetMemberId, k = 0) {
  const selectedDepth = parseK(k);
  return apiClient.get(`/mfo/origins/${encodeURIComponent(targetMemberId)}/full-set`, {
    params: { k: selectedDepth },
  });
}