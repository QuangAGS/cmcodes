/**
 * PATH       : src/modules/mfo/mfo.draft.js
 * DATETIME   : 2026-10-22T11:52:00+07:00
 * VERSION    : 2.4.1-KEEP-GATE-FLAG
 * DESCRIPTION:
 * - Tuân thủ Q1 (Bảo tồn nghiệp vụ cũ) & Q2 (Code Format & Chú thích đầy đủ).
 * - Bổ sung Guardrail khóa cứng API saveDraft: Chặn không cho sửa bản nháp nếu ticket_id
 *   đang ở trạng thái khác DRAFT (như PENDING, UNDER_REVIEW).
 * CHANGELOG  :
 * - 2026-10-22T08:06:00+07:00 | 2.4.0 | Lưu cập nhật tờ đang mở, kể cả cần sửa. Không tạo tờ DRAFT mới.
 * - 2026-10-22T11:52:00+07:00 | 2.4.1 | Bỏ ép plan_ok false. Tờ cửa 2 giữ cờ.
 * - 2026-10-08: Thêm kiểm tra proposal.status !== 'DRAFT' thì ném lỗi 409 MFO_PROPOSAL_LOCKED.
 */

const { prisma, withTransaction } = require('../../lib/prisma.js');
const { fail } = require('./mfo.payload.js');
const { mfoWriteBpl } = require('./mfo.ledger.js');

function actorIdOf(user) {
  return user && (user.id || user.userId);
}
function tenantIdOf(user) {
  return user && (user.tenant_id || user.tenantId || null);
}

/**
 * Xử lý lưu nháp Tờ trình MFO 5L (Optimistic Lock + Single Pipeline Guardrail)
 */
