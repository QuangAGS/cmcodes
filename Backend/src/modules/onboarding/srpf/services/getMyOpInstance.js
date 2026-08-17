/**
 * PATH       : Backend/src/modules/onboarding/srpf/services/getMyOpInstance.js
 * DATETIME   : 2026-08-16T20:00:00+07:00
 * VERSION    : 1.0.0-FE-OP-B1
 * DESCRIPTION:
 * - Read-only: lấy OP (MEMBER_PROMOTE) đang mở của user hiện tại cho FE hub/guard.
 * - Contract FE-OP-MEMBER_PROMOTE-2026-08-16: hasOpen, process_kind, case, primary, completeness.
 * - Tái sử dụng findOpenOpCase (openMemberPromoteInstance.js). Không side-effect.
 * - Q1: không đụng auth.service / create / submit / approve.
 */

'use strict';

const { prisma } = require('../../../../lib/prisma.js');
const {
  findOpenOpCase,
  PROCESS_TYPE,
} = require('./openMemberPromoteInstance.js');

/** Khớp MemberPromote.definition.js BP_HARD_REQUIRED */
const BP_HARD_REQUIRED = Object.freeze([
  'full_name',
  'gender',
  'is_alive',
  'birth_year',
  'birth_month',
  'birth_day',
]);

/**
 * @param {object|null} member
 * @param {string|null} caseType
 * @returns {{ complete: boolean, missingFields: string[] }}
 */
function computeCompleteness(member, caseType) {
  if (!member) {
    return { complete: false, missingFields: [...BP_HARD_REQUIRED] };
  }

  const missing = [];
  for (const f of BP_HARD_REQUIRED) {
    const v = member[f];
    if (v === null || v === undefined || v === '') {
      missing.push(f);
    }
  }

  if (caseType === 'CLAN_SETUP') {
    if (member.generation == null || Number(member.generation) < 1) {
      if (!missing.includes('generation')) missing.push('generation');
    }
  }

  return {
    complete: missing.length === 0,
    missingFields: missing,
  };
}

/**
 * Empty contract payload (hasOpen false).
 * @returns {object}
 */
function emptyPayload() {
  return {
    hasOpen: false,
    process_kind: null,
    case: null,
    primary: null,
    completeness: null,
  };
}

/**
 * Map member row → primary DTO (chỉ field FE cần).
 * @param {object} member
 */
function mapPrimary(member) {
  return {
    id: member.id,
    status: member.status,
    full_name: member.full_name ?? null,
    gender: member.gender ?? null,
    is_alive: member.is_alive ?? null,
    birth_year: member.birth_year ?? null,
    birth_month: member.birth_month ?? null,
    birth_day: member.birth_day ?? null,
    generation: member.generation ?? null,
  };
}

/**
 * GET my-op for current user.
 *
 * hasOpen = true chỉ khi:
 * - user có member_id
 * - member.status === 'DU_BI'
 * - có onboarding_cases OP non-terminal (findOpenOpCase)
 *
 * @param {object} input
 * @param {string} input.userId
 * @param {import('@prisma/client').Prisma.TransactionClient|object} [input.client]
 * @returns {Promise<object>} data payload (không bọc success)
 */
async function getMyOpInstance(input = {}) {
  const { userId, client = prisma } = input;

  if (!userId || typeof userId !== 'string') {
    return emptyPayload();
  }

  const user = await client.users.findFirst({
    where: { id: userId, deleted_at: null },
    select: {
      id: true,
      member_id: true,
      tenant_id: true,
      status: true,
    },
  });

  if (!user || !user.member_id) {
    return emptyPayload();
  }

  const member = await client.members.findFirst({
    where: { id: user.member_id, deleted_at: null },
    select: {
      id: true,
      status: true,
      tenant_id: true,
      full_name: true,
      gender: true,
      is_alive: true,
      birth_year: true,
      birth_month: true,
      birth_day: true,
      generation: true,
    },
  });

  if (!member) {
    return emptyPayload();
  }

  const tenantId = user.tenant_id || member.tenant_id;
  if (!tenantId) {
    return emptyPayload();
  }

  const openCase = await findOpenOpCase({
    memberId: member.id,
    tenantId,
    client,
  });

  // hasOpen: bắt buộc DU_BI + case OP đang mở
  if (!openCase || member.status !== 'DU_BI') {
    return emptyPayload();
  }

  const caseType = openCase.case_type || null;
  const completeness = computeCompleteness(member, caseType);

  return {
    hasOpen: true,
    process_kind: PROCESS_TYPE, // MEMBER_PROMOTE
    case: {
      id: openCase.id,
      status: openCase.status,
      case_type: caseType,
      process_kind:
        openCase.process_kind || PROCESS_TYPE,
    },
    primary: mapPrimary(member),
    completeness,
  };
}

module.exports = {
  getMyOpInstance,
  computeCompleteness,
  BP_HARD_REQUIRED,
  emptyPayload,
};