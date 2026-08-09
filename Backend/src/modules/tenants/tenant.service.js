/**
 * PATH       : src/modules/tenants/tenant.service.js
 * DATETIME   : 2026-08-09T18:15:00+07:00
 * VERSION    : 1.0.0-OP-2
 * DESCRIPTION:
 * - OP-2: Tenant Activate (TAM_NGUNG → HOAT_DONG).
 * - Service tách riêng, không đụng auth.service / Register flow (Q1).
 * - TX bắt buộc: correlation + update status + BPL + audit.
 *
 * INVARIANTS:
 * - Chỉ cho phép chuyển đúng một chiều: TAM_NGUNG → HOAT_DONG.
 * - CLAN_ADMIN chỉ được activate đúng tenant của mình + users.status = DA_DUYET.
 * - SYSTEM_ADMIN: full support.
 * - Không đụng users.status, members, onboarding_cases.
 */

'use strict';

const { basePrisma, prisma } = require('../../lib/prisma.js');
const businessLogger = require('../../services/ledger.service');
const auditService = require('../../services/audit.service');
const { createError } = require('../../shared/errors');
const { ERROR_CODES } = require('../../shared/errors/codes');

/**
 * Kích hoạt tenant: TAM_NGUNG → HOAT_DONG
 *
 * @param {string} tenantId
 * @param {object} actor  { id, role, tenantId, status }
 * @returns {Promise<object>} tenant đã cập nhật (minimal)
 */
async function activateTenant(tenantId, actor) {
  if (!tenantId) {
    throw createError(ERROR_CODES.TENANT.TENANT_NOT_FOUND, 'Thiếu tenantId');
  }
  if (!actor?.id) {
    throw createError(ERROR_CODES.COMMON?.UNAUTHORIZED || 'UNAUTHORIZED', 'Thiếu thông tin actor');
  }

  // --- Authz ---
  const isSystemAdmin = actor.role === 'SYSTEM_ADMIN';
  const isClanAdmin = actor.role === 'CLAN_ADMIN';

  if (!isSystemAdmin && !isClanAdmin) {
    throw createError(
      ERROR_CODES.TENANT.CROSS_TENANT_DENIED,
      'Bạn không có quyền kích hoạt dòng họ.'
    );
  }

  if (isClanAdmin) {
    if (actor.status !== 'DA_DUYET') {
      throw createError(
        ERROR_CODES.TENANT.CROSS_TENANT_DENIED,
        'Tài khoản chưa được phê duyệt, không thể kích hoạt dòng họ.'
      );
    }
    if (actor.tenantId !== tenantId) {
      throw createError(
        ERROR_CODES.TENANT.CROSS_TENANT_DENIED,
        'Bạn chỉ được kích hoạt dòng họ của chính mình.'
      );
    }
  }

  // --- Transaction ---
  return prisma.$transaction(async (tx) => {
    // 1. Correlation
    const correlation = await prisma.correlation.create();
    const C = correlation.id;

    // 2. Load tenant (trong TX)
    const tenant = await tx.tenants.findFirst({
      where: { id: tenantId, deleted_at: null },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        changed_by: true,
      },
    });

    if (!tenant) {
      throw createError(ERROR_CODES.TENANT.TENANT_NOT_FOUND, 'Không tìm thấy dòng họ.');
    }

    // 3. Status guard
    if (tenant.status === 'HOAT_DONG') {
      throw createError(
        ERROR_CODES.TENANT.TENANT_ALREADY_ACTIVE,
        'Dòng họ đã được kích hoạt trước đó.'
      );
    }

    if (tenant.status !== 'TAM_NGUNG') {
      throw createError(
        ERROR_CODES.TENANT.TENANT_NOT_ACTIVATABLE,
        `Dòng họ đang ở trạng thái ${tenant.status}, không thể kích hoạt.`
      );
    }

    // 4. Update
    const updated = await tx.tenants.update({
      where: { id: tenantId },
      data: {
        status: 'HOAT_DONG',
        changed_by: actor.id,
        updated_at: new Date(),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        updated_at: true,
      },
    });

    // 5. BPL
    await businessLogger.createLog(
      {
        correlation_id: C,
        attempt_no: 1,
        process_type: 'TENANT_ACTIVATE',
        actor_type: 'USER',
        actor_id: actor.id,
        tenant_id: tenantId,
        process_status: 'SUCCESS',
        context: {
          target_id: tenantId,
          target_name: tenant.name,
        },
        payload: {
          action: 'ACTIVATE',
          status_before: 'TAM_NGUNG',
          status_after: 'HOAT_DONG',
        },
      },
      tx
    );

    // 6. Audit
    await auditService.logAction(
      'CAP_NHAT',
      'tenants',
      tenantId,
      { status: 'TAM_NGUNG' },
      { status: 'HOAT_DONG' },
      actor.id,
      'Kích hoạt dòng họ (OP-2)',
      tenantId,
      C,
      tx
    );

    return {
      ...updated,
      correlation_id: C,
    };
  });
}

module.exports = {
  activateTenant,
};