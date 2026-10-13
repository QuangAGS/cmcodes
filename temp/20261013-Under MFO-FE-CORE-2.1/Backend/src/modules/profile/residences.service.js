/**
 * PATH       : src/modules/profile/residences.service.js
 * DATETIME   : 2026-09-09T09:30:00+07:00
 * VERSION    : 1.0.0-RESIDENCE-API
 * DESCRIPTION: Lịch sử chỗ ở. ALS. Đồng bộ current_address_id khi is_current.
 */

'use strict';

const { prisma, correlation, runWithTenantContext } = require('../../lib/prisma.js');
const { logAction } = require('../../services/audit.service.js');
const { resolveMemberActor, upsertAddress } = require('./profile.service.js');
const { canEditProfile } = require('../members/profileAccess.service.js');

const KINDS = new Set(['ORIGIN', 'RESIDENCE', 'TEMPORARY', 'LAST', 'RESTING']);

const SELECT = {
  id: true,
  tenant_id: true,
  member_id: true,
  address_id: true,
  kind: true,
  from_year: true,
  from_month: true,
  from_day: true,
  to_year: true,
  to_month: true,
  to_day: true,
  is_lunar: true,
  is_current: true,
  note: true,
  created_at: true,
  updated_at: true,
  addresses: {
    select: {
      id: true,
      full_address: true,
      admin_area: true,
      sub_locality: true,
      line1: true,
      line2: true,
      notes: true,
      latitude: true,
      longitude: true,
      location_url: true,
    },
  },
};

function deny(code, message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  err.isOperational = true;
  throw err;
}

function pickTenant(reqUser) {
  return reqUser?.tenantId || reqUser?.tenant_id || null;
}

function withAls(reqUser, fn) {
  const tenantId = pickTenant(reqUser);
  if (!tenantId) deny('S0_TENANT', 'Thiếu tenant trên phiên đăng nhập.', 401);
  return runWithTenantContext(
    { tenantId, userId: reqUser.id || reqUser.userId || null },
    fn
  );
}

function toInt(v, name, { min = 1, max = 31 } = {}) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) deny('BAD_REQUEST', `${name} không hợp lệ.`, 400);
  return n;
}

function parseBody(body = {}, { partial = false } = {}) {
  const out = {};
  if (!partial || body.address_id !== undefined) {
    const address_id = String(body.address_id || '').trim();
    if (address_id) out.address_id = address_id;
    else if (!partial && !(body.place || body.address)) deny('BAD_REQUEST', 'address_id bắt buộc.', 400);
  }
  if (!partial || body.kind !== undefined) {
    const kind = String(body.kind || 'RESIDENCE').toUpperCase();
    if (!KINDS.has(kind)) deny('BAD_REQUEST', 'kind không hợp lệ.', 400);
    out.kind = kind;
  }
  if (!partial || body.from_year !== undefined) {
    out.from_year = toInt(body.from_year, 'from_year', { min: 1000, max: 2100 });
    if (!partial && out.from_year == null) deny('BAD_REQUEST', 'from_year bắt buộc.', 400);
  }
  if (!partial || body.from_month !== undefined) out.from_month = toInt(body.from_month, 'from_month', { min: 1, max: 12 });
  if (!partial || body.from_day !== undefined) out.from_day = toInt(body.from_day, 'from_day', { min: 1, max: 31 });
  if (!partial || body.to_year !== undefined) out.to_year = toInt(body.to_year, 'to_year', { min: 1000, max: 2100 });
  if (!partial || body.to_month !== undefined) out.to_month = toInt(body.to_month, 'to_month', { min: 1, max: 12 });
  if (!partial || body.to_day !== undefined) out.to_day = toInt(body.to_day, 'to_day', { min: 1, max: 31 });
  if (!partial || body.is_lunar !== undefined) out.is_lunar = !!body.is_lunar;
  if (!partial || body.is_current !== undefined) out.is_current = !!body.is_current;
  if (!partial || body.note !== undefined) {
    out.note = body.note == null || body.note === '' ? null : String(body.note).trim().slice(0, 255);
  }
  if (out.from_year && out.to_year && out.to_year < out.from_year) {
    deny('BAD_REQUEST', 'Năm kết thúc không được trước năm bắt đầu.', 400);
  }
  return out;
}

