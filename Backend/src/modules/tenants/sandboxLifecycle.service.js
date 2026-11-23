/**
 * ============================================================================
 * PATH       : src/modules/tenants/sandboxLifecycle.service.js
 * DATETIME   : 2026-11-22T23:10:00+07:00
 * VERSION    : 1.0.0-ISO29148-UAT-IMP6-SANDBOX
 * DESCRIPTION:
 * - [AMEND-RP-OP-2026-03-BASELINE v7.1 - UAT-IMP6]:
 *   Quản lý trọn vẹn vòng đời dùng thử Sandbox 30 ngày & hậu kiểm tenant_status:
 *   1. Chốt chặn chống tạo rác CLAN_SETUP (`assertCanCreateNewClan`):
 *      - Tối đa 1 hồ sơ CLAN_SETUP đang chờ duyệt tại một thời điểm.
 *      - Tối đa 2 hồ sơ CLAN_SETUP được khởi tạo trong vòng 30 ngày (theo user_id hoặc SĐT).
 *   2. Khởi tạo mốc dùng thử 30 ngày (`buildSandboxInitialConfigs`):
 *      - Ghi sandboxStartedAt và sandboxExpiresAt (+30 ngày) vào tenants.social_configs.
 *   3. Giám sát, nhắc hạn (7 ngày & 3 ngày trước khi hết hạn) & chuyển trạng thái tự động:
 *      - HOAT_DONG (isSandbox: true) quá 30 ngày -> TAM_NGUNG (+30 ngày đệm, bảo toàn 100% dữ liệu).
 *      - TAM_NGUNG (isSandbox: true) quá 30 ngày đệm -> NGUNG_HAN & xóa cứng dữ liệu dùng thử.
 *   4. Thao tác điều phối dành cho SYSTEM_ADMIN:
 *      - Gia hạn Sandbox (`extendTenantSandbox`) và Đóng & Dọn dữ liệu (`closeAndCleanSandboxTenant`).
 * ============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

'use strict';

const crypto = require('crypto');
const { basePrisma } = require('../../lib/prisma.js');
const businessLogger = require('../../services/ledger.service');
const auditService = require('../../services/audit.service');
const { createError } = require('../../shared/errors');

const SANDBOX_TRIAL_DAYS = 30;
const SANDBOX_BUFFER_DAYS = 30;
const MAX_OPEN_CLAN_SETUP_CASES = 1;
const MAX_CLAN_SETUP_PER_30D = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

function parseIsoDate(val) {
  if (!val) return null;
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? null : d;
}

function buildSandboxInitialConfigs(existingConfigs = {}, now = new Date()) {
  const base =
    existingConfigs && typeof existingConfigs === 'object'
      ? { ...existingConfigs }
      : {};
  const expiresAt = new Date(now.getTime() + SANDBOX_TRIAL_DAYS * DAY_MS);
  delete base.sandboxSuspendedAt;
  delete base.sandboxCleanupDueAt;
  delete base.sandboxCleanedAt;
  delete base.sandboxReminded7dAt;
  delete base.sandboxReminded3dAt;

  return {
    ...base,
    isSandbox: true,
    sandboxStartedAt: now.toISOString(),
    sandboxExpiresAt: expiresAt.toISOString(),
    sandboxTrialDays: SANDBOX_TRIAL_DAYS,
    sandboxBufferDays: SANDBOX_BUFFER_DAYS,
  };
}

function computeSandboxLifecycleInfo(tenant, now = new Date()) {
  if (!tenant) {
    return {
      isSandbox: false,
      sandboxPhase: 'UNKNOWN',
      sandboxStartedAt: null,
      sandboxExpiresAt: null,
      daysRemaining: null,
      sandboxSuspendedAt: null,
      sandboxCleanupDueAt: null,
      bufferDaysRemaining: null,
    };
  }

  const sc =
    tenant.social_configs && typeof tenant.social_configs === 'object'
      ? tenant.social_configs
      : {};
  const isSandbox = Boolean(sc.isSandbox);
  const startedAt = parseIsoDate(sc.sandboxStartedAt) || parseIsoDate(tenant.created_at);
  const expiresAt =
    parseIsoDate(sc.sandboxExpiresAt) ||
    (isSandbox && startedAt
      ? new Date(startedAt.getTime() + SANDBOX_TRIAL_DAYS * DAY_MS)
      : null);

  const suspendedAt = parseIsoDate(sc.sandboxSuspendedAt);
  const cleanupDueAt =
    parseIsoDate(sc.sandboxCleanupDueAt) ||
    (tenant.status === 'TAM_NGUNG' && isSandbox && suspendedAt
      ? new Date(suspendedAt.getTime() + SANDBOX_BUFFER_DAYS * DAY_MS)
      : null);

  const daysRemaining =
    expiresAt != null
      ? Math.ceil((expiresAt.getTime() - now.getTime()) / DAY_MS)
      : null;

  const bufferDaysRemaining =
    cleanupDueAt != null
      ? Math.ceil((cleanupDueAt.getTime() - now.getTime()) / DAY_MS)
      : null;

  let sandboxPhase = 'OFFICIAL_ACTIVE';
  if (tenant.status === 'NGUNG_HAN') {
    sandboxPhase = 'CLOSED_CLEANED';
  } else if (tenant.status === 'CHO_DUYET') {
    sandboxPhase = 'PENDING_APPROVAL';
  } else if (tenant.status === 'TAM_NGUNG' && isSandbox) {
    sandboxPhase = 'BUFFER_SUSPENDED';
  } else if (tenant.status === 'HOAT_DONG' && isSandbox) {
    sandboxPhase = 'TRIAL_ACTIVE';
  } else if (tenant.status === 'TAM_NGUNG') {
    sandboxPhase = 'SUSPENDED';
  }

  return {
    isSandbox,
    sandboxPhase,
    sandboxStartedAt: startedAt ? startedAt.toISOString() : null,
    sandboxExpiresAt: expiresAt ? expiresAt.toISOString() : null,
    daysRemaining,
    sandboxSuspendedAt: suspendedAt ? suspendedAt.toISOString() : null,
    sandboxCleanupDueAt: cleanupDueAt ? cleanupDueAt.toISOString() : null,
    bufferDaysRemaining,
  };
}

async function assertCanCreateNewClan(
  prismaClient = basePrisma,
  { userId = null, phone = null, now = new Date() } = {}
) {
  const userIds = new Set();
  if (userId) userIds.add(String(userId));

  if (phone) {
    const matchingUsers = await prismaClient.users.findMany({
      where: { phone: String(phone).trim(), deleted_at: null },
      select: { id: true },
      take: 20,
    });
    for (const u of matchingUsers) {
      if (u?.id) userIds.add(String(u.id));
    }
  }

  const idList = Array.from(userIds);
  if (idList.length === 0) return { allowed: true };

  const openCount = await prismaClient.onboarding_cases.count({
    where: {
      user_id: { in: idList },
      case_type: 'CLAN_SETUP',
      process_kind: 'REGISTER',
      deleted_at: null,
      status: {
        in: [
          'DRAFT',
          'PENDING_VERIFICATION',
          'PROFILE_COMPLETED',
          'FAMILY_TREE_DRAFT',
          'SUBMITTED',
          'UNDER_REVIEW',
          'NEEDS_REVISION',
        ],
      },
    },
  });

  if (openCount >= MAX_OPEN_CLAN_SETUP_CASES) {
    const err = new Error(
      'Tài khoản hoặc số điện thoại này đang có 1 hồ sơ thành lập dòng họ chờ xét duyệt. Vui lòng hoàn tất hoặc chờ duyệt hồ sơ hiện tại trước khi tạo dòng họ khác.'
    );
    err.status = 409;
    err.statusCode = 409;
    err.code = 'OPEN_CLAN_SETUP_EXISTS';
    throw err;
  }

  const windowStart = new Date(now.getTime() - SANDBOX_TRIAL_DAYS * DAY_MS);
  const recentCount = await prismaClient.onboarding_cases.count({
    where: {
      user_id: { in: idList },
      case_type: 'CLAN_SETUP',
      process_kind: 'REGISTER',
      deleted_at: null,
      status: { notIn: ['CANCELLED'] },
      created_at: { gte: windowStart },
    },
  });

  if (recentCount >= MAX_CLAN_SETUP_PER_30D) {
    const err = new Error(
      'Mỗi tài khoản hoặc số điện thoại chỉ được đề xuất thành lập tối đa 2 dòng họ mới trong vòng 30 ngày để chống lạm dụng hệ thống.'
    );
    err.status = 429;
    err.statusCode = 429;
    err.code = 'CLAN_SETUP_RATE_LIMIT_30D';
    throw err;
  }

  return { allowed: true };
}

async function purgeSandboxTenantData(tx, tenantId) {
  const deleteByTenant = async (modelName) => {
    try {
      if (tx[modelName] && typeof tx[modelName].deleteMany === 'function') {
        await tx[modelName].deleteMany({ where: { tenant_id: tenantId } });
      }
    } catch (_) {
      /* Bỏ qua nếu bảng không có cột tenant_id trực tiếp */
    }
  };

  const orderedModels = [
    'parentages',
    'marriages',
    'graves',
    'biographies',
    'member_residences',
    'member_privacy_rules',
    'member_offices',
    'profile_edit_grants',
    'fund_transactions',
    'funds',
    'assets',
    'achievements',
    'suggestions',
    'events',
    'worships',
    'media',
    'user_member_links',
    'members',
    'branches',
    'cemeteries',
    'addresses',
    'clan_profiles',
  ];

  for (const modelName of orderedModels) {
    await deleteByTenant(modelName);
  }
}

