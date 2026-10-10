/**
 * PATH       : backend/src/modules/mfo/definitions/mfoPlanProcess.definition.js
 * DATETIME   : 2026-10-09T23:55:00+07:00
 * VERSION    : 2.5.0-AMENDMENT-20261009-SIDEEFFECTS-STATE-TRANSITION-FIXED
 * DESCRIPTION:
 * - Tuân thủ Q1 (Bảo tồn 100% logic/UI) & Q2 (Code Format & DateTime Annotation).
 * - Sửa dứt điểm lỗi 404 SRPF_INSTANCE_NOT_FOUND khi Admin bấm Không duyệt (RETURN_FOR_REVISION).
 * - Tự động cập nhật status đích trong sideEffects của SRPF Engine.
 */

'use strict';

const { SRPF_STATES } = require('../../../shared/frameworks/srpf/constants/states');
const { SRPF_ACTIONS } = require('../../../shared/frameworks/srpf/constants/actions');
const { srpfError, SRPF_ERROR_CODES } = require('../../../shared/frameworks/srpf/errors/srpfCreateError');

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

      const updatedPayload = {
        ...currentPayload,
        ...incomingPayload,
        kind: 'PLAN',
        plan_ok: false,
        result_submitted: false,
        result_ok: false,
        submitted_at: new Date().toISOString(),
      };

      await tx.proposals.update({
        where: { id: instance.id },
        data: {
          status: 'PENDING',
          payload: updatedPayload,
          target_id: updatedPayload.origin_member_id || updatedPayload.target_member_id || instance.target_id,
          updated_at: new Date(),
        },
      });
    },

    /**
     * <2026-10-09T23:55:00+07:00> - KHI RETURN_FOR_REVISION: CHUYỂN SANG NEEDS_REVISION
     */
    [SRPF_STATES.NEEDS_REVISION]: async (instance, tx, actorWithPayload) => {
      const incomingPayload = actorWithPayload._payload || {};
      const currentPayload = instance.payload || {};

      const updatedPayload = {
        ...currentPayload,
        ...incomingPayload,
        plan_ok: false,
        admin_note: incomingPayload.revision_request || incomingPayload.reason || currentPayload.admin_note || null,
      };

      await tx.proposals.update({
        where: { id: instance.id },
        data: {
          status: 'NEEDS_REVISION',
          payload: updatedPayload,
          admin_note: updatedPayload.admin_note,
          updated_at: new Date(),
        },
      });
    },

    /**
     * <2026-10-09T23:55:00+07:00> - KHI APPROVE: CHUYỂN SANG APPROVED VÀ CẤP TEM plan_ok = true
     */
    [SRPF_STATES.APPROVED]: async (instance, tx, actorWithPayload) => {
      const incomingPayload = actorWithPayload._payload || {};
      const currentPayload = instance.payload || {};

      const updatedPayload = {
        ...currentPayload,
        ...incomingPayload,
        kind: 'PLAN',
        plan_ok: true,
        result_submitted: false,
        result_ok: false,
        granted_at: new Date().toISOString(),
      };

      await tx.proposals.update({
        where: { id: instance.id },
        data: {
          status: 'APPROVED',
          payload: updatedPayload,
          admin_note: incomingPayload.note || currentPayload.admin_note || null,
          updated_at: new Date(),
        },
      });
    },

    /**
     * <2026-10-09T23:55:00+07:00> - KHI REJECT: CHUYỂN SANG REJECTED (deleted_at = NULL)
     */
    [SRPF_STATES.REJECTED]: async (instance, tx, actorWithPayload) => {
      const incomingPayload = actorWithPayload._payload || {};
      const currentPayload = instance.payload || {};

      const updatedPayload = {
        ...currentPayload,
        ...incomingPayload,
        plan_ok: false,
        result_ok: false,
        reject_reason: incomingPayload.reason || incomingPayload.admin_note || null,
      };

      await tx.proposals.update({
        where: { id: instance.id },
        data: {
          status: 'REJECTED',
          payload: updatedPayload,
          admin_note: updatedPayload.reject_reason,
          updated_at: new Date(),
        },
      });
    },
  },
});

module.exports = mfoPlanProcessDefinition;