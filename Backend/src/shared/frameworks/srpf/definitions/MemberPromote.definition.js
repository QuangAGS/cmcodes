/**
 * PATH       : backend/src/shared/frameworks/srpf/definitions/MemberPromote.definition.js
 * DATETIME   : 2026-08-13T11:40:00+07:00
 * VERSION    : 0.6.0-phase3.3
 * DESCRIPTION: Process Definition for MEMBER_PROMOTE (OP-A: DU_BI → CHINH_THUC).
 *
 * SSOT decisions (conversation + Architecture v1.1):
 * - Entry: member.status = DU_BI; optional user.status = DA_DUYET when user linked
 * - MEMBER_JOIN vs CLAN_SETUP branch rules
 * - Base Profile hard required on APPROVE; generation hard for CLAN_SETUP, strongly
 *   recommended for MEMBER_JOIN
 * - father_id / mother_id optional
 * - APPROVE side-effect: members.status = CHINH_THUC only (no auto CLAN_ADMIN)
 * - BPL process_type maps to existing ONBOARDING_* enum values until schema extends
 *
 * NOTE: Register this definition at bootstrap via registerMemberPromoteDefinition().
 */

'use strict';

const { srpfError, SRPF_ERROR_CODES } = require('../errors/srpfCreateError');
const { SRPF_STATES } = require('../constants/states');
const { SRPF_ACTIONS } = require('../constants/actions');

const PROCESS_TYPE = 'MEMBER_PROMOTE';

/** Fields hard-required on APPROVE for a living member from Register flow */
const BP_HARD_REQUIRED = [
  'full_name',
  'gender',
  'is_alive',
  'birth_year',
  'birth_month',
  'birth_day',
];

/**
 * @param {object} member
 * @param {string[]} fields
 * @returns {string[]} missing field names
 */
function missingFields(member, fields) {
  const missing = [];
  for (const f of fields) {
    const v = member[f];
    if (v === null || v === undefined || v === '') {
      missing.push(f);
    }
  }
  return missing;
}

/**
 * Load primary member for an onboarding-backed process instance.
 * @param {object} instance - normalized SRPF instance
 * @param {import('@prisma/client').Prisma.TransactionClient|object} [client]
 */
async function loadPrimaryMember(instance, client) {
  const memberId = instance.primary_member_id;
  if (!memberId) {
    const err = new Error('[SRPF] MEMBER_PROMOTE: instance missing primary_member_id');
    err.code = 'SRPF.PROFILE_INCOMPLETE';
    throw err;
  }

  // Lazy require to avoid circular deps at load time
  const { prisma } = require('../../../../lib/prisma.js');
  const db = client || prisma;

  const member = await db.members.findFirst({
    where: { id: memberId, deleted_at: null },
  });

  if (!member) {
    throw srpfError(
      SRPF_ERROR_CODES.INSTANCE_NOT_FOUND,
      `MEMBER_PROMOTE: member not found: ${memberId}`,
      { details: { memberId } }
    );
  }

  return member;
}

/**
 * Process Definition object (SRPF contract).
 */