async function notifyTenantAdmins(tx, { tenantId, title, content, level = 'WARNING', correlationId }) {
  const adminLinks = await tx.user_member_links.findMany({
    where: {
      tenant_id: tenantId,
      role_in_tenant: 'CLAN_ADMIN',
      status: 'DA_DUYET',
      deleted_at: null,
    },
    select: { user_id: true },
    take: 10,
  });

  const recipientIds = new Set(adminLinks.map((l) => l.user_id).filter(Boolean));
  if (recipientIds.size === 0) {
    const legacyAdmins = await tx.users.findMany({
      where: {
        tenant_id: tenantId,
        role: 'CLAN_ADMIN',
        deleted_at: null,
      },
      select: { id: true },
      take: 5,
    });
    for (const u of legacyAdmins) {
      if (u?.id) recipientIds.add(u.id);
    }
  }

  for (const uid of recipientIds) {
    await tx.notifications.create({
      data: {
        user_id: uid,
        tenant_id: tenantId,
        title,
        content,
        status: 'PENDING',
        event_type: 'SANDBOX_LIFECYCLE',
        correlation_id: correlationId,
        level,
        reliability: 'HIGH',
      },
    });
  }
}

async function evaluateTenantSandboxLifecycle(tenantId, options = {}) {
  if (!tenantId) return { action: 'NONE' };
  const now = options.now instanceof Date ? options.now : new Date();

  const tenant = await basePrisma.tenants.findFirst({
    where: { id: tenantId, deleted_at: null },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      social_configs: true,
      created_at: true,
    },
  });

  if (!tenant) return { action: 'NOT_FOUND' };

  const sc =
    tenant.social_configs && typeof tenant.social_configs === 'object'
      ? { ...tenant.social_configs }
      : {};
  if (!sc.isSandbox) {
    return { action: 'NOT_SANDBOX', status: tenant.status };
  }

  const info = computeSandboxLifecycleInfo(tenant, now);
  const correlationId = crypto.randomUUID();

  if (tenant.status === 'HOAT_DONG') {
    const expiresAt = parseIsoDate(info.sandboxExpiresAt);
    if (expiresAt && now.getTime() >= expiresAt.getTime()) {
      const cleanupDueAt = new Date(now.getTime() + SANDBOX_BUFFER_DAYS * DAY_MS);
      const nextSc = {
        ...sc,
        isSandbox: true,
        sandboxStartedAt: info.sandboxStartedAt,
        sandboxExpiresAt: info.sandboxExpiresAt,
        sandboxSuspendedAt: now.toISOString(),
        sandboxCleanupDueAt: cleanupDueAt.toISOString(),
      };

      await basePrisma.$transaction(async (tx) => {
        await tx.tenants.update({
          where: { id: tenant.id },
          data: {
            status: 'TAM_NGUNG',
            social_configs: nextSc,
            updated_at: now,
          },
        });

        await notifyTenantAdmins(tx, {
          tenantId: tenant.id,
          correlationId,
          level: 'WARNING',
          title: `Dòng họ ${tenant.name} đã hết 30 ngày dùng thử (Tạm ngưng)`,
          content: `Thời gian dùng thử 30 ngày đã kết thúc. Toàn bộ dữ liệu cây gia phả của dòng họ ${tenant.name} vẫn được bảo toàn nguyên vẹn trong 30 ngày đệm (đến ${cleanupDueAt.toLocaleDateString('vi-VN')}). Vui lòng hoàn tất đóng góp hạ tầng và kích hoạt chính thức trước hạn này để tránh dữ liệu bị dọn dẹp vĩnh viễn.`,
        });

        await businessLogger.createLog(
          {
            correlation_id: correlationId,
            attempt_no: 1,
            process_type: 'TENANT_ACTIVATE',
            actor_type: 'SYSTEM',
            actor_id: 'SYSTEM_SANDBOX_WORKER',
            tenant_id: tenant.id,
            process_status: 'SUCCESS',
            context: { target_id: tenant.id, target_name: tenant.name },
            payload: {
              action: 'SANDBOX_AUTO_SUSPEND',
              status_before: 'HOAT_DONG',
              status_after: 'TAM_NGUNG',
              cleanup_due_at: cleanupDueAt.toISOString(),
            },
          },
          tx
        );
      });

      return { action: 'SUSPENDED_TO_BUFFER', status: 'TAM_NGUNG' };
    }

    if (info.daysRemaining != null && info.daysRemaining > 0) {
      if (info.daysRemaining <= 3 && !sc.sandboxReminded3dAt) {
        await basePrisma.$transaction(async (tx) => {
          await tx.tenants.update({
            where: { id: tenant.id },
            data: {
              social_configs: {
                ...sc,
                sandboxStartedAt: info.sandboxStartedAt,
                sandboxExpiresAt: info.sandboxExpiresAt,
                sandboxReminded3dAt: now.toISOString(),
              },
            },
          });
          await notifyTenantAdmins(tx, {
            tenantId: tenant.id,
            correlationId,
            level: 'WARNING',
            title: `Chỉ còn ${info.daysRemaining} ngày dùng thử Sandbox — ${tenant.name}`,
            content: `Không gian dùng thử của dòng họ ${tenant.name} sẽ chuyển sang trạng thái Tạm ngưng sau ${info.daysRemaining} ngày nữa. Bác vui lòng hoàn tất đóng góp hạ tầng và kích hoạt chính thức để vận hành liên tục.`,
          });
        });
        return { action: 'REMINDED_3D', daysRemaining: info.daysRemaining };
      }

      if (info.daysRemaining <= 7 && !sc.sandboxReminded7dAt) {
        await basePrisma.$transaction(async (tx) => {
          await tx.tenants.update({
            where: { id: tenant.id },
            data: {
              social_configs: {
                ...sc,
                sandboxStartedAt: info.sandboxStartedAt,
                sandboxExpiresAt: info.sandboxExpiresAt,
                sandboxReminded7dAt: now.toISOString(),
              },
            },
          });
          await notifyTenantAdmins(tx, {
            tenantId: tenant.id,
            correlationId,
            level: 'INFO',
            title: `Còn ${info.daysRemaining} ngày dùng thử Sandbox — ${tenant.name}`,
            content: `Dòng họ ${tenant.name} còn ${info.daysRemaining} ngày dùng thử miễn phí. Sau thời hạn này, hệ thống sẽ chuyển sang 30 ngày đệm Tạm ngưng để chờ kích hoạt chính thức.`,
          });
        });
        return { action: 'REMINDED_7D', daysRemaining: info.daysRemaining };
      }
    }

    return { action: 'ACTIVE_TRIAL', daysRemaining: info.daysRemaining };
  }

  if (tenant.status === 'TAM_NGUNG') {
    const cleanupDueAt = parseIsoDate(info.sandboxCleanupDueAt);
    if (cleanupDueAt && now.getTime() >= cleanupDueAt.getTime()) {
      await basePrisma.$transaction(async (tx) => {
        await purgeSandboxTenantData(tx, tenant.id);

        await tx.tenants.update({
          where: { id: tenant.id },
          data: {
            status: 'NGUNG_HAN',
            social_configs: {
              ...sc,
              isSandbox: false,
              sandboxCleanedAt: now.toISOString(),
            },
            updated_at: now,
          },
        });

        await notifyTenantAdmins(tx, {
          tenantId: tenant.id,
          correlationId,
          level: 'CRITICAL',
          title: `Dòng họ ${tenant.name} đã đóng vĩnh viễn (NGUNG_HAN)`,
          content: `Do đã quá 30 ngày dùng thử và 30 ngày đệm Tạm ngưng mà chưa kích hoạt chính thức, dòng họ ${tenant.name} đã chuyển sang trạng thái Ngưng hẳn và toàn bộ dữ liệu dùng thử đã được dọn dẹp khỏi hệ thống.`,
        });

        await businessLogger.createLog(
          {
            correlation_id: correlationId,
            attempt_no: 1,
            process_type: 'TENANT_ACTIVATE',
            actor_type: 'SYSTEM',
            actor_id: 'SYSTEM_SANDBOX_WORKER',
            tenant_id: tenant.id,
            process_status: 'SUCCESS',
            context: { target_id: tenant.id, target_name: tenant.name },
            payload: {
              action: 'SANDBOX_AUTO_CLEANUP_NGUNG_HAN',
              status_before: 'TAM_NGUNG',
              status_after: 'NGUNG_HAN',
            },
          },
          tx
        );
      });

      return { action: 'CLOSED_AND_CLEANED', status: 'NGUNG_HAN' };
    }

    return {
      action: 'IN_BUFFER',
      bufferDaysRemaining: info.bufferDaysRemaining,
    };
  }

  return { action: 'NO_OP', status: tenant.status };
}

