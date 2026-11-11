/**
 * PATH       : src/modules/members/branch.service.js
 * DATETIME   : 2026-11-11T15:05:00+07:00
 * VERSION    : 1.11.0-MULTIHOME-AMEND02-V12-FINAL
 * DESCRIPTION:
 * - [AMEND-RP-OP-2026-02 V1.2] Lát 3/7 Branch Service hoàn chỉnh:
 *   + getBranchTree: Fail-closed nếu thiếu tenantId. Lọc tenant_id và deleted_at tường minh
 *     ở cả root và cấp 1 founder, originMember; bổ sung khử nhiễm in-memory.
 *   + loadBranch & loadMember: Chuyển sang findFirst kèm { id, tenant_id, deleted_at: null } thay vì findUnique trần.
 *   + Toàn bộ mutation (submitBranch, approveBranch, rejectBranch, setFounder, setOrigin, patchBranchMember, withdrawOpenTickets):
 *     Chuyển sang updateMany kèm { id, tenant_id, deleted_at: null } và findFirst đọc lại record,
 *     bảo đảm an toàn dữ liệu kể cả khi interactive transaction (tx) không đi qua extension.
 *   + tenantIdOf / roleOf: Ưu tiên activeTenantId và roleInTenant từ JWT snapshot.
 */

'use strict';

const crypto = require('crypto');
const { prisma, withTransaction, tenantContext } = require('../../lib/prisma.js');
const { writeBpl } = require('../../services/bpl.service.js');
const { silentEmit } = require('../notifications/services/silentNotificationEmit.service.js');
const {
  NotificationMetadataSchemas,
} = require('../notifications/policy/notification-metadata-schemas.js');

function parseQuotaSpan(raw) {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 30) {
    fail(
      'max_generation_span phải là số nguyên 1–30.',
      400,
      'BRANCH_QUOTA_SPAN'
    );
  }
  return n;
}

function fail(message, statusCode, code, extra) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  err.isOperational = true;
  if (extra) Object.assign(err, extra);
  throw err;
}

function actorIdOf(user) {
  return user && (user.id || user.userId);
}

function tenantIdOf(user) {
  return user && (user.activeTenantId || user.tenantId || user.tenant_id || null);
}

function roleOf(user) {
  return (user && (user.roleInTenant || user.role)) || '';
}

function isClanOrSys(user) {
  const r = roleOf(user);
  return r === 'CLAN_ADMIN' || r === 'SYSTEM_ADMIN';
}

async function loadBranch(txOrPrisma, branchId, tenantId = null) {
  const where = { id: branchId, deleted_at: null };
  if (tenantId) where.tenant_id = tenantId;
  const row = await txOrPrisma.branches.findFirst({ where });
  if (!row) {
    fail('Không tìm thấy chi.', 404, 'BRANCH_NOT_FOUND');
  }
  return row;
}

async function loadMember(txOrPrisma, memberId, tenantId = null) {
  if (!memberId) fail('Thiếu member_id.', 400, 'MEMBER_ID_REQUIRED');
  const where = { id: memberId, deleted_at: null };
  if (tenantId) where.tenant_id = tenantId;
  const row = await txOrPrisma.members.findFirst({ where });
  if (!row) {
    fail('Không tìm thấy người.', 404, 'MEMBER_NOT_FOUND');
  }
  return row;
}

async function assertSubmitPrecond(client, branch) {
  const missing = {
    founder: !branch.founder_id,
    parent_child_pair: true,
  };

  const members = await client.members.findMany({
    where: {
      branch_id: branch.id,
      tenant_id: branch.tenant_id,
      deleted_at: null,
    },
    select: {
      id: true,
      father_id: true,
      mother_id: true,
    },
  });

  const ids = new Set(members.map((m) => m.id));
  const hasPair = members.some(
    (m) =>
      (m.father_id && ids.has(m.father_id)) ||
      (m.mother_id && ids.has(m.mother_id))
  );
  missing.parent_child_pair = !hasPair;

  if (missing.founder || missing.parent_child_pair) {
    const need = [];
    if (missing.founder) need.push('người khai chi (founder_id)');
    if (missing.parent_child_pair) {
      need.push('ít nhất một cặp cha/mẹ–con cùng chi (members.branch_id)');
    }
    fail(
      'Chưa đủ điều kiện gửi duyệt. Cần: ' + need.join('; ') + '.',
      422,
      'BRANCH_SUBMIT_PRECOND',
      { missing }
    );
  }
}

