/**
 * PATH       : frontend/src/features/mfo/api/mfoApi.js
 * DATETIME   : 2026-10-26T12:25:00+07:00
 * VERSION    : 5.1.2-KHONG-304
 * DESCRIPTION: Giữ toàn bộ exports; tách API trả sửa và không duyệt cửa 2.
 * RULE       : Q1 bảo tồn ngoài phạm vi; Q2 metadata và chú thích thời gian.
 */
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
 * - 2026-10-26T12:25:00+07:00 | 5.1.1 | Thêm: cùng một người chỉ gọi full-set một lần. Bỏ: lần gọi thứ hai từ dịch vụ lấy đời. Giữ: các hàm khác. Lý do: trang và dịch vụ cùng gọi.
 * - 2026-10-08: Thêm deleteDraft, deletePlanDraft, listPlans alias. 保 toàn 100% legacy exports.
 */

import apiClient from '../../../lib/apiClient.js';

/* =========================================================================
 * 1. CÁC HÀM TRUY VẤN VÀ THAO TÁC DANH SÁCH TỜ TRÌNH (PLANS)
 * ========================================================================= */

/** Lấy danh sách Tờ trình của chính user đang đăng nhập */
/** <2026-10-13T17:07:00+07:00> Mục đích: Giữ xử lý listMyPlans; thay đổi chỉ trong thao tác admin lát 5. */
export function listMyPlans(params = {}) {
  return apiClient.get('/mfo/plans', { params: { mine: 1, ...params } });
}

/** Alias cho listMyPlans để tương thích với các component gọi listPlans */
/** <2026-10-13T17:07:00+07:00> Mục đích: Giữ xử lý listPlans; thay đổi chỉ trong thao tác admin lát 5. */
export function listPlans(params = {}) {
  return apiClient.get('/mfo/plans', { params: { mine: 1, ...params } });
}

/** Lấy danh sách Tờ trình phía Admin */
/** <2026-10-13T17:07:00+07:00> Mục đích: Giữ xử lý listAdminPlans; thay đổi chỉ trong thao tác admin lát 5. */
export function listAdminPlans(params = {}) {
  return apiClient.get('/mfo/plans', { params: { ...params } });
}

/** Lấy thông tin chi tiết một Proposal/Ticket theo ID */
/** <2026-10-13T17:07:00+07:00> Mục đích: Giữ xử lý getPlan; thay đổi chỉ trong thao tác admin lát 5. */
export function getPlan(id) {
  return apiClient.get(`/mfo/plans/${id}`);
}

/** Tạo/Trình mới Tờ trình Khung MFO 5L */
/** <2026-10-13T17:07:00+07:00> Mục đích: Giữ xử lý createPlan; thay đổi chỉ trong thao tác admin lát 5. */
export function createPlan(body) {
  return apiClient.post('/mfo/plans', body);
}

/**
 * Gọi API POST /api/mfo/plans/draft để lưu bản nháp Khung 5L
 * @param {Object} payload Payload chứa target_member_id, selected_canvas_depth, lines, canvas_delta & graph_snapshot
 */
/** <2026-10-13T17:07:00+07:00> Mục đích: Giữ xử lý savePlanDraft; thay đổi chỉ trong thao tác admin lát 5. */
export async function savePlanDraft(payload) {
  const response = await apiClient.post('/mfo/plans/draft', payload);
  return response.data;
}

/**
 * Khôi phục Payload/Snapshot của Tờ trình (DRAFT, PENDING, RESULT)
 * @param {string} ticketId ID của Proposal/Ticket
 */
/** <2026-10-13T17:07:00+07:00> Mục đích: Giữ xử lý getDraftPayload; thay đổi chỉ trong thao tác admin lát 5. */
export async function getDraftPayload(ticketId) {
  const response = await apiClient.get(`/mfo/plans/${ticketId}/draft-payload`);
  return response.data;
}

/**
 * XÓA MỀM BẢN NHÁP DRAFT (Khắc phục lỗi missing export 'deleteDraft')
 * @param {string} ticketId ID của Proposal/Ticket DRAFT cần xóa
 */
/** <2026-10-13T17:07:00+07:00> Mục đích: Giữ xử lý deleteDraft; thay đổi chỉ trong thao tác admin lát 5. */
export async function deleteDraft(ticketId) {
  const response = await apiClient.delete(`/mfo/plans/${ticketId}/draft`);
  return response.data;
}

/** Alias đồng bộ cho deleteDraft */
/** <2026-10-13T17:07:00+07:00> Mục đích: Giữ xử lý deletePlanDraft; thay đổi chỉ trong thao tác admin lát 5. */
export async function deletePlanDraft(ticketId) {
  return deleteDraft(ticketId);
}