async function runSandboxLifecycleSweep(options = {}) {
  const candidates = await basePrisma.tenants.findMany({
    where: {
      deleted_at: null,
      status: { in: ['HOAT_DONG', 'TAM_NGUNG'] },
    },
    select: { id: true, social_configs: true },
    take: options.batchSize || 200,
  });

  const sandboxTenants = candidates.filter(
    (t) =>
      t.social_configs &&
      typeof t.social_configs === 'object' &&
      t.social_configs.isSandbox === true
  );

  const results = [];
  for (const t of sandboxTenants) {
    try {
      const r = await evaluateTenantSandboxLifecycle(t.id, options);
      results.push({ tenantId: t.id, ...r });
    } catch (err) {
      console.error(`[sandboxLifecycle] error tenant=${t.id}:`, err.message || err);
      results.push({ tenantId: t.id, action: 'ERROR', error: err.message });
    }
  }

  return { scanned: sandboxTenants.length, results };
}

async function extendTenantSandbox(tenantId, actor, extraDays = 15, note = '') {
  if (actor?.role !== 'SYSTEM_ADMIN') {
    throw createError('FORBIDDEN', 'Chỉ SYSTEM_ADMIN được gia hạn thời gian dùng thử.', {
      statusCode: 403,
    });
  }
  const days = Math.min(90, Math.max(1, parseInt(extraDays, 10) || 15));
  const now = new Date();

  const tenant = await basePrisma.tenants.findFirst({
    where: { id: tenantId, deleted_at: null },
    select: { id: true, name: true, status: true, social_configs: true, created_at: true },
  });
  if (!tenant) {
    throw createError('NOT_FOUND', 'Không tìm thấy dòng họ.', { statusCode: 404 });
  }
  if (tenant.status === 'NGUNG_HAN') {
    throw createError(
      'BAD_REQUEST',
      'Dòng họ đã ở trạng thái NGUNG_HAN và đã dọn dữ liệu, không thể gia hạn.',
      { statusCode: 400 }
    );
  }

  const sc =
    tenant.social_configs && typeof tenant.social_configs === 'object'
      ? { ...tenant.social_configs }
      : {};
  const info = computeSandboxLifecycleInfo(tenant, now);
  const baseDate =
    info.sandboxExpiresAt && new Date(info.sandboxExpiresAt) > now
      ? new Date(info.sandboxExpiresAt)
      : now;
  const nextExpires = new Date(baseDate.getTime() + days * DAY_MS);

  const nextSc = {
    ...sc,
    isSandbox: true,
    sandboxStartedAt: info.sandboxStartedAt || now.toISOString(),
    sandboxExpiresAt: nextExpires.toISOString(),
    sandboxExtendedBy: actor.id,
    sandboxExtendedAt: now.toISOString(),
  };
  delete nextSc.sandboxSuspendedAt;
  delete nextSc.sandboxCleanupDueAt;
  delete nextSc.sandboxReminded7dAt;
  delete nextSc.sandboxReminded3dAt;

  const updated = await basePrisma.tenants.update({
    where: { id: tenant.id },
    data: {
      status: 'HOAT_DONG',
      social_configs: nextSc,
      changed_by: actor.id,
      updated_at: now,
    },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      social_configs: true,
      updated_at: true,
    },
  });

  try {
    await auditService.logAction(
      'CAP_NHAT',
      'tenants',
      tenant.id,
      { status: tenant.status, sandboxExpiresAt: info.sandboxExpiresAt },
      { status: 'HOAT_DONG', sandboxExpiresAt: nextExpires.toISOString(), extraDays: days },
      actor.id,
      note || `Gia hạn Sandbox thêm ${days} ngày`,
      tenant.id
    );
  } catch (_) {
    /* best-effort */
  }

  return {
    ...updated,
    sandboxInfo: computeSandboxLifecycleInfo(updated, now),
  };
}