const MemberPromoteDefinition = {
  processType: PROCESS_TYPE,
  revisionSupported: true,

  supportedStates: [
    SRPF_STATES.DRAFT,
    SRPF_STATES.SUBMITTED,
    SRPF_STATES.UNDER_REVIEW,
    SRPF_STATES.NEEDS_REVISION,
    SRPF_STATES.APPROVED,
    SRPF_STATES.REJECTED,
    SRPF_STATES.CANCELLED,
  ],

  /**
   * Who may perform which action (v1 role lists).
   * CLAN_SETUP approve path should be exercised mainly by SYSTEM_ADMIN in practice;
   * CLAN_ADMIN remains listed for JOIN. Refine with richer ContextGuard later if needed.
   */
  contextGuards: {
    [SRPF_ACTIONS.SAVE_DRAFT]: ['MEMBER', 'CLAN_ADMIN', 'SYSTEM_ADMIN', 'ANY'],
    [SRPF_ACTIONS.SUBMIT]: ['MEMBER', 'CLAN_ADMIN', 'SYSTEM_ADMIN', 'ANY'],
    [SRPF_ACTIONS.WITHDRAW]: ['MEMBER', 'CLAN_ADMIN', 'SYSTEM_ADMIN', 'ANY'],
    [SRPF_ACTIONS.CANCEL]: ['CLAN_ADMIN', 'SYSTEM_ADMIN', 'MEMBER', 'ANY'],
    [SRPF_ACTIONS.START_REVIEW]: ['CLAN_ADMIN', 'SYSTEM_ADMIN'],
    [SRPF_ACTIONS.RETURN_FOR_REVISION]: ['CLAN_ADMIN', 'SYSTEM_ADMIN'],
    [SRPF_ACTIONS.APPROVE]: ['CLAN_ADMIN', 'SYSTEM_ADMIN'],
    [SRPF_ACTIONS.REJECT]: ['CLAN_ADMIN', 'SYSTEM_ADMIN'],
  },

  /**
   * Entry checks before meaningful workflow use.
   * @param {object} ctx
   * @param {object} ctx.instance
   * @param {object} [ctx.actorContext]
   * @param {object} [ctx.tx]
   */
  entryCondition: async (ctx) => {
    const instance = ctx.instance;
    if (!instance) {
      throw new Error('[SRPF] MEMBER_PROMOTE entryCondition: missing instance');
    }

    const member = await loadPrimaryMember(instance, ctx.tx);

    if (member.status !== 'DU_BI') {
      throw srpfError(
        SRPF_ERROR_CODES.ENTRY_CONDITION_FAILED,
        `MEMBER_PROMOTE entry: member.status must be DU_BI (got ${member.status})`,
        { details: { memberStatus: member.status } }
      );
    }

    // Optional: linked user must be DA_DUYET when user_id present on case
    if (instance.user_id) {
      const { prisma } = require('../../../../lib/prisma.js');
      const db = ctx.tx || prisma;
      const user = await db.users.findFirst({
        where: { id: instance.user_id, deleted_at: null },
        select: { id: true, status: true },
      });
      if (user && user.status !== 'DA_DUYET') {
        throw srpfError(
          SRPF_ERROR_CODES.ENTRY_CONDITION_FAILED,
          `MEMBER_PROMOTE entry: user.status must be DA_DUYET (got ${user.status})`,
          { details: { userStatus: user.status } }
        );
      }
    }

    return true;
  },

  /**
   * Profile validation before selected actions.
   */
  profileValidation: {
    /**
     * Hard Base Profile checks before APPROVE.
     * generation: required >= 1 for CLAN_SETUP; strongly recommended for MEMBER_JOIN (warn only).
     */
    APPROVE: async (instance, payload) => {
      const { prisma } = require('../../../../lib/prisma.js');
      const member = await loadPrimaryMember(instance, prisma);

      const missing = missingFields(member, BP_HARD_REQUIRED);
      if (missing.length) {
        throw srpfError(
          SRPF_ERROR_CODES.PROFILE_INCOMPLETE,
          `MEMBER_PROMOTE APPROVE: Base Profile incomplete: ${missing.join(', ')}`,
          { details: { missing } }
        );
      }

      const caseType = instance.case_type;

      if (caseType === 'CLAN_SETUP') {
        if (member.generation == null || Number(member.generation) < 1) {
          throw srpfError(
            SRPF_ERROR_CODES.PROFILE_INCOMPLETE,
            'MEMBER_PROMOTE APPROVE (CLAN_SETUP): generation is required and must be >= 1',
            { details: { missing: ['generation'] } }
          );
        }
      }

      if (caseType === 'MEMBER_JOIN') {
        if (member.generation == null) {
          // Strongly recommended — warn only (do not block APPROVE)
          // eslint-disable-next-line no-console
          console.warn(
            `[SRPF] MEMBER_PROMOTE APPROVE (MEMBER_JOIN): generation is missing for member ${member.id} (strongly recommended)`
          );
        }
      }

      // Allow payload.role for founder role label (TRUONG_TOC, ...) — applied in side-effect if provided
      return true;
    },
  },

  /**
   * Terminal side-effects (same TX as state transition).
   * No saga. No auto CLAN_ADMIN assignment.
   */
  sideEffects: {
    APPROVED: async (instance, tx, actorContext) => {
      const memberId = instance.primary_member_id;
      if (!memberId) {
        throw new Error('[SRPF] MEMBER_PROMOTE sideEffect APPROVED: missing primary_member_id');
      }

      const actorId = actorContext?.actor_id || actorContext?.user_id || null;
      const data = {
        status: 'CHINH_THUC',
      };
      if (actorId) {
        data.changed_by = actorId;
      }

      // Optional: Admin-chosen member.role at promote time (e.g. TRUONG_TOC) — only if provided
      // and only when payload was threaded via instance.metadata or actorContext._payload
      const roleFromPayload =
        actorContext?._payload?.role ||
        instance?.metadata?.promote_role ||
        null;
      if (roleFromPayload) {
        data.role = roleFromPayload;
      }

      await tx.members.update({
        where: { id: memberId },
        data,
      });

      // Explicit non-goals (do NOT implement here):
      // - auto assign CLAN_ADMIN user role
      // - auto tenant HOAT_DONG (CLAN_SETUP stays TAM_NGUNG until Admin decides)
    },
  },

  /**
   * Map SRPF action → business_process_type enum currently available in schema.
   */
  actionToProcessType: {
    [SRPF_ACTIONS.SUBMIT]: 'ONBOARDING_SUBMIT',
    [SRPF_ACTIONS.START_REVIEW]: 'ONBOARDING_REVIEW_START',
    [SRPF_ACTIONS.RETURN_FOR_REVISION]: 'ONBOARDING_REVISION_REQUEST',
    [SRPF_ACTIONS.APPROVE]: 'ONBOARDING_APPROVE',
    [SRPF_ACTIONS.REJECT]: 'ONBOARDING_REJECT',
    [SRPF_ACTIONS.CANCEL]: 'ONBOARDING_CANCEL',
    [SRPF_ACTIONS.WITHDRAW]: 'ONBOARDING_CANCEL',
    [SRPF_ACTIONS.SAVE_DRAFT]: 'ONBOARDING_PROFILE_SAVE',
  },
};

/**
 * Register MEMBER_PROMOTE into the SRPF registry (idempotent overwrite).
 */
function registerMemberPromoteDefinition(registry) {
  const reg = registry || require('../registry/ProcessDefinitionRegistry');
  reg.register(PROCESS_TYPE, MemberPromoteDefinition);
  return MemberPromoteDefinition;
}

module.exports = {
  PROCESS_TYPE,
  BP_HARD_REQUIRED,
  MemberPromoteDefinition,
  registerMemberPromoteDefinition,
  loadPrimaryMember,
};
