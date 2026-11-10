/**
 * =============================================================================
 * PATH        : frontend/src/features/membership/api/membershipApi.js
 * DATETIME    : 2026-11-10T11:05:00+07:00
 * VERSION     : 1.0.0-MEMBERSHIP-API-SSOT
 * DESCRIPTION : Tầng giao tiếp HTTP Client tập trung cho phân hệ Membership & Multi-Home.
 *               Đảm nhiệm gọi các API chuyển ngữ cảnh (switch-context), lấy danh sách
 *               dòng họ liên kết, nộp hồ sơ nhận người thân (Claim 3 lớp), tra cứu tiến độ
 *               và gửi bổ sung thông tin chỉnh sửa (Revision).
 * =============================================================================
 * CHANGELOGS:
 * - 2026-11-10T11:05:00+07:00 (v1.0.0-MEMBERSHIP-API-SSOT):
 *   + Khởi tạo mới theo quy chuẩn QX.
 *   + Tích hợp đầy đủ các endpoints Backend Phase 3 & 4 (RP-OP-V2.1 + AMEND).
 * =============================================================================
 */

import apiClient from '../../../services/http/apiClient';

export const membershipApi = {
  /**
   * Lấy danh sách các dòng họ mà tài khoản hiện tại sở hữu liên kết (available-clans)
   * Mục đích: Cung cấp danh sách nạp vào HeaderClanSwitcher dropdown.
   * @returns {Promise<Array<{tenantId: string, clanName: string, roleInTenant: string, linkType: string, isDefault: boolean}>>}
   */
  getMyClans: async () => {
    const response = await apiClient.get('/api/auth/available-clans');
    return response.data;
  },

  /**
   * Chuyển đổi ngữ cảnh làm việc sang dòng họ mục tiêu
   * Mục đích: Backend sinh JWT mới mang claims của tenant được chọn, cập nhật activeTenantId & activeMemberId.
   * @param {string} targetTenantId - UUID của dòng họ muốn chuyển đến
   * @returns {Promise<{token: string, activeTenantId: string, activeMemberId: string, activeLinkStatus: string, roleInTenant: string, linkType: string}>}
   */
  switchContext: async (targetTenantId) => {
    const response = await apiClient.post('/api/auth/switch-context', {
      targetTenantId,
    });
    return response.data;
  },

  /**
   * Tra cứu trạng thái hồ sơ liên kết / Onboarding Case hiện tại của tài khoản
   * Mục đích: Nạp dữ liệu vào MembershipStatusPage để kiểm tra trạng thái duyệt (CHO_DUYET, NEEDS_REVISION, TU_CHOI...).
   * @returns {Promise<{caseId: string, status: string, isFinalRejection: boolean, reviewNote: string, revisionRequest: string, submittedAt: string, tenantName: string}>}
   */
  getMembershipStatus: async () => {
    const response = await apiClient.get('/api/membership/status');
    return response.data;
  },

  /**
   * Nộp hồ sơ nhận người thân (Claim Member 3 lớp)
   * Mục đích: Gửi yêu cầu liên kết với một bản ghi thành viên đã có trên cây phả hệ kèm bằng chứng xác thực.
   * @param {object} payload - Dữ liệu hồ sơ claim (claimed_member_id, secretAnswers, phoneVerify, voucherMemberId, proofDocuments...)
   * @returns {Promise<{success: boolean, caseId: string, status: string, message: string}>}
   */
  submitClaim: async (payload) => {
    const response = await apiClient.post('/api/membership/claim', payload);
    return response.data;
  },

  /**
   * Nộp lại hồ sơ sau khi Ban quản trị yêu cầu bổ sung thông tin (NEEDS_REVISION)
   * Mục đích: Chuyển trạng thái case từ NEEDS_REVISION -> SUBMITTED, giữ nguyên users.status = CHO_DUYET theo chuẩn AMEND.
   * @param {string} caseId - Định danh hồ sơ Onboarding Case
   * @param {object} payload - Metadata hồ sơ 21 trường phả hệ đã cập nhật
   * @returns {Promise<{success: boolean, caseId: string, status: string}>}
   */
  submitRevision: async (caseId, payload) => {
    const response = await apiClient.post(`/api/onboarding/cases/${caseId}/revision`, payload);
    return response.data;
  },

  /**
   * Mở lại hồ sơ đã từng bị từ chối mềm (Soft-Rejection)
   * Mục đích: Cho phép người dùng tạo case mới khi case cũ bị TU_CHOI (chưa bị Hard-lock).
   * @param {string} userId - Định danh người dùng
   * @returns {Promise<{success: boolean, newCaseId: string}>}
   */
  reopenCase: async (userId) => {
    const response = await apiClient.post('/api/onboarding/reopen', { userId });
    return response.data;
  },
};