/**
 * PATH       : src/modules/members/branch.service.js
 * DATETIME   : 2026-09-12T16:00:00+07:00
 * VERSION    : 1.8.0-M13-REVIEW
 * DESCRIPTION: Cây chi + SUBMIT/APPROVE/REJECT.
 *   TX: status + proposal BRANCH_REVIEW + writeBpl.
 *   Sau commit: silentEmit. APPROVED = tem, không khóa field.
 *   Submit: 422 nếu thiếu founder_id hoặc cặp cha/mẹ–con cùng branch_id.
 */

'use strict';

const crypto = require('crypto');
const { prisma, withTransaction } = require('../../lib/prisma.js');
const { writeBpl } = require('../../services/bpl.service.js');
const { silentEmit } = require('../notifications/services/silentNotificationEmit.service.js');
const {
  NotificationMetadataSchemas,
} = require('../notifications/policy/notification-metadata-schemas.js');

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
  return user && (user.tenant_id || user.tenantId || null);
}

function roleOf(user) {
  return (user && user.role) || '';
}

function isClanOrSys(user) {
  const r = roleOf(user);
  return r === 'CLAN_ADMIN' || r === 'SYSTEM_ADMIN';
}

async function loadBranch(txOrPrisma, branchId) {
  const row = await txOrPrisma.branches.findUnique({
    where: { id: branchId },
  });
  if (!row || row.deleted_at) {
    fail('Không tìm thấy chi.', 404, 'BRANCH_NOT_FOUND');
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

async function withdrawOpenTickets(tx, branchId, actor) {
  const open = await tx.proposals.findMany({
    where: {
      ticket_type: 'BRANCH_REVIEW',
      target_table: 'branches',
      target_id: branchId,
      deleted_at: null,
      status: { in: ['DRAFT', 'PENDING', 'UNDER_REVIEW', 'NEEDS_REVISION'] },
    },
    select: { id: true },
  });
  for (const row of open) {
    await tx.proposals.update({
      where: { id: row.id },
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
  getBranchTree: async () => {
    try {
      const allBranches = await prisma.branches.findMany({
        include: {
          founder: {
            select: {
              id: true,
              full_name: true,
              generation: true,
            },
          },
          originMember: {
            select: {
              id: true,
              full_name: true,
              generation: true,
              branch_id: true,
            },
          },
        },
        orderBy: {
          name: 'asc',
        },
      });

      const branchMap = {};
      allBranches.forEach((branch) => {
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
      throw new Error('Không thể xây dựng cấu trúc chi họ. Vui lòng thử lại sau.');
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
        const branch = await loadBranch(tx, branchId);
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

        await withdrawOpenTickets(tx, branch.id, actor);

        const rejectedOpen = await tx.proposals.findMany({
          where: {
            ticket_type: 'BRANCH_REVIEW',
            target_table: 'branches',
            target_id: branch.id,
            status: 'REJECTED',
            deleted_at: null,
          },
          select: { id: true },
        });
        for (const row of rejectedOpen) {
          await tx.proposals.update({
            where: { id: row.id },
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

        const updated = await tx.branches.update({
          where: { id: branch.id },
          data: {
            status: 'SUBMITTED',
            changed_by: actor,
            updated_at: new Date(),
          },
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

  approveBranch: async ({ branchId, user, note, correlationId }) => {
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
        const branch = await loadBranch(tx, branchId);
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
          },
          orderBy: { created_at: 'desc' },
        });
        if (!ticket) {
          fail('Không có hồ sơ duyệt đang mở.', 409, 'BRANCH_TICKET_MISSING');
        }

        const closed = await tx.proposals.update({
          where: { id: ticket.id },
          data: {
            status: 'APPROVED',
            admin_note: note || ticket.admin_note,
            reviewed_by: actor,
            reviewed_at: new Date(),
            changed_by: actor,
            updated_at: new Date(),
          },
        });

        const updated = await tx.branches.update({
          where: { id: branch.id },
          data: {
            status: 'APPROVED',
            changed_by: actor,
            updated_at: new Date(),
          },
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
        const branch = await loadBranch(tx, branchId);
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
          },
          orderBy: { created_at: 'desc' },
        });
        if (!ticket) {
          fail('Không có hồ sơ duyệt đang mở.', 409, 'BRANCH_TICKET_MISSING');
        }

        const closed = await tx.proposals.update({
          where: { id: ticket.id },
          data: {
            status: 'REJECTED',
            admin_note: why,
            reviewed_by: actor,
            reviewed_at: new Date(),
            changed_by: actor,
            updated_at: new Date(),
          },
        });

        const updated = await tx.branches.update({
          where: { id: branch.id },
          data: {
            status: 'REJECTED',
            changed_by: actor,
            updated_at: new Date(),
          },
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
};

module.exports = branchService;
