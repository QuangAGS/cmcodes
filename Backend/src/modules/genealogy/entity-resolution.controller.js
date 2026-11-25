/**
 * PATH       : src/modules/genealogy/entity-resolution.controller.js
 * DATETIME   : 2026-11-25T19:20:00+07:00
 * VERSION    : 1.1.0-WP06
 * DESCRIPTION:
 * - Controller cho API / Wizard Entity Resolution của Admin (WP-03, WP-05, WP-06).
 * - Kiểm tra quyền Admin tenant / SYSTEM_ADMIN (hỗ trợ roleInTenant), validate input (chặn self-merge 422),
 *   trả về preview / wizard-summary (cảnh báo mềm offset + potential_conflicts) hoặc thực thi merge.
 * CHANGE LOGS:
 * - [CHANGE-LOG-2026-02 V1.0] Lát 2/7:
 *   + Thêm controller cho Wizard Entity Resolution (WP-06).
 *   + Hỗ trợ kiểm tra quyền Admin tenant / SYSTEM_ADMIN, validate input, trả về preview / wizard-summary hoặc thực thi merge.
 */

'use strict';

const {
  previewDuplicateEntityResolution,
  resolveDuplicateEntity,
} = require('./entity-resolution.service.js');

function isAdminAuthorized(req, tenantId) {
  const user = req.user || {};
  const globalRole = String(user.role || '').toUpperCase();
  if (globalRole === 'SYSTEM_ADMIN' || globalRole === 'SUPER_ADMIN') {
    return true;
  }

  const tenantRole = String(
    req.tenantRole ||
    user.roleInTenant ||
    user.tenantRole ||
    user.role_in_tenant ||
    (Array.isArray(user.memberships)
      ? user.memberships.find((m) => m.tenant_id === tenantId || m.tenantId === tenantId)?.role_in_tenant ||
        user.memberships.find((m) => m.tenant_id === tenantId || m.tenantId === tenantId)?.role
      : '') ||
    ''
  ).toUpperCase();

  return ['TENANT_ADMIN', 'CLAN_ADMIN', 'ADMIN'].includes(tenantRole);
}

function mapErrorResponse(res, err) {
  const rawStatus = Number(err?.statusCode || err?.status || 500);
  const statusCode = rawStatus === 403 ? 422 : rawStatus;
  return res.status(statusCode).json({
    ok: false,
    code: err?.code || 'ENTITY_RESOLUTION_ERROR',
    message: err?.message || 'Lỗi xử lý gộp thực thể.',
    details: err?.details || null,
  });
}

async function previewMergeHandler(req, res) {
  try {
    const tenantId = req.body?.tenant_id || req.body?.tenantId || req.query?.tenant_id || req.tenantId;
    const sourceMemberId = req.body?.source_member_id || req.body?.sourceMemberId;
    const targetMemberId = req.body?.target_member_id || req.body?.targetMemberId;

    if (!isAdminAuthorized(req, tenantId)) {
      return res.status(422).json({
        ok: false,
        code: 'ER_ADMIN_PERMISSION_REQUIRED',
        message: 'Chỉ quản trị viên mới có quyền thực hiện gộp thực thể (Entity Resolution).',
      });
    }

    if (!tenantId || !sourceMemberId || !targetMemberId) {
      return res.status(422).json({
        ok: false,
        code: 'ER_INVALID_PARAMS',
        message: 'Thiếu tenant_id, source_member_id hoặc target_member_id.',
      });
    }

    if (sourceMemberId === targetMemberId) {
      return res.status(422).json({
        ok: false,
        code: 'ER_SELF_MERGE_FORBIDDEN',
        message: 'Không thể tự gộp một thực thể vào chính nó (self-merge).',
      });
    }

    const data = await previewDuplicateEntityResolution({
      tenantId,
      sourceMemberId,
      targetMemberId,
    });

    return res.status(200).json({
      ok: true,
      data,
    });
  } catch (err) {
    return mapErrorResponse(res, err);
  }
}

