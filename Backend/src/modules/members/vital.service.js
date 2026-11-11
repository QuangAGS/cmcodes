/**
 * PATH       : src/modules/members/vital.service.js
 * DATETIME   : 2026-11-11T12:40:00+07:00
 * VERSION    : 1.1.0-MULTIHOME-AMEND02-V12
 * DESCRIPTION:
 * - [AMEND-RP-OP-2026-02 V1.2] Lát 2/7 Vital Service:
 *   + Hỗ trợ tập vai trò quản trị dòng họ: CLAN_ADMIN, SYSTEM_ADMIN, TRUONG_HO, TRUONG_TOC, TRUONG_NGANH, TRUONG_CHI.
 *   + role lấy từ roleInTenant || role, tenantId lấy từ activeTenantId || tenantId.
 *   + Loại bỏ bypass ngầm allowUnscoped: actor.role === 'SYSTEM_ADMIN' -> khóa allowUnscoped: false.
 */

'use strict';

const { prisma, runWithTenantContext } = require('../../lib/prisma.js');
const { logAction } = require('../../services/audit.service.js');

const ADMIN_ROLES = new Set([
  'SYSTEM_ADMIN',
  'CLAN_ADMIN',
  'TRUONG_HO',
  'TRUONG_TOC',
  'TRUONG_NGANH',
  'TRUONG_CHI',
]);

function deny(code, message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  err.isOperational = true;
  throw err;
}

function actorOf(user) {
  const role = user?.roleInTenant || user?.role || null;
  return {
    userId: user?.userId || user?.id || null,
    tenantId: user?.activeTenantId || user?.tenantId || user?.tenant_id || null,
    role: role ? String(role).toUpperCase() : null,
    activeMemberId: user?.activeMemberId || user?.member_id || null,
  };
}

function toInt(v, name, { min, max } = {}) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  if (!Number.isInteger(n)) deny('BAD_REQUEST', `${name} không hợp lệ.`, 400);
  if (min != null && n < min) deny('BAD_REQUEST', `${name} không hợp lệ.`, 400);
  if (max != null && n > max) deny('BAD_REQUEST', `${name} không hợp lệ.`, 400);
  return n;
}

async function patchVital(reqUser, memberId, body = {}) {
  const actor = actorOf(reqUser);
  if (!actor.userId) deny('UNAUTHORIZED', 'Thiếu phiên đăng nhập.', 401);

  // AMEND-02 V1.2: Hỗ trợ tập vai trò Admin trong dòng họ
  if (!ADMIN_ROLES.has(actor.role)) {
    deny('FORBIDDEN', 'Chỉ ban quản trị dòng họ được đổi tình trạng sống.', 403);
  }

  const row = await prisma.members.findFirst({
    where: { id: String(memberId), deleted_at: null },
  });
  if (!row) deny('NOT_FOUND', 'Không tìm thấy thành viên.', 404);

  if (actor.role !== 'SYSTEM_ADMIN' && actor.tenantId !== row.tenant_id) {
    deny('FORBIDDEN', 'Không sửa thành viên dòng họ khác.', 403);
  }

  if (body.is_alive === undefined) {
    deny('BAD_REQUEST', 'Cần is_alive.', 400);
  }
  const isAlive = body.is_alive === true || body.is_alive === 'true' || body.is_alive === '1';

  const data = { is_alive: isAlive, changed_by: actor.userId, updated_at: new Date() };
  if (isAlive) {
    data.death_year = null;
    data.death_month = null;
    data.death_day = null;
    data.is_death_lunar = false;
    data.death_note = null;
  } else {
    data.death_year = toInt(body.death_year, 'Năm mất', { min: 1000, max: 2100 });
    data.death_month = toInt(body.death_month, 'Tháng mất', { min: 1, max: 12 });
    data.death_day = toInt(body.death_day, 'Ngày mất', { min: 1, max: 31 });
    data.is_death_lunar = !!(body.is_death_lunar === true || body.is_death_lunar === 'true' || body.is_death_lunar === '1');
    data.death_note = body.death_note == null || body.death_note === ''
      ? null
      : String(body.death_note).trim().slice(0, 100);
    if (!data.death_year) deny('BAD_REQUEST', 'Người đã mất cần ít nhất năm mất.', 400);
  }

  // AMEND-02 V1.2: allowUnscoped: false (triệt tiêu bypass ngầm định)
  return runWithTenantContext(
    { tenantId: row.tenant_id, userId: actor.userId, allowUnscoped: false },
    async () => {
      const upd = await prisma.members.updateMany({
        where: { id: row.id, tenant_id: row.tenant_id, deleted_at: null },
        data,
      });
      if (upd.count !== 1) deny('NOT_FOUND', 'Không cập nhật được thành viên.', 404);
      const next = await prisma.members.findFirst({
        where: { id: row.id, tenant_id: row.tenant_id, deleted_at: null },
      });
      try {
        await logAction(
          'CAP_NHAT',
          'members',
          row.id,
          { is_alive: row.is_alive, death_year: row.death_year, death_note: row.death_note },
          { is_alive: next.is_alive, death_year: next.death_year, death_note: next.death_note },
          actor.userId,
          'M11 steward vital',
          row.tenant_id
        );
      } catch (_) { /* best-effort */ }
      return {
        id: next.id,
        full_name: next.full_name,
        is_alive: next.is_alive !== false,
        death_year: next.death_year,
        death_month: next.death_month,
        death_day: next.death_day,
        is_death_lunar: !!next.is_death_lunar,
        death_note: next.death_note,
      };
    }
  );
}

module.exports = { patchVital };
