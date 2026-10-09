/**
 * PATH       : frontend/src/features/mfo/api/mfoApi.js
 * DATETIME   : 2026-10-08T09:03:00+07:00
 * VERSION    : 5.0.0-COMPLETE-5L-CANVAS-FULL
 * DESCRIPTION:
 * - Tuân thủ Q1 (Bảo tồn mọi hàm/UI/UX cũ) & Q2 (Code Format & Chú thích đầy đủ).
 * - Bổ sung deleteDraft / deletePlanDraft phục vụ xóa bản nháp DRAFT (DELETE /mfo/plans/:id/draft).
 * - Cung cấp cả alias `listPlans` song song với `listMyPlans` / `listAdminPlans`.
 * - Giữ nguyên toàn bộ các hàm thao tác Sổ họ, Thành viên, Hôn nhân và Admin Review.
 * CHANGELOG  :
 * - 2026-10-08: Thêm deleteDraft, deletePlanDraft, listPlans alias. 保 toàn 100% legacy exports.
 */

import apiClient from '../../../lib/apiClient.js';

/* =========================================================================
 * 1. CÁC HÀM TRUY VẤN VÀ THAO TÁC DANH SÁCH TỜ TRÌNH (PLANS)
 * ========================================================================= */

/** Lấy danh sách Tờ trình của chính user đang đăng nhập */
export function listMyPlans(params = {}) {
  return apiClient.get('/mfo/plans', { params: { mine: 1, ...params } });
}

/** Alias cho listMyPlans để tương thích với các component gọi listPlans */
export function listPlans(params = {}) {
  return apiClient.get('/mfo/plans', { params: { mine: 1, ...params } });
}

/** Lấy danh sách Tờ trình phía Admin */
export function listAdminPlans(params = {}) {
  return apiClient.get('/mfo/plans', { params: { ...params } });
}

/** Lấy thông tin chi tiết một Proposal/Ticket theo ID */
export function getPlan(id) {
  return apiClient.get(`/mfo/plans/${id}`);
}

/** Tạo/Trình mới Tờ trình Khung MFO 5L */
export function createPlan(body) {
  return apiClient.post('/mfo/plans', body);
}

/**
 * Gọi API POST /api/mfo/plans/draft để lưu bản nháp Khung 5L
 * @param {Object} payload Payload chứa target_member_id, selected_canvas_depth, lines, canvas_delta & graph_snapshot
 */
export async function savePlanDraft(payload) {
  const response = await apiClient.post('/mfo/plans/draft', payload);
  return response.data;
}

/**
 * Khôi phục Payload/Snapshot của Tờ trình (DRAFT, PENDING, RESULT)
 * @param {string} ticketId ID của Proposal/Ticket
 */
export async function getDraftPayload(ticketId) {
  const response = await apiClient.get(`/mfo/plans/${ticketId}/draft-payload`);
  return response.data;
}

/**
 * XÓA MỀM BẢN NHÁP DRAFT (Khắc phục lỗi missing export 'deleteDraft')
 * @param {string} ticketId ID của Proposal/Ticket DRAFT cần xóa
 */
export async function deleteDraft(ticketId) {
  const response = await apiClient.delete(`/mfo/plans/${ticketId}/draft`);
  return response.data;
}

/** Alias đồng bộ cho deleteDraft */
export async function deletePlanDraft(ticketId) {
  return deleteDraft(ticketId);
}


/* =========================================================================
 * 2. CÁC HÀM TRA CỨU SỔ HỌ VÀ THÀNH VIÊN
 * ========================================================================= */

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

/** Full-Set v2. Alias k. Không gọi /tree. */
export async function getFullMfoSet(targetMemberId, selectedCanvasDepth = 0) {
  const depth = Number(selectedCanvasDepth);
  const res = await apiClient.get(`/mfo/origins/${targetMemberId}/full-set`, {
    params: { k: depth },
  });
  return res.data && res.data.data != null ? res.data.data : res.data;
}


/* =========================================================================
 * 3. CÁC HÀM THAO TÁC TRONG BẢN KÊ (IN-PLAN MUTATIONS)
 * ========================================================================= */

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

export function abortPlan(id, body = {}) {
  return apiClient.post(`/mfo/plans/${id}/abort`, body);
}


/* =========================================================================
 * 4. CÁC HÀM ADMIN SỬA SỔ VÀ THẨM ĐỊNH TỜ TRÌNH (ADMIN REVIEW)
 * ========================================================================= */

/** ADMIN sửa sổ — không gửi gender / is_alive / phone / email (A01). */
export function adminPatchMember(memberId, body = {}) {
  const b = { ...(body || {}) };
  delete b.gender;
  delete b.is_alive;
  delete b.phone;
  delete b.phone_number;
  delete b.email;
  return apiClient.put(`/members/${memberId}`, b);
}

/** ADMIN tạo người trên sổ (UM / cha mẹ chưa rõ). */
export function adminCreateMember(body = {}) {
  return apiClient.post('/members', body);
}

export function approvePlan(id, body = {}) {
  return apiClient.post(`/mfo/plans/${id}/approve`, body);
}

export async function rejectPlan(ticketId, reason) {
  const res = await apiClient.post(`/mfo/plans/${ticketId}/reject`, { 
    reason,
    note: reason,
    admin_note: reason 
  });
  return res.data || res;
}

export function approveResult(id, body = {}) {
  return apiClient.post(`/mfo/plans/${id}/result/approve`, body);
}

export function rejectResult(id, body = {}) {
  return apiClient.post(`/mfo/plans/${id}/result/reject`, body);
}

/**
 * ADMIN: Trả Tờ trình MFO 5L về cho User sửa theo từng mục bút phê
 */
export async function adminReturnPlanForRevision(ticketId, payload) {
  const res = await apiClient.post(`/mfo/plans/${ticketId}/return`, payload);
  return res.data;
}

/**
 * ADMIN: Phê duyệt Khung MFO 5L (Chốt granted_generation)
 */
export async function adminApprovePlan(ticketId, payload) {
  const res = await apiClient.post(`/mfo/plans/${ticketId}/approve`, payload);
  return res.data;
}

/**
 * ADMIN: Từ chối đóng băng hoàn toàn Khung MFO 5L
 */
/** Alias đồng bộ cho adminRejectPlan */
export async function adminRejectPlan(ticketId, payload) {
  const reason = typeof payload === 'string' ? payload : (payload?.reason || payload?.note || payload?.admin_note || '');
  return rejectPlan(ticketId, reason);
}

/**
 * ADMIN: Lấy danh sách hàng đợi duyệt Khung 5L
 */
export async function adminGetReviewQueue(params = {}) {
  const res = await apiClient.get('/mfo/plans', { params });
  return res.data;
}