/* =========================================================================
 * 2. CÁC HÀM TRA CỨU SỔ HỌ VÀ THÀNH VIÊN
 * ========================================================================= */

/** BE GET /members không nhận q — lấy sổ CHINH_THUC, FE lọc tên. */
/** <2026-10-13T17:07:00+07:00> Mục đích: Giữ xử lý listBookMembers; thay đổi chỉ trong thao tác admin lát 5. */
export function listBookMembers() {
  return apiClient.get('/members', { params: { status: 'CHINH_THUC' } });
}

/** <2026-10-13T17:07:00+07:00> Mục đích: Giữ xử lý searchBookMembers; thay đổi chỉ trong thao tác admin lát 5. */
export function searchBookMembers(q) {
  return listBookMembers();
}

/** <2026-10-13T17:07:00+07:00> Mục đích: Giữ xử lý getMember; thay đổi chỉ trong thao tác admin lát 5. */
export function getMember(id) {
  return apiClient.get(`/members/${id}`);
}

/** Cây theo gốc — cửa GFL khi đã có sổ. */
/** <2026-10-13T17:07:00+07:00> Mục đích: Giữ xử lý getOriginTree; thay đổi chỉ trong thao tác admin lát 5. */
export function getOriginTree(originId) {
  return apiClient.get(`/mfo/origins/${originId}/tree`);
}

/** Full-Set v2. Alias k. Không gọi /tree. */
/** <2026-10-13T17:07:00+07:00> Mục đích: Giữ xử lý getFullMfoSet; thay đổi chỉ trong thao tác admin lát 5. */
const fullSetFlight = new Map();
export async function getFullMfoSet(targetMemberId, selectedCanvasDepth = 0) {
  const key = String(targetMemberId);
  const hit = fullSetFlight.get(key);
  if (hit && hit.data && Date.now() - hit.at < 15000) return hit.data;
  if (hit && hit.job) return hit.job;
  const depth = Number(selectedCanvasDepth);
  const job = apiClient.get(`/mfo/origins/${targetMemberId}/full-set`, {
    params: { k: depth, _t: Date.now() },
    headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' },
  }).then((res) => {
    const data = res.data && res.data.data != null ? res.data.data : res.data;
    fullSetFlight.set(key, { at: Date.now(), data, job: null });
    return data;
  }).catch((error) => {
    fullSetFlight.delete(key);
    throw error;
  });
  // <2026-10-26T12:25:00+07:00> Mục đích: Khoá trước khi gọi. Lý do: trang và dịch vụ lấy đời cùng gọi một người.
  fullSetFlight.set(key, { at: Date.now(), data: null, job });
  return job;
}


/* =========================================================================
 * 3. CÁC HÀM THAO TÁC TRONG BẢN KÊ (IN-PLAN MUTATIONS)
 * ========================================================================= */

/** <2026-10-13T17:07:00+07:00> Mục đích: Giữ xử lý saveStaging; thay đổi chỉ trong thao tác admin lát 5. */
export function saveStaging(planId, smpStagingData) {
  return apiClient.post(`/mfo/plans/${planId}/staging`, {
    smp_staging_data: smpStagingData || {},
  });
}

/** <2026-10-13T17:07:00+07:00> Mục đích: Giữ xử lý createMemberInPlan; thay đổi chỉ trong thao tác admin lát 5. */
export function createMemberInPlan(planId, body) {
  return apiClient.post(`/mfo/plans/${planId}/members`, body);
}

/** <2026-10-13T17:07:00+07:00> Mục đích: Giữ xử lý patchMemberInPlan; thay đổi chỉ trong thao tác admin lát 5. */
export function patchMemberInPlan(planId, memberId, body) {
  const b = { ...(body || {}) };
  delete b.gender;
  delete b.is_alive;
  delete b.phone;
  delete b.phone_number;
  delete b.email;
  return apiClient.patch(`/mfo/plans/${planId}/members/${memberId}`, b);
}

/** <2026-10-13T17:07:00+07:00> Mục đích: Giữ xử lý deleteMemberInPlan; thay đổi chỉ trong thao tác admin lát 5. */
export function deleteMemberInPlan(planId, memberId) {
  return apiClient.delete(`/mfo/plans/${planId}/members/${memberId}`);
}

/** <2026-10-13T17:07:00+07:00> Mục đích: Giữ xử lý createSpouseInPlan; thay đổi chỉ trong thao tác admin lát 5. */
export function createSpouseInPlan(planId, body) {
  return apiClient.post(`/mfo/plans/${planId}/spouses`, body);
}

/** <2026-10-13T17:07:00+07:00> Mục đích: Giữ xử lý linkFounder; thay đổi chỉ trong thao tác admin lát 5. */
export function linkFounder(planId, body) {
  return apiClient.patch(`/mfo/plans/${planId}/founder`, body);
}

