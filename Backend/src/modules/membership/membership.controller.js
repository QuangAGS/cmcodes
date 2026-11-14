/**
 * ============================================================================
 * PATH       : src/modules/membership/membership.controller.js
 * DATETIME   : 2026-11-14T11:15:00+07:00
 * VERSION    : 1.2.0-MULTIHOME-UAT-BUG4-PROACTIVE-CHECK
 * DESCRIPTION:
 * - HTTP Controller cho phân hệ Multi-Home C1 (/membership/cases) & C1-S (/membership/clan-setup),
 *   bao gồm kiểm tra điều kiện chủ động, nộp đơn, xem trạng thái, bổ sung hồ sơ, mở lại từ chối mềm,
 *   và phê duyệt/trả sửa C1.
 * ============================================================================
 * CHANGELOGS:
 * - 2026-11-13T09:45:00+07:00 (v1.0.0-MULTIHOME-AMEND02-V15-LAT3):
 *   + Khởi tạo getStatus, createCase, clanSetup, submitRevision, reopenCase.
 * - 2026-11-13T10:30:00+07:00 (v1.1.0-MULTIHOME-AMEND02-V15-LAT3):
 *   + Bổ sung approveCase và returnForRevision cho cổng Admin duyệt C1 / C1-S.
 * - 2026-11-14T11:15:00+07:00 (v1.2.0-MULTIHOME-UAT-BUG4-PROACTIVE-CHECK):
 *   + Bổ sung checkEligibility (GET /api/membership/eligibility?tenantId=...).
 * ============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

'use strict';

const membershipService = require('./membership.service');

const membershipController = {
  checkEligibility: async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.id;
      const tenantId = req.query?.tenantId || req.query?.tenant_id || '';
      const result = await membershipService.checkMultiHomeEligibility(
        userId,
        tenantId
      );

      return res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (err) {
      return res.status(err.status || 500).json({
        status: 'error',
        code: err.code || 'CHECK_ELIGIBILITY_FAILED',
        message: err.message || 'Không thể kiểm tra điều kiện gia nhập dòng họ.',
      });
    }
  },

  getStatus: async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.id;
      const caseId = req.query?.caseId || null;
      const tenantId = req.query?.tenantId || req.user?.activeTenantId || null;

      const data = await membershipService.getMultiHomeStatus(userId, {
        caseId,
        tenantId,
      });

      return res.status(200).json({
        status: 'success',
        data,
      });
    } catch (err) {
      return res.status(err.status || 500).json({
        status: 'error',
        code: err.code || 'GET_MEMBERSHIP_STATUS_FAILED',
        message: err.message || 'Không thể tải trạng thái hồ sơ.',
      });
    }
  },

  createCase: async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.id;
      const result = await membershipService.submitMultiHomeClaim(
        userId,
        req.body || {},
        { correlationId: req.correlationId }
      );

      return res.status(201).json({
        status: 'success',
        data: result,
        message: 'Đã gửi hồ sơ xin gia nhập dòng họ thành công.',
      });
    } catch (err) {
      return res.status(err.status || 500).json({
        status: 'error',
        code: err.code || 'SUBMIT_MULTIHOME_CLAIM_FAILED',
        message: err.message || 'Không thể gửi hồ sơ gia nhập dòng họ.',
      });
    }
  },

  clanSetup: async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.id;
      const result = await membershipService.submitMultiHomeClanSetup(
        userId,
        req.body || {},
        { correlationId: req.correlationId }
      );

      return res.status(201).json({
        status: 'success',
        data: result,
        message: 'Đã gửi hồ sơ lập dòng họ mới thành công.',
      });
    } catch (err) {
      return res.status(err.status || 500).json({
        status: 'error',
        code: err.code || 'SUBMIT_CLAN_SETUP_FAILED',
        message: err.message || 'Không thể gửi hồ sơ lập dòng họ mới.',
      });
    }
  },

  submitRevision: async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.id;
      const { caseId } = req.params;
      const result = await membershipService.submitMultiHomeRevision(
        userId,
        caseId,
        req.body || {},
        { correlationId: req.correlationId }
      );

      return res.status(200).json({
        status: 'success',
        data: result,
        message: 'Đã gửi hồ sơ bổ sung thành công.',
      });
    } catch (err) {
      return res.status(err.status || 500).json({
        status: 'error',
        code: err.code || 'SUBMIT_REVISION_FAILED',
        message: err.message || 'Không thể gửi hồ sơ bổ sung.',
      });
    }
  },

  reopenCase: async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.id;
      const { caseId } = req.params;
      const result = await membershipService.reopenMultiHomeCase(userId, caseId);

      return res.status(200).json({
        status: 'success',
        data: result,
        message: 'Đã mở lại hồ sơ để bổ sung thông tin.',
      });
    } catch (err) {
      return res.status(err.status || 500).json({
        status: 'error',
        code: err.code || 'REOPEN_CASE_FAILED',
        message: err.message || 'Không thể mở lại hồ sơ.',
      });
    }
  },

  approveCase: async (req, res) => {
    try {
      const { caseId } = req.params;
      const { newStatus = 'DA_DUYET', adminNote, isFinalRejection, targetMemberId } =
        req.body || {};

      const result = await membershipService.approveMultiHomeCase({
        caseId,
        newStatus,
        adminNote,
        actorId: req.user?.userId || req.user?.id,
        actorRole: req.user?.roleInTenant || req.user?.role,
        actorTenantId: req.user?.activeTenantId || req.user?.tenantId,
        actorStatus: req.user?.status,
        isFinalRejection: Boolean(isFinalRejection),
        targetMemberId: targetMemberId || null,
        correlationId: req.correlationId,
      });

      return res.status(200).json({
        status: 'success',
        data: result,
        message:
          newStatus === 'DA_DUYET'
            ? 'Đã phê duyệt hồ sơ Multi-Home thành công.'
            : 'Đã từ chối hồ sơ Multi-Home.',
      });
    } catch (err) {
      return res.status(err.status || 500).json({
        status: 'error',
        code: err.code || 'APPROVE_MULTIHOME_CASE_FAILED',
        message: err.message || 'Không thể xét duyệt hồ sơ Multi-Home.',
      });
    }
  },

  returnForRevision: async (req, res) => {
    try {
      const { caseId } = req.params;
      const { adminNote } = req.body || {};

      const result = await membershipService.returnMultiHomeForRevision({
        caseId,
        adminNote,
        actorId: req.user?.userId || req.user?.id,
        actorRole: req.user?.roleInTenant || req.user?.role,
        actorTenantId: req.user?.activeTenantId || req.user?.tenantId,
        actorStatus: req.user?.status,
        correlationId: req.correlationId,
      });

      return res.status(200).json({
        status: 'success',
        data: result,
        message: 'Đã gửi yêu cầu bổ sung hồ sơ Multi-Home.',
      });
    } catch (err) {
      return res.status(err.status || 500).json({
        status: 'error',
        code: err.code || 'RETURN_MULTIHOME_REVISION_FAILED',
        message: err.message || 'Không thể yêu cầu bổ sung hồ sơ.',
      });
    }
  },
};

module.exports = membershipController;
