/**
 * PATH       : backend/src/modules/mfo/definitions/mfoPlanProcess.definition.js
 * DATETIME   : 2026-10-30T17:40:00+07:00
 * VERSION    : 3.1.0-AUDIT-LOGS-INTEGRATED
 * DESCRIPTION: Bổ sung giám sát audit_logs cho toàn bộ sideEffects của Gate 1 (PENDING, NEEDS_REVISION, APPROVED, REJECTED).
 *              Bảo toàn 100% ma trận chuyển dịch trạng thái, context guards, entry conditions và lịch sử submission_history.
 *
 * CHANGE LOG:
 * - 2026-10-30T17:40:00+07:00 | 3.1.0 | Tích hợp audit.create vào các sideEffects của MFO_PLAN trên bảng proposals.
 * - 2026-10-13T15:24:00+07:00 | 3.0.0 | Bổ sung lịch sử submission_history, giữ ma trận trạng thái, guards và tác vụ DB hiện có.
 * - 2026-10-09T23:55:00+07:00 | 2.5.0 | Sửa dứt điểm lỗi 404 SRPF_INSTANCE_NOT_FOUND khi Admin bấm Không duyệt (RETURN_FOR_REVISION).
 */

'use strict';

const { audit } = require('../../../lib/prisma.js');
const { expiresAtFor } = require('../mfo.ttl.js');
const { SRPF_STATES } = require('../../../shared/frameworks/srpf/constants/states');
const { SRPF_ACTIONS } = require('../../../shared/frameworks/srpf/constants/actions');
const { srpfError, SRPF_ERROR_CODES } = require('../../../shared/frameworks/srpf/errors/srpfCreateError');

const { recordSubmission, recordReview } = require('../mfo.history.js');

const PROCESS_TYPE = 'MFO_PLAN';

