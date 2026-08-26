/**
 * PATH       : src/modules/tenants/tenant.service.js
 * DATETIME   : 2026-08-25T16:10:00+07:00
 * VERSION    : 1.1.0-TENANT-SETTINGS
 * DESCRIPTION:
 * - OP-2 activateTenant (giữ nguyên).
 * - Tenant settings (ADMIN): name, slogan, description, theme_color, logo_url.
 * - logo_icon: chỉ cập nhật khi cột đã có trên schema (optional).
 */

'use strict';

const { basePrisma, prisma } = require('../../lib/prisma.js');
const businessLogger = require('../../services/ledger.service');
const auditService = require('../../services/audit.service');
const { createError } = require('../../shared/errors');
const { ERROR_CODES } = require('../../shared/errors/codes');

const SETTINGS_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  logo_url: true,
  theme_color: true,
  slogan: true,
  status: true,
  social_configs: true,
  updated_at: true,
};

function assertAdminCanEditTenant(actor, tenantId) {
  const isSystemAdmin = actor.role === 'SYSTEM_ADMIN';
  const isClanAdmin = actor.role === 'CLAN_ADMIN';

  if (!isSystemAdmin && !isClanAdmin) {
    throw createError(
      ERROR_CODES.TENANT?.CROSS_TENANT_DENIED || 'FORBIDDEN',
      'Chỉ quản trị viên được cập nhật thông tin dòng họ.',
      { statusCode: 403 }
    );
  }

  if (isClanAdmin) {
    if (actor.status && actor.status !== 'DA_DUYET') {
      throw createError(
        ERROR_CODES.TENANT?.CROSS_TENANT_DENIED || 'FORBIDDEN',
        'Tài khoản chưa được phê duyệt.',
        { statusCode: 403 }
      );
    }
    if (!actor.tenantId || actor.tenantId !== tenantId) {
      throw createError(
        ERROR_CODES.TENANT?.CROSS_TENANT_DENIED || 'FORBIDDEN',
        'Bạn chỉ được cập nhật dòng họ của mình.',
        { statusCode: 403 }
      );
    }
  }
}

/**
 * Đọc thông tin tenant cho form cài đặt.
 */
async function getTenantSettings(tenantId, actor) {
  if (!tenantId) {
    throw createError(
      ERROR_CODES.TENANT?.TENANT_NOT_FOUND || 'NOT_FOUND',
      'Thiếu tenantId.',
      { statusCode: 404 }
    );
  }

  assertAdminCanEditTenant(actor, tenantId);

  const db = actor.role === 'SYSTEM_ADMIN' ? basePrisma : prisma;
  const tenant = await db.tenants.findFirst({
    where: { id: tenantId, deleted_at: null },
    select: SETTINGS_SELECT,
  });

  if (!tenant) {
    throw createError(
      ERROR_CODES.TENANT?.TENANT_NOT_FOUND || 'NOT_FOUND',
      'Không tìm thấy dòng họ.',
      { statusCode: 404 }
    );
  }

  // logo_icon nếu lưu tạm trong social_configs
  const cfg =
    tenant.social_configs && typeof tenant.social_configs === 'object'
      ? tenant.social_configs
      : {};

  return {
    ...tenant,
    logo_icon: cfg.logo_icon || null,
  };
}

/**
 * Cập nhật settings hiển thị dòng họ.
 * Body cho phép: name, slogan, description, theme_color, logo_url, logo_icon
 */