function assertCanSubmit(branch, user) {
  if (isClanOrSys(user)) return;
  const actor = actorIdOf(user);
  if (branch.changed_by && actor && String(branch.changed_by) === String(actor)) {
    return;
  }
  fail(
    'Bác chỉ gửi được chi do bác tạo. Chi này thuộc người khác.',
    403,
    'BRANCH_SUBMIT_FORBIDDEN'
  );
}

const ATTACH_OPEN = ['DRAFT', 'PROVISIONAL', 'REJECTED'];
const DETACH_OK = ['DRAFT', 'PROVISIONAL', 'REJECTED'];

function assertCanAttach(branch, user) {
  if (isClanOrSys(user)) return;
  const actor = actorIdOf(user);
  if (
    branch.changed_by &&
    actor &&
    String(branch.changed_by) === String(actor) &&
    ATTACH_OPEN.includes(branch.status)
  ) {
    return;
  }
  fail(
    'Bác không được gắn người trên chi này.',
    403,
    'BRANCH_ATTACH_FORBIDDEN'
  );
}

function assertSameTenant(branch, member) {
  if (String(branch.tenant_id) !== String(member.tenant_id)) {
    fail('Người không thuộc dòng họ này.', 403, 'TENANT_MISMATCH');
  }
}

async function withdrawOpenTickets(tx, branchId, actor, tenantId = null) {
  const where = {
    ticket_type: 'BRANCH_REVIEW',
    target_table: 'branches',
    target_id: branchId,
    deleted_at: null,
    status: { in: ['DRAFT', 'PENDING', 'UNDER_REVIEW', 'NEEDS_REVISION'] },
    ...(tenantId ? { tenant_id: tenantId } : {}),
  };
  const open = await tx.proposals.findMany({
    where,
    select: { id: true },
  });
  for (const row of open) {
    await tx.proposals.updateMany({
      where: { id: row.id, ...(tenantId ? { tenant_id: tenantId } : {}) },
      data: {
        status: 'WITHDRAWN',
        changed_by: actor,
        updated_at: new Date(),
      },
    });
  }
}

async function emitSafe({ eventType, userId, metadata, correlationId, branch }) {
  let payloadMeta = metadata || {};
  const schema = NotificationMetadataSchemas[eventType];
  if (typeof schema === 'function') {
    try {
      payloadMeta = schema(payloadMeta);
    } catch (e) {
      console.error('[BranchNotifySchema]', eventType, e.message);
    }
  }
  await silentEmit(
    eventType,
    {
      userId,
      correlationId,
      metadata: {
        context: {
          target_id: branch.id,
          target_name: branch.name,
        },
        payload: payloadMeta,
      },
    },
    { branch_id: branch.id, eventType }
  );
}

