/**
 * PATH       : backend/src/modules/mfo/definitions/mfoResultProcess.definition.js
 * DATETIME   : 2026-10-09T19:00:00+07:00
 * VERSION    : 2.2.0-AMENDMENT-20261009-RESULT-SYNC
 * DESCRIPTION:
 * - SRPF Process Definition cho Gate 2: Thẩm định Nghiệm thu Tờ khai Kết quả Xưởng (MFO_RESULT).
 * - Bổ sung targetTicketTypes và resolveInstance hỗ trợ ticket_type = 'MFO_REVIEW' trong DB proposals.
 */

'use strict';

const { SRPF_STATES } = require('../../../shared/frameworks/srpf/constants/states');
const { SRPF_ACTIONS } = require('../../../shared/frameworks/srpf/constants/actions');
const { srpfError, SRPF_ERROR_CODES } = require('../../../shared/frameworks/srpf/errors/srpfCreateError');

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
    [SRPF_STATES.UNDER_REVIEW]: {
      [SRPF_ACTIONS.SUBMIT]: SRPF_STATES.UNDER_REVIEW,
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
    [SRPF_STATES.APPROVED]: async (instance, tx, actorWithPayload) => {
      console.log(`[SRPF Gate 2] MFO_RESULT Approved for instance #${instance.id}`);
    },
  },
});

module.exports = mfoResultProcessDefinition;