const mfoPlanProcessDefinition = Object.freeze({
  processType: PROCESS_TYPE,
  targetTicketTypes: ['MFO_REVIEW', 'BRANCH_REVIEW'],

  /**
   * <2026-10-09T23:55:00+07:00> - Custom Instance Resolver định vị row trong DB proposals
   */
  async resolveInstance(tx, instanceId) {
    const row = await tx.proposals.findFirst({
      where: {
        id: instanceId,
        ticket_type: { in: ['MFO_REVIEW', 'BRANCH_REVIEW'] },
        deleted_at: null,
      },
    });
    if (!row) return null;
    return {
      ...row,
      currentState: row.status,
      _storage: 'proposals',
    };
  },

  // 1. MA TRẬN CHUYỂN DỊCH TRẠNG THÁI GATE 1 (MFO_PLAN)
  transitions: {
    [SRPF_STATES.DRAFT]: {
      [SRPF_ACTIONS.SAVE_DRAFT]: SRPF_STATES.DRAFT,
      [SRPF_ACTIONS.SUBMIT]: 'PENDING',
      [SRPF_ACTIONS.CANCEL]: SRPF_STATES.CANCELLED,
    },
    [SRPF_STATES.PENDING]: {
      [SRPF_ACTIONS.START_REVIEW]: SRPF_STATES.UNDER_REVIEW,
      [SRPF_ACTIONS.RETURN_FOR_REVISION]: SRPF_STATES.NEEDS_REVISION, // PENDING -> NEEDS_REVISION
      [SRPF_ACTIONS.APPROVE]: SRPF_STATES.APPROVED,                   // PENDING -> APPROVED
      [SRPF_ACTIONS.REJECT]: SRPF_STATES.REJECTED,                    // PENDING -> REJECTED
      [SRPF_ACTIONS.WITHDRAW]: SRPF_STATES.CANCELLED,
    },
    [SRPF_STATES.UNDER_REVIEW]: {
      [SRPF_ACTIONS.RETURN_FOR_REVISION]: SRPF_STATES.NEEDS_REVISION,
      [SRPF_ACTIONS.APPROVE]: SRPF_STATES.APPROVED,
      [SRPF_ACTIONS.REJECT]: SRPF_STATES.REJECTED,
    },
    [SRPF_STATES.NEEDS_REVISION]: {
      [SRPF_ACTIONS.SAVE_DRAFT]: SRPF_STATES.NEEDS_REVISION,
      [SRPF_ACTIONS.SUBMIT]: 'PENDING',                     // NEEDS_REVISION -> PENDING
      [SRPF_ACTIONS.WITHDRAW]: SRPF_STATES.CANCELLED,
    },
  },

  // 2. CONTEXT GUARDS
  contextGuards: {
    [SRPF_ACTIONS.SAVE_DRAFT]: ['MWL', 'FOUNDER', 'USER', 'CLAN_ADMIN', 'SYSTEM_ADMIN'],
    [SRPF_ACTIONS.SUBMIT]: ['MWL', 'FOUNDER', 'USER', 'CLAN_ADMIN', 'SYSTEM_ADMIN'],
    [SRPF_ACTIONS.START_REVIEW]: ['CLAN_ADMIN', 'SYSTEM_ADMIN'],
    [SRPF_ACTIONS.RETURN_FOR_REVISION]: ['CLAN_ADMIN', 'SYSTEM_ADMIN'],
    [SRPF_ACTIONS.APPROVE]: ['CLAN_ADMIN', 'SYSTEM_ADMIN'],
    [SRPF_ACTIONS.REJECT]: ['CLAN_ADMIN', 'SYSTEM_ADMIN'],
    [SRPF_ACTIONS.WITHDRAW]: ['MWL', 'FOUNDER', 'USER'],
    [SRPF_ACTIONS.CANCEL]: ['MWL', 'FOUNDER', 'USER', 'CLAN_ADMIN', 'SYSTEM_ADMIN'],
  },

  // 3. ĐIỀU KIỆN ĐẦU VÀO
  async entryCondition({ action, payload, instance }) {
    if (action === SRPF_ACTIONS.SUBMIT) {
      if (!payload.target_member_id && !instance?.target_id) {
        throw srpfError(
          SRPF_ERROR_CODES.ENTRY_CONDITION_FAILED,
          'Thiếu thông tin Thành viên mốc M (target_member_id) khi trình Khung!',
          { statusCode: 400 }
        );
      }
    }

    if (action === SRPF_ACTIONS.APPROVE) {
      const grantedGen = Number(payload.granted_generation);
      if (!Number.isInteger(grantedGen) || grantedGen < 1) {
        throw srpfError(
          SRPF_ERROR_CODES.ENTRY_CONDITION_FAILED,
          'Phê duyệt Khung 5L bắt buộc phải chốt Đời tuyệt đối gia tộc (granted_generation >= 1)!',
          { statusCode: 422 }
        );
      }
    }
  },

  // 4. SIDE EFFECTS CẬP NHẬT TRẠNG THÁI VÀ PAYLOAD VÀO CSDL
  sideEffects: {
    /**
     * <2026-10-09T23:55:00+07:00> - KHI SUBMIT: CHUYỂN SANG PENDING
     */
    [SRPF_STATES.PENDING]: async (instance, tx, actorWithPayload) => {
      const incomingPayload = actorWithPayload._payload || {};
      const currentPayload = instance.payload || {};
      const actorId = actorWithPayload.id || actorWithPayload.userId || null;
      const tenantId = instance.tenant_id;
      const correlationId = instance.correlation_id || null;

      const updatedPayload = {
        ...currentPayload,
        ...incomingPayload,
        kind: 'PLAN',
        plan_ok: false,
        result_submitted: false,
        result_ok: false,
        submitted_at: new Date().toISOString(),
      };

      /**
       * <2026-10-13T15:24:00+07:00>
       * Mục đích: Ghi snapshot bất biến của lần trình trước persist, cùng transaction SRPF.
       */
      updatedPayload.submission_history = recordSubmission(
        { ...updatedPayload, submission_history: currentPayload.submission_history },
        'PLAN',
        actorWithPayload
      );

      const updated = await tx.proposals.update({
        where: { id: instance.id },
        data: {
          status: 'PENDING',
          payload: updatedPayload,
          hold_member_ids: instance.hold_member_ids || [],
          expires_at: expiresAtFor('PENDING', new Date()),
          target_id: updatedPayload.origin_member_id || updatedPayload.target_member_id || instance.target_id,
          updated_at: new Date(),
          changed_by: actorId,
        },
      });

      // <2026-10-30T17:40:00+07:00> Audit Cửa 1: Trình Khung 5L
      if (audit && typeof audit.create === 'function') {
        await audit.create(tx, {
          tableName: 'proposals',
          recordId: instance.id,
          action: 'CAP_NHAT',
          tenantId,
          changedBy: actorId,
          correlationId,
          oldData: {
            status: instance.status,
            plan_ok: currentPayload.plan_ok,
          },
          newData: {
            status: 'PENDING',
            plan_ok: false,
            submitted_at: updatedPayload.submitted_at,
          },
          changeReason: `Người dùng trình Khung 5L (Gate 1) cho hồ sơ #${instance.id}`,
        });
      }
    },

    /**
     * <2026-10-09T23:55:00+07:00> - KHI RETURN_FOR_REVISION: CHUYỂN SANG NEEDS_REVISION
     */
    [SRPF_STATES.NEEDS_REVISION]: async (instance, tx, actorWithPayload) => {
      const incomingPayload = actorWithPayload._payload || {};
      const currentPayload = instance.payload || {};
      const actorId = actorWithPayload.id || actorWithPayload.userId || null;
      const tenantId = instance.tenant_id;
      const correlationId = instance.correlation_id || null;

      const updatedPayload = {
        ...currentPayload,
        ...incomingPayload,
        plan_ok: false,
        admin_note: incomingPayload.revision_request || incomingPayload.reason || currentPayload.admin_note || null,
      };

      /**
       * <2026-10-13T15:24:00+07:00>
       * Mục đích: Ghi ý kiến cho lần trình tương ứng trước persist, cùng transaction SRPF.
       */
      updatedPayload.submission_history = recordReview(
        { ...updatedPayload, submission_history: currentPayload.submission_history },
        'PLAN',
        'NEEDS_REVISION',
        actorWithPayload,
        actorWithPayload._payload || {}
      );

      const updated = await tx.proposals.update({
        where: { id: instance.id },
        data: {
          status: 'NEEDS_REVISION',
          payload: updatedPayload,
          expires_at: expiresAtFor('NEEDS_REVISION', new Date()),
          admin_note: updatedPayload.admin_note,
          updated_at: new Date(),
          changed_by: actorId,
        },
      });

      // <2026-10-30T17:40:00+07:00> Audit Cửa 1: Admin trả về sửa Khung
      if (audit && typeof audit.create === 'function') {
        await audit.create(tx, {
          tableName: 'proposals',
          recordId: instance.id,
          action: 'CAP_NHAT',
          tenantId,
          changedBy: actorId,
          correlationId,
          oldData: {
            status: instance.status,
            admin_note: currentPayload.admin_note || null,
          },
          newData: {
            status: 'NEEDS_REVISION',
            admin_note: updatedPayload.admin_note,
          },
          changeReason: `Admin yêu cầu sửa Khung 5L (Gate 1) cho hồ sơ #${instance.id}`,
        });
      }
    },

    /**
     * <2026-10-09T23:55:00+07:00> - KHI APPROVE: CHUYỂN SANG APPROVED VÀ CẤP TEM plan_ok = true
     */
    [SRPF_STATES.APPROVED]: async (instance, tx, actorWithPayload) => {
      const incomingPayload = actorWithPayload._payload || {};
      const currentPayload = instance.payload || {};
      const actorId = actorWithPayload.id || actorWithPayload.userId || null;
      const tenantId = instance.tenant_id;
      const correlationId = instance.correlation_id || null;

      const updatedPayload = {
        ...currentPayload,
        ...incomingPayload,
        kind: 'PLAN',
        plan_ok: true,
        result_submitted: false,
        result_ok: false,
        granted_at: new Date().toISOString(),
      };

      /**
       * <2026-10-13T15:24:00+07:00>
       * Mục đích: Ghi ý kiến cho lần trình tương ứng trước persist, cùng transaction SRPF.
       */
      updatedPayload.submission_history = recordReview(
        { ...updatedPayload, submission_history: currentPayload.submission_history },
        'PLAN',
        'APPROVED',
        actorWithPayload,
        actorWithPayload._payload || {}
      );

      const updated = await tx.proposals.update({
        where: { id: instance.id },
        data: {
          status: 'APPROVED',
          payload: updatedPayload,
          expires_at: expiresAtFor('APPROVED', new Date()),
          admin_note: incomingPayload.note || currentPayload.admin_note || null,
          updated_at: new Date(),
          changed_by: actorId,
        },
      });

      // <2026-10-30T17:40:00+07:00> Audit Cửa 1: Admin phê duyệt Khung 5L
      if (audit && typeof audit.create === 'function') {
        await audit.create(tx, {
          tableName: 'proposals',
          recordId: instance.id,
          action: 'CAP_NHAT',
          tenantId,
          changedBy: actorId,
          correlationId,
          oldData: {
            status: instance.status,
            plan_ok: currentPayload.plan_ok || false,
            granted_generation: currentPayload.granted_generation || null,
          },
          newData: {
            status: 'APPROVED',
            plan_ok: true,
            granted_generation: updatedPayload.granted_generation,
            granted_branch_id: updatedPayload.granted_branch_id || null,
          },
          changeReason: `Admin phê duyệt Khung 5L (Gate 1), chốt đời ${updatedPayload.granted_generation} cho hồ sơ #${instance.id}`,
        });
      }
    },

    /**
     * <2026-10-09T23:55:00+07:00> - KHI REJECT: CHUYỂN SANG REJECTED (deleted_at = NULL)
     */
    [SRPF_STATES.REJECTED]: async (instance, tx, actorWithPayload) => {
      const incomingPayload = actorWithPayload._payload || {};
      const currentPayload = instance.payload || {};
      const actorId = actorWithPayload.id || actorWithPayload.userId || null;
      const tenantId = instance.tenant_id;
      const correlationId = instance.correlation_id || null;

      const updatedPayload = {
        ...currentPayload,
        ...incomingPayload,
        plan_ok: false,
        result_ok: false,
        reject_reason: incomingPayload.reason || incomingPayload.admin_note || null,
      };

      /**
       * <2026-10-13T15:24:00+07:00>
       * Mục đích: Ghi ý kiến cho lần trình tương ứng trước persist, cùng transaction SRPF.
       */
      updatedPayload.submission_history = recordReview(
        { ...updatedPayload, submission_history: currentPayload.submission_history },
        'PLAN',
        'REJECTED',
        actorWithPayload,
        actorWithPayload._payload || {}
      );

      const updated = await tx.proposals.update({
        where: { id: instance.id },
        data: {
          status: 'REJECTED',
          payload: updatedPayload,
          hold_member_ids: [],
          expires_at: null,
          admin_note: updatedPayload.reject_reason,
          updated_at: new Date(),
          changed_by: actorId,
        },
      });

      // <2026-10-30T17:40:00+07:00> Audit Cửa 1: Admin bác bỏ Khung 5L
      if (audit && typeof audit.create === 'function') {
        await audit.create(tx, {
          tableName: 'proposals',
          recordId: instance.id,
          action: 'CAP_NHAT',
          tenantId,
          changedBy: actorId,
          correlationId,
          oldData: {
            status: instance.status,
          },
          newData: {
            status: 'REJECTED',
            reject_reason: updatedPayload.reject_reason,
          },
          changeReason: `Admin bác bỏ vĩnh viễn Khung 5L (Gate 1) cho hồ sơ #${instance.id}`,
        });
      }
    },
  },
});

module.exports = mfoPlanProcessDefinition;