function mapRow(row) {
  if (!row) return row;
  const { addresses, ...rest } = row;
  return {
    ...rest,
    full_address: addresses && addresses.full_address,
    address: addresses || null,
  };
}

async function writeAudit(tx, args) {
  const row = await logAction(
    args.action,
    args.tableName,
    args.recordId,
    args.oldData,
    args.newData,
    args.actorId,
    args.reason,
    args.tenantId,
    args.correlationId,
    tx
  );
  if (!row) deny('AUDIT_FAILED', `Không ghi được audit_logs (${args.tableName}).`, 500);
}

async function assertCanWrite(reqUser, memberId, self) {
  if (self !== false) return;
  const edit = await canEditProfile(reqUser, memberId);
  if (!edit.ok) deny(edit.code || 'FORBIDDEN', edit.reason || 'Không có quyền sửa.', 403);
}

async function assertAddress(tenantId, addressId) {
  const row = await prisma.addresses.findFirst({
    where: { id: String(addressId), tenant_id: tenantId, deleted_at: null },
    select: { id: true },
  });
  if (!row) deny('NOT_FOUND', 'Không tìm thấy địa chỉ.', 404);
}

async function syncCurrent(tx, { tenantId, memberId, addressId, actorId, on }) {
  if (on) {
    await tx.member_residences.updateMany({
      where: { member_id: memberId, tenant_id: tenantId, deleted_at: null, is_current: true },
      data: { is_current: false, updated_at: new Date(), changed_by: actorId },
    });
    await tx.members.updateMany({
      where: { id: memberId, tenant_id: tenantId, deleted_at: null },
      data: { current_address_id: addressId, changed_by: actorId, updated_at: new Date() },
    });
  }
}

async function listMine(reqUser) {
  return withAls(reqUser, async () => {
    const { member } = await resolveMemberActor({ ...reqUser, viewOnly: true });
    const items = await prisma.member_residences.findMany({
      where: { member_id: member.id, tenant_id: member.tenant_id, deleted_at: null },
      orderBy: [{ is_current: 'desc' }, { from_year: 'desc' }, { created_at: 'desc' }],
      select: SELECT,
    });
    return { items: items.map(mapRow) };
  });
}

async function createMine(reqUser, body) {
  return withAls(reqUser, async () => {
    const { user, member, self } = await resolveMemberActor(reqUser);
    await assertCanWrite(reqUser, member.id, self);
    const data = parseBody(body, { partial: false });
    return prisma.$transaction(async (tx) => {
      const correlationId = correlation.create();
      if (!data.address_id) {
        const place = body.place || body.address;
        const created = await upsertAddress(tx, member.tenant_id, user.id, place);
        if (!created || !created.id) deny('BAD_REQUEST', 'Không tạo được địa chỉ.', 400);
        data.address_id = created.id;
      } else {
        await assertAddress(member.tenant_id, data.address_id);
      }
      if (data.is_current) {
        await syncCurrent(tx, {
          tenantId: member.tenant_id,
          memberId: member.id,
          addressId: data.address_id,
          actorId: user.id,
          on: true,
        });
      }
      const row = await tx.member_residences.create({
        data: {
          ...data,
          tenant_id: member.tenant_id,
          member_id: member.id,
          changed_by: user.id,
        },
        select: SELECT,
      });
      await writeAudit(tx, {
        action: 'THEM_MOI',
        tableName: 'member_residences',
        recordId: row.id,
        oldData: null,
        newData: row,
        actorId: user.id,
        tenantId: member.tenant_id,
        correlationId,
        reason: 'A01 POST /me/residences',
      });
      return { item: mapRow(row) };
    });
  });
}