async function updateTenantSettings(tenantId, actor, body = {}) {
  if (!tenantId) {
    throw createError(
      ERROR_CODES.TENANT?.TENANT_NOT_FOUND || 'NOT_FOUND',
      'Thiếu tenantId.',
      { statusCode: 404 }
    );
  }

  assertAdminCanEditTenant(actor, tenantId);

  const db = actor.role === 'SYSTEM_ADMIN' ? basePrisma : prisma;

  const existing = await db.tenants.findFirst({
    where: { id: tenantId, deleted_at: null },
    select: SETTINGS_SELECT,
  });

  if (!existing) {
    throw createError(
      ERROR_CODES.TENANT?.TENANT_NOT_FOUND || 'NOT_FOUND',
      'Không tìm thấy dòng họ.',
      { statusCode: 404 }
    );
  }

  const data = {
    changed_by: actor.id,
    updated_at: new Date(),
  };

  if (body.name !== undefined) {
    const name = String(body.name || '').trim();
    if (!name || name.length > 100) {
      const err = new Error('Tên dòng họ không hợp lệ (1–100 ký tự).');
      err.statusCode = 400;
      err.code = 'TENANT_NAME_INVALID';
      throw err;
    }
    data.name = name;
  }

  if (body.slogan !== undefined) {
    const slogan = body.slogan == null ? null : String(body.slogan).trim();
    data.slogan = slogan ? slogan.slice(0, 255) : null;
  }

  if (body.description !== undefined) {
    data.description =
      body.description == null ? null : String(body.description).trim() || null;
  }

  if (body.theme_color !== undefined) {
    const c = body.theme_color == null ? null : String(body.theme_color).trim();
    if (c && !/^#[0-9A-Fa-f]{6}$/.test(c)) {
      const err = new Error('theme_color phải dạng #RRGGBB.');
      err.statusCode = 400;
      err.code = 'TENANT_THEME_INVALID';
      throw err;
    }
    data.theme_color = c || null;
  }

  if (body.logo_url !== undefined) {
    data.logo_url =
      body.logo_url == null ? null : String(body.logo_url).trim().slice(0, 255) || null;
  }

  // social_configs: logo_icon (Lucide) + zalo/facebook/website
  {
    const ALLOWED = new Set([
      'Landmark',
      'Home',
      'House',
      'TreePine',
      'UsersRound',
      'GitFork',
      'Crown',
      'ShieldCheck',
      'Settings',
      '',
      null,
    ]);
    const prev =
      existing.social_configs && typeof existing.social_configs === 'object'
        ? { ...existing.social_configs }
        : {};
    let touched = false;

    if (body.logo_icon !== undefined) {
      let icon = body.logo_icon;
      if (icon != null) icon = String(icon).trim();
      if (icon === '') icon = null;
      if (icon && !ALLOWED.has(icon)) {
        const err = new Error('logo_icon không nằm trong danh sách cho phép.');
        err.statusCode = 400;
        err.code = 'TENANT_ICON_INVALID';
        throw err;
      }
      if (icon) prev.logo_icon = icon;
      else delete prev.logo_icon;
      touched = true;
    }

    const setLink = (key, val) => {
      if (val === undefined) return;
      touched = true;
      const s = val == null ? '' : String(val).trim().slice(0, 500);
      if (s) prev[key] = s;
      else delete prev[key];
    };
    setLink('zalo', body.social_zalo);
    setLink('facebook', body.social_facebook);
    setLink('website', body.social_website);

    if (touched) data.social_configs = prev;
  }

  const hasField = Object.keys(data).some(
    (k) => !['changed_by', 'updated_at'].includes(k)
  );
  if (!hasField) {
    const err = new Error('Không có trường nào để cập nhật.');
    err.statusCode = 400;
    err.code = 'TENANT_NO_CHANGES';
    throw err;
  }

  const updated = await db.tenants.update({
    where: { id: tenantId },
    data,
    select: SETTINGS_SELECT,
  });

  try {
    await auditService.logAction(
      'CAP_NHAT',
      'tenants',
      tenantId,
      {
        name: existing.name,
        slogan: existing.slogan,
        logo_url: existing.logo_url,
      },
      {
        name: updated.name,
        slogan: updated.slogan,
        logo_url: updated.logo_url,
      },
      actor.id,
      'Cập nhật cài đặt dòng họ',
      tenantId
    );
  } catch (_) {
    /* best-effort */
  }

  const cfg =
    updated.social_configs && typeof updated.social_configs === 'object'
      ? updated.social_configs
      : {};

  return {
    ...updated,
    logo_icon: cfg.logo_icon || null,
  };
}

/**
 * Kích hoạt tenant: TAM_NGUNG → HOAT_DONG
 */
async function activateTenant(tenantId, actor) {
  if (!tenantId) {
    throw createError(ERROR_CODES.TENANT.TENANT_NOT_FOUND, 'Thiếu tenantId');
  }
  if (!actor?.id) {
    throw createError(
      ERROR_CODES.COMMON?.UNAUTHORIZED || 'UNAUTHORIZED',
      'Thiếu thông tin actor'
    );
  }

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

  return prisma.$transaction(async (tx) => {
    const C = prisma.correlation.create();

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
      throw createError(
        ERROR_CODES.TENANT.TENANT_NOT_FOUND,
        'Không tìm thấy dòng họ.'
      );
    }

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

    await auditService.logAction(
      'CAP_NHAT',
      'tenants',
      tenantId,
      { status: 'TAM_NGUNG' },
      { status: 'HOAT_DONG' },
      actor.id,
      'Kích hoạt dòng họ (OP-2)',
      tenantId
    );

    return updated;
  });
}

module.exports = {
  activateTenant,
  getTenantSettings,
  updateTenantSettings,
};