async function saveDraft({ user, body, correlationId }) {
  const actor = actorIdOf(user);
  if (!actor) fail('Thiếu người thực hiện.', 401, 'UNAUTHENTICATED');
  const tenantId = tenantIdOf(user);
  if (!tenantId) fail('Thiếu tenant.', 400, 'TENANT_REQUIRED');

  const targetMemberId = body.target_member_id || body.origin_member_id;
  if (!targetMemberId) {
    fail('Lưu nháp bắt buộc chọn Thành viên mốc M (target_member_id).', 400, 'MFO_TARGET_REQUIRED');
  }

  // Bắt buộc mốc M phải tồn tại trên sổ
  const targetMember = await prisma.members.findUnique({
    where: { id: targetMemberId },
    select: { id: true, tenant_id: true, deleted_at: true },
  });

  if (!targetMember || targetMember.deleted_at) {
    fail('Thành viên mốc M không tồn tại trên sổ.', 404, 'MFO_TARGET_NOT_FOUND');
  }

  if (String(targetMember.tenant_id) !== String(tenantId)) {
    fail('Thành viên mốc M không thuộc dòng họ này.', 403, 'TENANT_MISMATCH');
  }

  const selectedCanvasDepth = Number(body.selected_canvas_depth ?? body.k ?? 0);
  const now = new Date();

  // Tìm bản nháp DRAFT đang mở của User
  const existingDraft = await prisma.proposals.findFirst({
    where: {
      tenant_id: tenantId,
      requester_user_id: actor,
      ticket_type: 'MFO_REVIEW',
      deleted_at: null,
      status: 'DRAFT',
    },
    orderBy: { updated_at: 'desc' },
  });

  // NẾU CÓ TICKET_ID TRUYỀN LÊN: KIỂM TRA KHÓA ĐÓNG BĂNG HỒ SƠ
  if (body.ticket_id || body.ticketId) {
    const targetTicketId = body.ticket_id || body.ticketId;
    const currentProposal = await prisma.proposals.findUnique({
      where: { id: targetTicketId },
      select: { id: true, status: true, updated_at: true },
    });

    // <2026-10-22T08:06:00+07:00> Mục đích: Tờ cần sửa vẫn được lưu vào chính nó. Lý do: chặn khác DRAFT làm máy tạo tờ mới.
    if (currentProposal && !['DRAFT', 'NEEDS_REVISION'].includes(currentProposal.status)) {
      fail(
        `Tờ trình đang ở trạng thái [${currentProposal.status}], không thể lưu sửa nháp!`,
        409,
        'MFO_PROPOSAL_LOCKED'
      );
    }
  }

  const payloadToSave = {
    kind: 'PLAN',
    target_member_id: targetMemberId,
    origin_member_id: targetMemberId,
    selected_canvas_depth: selectedCanvasDepth,
    k: selectedCanvasDepth,
    lines: Array.isArray(body.lines) ? body.lines : [],
    canvas_delta: body.canvas_delta || {
      draft_children: [],
      draft_spouses: [],
      node_positions_x: {},
    },
    graph_snapshot: body.graph_snapshot || null,
    init_scs: body.init_scs || body.diff_summary || [],
    diff_summary: body.diff_summary || body.init_scs || [],
    // <2026-10-22T11:52:00+07:00> Mục đích: Không hạ cờ cửa 2. Lý do: bản trước ép plan_ok false cho mọi lần lưu.
    plan_ok: false,
    result_submitted: false,
    result_ok: false,
  };
  // <2026-10-22T11:52:00+07:00> Mục đích: Giữ cờ của tờ đang mở. Lý do: ép false làm cửa 2 thành cửa 1.
  const keepId = body.ticket_id || body.ticketId;
  if (keepId) {
    const keep = await prisma.proposals.findUnique({ where: { id: keepId }, select: { payload: true } });
    const kept = (keep && keep.payload) || {};
    payloadToSave.plan_ok = kept.plan_ok === true;
    payloadToSave.result_submitted = kept.result_submitted === true;
    payloadToSave.result_ok = kept.result_ok === true;
  }

  const corr = correlationId || existingDraft?.correlation_id || require('crypto').randomUUID();

  return await withTransaction(
    { tenantId, actorId: actor, correlationId: corr },
    async (tx) => {
      let ticket;

      const ticketId = body.ticket_id || body.ticketId;
      const openTicket = ticketId
        ? await tx.proposals.findFirst({ where: { id: ticketId, tenant_id: tenantId, deleted_at: null } })
        : existingDraft;
      if (openTicket) {
        // KIỂM TRA OPTIMISTIC LOCK (Khóa lạc quan)
        if (body.updated_at) {
          const clientTime = new Date(body.updated_at).getTime();
          const serverTime = new Date(openTicket.updated_at).getTime();
          if (Math.abs(clientTime - serverTime) > 2000) {
            fail('Bản nháp đã được cập nhật từ thiết bị khác. Vui lòng nạp lại trang!', 409, 'OPTIMISTIC_LOCK_CONFLICT');
          }
        }

        ticket = await tx.proposals.update({
          where: { id: openTicket.id },
          data: {
            target_id: targetMemberId,
            payload: payloadToSave,
            updated_at: now,
            changed_by: actor,
          },
        });
      } else {
        ticket = await tx.proposals.create({
          data: {
            tenant_id: tenantId,
            ticket_type: 'MFO_REVIEW',
            status: 'DRAFT',
            requester_user_id: actor,
            target_table: 'members',
            target_id: targetMemberId,
            payload: payloadToSave,
            payload_schema_version: 2,
            correlation_id: corr,
            changed_by: actor,
          },
        });
      }

      // Ghi Sổ cái quy trình BPL
      await mfoWriteBpl(tx, {
        processType: 'MFO_PLAN_SUBMIT',
        user,
        ticket,
        payload: {
          action: 'MFO_DRAFT_SAVED',
          ticket_id: ticket.id,
          target_member_id: targetMemberId,
          saved_at: now.toISOString(),
        },
      });

      return {
        ticket,
        updated_at: ticket.updated_at.toISOString(),
      };
    }
  );
}

module.exports = {
  saveDraft,
};