/** <2026-10-13T17:07:00+07:00> Mục đích: Giữ xử lý submitResult; thay đổi chỉ trong thao tác admin lát 5. */
export function submitResult(planId, body = {}) {
  return apiClient.post(`/mfo/plans/${planId}/result`, body);
}

/** <2026-10-13T17:07:00+07:00> Mục đích: Giữ xử lý abortPlan; thay đổi chỉ trong thao tác admin lát 5. */
export function abortPlan(id, body = {}) {
  return apiClient.post(`/mfo/plans/${id}/abort`, body);
}


/* =========================================================================
 * 4. CÁC HÀM ADMIN SỬA SỔ VÀ THẨM ĐỊNH TỜ TRÌNH (ADMIN REVIEW)
 * ========================================================================= */

/** ADMIN sửa sổ — không gửi gender / is_alive / phone / email (A01). */
/** <2026-10-13T17:07:00+07:00> Mục đích: Giữ xử lý adminPatchMember; thay đổi chỉ trong thao tác admin lát 5. */
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
/** <2026-10-13T17:07:00+07:00> Mục đích: Giữ xử lý adminCreateMember; thay đổi chỉ trong thao tác admin lát 5. */
export function adminCreateMember(body = {}) {
  return apiClient.post('/members', body);
}

/** <2026-10-13T17:07:00+07:00> Mục đích: Giữ xử lý approvePlan; thay đổi chỉ trong thao tác admin lát 5. */
export function approvePlan(id, body = {}) {
  return apiClient.post(`/mfo/plans/${id}/approve`, body);
}

/** <2026-10-13T17:07:00+07:00> Mục đích: Giữ xử lý rejectPlan; thay đổi chỉ trong thao tác admin lát 5. */
export async function rejectPlan(ticketId, reason) {
  const res = await apiClient.post(`/mfo/plans/${ticketId}/reject`, { 
    reason,
    note: reason,
    admin_note: reason 
  });
  return res.data || res;
}

/** <2026-10-13T17:07:00+07:00> Mục đích: Giữ xử lý approveResult; thay đổi chỉ trong thao tác admin lát 5. */
export function approveResult(id, body = {}) {
  return apiClient.post(`/mfo/plans/${id}/result/approve`, body);
}

/**
 * <2026-10-13T17:07:00+07:00>
 * Mục đích: Trả sửa cửa 2 là route riêng /result/return, không dùng endpoint REJECT.
 */
export function returnResultForRevision(id, body = {}) {
  return apiClient.post(`/mfo/plans/${id}/result/return`, body);
}

/**
 * <2026-10-15T06:55:00+07:00>
 * Mục đích: Không duyệt cửa 2 gọi /result/terminate. Giữ tên hàm để admin không đổi chỗ gọi.
 */
export function rejectResult(id, body = {}) {
  return apiClient.post(`/mfo/plans/${id}/result/terminate`, body);
}

/**
 * ADMIN: Trả Tờ trình MFO 5L về cho User sửa theo từng mục bút phê
 */
/** <2026-10-13T17:07:00+07:00> Mục đích: Giữ xử lý adminReturnPlanForRevision; thay đổi chỉ trong thao tác admin lát 5. */
export async function adminReturnPlanForRevision(ticketId, payload) {
  const res = await apiClient.post(`/mfo/plans/${ticketId}/return`, payload);
  return res.data;
}

/**
 * ADMIN: Phê duyệt Khung MFO 5L (Chốt granted_generation)
 */
/** <2026-10-13T17:07:00+07:00> Mục đích: Giữ xử lý adminApprovePlan; thay đổi chỉ trong thao tác admin lát 5. */
export async function adminApprovePlan(ticketId, payload) {
  const res = await apiClient.post(`/mfo/plans/${ticketId}/approve`, payload);
  return res.data;
}

/**
 * ADMIN: Từ chối đóng băng hoàn toàn Khung MFO 5L
 */
/** Alias đồng bộ cho adminRejectPlan */
/** <2026-10-13T17:07:00+07:00> Mục đích: Giữ xử lý adminRejectPlan; thay đổi chỉ trong thao tác admin lát 5. */
export async function adminRejectPlan(ticketId, payload) {
  const reason = typeof payload === 'string' ? payload : (payload?.reason || payload?.note || payload?.admin_note || '');
  return rejectPlan(ticketId, reason);
}

/**
 * ADMIN: Lấy danh sách hàng đợi duyệt Khung 5L
 */
/** <2026-10-13T17:07:00+07:00> Mục đích: Giữ xử lý adminGetReviewQueue; thay đổi chỉ trong thao tác admin lát 5. */
export async function adminGetReviewQueue(params = {}) {
  const res = await apiClient.get('/mfo/plans', { params });
  return res.data;
}