async function executeMergeHandler(req, res) {
  try {
    const tenantId = req.body?.tenant_id || req.body?.tenantId || req.tenantId;
    const sourceMemberId = req.body?.source_member_id || req.body?.sourceMemberId;
    const targetMemberId = req.body?.target_member_id || req.body?.targetMemberId;
    const actorId = req.user?.id || req.user?.userId || req.body?.actor_id || req.body?.actorId || null;
    const correlationId = req.body?.correlation_id || req.headers?.['x-correlation-id'] || null;
    const dryRun = Boolean(req.body?.dry_run || req.body?.dryRun);

    if (!isAdminAuthorized(req, tenantId)) {
      return res.status(422).json({
        ok: false,
        code: 'ER_ADMIN_PERMISSION_REQUIRED',
        message: 'Chỉ quản trị viên mới có quyền thực hiện gộp thực thể (Entity Resolution).',
      });
    }

    if (!tenantId || !sourceMemberId || !targetMemberId) {
      return res.status(422).json({
        ok: false,
        code: 'ER_INVALID_PARAMS',
        message: 'Thiếu tenant_id, source_member_id hoặc target_member_id.',
      });
    }

    if (sourceMemberId === targetMemberId) {
      return res.status(422).json({
        ok: false,
        code: 'ER_SELF_MERGE_FORBIDDEN',
        message: 'Không thể tự gộp một thực thể vào chính nó (self-merge).',
      });
    }

    const result = await resolveDuplicateEntity({
      tenantId,
      sourceMemberId,
      targetMemberId,
      actorId,
      actorType: 'USER',
      correlationId,
      dryRun,
    });

    return res.status(200).json({
      ok: true,
      data: {
        ...result,
        conflict_list: result.conflicts || [],
      },
    });
  } catch (err) {
    return mapErrorResponse(res, err);
  }
}

async function wizardSummaryHandler(req, res) {
  try {
    const tenantId =
      req.query?.tenant_id ||
      req.query?.tenantId ||
      req.body?.tenant_id ||
      req.body?.tenantId ||
      req.tenantId ||
      req.user?.activeTenantId ||
      req.user?.tenantId ||
      req.user?.tenant_id;
    const sourceMemberId =
      req.query?.source_member_id ||
      req.query?.sourceMemberId ||
      req.body?.source_member_id ||
      req.body?.sourceMemberId;
    const targetMemberId =
      req.query?.target_member_id ||
      req.query?.targetMemberId ||
      req.body?.target_member_id ||
      req.body?.targetMemberId;

    if (!isAdminAuthorized(req, tenantId)) {
      return res.status(422).json({
        ok: false,
        code: 'ER_ADMIN_PERMISSION_REQUIRED',
        message: 'Chỉ quản trị viên mới có quyền truy cập Wizard gộp thực thể.',
      });
    }

    if (!tenantId || !sourceMemberId || !targetMemberId) {
      return res.status(422).json({
        ok: false,
        code: 'ER_INVALID_PARAMS',
        message: 'Thiếu tenant_id, source_member_id hoặc target_member_id.',
      });
    }

    if (sourceMemberId === targetMemberId) {
      return res.status(422).json({
        ok: false,
        code: 'ER_SELF_MERGE_FORBIDDEN',
        message: 'Không thể tự gộp một thực thể vào chính nó (self-merge).',
      });
    }

    const preview = await previewDuplicateEntityResolution({
      tenantId,
      sourceMemberId,
      targetMemberId,
    });

    return res.status(200).json({
      ok: true,
      data: {
        ...preview,
        soft_warning_only: true,
        auto_disputed: false,
        conflict_citation_prefix: 'SYS_CIT::CONFLICT_MERGE::',
      },
    });
  } catch (err) {
    return mapErrorResponse(res, err);
  }
}

module.exports = {
  isAdminAuthorized,
  previewMergeHandler,
  executeMergeHandler,
  wizardSummaryHandler,
};