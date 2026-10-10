/**
 * PATH       : backend/src/modules/mfo/definitions/mfoResultProcess.definition.js
 * DATETIME   : 2026-10-10T00:26:00+07:00
 * VERSION    : 2.4.0-LAT2-BOOK-IN-SIDE-EFFECT
 * DESCRIPTION:
 * - Lát 2. Ghi sổ nằm trong side effect APPROVED, cùng transaction SRPF.
 * - Đọc business_layer. Không ghi trước khi chuyển trạng thái.
 */

'use strict';

const { SRPF_STATES } = require('../../../shared/frameworks/srpf/constants/states');
const { SRPF_ACTIONS } = require('../../../shared/frameworks/srpf/constants/actions');
const { srpfError, SRPF_ERROR_CODES } = require('../../../shared/frameworks/srpf/errors/srpfCreateError');
const { executeGate2DbMutation } = require('../mfo.gate2');

const PROCESS_TYPE = 'MFO_RESULT';

const mfoResultProcessDefinition = Object.freeze({
  processType: PROCESS_TYPE,
  targetTicketTypes: ['MFO_REVIEW', 'BRANCH_REVIEW', 'MFO_RESULT'],

  /**
   * Custom Instance Resolver giúp SRPF Executor định vị đúng row trong DB proposals
   */
  async resolveInstance(tx, instanceId) {
    return await tx.proposals.findFirst({
      where: {
        id: instanceId,
        ticket_type: { in: ['MFO_REVIEW', 'BRANCH_REVIEW', 'MFO_RESULT'] },
        deleted_at: null,
      },
    });
  },

  // 1. MA TRẬN CHUYỂN DỊCH TRẠNG THÁI CỔNG 2
  transitions: {
    [SRPF_STATES.APPROVED]: {
      [SRPF_ACTIONS.SUBMIT]: SRPF_STATES.UNDER_REVIEW,
      [SRPF_ACTIONS.SAVE_DRAFT]: SRPF_STATES.APPROVED,
    },
    [SRPF_STATES.UNDER_REVIEW]: {
      [SRPF_ACTIONS.RETURN_FOR_REVISION]: SRPF_STATES.NEEDS_REVISION,
      [SRPF_ACTIONS.APPROVE]: SRPF_STATES.APPROVED,
      [SRPF_ACTIONS.REJECT]: SRPF_STATES.REJECTED,
    },
    [SRPF_STATES.NEEDS_REVISION]: {
      [SRPF_ACTIONS.SAVE_DRAFT]: SRPF_STATES.NEEDS_REVISION,
      [SRPF_ACTIONS.SUBMIT]: SRPF_STATES.UNDER_REVIEW,
    },
  },

  // 2. PHÂN QUYỀN VAI TRÒ
  contextGuards: {
    [SRPF_ACTIONS.SAVE_DRAFT]: ['MWL', 'FOUNDER'],
    [SRPF_ACTIONS.SUBMIT]: ['MWL', 'FOUNDER'],
    [SRPF_ACTIONS.RETURN_FOR_REVISION]: ['CLAN_ADMIN', 'SYSTEM_ADMIN'],
    [SRPF_ACTIONS.APPROVE]: ['CLAN_ADMIN', 'SYSTEM_ADMIN'],
    [SRPF_ACTIONS.REJECT]: ['CLAN_ADMIN', 'SYSTEM_ADMIN'],
  },

  // 3. ĐIỀU KIỆN ĐẦU VÀO
  async entryCondition({ action, instance }) {
    const currentPayload = instance.payload || {};
    
    if (!currentPayload.plan_ok) {
      throw srpfError(
        SRPF_ERROR_CODES.ENTRY_CONDITION_FAILED,
        'Khung 5L chưa được phê duyệt (chưa có plan_ok). Không thể thao tác Tờ khai Nghiệm thu!',
        { statusCode: 400 }
      );
    }
  },

  // 4. SIDE EFFECTS
  sideEffects: {
    [SRPF_STATES.UNDER_REVIEW]: async (instance, tx, actorWithPayload) => {
      const currentPayload = instance.payload || {};
      const updatedPayload = {
        ...currentPayload,
        ...(actorWithPayload._payload || {}),
        plan_ok: true,
        result_submitted: true,
        result_ok: false,
      };
      await tx.proposals.update({
        where: { id: instance.id },
        data: {
          status: 'UNDER_REVIEW',
          payload: updatedPayload,
          updated_at: new Date(),
        },
      });
    },
    [SRPF_STATES.APPROVED]: async (instance, tx, actorWithPayload) => {
      const currentPayload = instance.payload || {};
      const actorId = actorWithPayload.actor_id || actorWithPayload.user_id || null;
      const mutation = await executeGate2DbMutation(tx, {
        tenantId: instance.tenant_id,
        actorId,
        proposal: instance,
      });
      const updatedPayload = {
        ...currentPayload,
        ...(actorWithPayload._payload || {}),
        plan_ok: true,
        result_submitted: true,
        result_ok: true,
        result_approved_at: new Date().toISOString(),
        created_member_ids: mutation.created_member_ids,
        created_marriage_ids: mutation.created_marriage_ids,
      };
      await tx.proposals.update({
        where: { id: instance.id },
        data: {
          status: 'APPROVED',
          payload: updatedPayload,
          admin_note: updatedPayload.note || updatedPayload.admin_note || currentPayload.admin_note || null,
          updated_at: new Date(),
        },
      });
    },
    [SRPF_STATES.REJECTED]: async (instance, tx, actorWithPayload) => {
      const incoming = actorWithPayload._payload || {};
      const currentPayload = instance.payload || {};
      const reason = incoming.reason || incoming.admin_note || incoming.revision_request || null;
      const updatedPayload = {
        ...currentPayload,
        ...incoming,
        plan_ok: true,
        result_ok: false,
        reject_reason: reason,
      };
      await tx.proposals.update({
        where: { id: instance.id },
        data: {
          status: 'REJECTED',
          payload: updatedPayload,
          admin_note: reason,
          deleted_at: null,
          updated_at: new Date(),
        },
      });
    },
  },
});

module.exports = mfoResultProcessDefinition;