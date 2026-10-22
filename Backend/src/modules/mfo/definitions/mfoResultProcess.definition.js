/**
 * PATH       : Backend/src/modules/mfo/definitions/mfoResultProcess.definition.js
 * DATETIME   : 2026-10-22T10:59:00+07:00
 * VERSION    : 3.0.1-RETURN-STATUS
 * DESCRIPTION: Bổ sung lịch sử, giữ ma trận trạng thái, guards và tác vụ DB hiện có.
 * RULE       : Q1 bảo tồn ngoài lịch sử; Q2 metadata và chú thích thời gian.
 *
 * CHANGE LOG:
 * - 2026-10-22T10:59:00+07:00 | 3.0.1 | Thêm: trả sửa ghi NEEDS_REVISION và hạ result_submitted. Bỏ: header thứ hai. Giữ: ghi sổ chỉ lúc APPROVED. Lý do: hai header làm mất dấu vết.
 */
'use strict';

const { SRPF_STATES } = require('../../../shared/frameworks/srpf/constants/states');
const { SRPF_ACTIONS } = require('../../../shared/frameworks/srpf/constants/actions');
const { srpfError, SRPF_ERROR_CODES } = require('../../../shared/frameworks/srpf/errors/srpfCreateError');
const { executeGate2DbMutation } = require('../mfo.gate2');

const { recordSubmission, recordReview } = require('../mfo.history.js');

const PROCESS_TYPE = 'MFO_RESULT';

const mfoResultProcessDefinition = Object.freeze({
  processType: PROCESS_TYPE,
  targetTicketTypes: ['MFO_REVIEW', 'BRANCH_REVIEW'],

  /**
   * Custom Instance Resolver giúp SRPF Executor định vị đúng row trong DB proposals
   * <2026-10-12T09:25:00+07:00> Bỏ MFO_RESULT khỏi in. Enum proposal_ticket_type không có giá trị này.
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
      [SRPF_ACTIONS.REJECT]: SRPF_STATES.REJECTED,
    },
  },

  // 2. PHÂN QUYỀN VAI TRÒ
  contextGuards: {
    [SRPF_ACTIONS.SAVE_DRAFT]: ['MWL', 'FOUNDER', 'USER'],
    [SRPF_ACTIONS.SUBMIT]: ['MWL', 'FOUNDER', 'USER'],
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
      /**
 * <2026-10-13T15:24:00+07:00>
 * Mục đích: Ghi snapshot bất biến của lần trình trước persist, cùng transaction SRPF.
 */
    updatedPayload.submission_history = recordSubmission({ ...updatedPayload, submission_history: currentPayload.submission_history }, 'RESULT', actorWithPayload);
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
      /**
 * <2026-10-13T15:24:00+07:00>
 * Mục đích: Ghi ý kiến cho lần trình tương ứng trước persist, cùng transaction SRPF.
 */
    updatedPayload.submission_history = recordReview({ ...updatedPayload, submission_history: currentPayload.submission_history }, 'RESULT', 'APPROVED', actorWithPayload, actorWithPayload._payload || {});
    await tx.proposals.update({
        where: { id: instance.id },
        data: {
          status: 'APPROVED',
          payload: updatedPayload,
          hold_member_ids: [],
          expires_at: null,
          admin_note: updatedPayload.note || updatedPayload.admin_note || currentPayload.admin_note || null,
          updated_at: new Date(),
        },
      });
    },
/**
 * <2026-10-13T15:24:00+07:00>
 * Mục đích: Chỉ ghi review lịch sử khi trả sửa; không sửa flags, matrix hoặc nghiệp vụ lát 3/5.
 */
    [SRPF_STATES.NEEDS_REVISION]: async (instance, tx, actorWithPayload) => {
      const incoming = actorWithPayload._payload || {};
      const currentPayload = instance.payload || {};
      const note = incoming.revision_request || incoming.reason || incoming.admin_note || null;
      const updatedPayload = {
        ...currentPayload,
        ...incoming,
        // <2026-10-22T10:59:00+07:00> Mục đích: Trả sửa thì mở lại tờ khai. Lý do: còn result_submitted thì vẫn hiện chờ duyệt.
        plan_ok: true,
        result_submitted: false,
        result_ok: false,
      };
      updatedPayload.submission_history = recordReview({ ...updatedPayload, submission_history: currentPayload.submission_history }, 'RESULT', 'NEEDS_REVISION', actorWithPayload, incoming);
      await tx.proposals.update({
        where: { id: instance.id },
        data: {
          status: 'NEEDS_REVISION',
          payload: updatedPayload,
          admin_note: note,
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
      /**
 * <2026-10-13T15:24:00+07:00>
 * Mục đích: Ghi ý kiến cho lần trình tương ứng trước persist, cùng transaction SRPF.
 */
    updatedPayload.submission_history = recordReview({ ...updatedPayload, submission_history: currentPayload.submission_history }, 'RESULT', 'REJECTED', actorWithPayload, actorWithPayload._payload || {});
    await tx.proposals.update({
        where: { id: instance.id },
        data: {
          status: 'REJECTED',
          payload: updatedPayload,
          hold_member_ids: [],
          expires_at: null,
          admin_note: reason,
          deleted_at: null,
          updated_at: new Date(),
        },
      });
    },
  },
});

module.exports = mfoResultProcessDefinition;