async function closeAndCleanSandboxTenant(tenantId, actor, note = '') {
  if (actor?.role !== 'SYSTEM_ADMIN') {
    throw createError('FORBIDDEN', 'Chỉ SYSTEM_ADMIN được đóng và dọn dữ liệu dòng họ.', {
      statusCode: 403,
    });
  }
  const now = new Date();
  const correlationId = crypto.randomUUID();

  const tenant = await basePrisma.tenants.findFirst({
    where: { id: tenantId, deleted_at: null },
    select: { id: true, name: true, slug: true, status: true, social_configs: true },
  });
  if (!tenant) {
    throw createError('NOT_FOUND', 'Không tìm thấy dòng họ.', { statusCode: 404 });
  }

  const sc =
    tenant.social_configs && typeof tenant.social_configs === 'object'
      ? { ...tenant.social_configs }
      : {};

  await basePrisma.$transaction(async (tx) => {
    await purgeSandboxTenantData(tx, tenant.id);

    await tx.tenants.update({
      where: { id: tenant.id },
      data: {
        status: 'NGUNG_HAN',
        social_configs: {
          ...sc,
          isSandbox: false,
          sandboxCleanedAt: now.toISOString(),
          sandboxClosedBy: actor.id,
        },
        changed_by: actor.id,
        updated_at: now,
      },
    });

    await businessLogger.createLog(
      {
        correlation_id: correlationId,
        attempt_no: 1,
        process_type: 'TENANT_ACTIVATE',
        actor_type: 'USER',
        actor_id: actor.id,
        tenant_id: tenant.id,
        process_status: 'SUCCESS',
        context: { target_id: tenant.id, target_name: tenant.name },
        payload: {
          action: 'SANDBOX_MANUAL_CLOSE_NGUNG_HAN',
          status_before: tenant.status,
          status_after: 'NGUNG_HAN',
          note: note || 'SYSTEM_ADMIN đóng và dọn dữ liệu dùng thử',
        },
      },
      tx
    );
  });

  return {
    id: tenant.id,
    name: tenant.name,
    status: 'NGUNG_HAN',
    cleanedAt: now.toISOString(),
  };
}

module.exports = {
  SANDBOX_TRIAL_DAYS,
  SANDBOX_BUFFER_DAYS,
  MAX_OPEN_CLAN_SETUP_CASES,
  MAX_CLAN_SETUP_PER_30D,
  buildSandboxInitialConfigs,
  computeSandboxLifecycleInfo,
  assertCanCreateNewClan,
  purgeSandboxTenantData,
  evaluateTenantSandboxLifecycle,
  runSandboxLifecycleSweep,
  extendTenantSandbox,
  closeAndCleanSandboxTenant,
};
