/**
 * PATH       : backend/src/modules/mfo/mfo.controller.js
 * DATETIME   : 2026-10-09T16:30:00+07:00
 * VERSION    : 3.2.0-LAT3-PREPARED-PAYLOAD
 * DESCRIPTION:
 * - Lát 3. Đưa payload service đã dựng sang SRPF, không chỉ vài trường lẻ.
 */

'use strict';

const mfoService = require('./mfo.service');
const { executeAction } = require('../../shared/frameworks/srpf/engine/ActionExecutor');
const { SRPF_ACTIONS } = require('../../shared/frameworks/srpf/constants/actions');

function sendError(res, error) {
  const status = error.statusCode || error.status || 500;
  console.error('[MFO_CONTROLLER_ERROR]', {
    status,
    code: error.code || 'INTERNAL_ERROR',
    message: error.message,
  });

  const body = {
    status: 'error',
    code: error.code || 'INTERNAL_ERROR',
    message: error.message,
  };
  if (error.k != null) body.k = error.k;
  if (error.ticket_id) body.ticket_id = error.ticket_id;
  if (error.ticket_status) body.ticket_status = error.ticket_status;
  if (error.correlation_id) body.correlation_id = error.correlation_id;
  return res.status(status).json(body);
}

function buildActorContext(req) {
  return {
    user_id: req.user?.id || req.user?.userId || null,
    actor_id: req.user?.id || req.user?.userId || null,
    role: req.user?.role || 'MWL',
    tenant_id: req.user?.tenant_id || req.user?.tenantId || null,
    correlation_id: req.correlationId || req.headers['x-correlation-id'] || null,
  };
}