async function updateMine(reqUser, id, body) {
  return withAls(reqUser, async () => {
    const { user, member, self } = await resolveMemberActor(reqUser);
    await assertCanWrite(reqUser, member.id, self);
    const existing = await prisma.member_residences.findFirst({
      where: { id: String(id), member_id: member.id, tenant_id: member.tenant_id, deleted_at: null },
      select: SELECT,
    });
    if (!existing) deny('NOT_FOUND', 'Không tìm thấy lần ở.', 404);
    const data = parseBody(body, { partial: true });
    if (data.address_id) await assertAddress(member.tenant_id, data.address_id);
    return prisma.$transaction(async (tx) => {
      const correlationId = correlation.create();
      const nextAddr = data.address_id || existing.address_id;
      const nextCurrent = data.is_current !== undefined ? data.is_current : existing.is_current;
      if (nextCurrent) {
        await tx.member_residences.updateMany({
          where: {
            member_id: member.id,
            tenant_id: member.tenant_id,
            deleted_at: null,
            is_current: true,
            NOT: { id: existing.id },
          },
          data: { is_current: false, updated_at: new Date(), changed_by: user.id },
        });
        await tx.members.updateMany({
          where: { id: member.id, tenant_id: member.tenant_id, deleted_at: null },
          data: { current_address_id: nextAddr, changed_by: user.id, updated_at: new Date() },
        });
      }
      const upd = await tx.member_residences.updateMany({
        where: { id: existing.id, tenant_id: member.tenant_id, deleted_at: null },
        data: { ...data, changed_by: user.id, updated_at: new Date() },
      });
      if (upd.count !== 1) deny('NOT_FOUND', 'Không cập nhật được lần ở.', 404);
      const row = await tx.member_residences.findFirst({
        where: { id: existing.id, tenant_id: member.tenant_id },
        select: SELECT,
      });
      await writeAudit(tx, {
        action: 'CAP_NHAT',
        tableName: 'member_residences',
        recordId: existing.id,
        oldData: existing,
        newData: row,
        actorId: user.id,
        tenantId: member.tenant_id,
        correlationId,
        reason: 'A01 PATCH /me/residences',
      });
      return { item: mapRow(row) };
    });
  });
}

async function removeMine(reqUser, id) {
  return withAls(reqUser, async () => {
    const { user, member, self } = await resolveMemberActor(reqUser);
    await assertCanWrite(reqUser, member.id, self);
    const existing = await prisma.member_residences.findFirst({
      where: { id: String(id), member_id: member.id, tenant_id: member.tenant_id, deleted_at: null },
      select: SELECT,
    });
    if (!existing) deny('NOT_FOUND', 'Không tìm thấy lần ở.', 404);
    return prisma.$transaction(async (tx) => {
      const correlationId = correlation.create();
      await tx.member_residences.updateMany({
        where: { id: existing.id, tenant_id: member.tenant_id, deleted_at: null },
        data: { deleted_at: new Date(), is_current: false, changed_by: user.id, updated_at: new Date() },
      });
      if (existing.is_current) {
        await tx.members.updateMany({
          where: { id: member.id, tenant_id: member.tenant_id, deleted_at: null, current_address_id: existing.address_id },
          data: { current_address_id: null, changed_by: user.id, updated_at: new Date() },
        });
      }
      await writeAudit(tx, {
        action: 'XOA',
        tableName: 'member_residences',
        recordId: existing.id,
        oldData: existing,
        newData: { ...existing, deleted_at: new Date(), is_current: false },
        actorId: user.id,
        tenantId: member.tenant_id,
        correlationId,
        reason: 'A01 DELETE /me/residences',
      });
      return { ok: true };
    });
  });
}

module.exports = {
  listMine,
  createMine,
  updateMine,
  removeMine,
};