const branchService = {
  getBranchTree: async (userOrTenantId = null) => {
    try {
      const store = tenantContext && typeof tenantContext.getStore === 'function' ? tenantContext.getStore() : null;
      let effectiveTenantId = null;
      if (typeof userOrTenantId === 'string') {
        effectiveTenantId = userOrTenantId;
      } else if (userOrTenantId && typeof userOrTenantId === 'object') {
        effectiveTenantId = tenantIdOf(userOrTenantId);
      }
      if (!effectiveTenantId) {
        effectiveTenantId = store?.activeTenantId || store?.tenantId || null;
      }

      if (!effectiveTenantId) {
        fail('getBranchTree yêu cầu tenantId hợp lệ (fail-closed).', 400, 'TENANT_REQUIRED');
      }

      const allBranches = await prisma.branches.findMany({
        where: {
          tenant_id: effectiveTenantId,
          deleted_at: null,
        },
        include: {
          founder: {
            where: {
              tenant_id: effectiveTenantId,
              deleted_at: null,
            },
            select: {
              id: true,
              full_name: true,
              generation: true,
              tenant_id: true,
              deleted_at: true,
            },
          },
          originMember: {
            where: {
              tenant_id: effectiveTenantId,
              deleted_at: null,
            },
            select: {
              id: true,
              full_name: true,
              generation: true,
              branch_id: true,
              tenant_id: true,
              deleted_at: true,
            },
          },
        },
        orderBy: {
          name: 'asc',
        },
      });

      const branchMap = {};
      allBranches.forEach((branch) => {
        // Lọc bảo vệ in-memory cấp 2:
        if (branch.founder && (branch.founder.deleted_at || (branch.founder.tenant_id && branch.founder.tenant_id !== effectiveTenantId))) {
          branch.founder = null;
        }
        if (branch.originMember && (branch.originMember.deleted_at || (branch.originMember.tenant_id && branch.originMember.tenant_id !== effectiveTenantId))) {
          branch.originMember = null;
        }

        branchMap[branch.id] = {
          ...branch,
          children: [],
        };
      });

      const rootBranches = [];

      allBranches.forEach((branch) => {
        const currentBranch = branchMap[branch.id];
        if (branch.parent_id && branchMap[branch.parent_id]) {
          branchMap[branch.parent_id].children.push(currentBranch);
        } else {
          rootBranches.push(currentBranch);
        }
      });

      return rootBranches;
    } catch (error) {
      console.error('[BranchTree Error]:', error.message);
      throw error;
    }
  },

  submitBranch: async ({ branchId, user, note, correlationId }) => {
    const actor = actorIdOf(user);
    if (!actor) fail('Thiếu người thực hiện.', 401, 'UNAUTHENTICATED');
    const corr = correlationId || crypto.randomUUID();

    const result = await withTransaction(
      {
        actorId: actor,
        actorType: 'USER',
        tenantId: tenantIdOf(user),
        correlationId: corr,
      },
      async (tx) => {
        const branch = await loadBranch(tx, branchId, tenantIdOf(user));
        assertCanSubmit(branch, user);

        const allowed = ['DRAFT', 'REJECTED', 'PROVISIONAL'];
        if (!allowed.includes(branch.status)) {
          fail(
            `Chi đang ${branch.status}, không gửi duyệt được.`,
            409,
            'BRANCH_INVALID_STATUS'
          );
        }

        await assertSubmitPrecond(tx, branch);

        await withdrawOpenTickets(tx, branch.id, actor, branch.tenant_id);

        const rejectedOpen = await tx.proposals.findMany({
          where: {
            ticket_type: 'BRANCH_REVIEW',
            target_table: 'branches',
            target_id: branch.id,
            status: 'REJECTED',
            deleted_at: null,
            tenant_id: branch.tenant_id,
          },
          select: { id: true },
        });
        for (const row of rejectedOpen) {
          await tx.proposals.updateMany({
            where: { id: row.id, tenant_id: branch.tenant_id },
            data: {
              status: 'WITHDRAWN',
              changed_by: actor,
              updated_at: new Date(),
            },
          });
        }

        const ticket = await tx.proposals.create({
          data: {
            id: crypto.randomUUID(),
            tenant_id: branch.tenant_id,
            ticket_type: 'BRANCH_REVIEW',
            status: 'PENDING',
            requester_user_id: actor,
            target_table: 'branches',
            target_id: branch.id,
            payload: {
              branch_id: branch.id,
              branch_name: branch.name,
              note: note || null,
              from_status: branch.status,
            },
            correlation_id: corr,
            changed_by: actor,
          },
        });

        await tx.branches.updateMany({
          where: { id: branch.id, tenant_id: branch.tenant_id, deleted_at: null },
          data: {
            status: 'SUBMITTED',
            changed_by: actor,
            updated_at: new Date(),
          },
        });
        const updated = await tx.branches.findFirst({
          where: { id: branch.id, tenant_id: branch.tenant_id, deleted_at: null },
        });

        await writeBpl({
          tx,
          processType: 'BRANCH_SUBMIT',
          action: 'SUBMIT',
          actorContext: {
            actor_id: actor,
            actor_type: 'USER',
            tenant_id: branch.tenant_id,
            correlation_id: corr,
          },
          context: { target_id: branch.id, target_name: branch.name },
          payload: {
            branch_id: branch.id,
            branch_name: branch.name,
            ticket_id: ticket.id,
            from_status: branch.status,
            to_status: 'SUBMITTED',
            submitted_note: note || null,
          },
          extraMetadata: {
            origin_member_id: branch.origin_member_id || null,
            max_generation_span: branch.max_generation_span == null
              ? null
              : branch.max_generation_span,
          },
        });

        return { branch: updated, ticket };
      }
    );

    await emitSafe({
      eventType: 'BRANCH_SUBMITTED',
      userId: actor,
      correlationId: corr,
      branch: result.branch,
      metadata: {
        branch_id: result.branch.id,
        branch_name: result.branch.name,
        ticket_id: result.ticket.id,
      },
    });

    return result;
  },

  approveBranch: async ({ branchId, user, note, max_generation_span, correlationId }) => {
    const actor = actorIdOf(user);
    if (!actor) fail('Thiếu người thực hiện.', 401, 'UNAUTHENTICATED');
    if (!isClanOrSys(user)) {
      fail('Chỉ Ban quản trị được chấp nhận chi.', 403, 'BRANCH_APPROVE_FORBIDDEN');
    }
    const corr = correlationId || crypto.randomUUID();

    const result = await withTransaction(
      {
        actorId: actor,
        actorType: 'USER',
        tenantId: tenantIdOf(user),
        correlationId: corr,
      },
      async (tx) => {
        const branch = await loadBranch(tx, branchId, tenantIdOf(user));
        const allowed = ['SUBMITTED', 'UNDER_REVIEW'];
        if (!allowed.includes(branch.status)) {
          fail(
            `Chi đang ${branch.status}, không chấp nhận được.`,
            409,
            'BRANCH_INVALID_STATUS'
          );
        }

        const ticket = await tx.proposals.findFirst({
          where: {
            ticket_type: 'BRANCH_REVIEW',
            target_table: 'branches',
            target_id: branch.id,
            status: { in: ['PENDING', 'UNDER_REVIEW'] },
            deleted_at: null,
            tenant_id: branch.tenant_id,
          },
          orderBy: { created_at: 'desc' },
        });
        if (!ticket) {
          fail('Không có hồ sơ duyệt đang mở.', 409, 'BRANCH_TICKET_MISSING');
        }

        const span = parseQuotaSpan(max_generation_span);

        const ticketPayload = {
          ...(ticket.payload && typeof ticket.payload === 'object' ? ticket.payload : {}),
        };
        if (span !== undefined) ticketPayload.max_generation_span = span;
        if (note) ticketPayload.approver_note = note;

        await tx.proposals.updateMany({
          where: { id: ticket.id, tenant_id: branch.tenant_id },
          data: {
            status: 'APPROVED',
            admin_note: note || ticket.admin_note,
            payload: ticketPayload,
            reviewed_by: actor,
            reviewed_at: new Date(),
            changed_by: actor,
            updated_at: new Date(),
          },
        });
        const closed = await tx.proposals.findFirst({
          where: { id: ticket.id, tenant_id: branch.tenant_id },
        });

        const branchData = {
          status: 'APPROVED',
          changed_by: actor,
          updated_at: new Date(),
        };
        if (span !== undefined) branchData.max_generation_span = span;

        await tx.branches.updateMany({
          where: { id: branch.id, tenant_id: branch.tenant_id, deleted_at: null },
          data: branchData,
        });
        const updated = await tx.branches.findFirst({
          where: { id: branch.id, tenant_id: branch.tenant_id, deleted_at: null },
        });

        await writeBpl({
          tx,
          processType: 'BRANCH_APPROVE',
          action: 'APPROVE',
          actorContext: {
            actor_id: actor,
            actor_type: 'USER',
            tenant_id: branch.tenant_id,
            correlation_id: corr,
          },
          context: { target_id: branch.id, target_name: branch.name },
          payload: {
            branch_id: branch.id,
            branch_name: branch.name,
            ticket_id: closed.id,
            from_status: branch.status,
            to_status: 'APPROVED',
            approver_note: note || null,
          },
          extraMetadata: {
            max_generation_span: span === undefined ? branch.max_generation_span : span,
          },
        });

        return { branch: updated, ticket: closed };
      }
    );

    const notifyUser = result.ticket.requester_user_id || actor;
    await emitSafe({
      eventType: 'BRANCH_APPROVED',
      userId: notifyUser,
      correlationId: corr,
      branch: result.branch,
      metadata: {
        branch_id: result.branch.id,
        branch_name: result.branch.name,
        ticket_id: result.ticket.id,
      },
    });

    return result;
  },

  rejectBranch: async ({ branchId, user, reason, correlationId }) => {
    const actor = actorIdOf(user);
    if (!actor) fail('Thiếu người thực hiện.', 401, 'UNAUTHENTICATED');
    if (!isClanOrSys(user)) {
      fail('Chỉ Ban quản trị được từ chối chi.', 403, 'BRANCH_REJECT_FORBIDDEN');
    }
    const why = reason && String(reason).trim();
    if (!why) {
      fail('Cần lý do từ chối.', 400, 'BRANCH_REJECT_REASON');
    }
    const corr = correlationId || crypto.randomUUID();

    const result = await withTransaction(
      {
        actorId: actor,
        actorType: 'USER',
        tenantId: tenantIdOf(user),
        correlationId: corr,
      },
      async (tx) => {
        const branch = await loadBranch(tx, branchId, tenantIdOf(user));
        const allowed = ['SUBMITTED', 'UNDER_REVIEW'];
        if (!allowed.includes(branch.status)) {
          fail(
            `Chi đang ${branch.status}, không từ chối được.`,
            409,
            'BRANCH_INVALID_STATUS'
          );
        }

        const ticket = await tx.proposals.findFirst({
          where: {
            ticket_type: 'BRANCH_REVIEW',
            target_table: 'branches',
            target_id: branch.id,
            status: { in: ['PENDING', 'UNDER_REVIEW'] },
            deleted_at: null,
            tenant_id: branch.tenant_id,
          },
          orderBy: { created_at: 'desc' },
        });
        if (!ticket) {
          fail('Không có hồ sơ duyệt đang mở.', 409, 'BRANCH_TICKET_MISSING');
        }

        await tx.proposals.updateMany({
          where: { id: ticket.id, tenant_id: branch.tenant_id },
          data: {
            status: 'REJECTED',
            admin_note: why,
            reviewed_by: actor,
            reviewed_at: new Date(),
            changed_by: actor,
            updated_at: new Date(),
          },
        });
        const closed = await tx.proposals.findFirst({
          where: { id: ticket.id, tenant_id: branch.tenant_id },
        });

        await tx.branches.updateMany({
          where: { id: branch.id, tenant_id: branch.tenant_id, deleted_at: null },
          data: {
            status: 'REJECTED',
            changed_by: actor,
            updated_at: new Date(),
          },
        });
        const updated = await tx.branches.findFirst({
          where: { id: branch.id, tenant_id: branch.tenant_id, deleted_at: null },
        });

        await writeBpl({
          tx,
          processType: 'BRANCH_REJECT',
          action: 'REJECT',
          actorContext: {
            actor_id: actor,
            actor_type: 'USER',
            tenant_id: branch.tenant_id,
            correlation_id: corr,
          },
          context: { target_id: branch.id, target_name: branch.name },
          payload: {
            branch_id: branch.id,
            branch_name: branch.name,
            ticket_id: closed.id,
            reason: why,
            from_status: branch.status,
            to_status: 'REJECTED',
          },
        });

        return { branch: updated, ticket: closed };
      }
    );

    const notifyUser = result.ticket.requester_user_id || actor;
    await emitSafe({
      eventType: 'BRANCH_REJECTED',
      userId: notifyUser,
      correlationId: corr,
      branch: result.branch,
      metadata: {
        branch_id: result.branch.id,
        branch_name: result.branch.name,
        ticket_id: result.ticket.id,
        reason: why,
      },
    });

    return result;
  },

  setFounder: async ({ branchId, user, memberId, correlationId }) => {
    const actor = actorIdOf(user);
    if (!actor) fail('Thiếu người thực hiện.', 401, 'UNAUTHENTICATED');
    const corr = correlationId || crypto.randomUUID();

    const result = await withTransaction(
      {
        actorId: actor,
        actorType: 'USER',
        tenantId: tenantIdOf(user),
        correlationId: corr,
      },
      async (tx) => {
        const branch = await loadBranch(tx, branchId, tenantIdOf(user));
        assertCanAttach(branch, user);
        const member = await loadMember(tx, memberId, branch.tenant_id);
        assertSameTenant(branch, member);

        if (member.branch_id && String(member.branch_id) !== String(branch.id)) {
          fail(
            'Người này đã đứng chi khác. Không chuyển chi (Founder phải thuộc chi này hoặc chưa gắn).',
            422,
            'BRANCH_FOUNDER_TAKEN'
          );
        }

        await tx.members.updateMany({
          where: { id: member.id, tenant_id: branch.tenant_id, deleted_at: null },
          data: {
            branch_id: branch.id,
            changed_by: actor,
            updated_at: new Date(),
          },
        });
        const updatedMember = await tx.members.findFirst({
          where: { id: member.id, tenant_id: branch.tenant_id, deleted_at: null },
        });

        await tx.branches.updateMany({
          where: { id: branch.id, tenant_id: branch.tenant_id, deleted_at: null },
          data: {
            founder_id: member.id,
            changed_by: actor,
            updated_at: new Date(),
          },
        });
        const updated = await tx.branches.findFirst({
          where: { id: branch.id, tenant_id: branch.tenant_id, deleted_at: null },
        });

        await writeBpl({
          tx,
          processType: 'BRANCH_MEMBER_ATTACH',
          action: 'SET_FOUNDER',
          actorContext: {
            actor_id: actor,
            actor_type: 'USER',
            tenant_id: branch.tenant_id,
            correlation_id: corr,
          },
          context: { target_id: branch.id, target_name: branch.name },
          payload: {
            branch_id: branch.id,
            branch_name: branch.name,
            member_id: member.id,
            member_name: member.full_name || null,
          },
          extraMetadata: { role: 'FOUNDER' },
        });

        return { branch: updated, member: updatedMember };
      }
    );

    return result;
  },

  setOrigin: async ({ branchId, user, memberId, correlationId }) => {
    const actor = actorIdOf(user);
    if (!actor) fail('Thiếu người thực hiện.', 401, 'UNAUTHENTICATED');
    const corr = correlationId || crypto.randomUUID();

    const result = await withTransaction(
      {
        actorId: actor,
        actorType: 'USER',
        tenantId: tenantIdOf(user),
        correlationId: corr,
      },
      async (tx) => {
        const branch = await loadBranch(tx, branchId, tenantIdOf(user));
        assertCanAttach(branch, user);

        let member = null;
        if (memberId) {
          member = await loadMember(tx, memberId, branch.tenant_id);
          assertSameTenant(branch, member);
        } else if (['APPROVED', 'MERGED', 'SUBMITTED', 'UNDER_REVIEW'].includes(branch.status)) {
          fail(
            'Chi đang xét hoặc đã tem, không gỡ Tổ nghiệp.',
            409,
            'BRANCH_ORIGIN_LOCKED'
          );
        }

        await tx.branches.updateMany({
          where: { id: branch.id, tenant_id: branch.tenant_id, deleted_at: null },
          data: {
            origin_member_id: member ? member.id : null,
            changed_by: actor,
            updated_at: new Date(),
          },
        });
        const updated = await tx.branches.findFirst({
          where: { id: branch.id, tenant_id: branch.tenant_id, deleted_at: null },
        });

        if (member) {
          await writeBpl({
            tx,
            processType: 'BRANCH_MEMBER_ATTACH',
            action: 'SET_ORIGIN',
            actorContext: {
              actor_id: actor,
              actor_type: 'USER',
              tenant_id: branch.tenant_id,
              correlation_id: corr,
            },
            context: { target_id: branch.id, target_name: branch.name },
            payload: {
              branch_id: branch.id,
              branch_name: branch.name,
              member_id: member.id,
              member_name: member.full_name || null,
            },
            extraMetadata: {
              role: 'ORIGIN',
              member_branch_id_unchanged: member.branch_id || null,
            },
          });
        }

        return { branch: updated, member };
      }
    );

    return result;
  },

  patchBranchMember: async ({ branchId, user, memberId, op, correlationId }) => {
    const actor = actorIdOf(user);
    if (!actor) fail('Thiếu người thực hiện.', 401, 'UNAUTHENTICATED');
    const action = String(op || '').toUpperCase();
    if (action !== 'ATTACH' && action !== 'DETACH') {
      fail('op phải là ATTACH hoặc DETACH.', 400, 'BRANCH_MEMBER_OP');
    }
    const corr = correlationId || crypto.randomUUID();

    const result = await withTransaction(
      {
        actorId: actor,
        actorType: 'USER',
        tenantId: tenantIdOf(user),
        correlationId: corr,
      },
      async (tx) => {
        const branch = await loadBranch(tx, branchId, tenantIdOf(user));
        assertCanAttach(branch, user);
        const member = await loadMember(tx, memberId, branch.tenant_id);
        assertSameTenant(branch, member);

        if (action === 'ATTACH') {
          if (member.branch_id && String(member.branch_id) !== String(branch.id)) {
            fail(
              'Người này đã đứng chi khác. Multi-home chưa mở.',
              422,
              'MEMBER_BRANCH_TAKEN'
            );
          }
          await tx.members.updateMany({
            where: { id: member.id, tenant_id: branch.tenant_id, deleted_at: null },
            data: {
              branch_id: branch.id,
              changed_by: actor,
              updated_at: new Date(),
            },
          });
          const updatedMember = await tx.members.findFirst({
            where: { id: member.id, tenant_id: branch.tenant_id, deleted_at: null },
          });

          await writeBpl({
            tx,
            processType: 'BRANCH_MEMBER_ATTACH',
            action: 'ATTACH',
            actorContext: {
              actor_id: actor,
              actor_type: 'USER',
              tenant_id: branch.tenant_id,
              correlation_id: corr,
            },
            context: { target_id: branch.id, target_name: branch.name },
            payload: {
              branch_id: branch.id,
              branch_name: branch.name,
              member_id: member.id,
              member_name: member.full_name || null,
            },
          });
          return { branch, member: updatedMember, op: 'ATTACH' };
        }

        if (!DETACH_OK.includes(branch.status)) {
          fail(
            'Chi đang xét hoặc đã tem, không tháo người.',
            409,
            'BRANCH_DETACH_LOCKED'
          );
        }
        if (member.branch_id && String(member.branch_id) !== String(branch.id)) {
          fail('Người không thuộc chi này.', 409, 'MEMBER_NOT_ON_BRANCH');
        }

        const memberPatch = {
          branch_id: null,
          changed_by: actor,
          updated_at: new Date(),
        };
        await tx.members.updateMany({
          where: { id: member.id, tenant_id: branch.tenant_id, deleted_at: null },
          data: memberPatch,
        });
        const updatedMember = await tx.members.findFirst({
          where: { id: member.id, tenant_id: branch.tenant_id, deleted_at: null },
        });

        let updatedBranch = branch;
        if (branch.founder_id && String(branch.founder_id) === String(member.id)) {
          await tx.branches.updateMany({
            where: { id: branch.id, tenant_id: branch.tenant_id, deleted_at: null },
            data: {
              founder_id: null,
              changed_by: actor,
              updated_at: new Date(),
            },
          });
          updatedBranch = await tx.branches.findFirst({
            where: { id: branch.id, tenant_id: branch.tenant_id, deleted_at: null },
          });
        }

        await writeBpl({
          tx,
          processType: 'BRANCH_MEMBER_ATTACH',
          action: 'DETACH',
          actorContext: {
            actor_id: actor,
            actor_type: 'USER',
            tenant_id: branch.tenant_id,
            correlation_id: corr,
          },
          context: { target_id: branch.id, target_name: branch.name },
          payload: {
            branch_id: branch.id,
            branch_name: branch.name,
            member_id: member.id,
            member_name: member.full_name || null,
          },
          extraMetadata: { op: 'DETACH' },
        });

        return { branch: updatedBranch, member: updatedMember, op: 'DETACH' };
      }
    );

    return result;
  },
};

module.exports = branchService;