const mfoController = {
  /**
   * 1. Lưu nháp Khung 5L (SAVE_DRAFT - MFO_PLAN)
   */
  saveDraft: async (req, res) => {
    try {
      const data = await mfoService.saveDraft({
        user: req.user,
        body: req.body || {},
        correlationId: req.correlationId,
      });
      res.status(200).json({ status: 'success', data });
    } catch (error) {
      sendError(res, error);
    }
  },

  /**
   * 2. Xóa mềm nháp / Tờ trình hợp lệ theo EU Delete Matrix
   */
  deleteDraft: async (req, res) => {
    try {
      const ticketId = req.params.id;
      if (!ticketId) {
        return res.status(400).json({ status: 'error', message: 'Thiếu ticketId' });
      }

      const data = await mfoService.deleteDraft({
        user: req.user,
        ticketId,
      });

      return res.status(200).json({
        status: 'success',
        message: 'Đã xóa tờ trình thành công.',
        data,
      });
    } catch (error) {
      sendError(res, error);
    }
  },

  /**
   * 3. Trình Khung 5L chính thức (SUBMIT - Gate 1 MFO_PLAN -> PENDING)
   */
  createPlan: async (req, res) => {
    try {
      const body = req.body || {};
      const actorContext = buildActorContext(req);
      const ticketIdFromBody = body.ticket_id || body.ticketId;

      // 1. Gọi trực tiếp mfoService.createPlan để khởi tạo/cập nhật record PENDING an toàn trong DB
      const serviceResult = await mfoService.createPlan({
        user: req.user,
        body,
        correlationId: req.correlationId,
      });

      const targetTicketId = serviceResult.ticket.id;

      // 2. Chạy SRPF ActionExecutor SUBMIT để đồng bộ State Machine & BPL Ledger
      const srpfResult = await executeAction({
        processType: 'MFO_PLAN',
        instanceId: targetTicketId,
        action: SRPF_ACTIONS.SUBMIT,
        payload: serviceResult.payload || (serviceResult.ticket && serviceResult.ticket.payload) || body,
        actorContext,
      });

      return res.status(201).json({
        status: 'success',
        message: 'Đã trình Khung 5L thành công.',
        correlation_id: srpfResult.correlationId,
        data: {
          ticket: srpfResult.instance,
          payload: srpfResult.instance?.payload || body,
        },
      });
    } catch (error) {
      sendError(res, error);
    }
  },

  /**
   * 4. Admin Phê duyệt Khung 5L (APPROVE - Gate 1 MFO_PLAN -> APPROVED mở xưởng)
   */
  approvePlan: async (req, res) => {
    try {
      const ticketId = req.params.id;
      const body = req.body || {};
      const actorContext = buildActorContext(req);

      const serviceResult = await mfoService.approvePlan({
        user: req.user,
        ticketId,
        body,
      });

      const srpfResult = await executeAction({
        processType: 'MFO_PLAN',
        instanceId: ticketId,
        action: SRPF_ACTIONS.APPROVE,
        payload: {
          prepared_payload: serviceResult.ticket && serviceResult.ticket.payload,
          granted_generation: body.granted_generation || body.generation,
          granted_branch_id: body.granted_branch_id || null,
          review_scs: body.review_scs || null,
          admin_review: body.admin_review || null,
          note: body.note || body.admin_note || null,
        },
        actorContext,
      });

      res.status(200).json({
        status: 'success',
        message: 'Đã phê duyệt Khung 5L và cấp tem mở xưởng Workbench thành công.',
        correlation_id: srpfResult.correlationId,
        data: serviceResult,
      });
    } catch (error) {
      sendError(res, error);
    }
  },

  /**
   * 5. Admin Trả về yêu cầu hiệu chỉnh (RETURN_FOR_REVISION - Gate 1 MFO_PLAN)
   */
  returnPlanForRevision: async (req, res) => {
    try {
      const ticketId = req.params.id;
      const body = req.body || {};
      const actorContext = buildActorContext(req);

      const serviceResult = await mfoService.returnPlanForRevision({
        user: req.user,
        ticketId,
        body,
      });

      const srpfResult = await executeAction({
        processType: 'MFO_PLAN',
        instanceId: ticketId,
        action: SRPF_ACTIONS.RETURN_FOR_REVISION,
        payload: {
          prepared_payload: serviceResult.ticket && serviceResult.ticket.payload,
          review_scs: serviceResult.reviewScs || body.review_scs || [],
          review_rounds: serviceResult.ticket && serviceResult.ticket.payload
            ? serviceResult.ticket.payload.review_rounds
            : [],
          revision_request: serviceResult.globalAdminNote || body.note || body.admin_note || 'Yêu cầu hiệu chỉnh theo bút phê',
          admin_note: serviceResult.globalAdminNote || body.note || body.admin_note || null,
        },
        actorContext,
      });

      res.status(200).json({
        status: 'success',
        message: 'Đã chuyển hồ sơ về trạng thái NEEDS_REVISION kèm bút phê.',
        correlation_id: srpfResult.correlationId,
        data: serviceResult,
      });
    } catch (error) {
      sendError(res, error);
    }
  },

  /**
   * 6. Admin Bác bỏ vĩnh viễn Khung 5L (REJECT - Gate 1 MFO_PLAN)
   */
  rejectPlan: async (req, res) => {
    try {
      const ticketId = req.params.id;
      const body = req.body || {};
      const actorContext = buildActorContext(req);

      const serviceResult = await mfoService.rejectPlan({
        user: req.user,
        ticketId,
        body,
      });

      const srpfResult = await executeAction({
        processType: 'MFO_PLAN',
        instanceId: ticketId,
        action: SRPF_ACTIONS.REJECT,
        payload: {
          prepared_payload: serviceResult.ticket && serviceResult.ticket.payload,
          reason: serviceResult.reason,
          admin_note: serviceResult.reason,
        },
        actorContext,
      });

      return res.status(200).json({
        status: 'success',
        message: 'Đã bác bỏ Khung 5L thành công.',
        correlation_id: srpfResult.correlationId,
        data: serviceResult,
      });
    } catch (error) {
      sendError(res, error);
    }
  },

  /**
   * 7. Nộp Tờ khai Nghiệm thu Kết quả Xưởng (SUBMIT - Gate 2 MFO_RESULT -> UNDER_REVIEW)
   */
  submitResult: async (req, res) => {
    try {
      const ticketId = req.params.id;
      const body = req.body || {};
      const actorContext = buildActorContext(req);

      const serviceResult = await mfoService.submitResult({
        user: req.user,
        ticketId,
        body,
      });

      const srpfResult = await executeAction({
        processType: 'MFO_RESULT',
        instanceId: ticketId,
        action: SRPF_ACTIONS.SUBMIT,
        payload: body,
        actorContext,
      });

      res.status(200).json({
        status: 'success',
        message: 'Đã trình Tờ khai Nghiệm thu thành công.',
        correlation_id: srpfResult.correlationId,
        data: serviceResult,
      });
    } catch (error) {
      sendError(res, error);
    }
  },

  /**
   * 8. Admin Phê duyệt Nghiệm thu & Chốt Sổ thật (APPROVE - Gate 2 MFO_RESULT)
   * Kích hoạt Transaction 4 bước hóa giải quan hệ vòng và ghi Sổ thật
   */
  approveResult: async (req, res) => {
    try {
      const ticketId = req.params.id;
      const body = req.body || {};
      const actorContext = buildActorContext(req);

      const serviceResult = await mfoService.approveResult({
        user: req.user,
        ticketId,
        body,
      });

      const srpfResult = await executeAction({
        processType: 'MFO_RESULT',
        instanceId: ticketId,
        action: SRPF_ACTIONS.APPROVE,
        payload: body,
        actorContext,
      });

      res.status(200).json({
        status: 'success',
        message: 'Đã phê duyệt Nghiệm thu Tờ khai và chính thức ghi Sổ họ thành công.',
        correlation_id: srpfResult.correlationId,
        data: serviceResult,
      });
    } catch (error) {
      sendError(res, error);
    }
  },

  /**
   * 9. Admin Trả về Tờ khai Nghiệm thu (RETURN_FOR_REVISION - Gate 2 MFO_RESULT)
   */
  rejectResult: async (req, res) => {
    try {
      const ticketId = req.params.id;
      const body = req.body || {};
      const actorContext = buildActorContext(req);

      const serviceResult = await mfoService.rejectResult({
        user: req.user,
        ticketId,
        body,
      });

      const srpfResult = await executeAction({
        processType: 'MFO_RESULT',
        instanceId: ticketId,
        action: SRPF_ACTIONS.RETURN_FOR_REVISION,
        payload: {
          revision_request: body.reason || body.note || body.admin_note,
        },
        actorContext,
      });

      res.status(200).json({
        status: 'success',
        message: 'Đã trả Tờ khai Nghiệm thu về trạng thái sửa đổi.',
        correlation_id: srpfResult.correlationId,
        data: serviceResult,
      });
    } catch (error) {
      sendError(res, error);
    }
  },

  // ---------------------------------------------------------------------------
  // CÁC HÀM READ-ONLY VÀ TRUY VẤN DỮ LIỆU CÂY / FULL-SET
  // ---------------------------------------------------------------------------
  getDraftPayload: async (req, res) => {
    try {
      const data = await mfoService.getDraftPayload({
        user: req.user,
        ticketId: req.params.id,
      });
      res.status(200).json({ status: 'success', data });
    } catch (error) {
      sendError(res, error);
    }
  },

  listPlans: async (req, res) => {
    try {
      const data = await mfoService.listPlans({
        user: req.user,
        query: req.query || {},
      });
      res.status(200).json({ status: 'success', data });
    } catch (error) {
      sendError(res, error);
    }
  },

  getPlan: async (req, res) => {
    try {
      const data = await mfoService.getPlan({
        user: req.user,
        ticketId: req.params.id,
      });
      res.status(200).json({ status: 'success', data });
    } catch (error) {
      sendError(res, error);
    }
  },

  abortPlan: async (req, res) => {
    try {
      const data = await mfoService.abortPlan({
        user: req.user,
        ticketId: req.params.id,
        body: req.body || {},
      });
      res.status(200).json({ status: 'success', data });
    } catch (error) {
      sendError(res, error);
    }
  },

  getOriginTree: async (req, res) => {
    try {
      const data = await mfoService.getOriginTree({
        user: req.user,
        originId: req.params.originId,
      });
      res.status(200).json({ status: 'success', data });
    } catch (error) {
      sendError(res, error);
    }
  },

  getFullMfoSet: async (req, res) => {
    try {
      const data = await mfoService.getFullMfoSet({
        user: req.user,
        targetMemberId: req.params.targetMemberId || req.params.originId,
        selectedCanvasDepth: req.query.selected_canvas_depth ?? req.query.k,
      });
      res.status(200).json({ status: 'success', data });
    } catch (error) {
      sendError(res, error);
    }
  },
};

module.exports = mfoController;