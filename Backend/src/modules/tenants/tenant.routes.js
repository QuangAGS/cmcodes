/**
 * PATH       : src/modules/tenants/tenant.routes.js
 * DATETIME   : 2026-11-23T06:58:00+07:00
 * VERSION    : 1.11.0-ISO29148-UAT-IMP7-NAME-CHECK
 * DESCRIPTION:
 * - GET/PATCH /me — cài đặt dòng họ (CLAN_ADMIN / SYSTEM_ADMIN).
 * - PATCH /:id/settings — SYSTEM_ADMIN sửa tenant bất kỳ.
 * - Đặt /me trước /:id để không bị nuốt param.
 * - Q1: giữ CRUD + activate.
 */

'use strict';

const express = require('express');
const router = express.Router();
const baseController = require('../../shared/controllers/base.controller');
const { verifyToken, checkRole } = require('../../middlewares/auth.middleware');
const validateMiddleware = require('../../middlewares/validate.middleware');
const { asyncHandler } = require('../../shared/errors');
const tenantService = require('./tenant.service');
const { basePrisma } = require('../../lib/prisma');
const {
  PLATFORM_GENERAL_RULES,
  DEFAULT_TOS_VERSION,
} = require('../onboarding/onboardingConsentAndRules.service');

const tenantCtrl = baseController('tenants');

function actorFromReq(req) {
  return {
    id: req.user.userId || req.user.id,
    role: req.user.role,
    tenantId: req.user.tenantId || req.user.tenant_id,
    status: req.user.status,
  };
}

// --- PUBLIC ---
router.get('/search', tenantCtrl.search);

// --- PUBLIC check duplicate clan name (UAT-IMP7 soft warning) ---
router.get(
  '/check-name',
  asyncHandler(async (req, res) => {
    const rawName = String(req.query.name || req.query.q || '').trim();
    const data = await tenantService.checkClanNameAvailability(rawName);
    res.status(200).json({
      success: true,
      status: 'success',
      data,
    });
  })
);

// --- SETTINGS (trước /:id) ---
router.get(
  '/me',
  verifyToken,
  checkRole(['SYSTEM_ADMIN', 'CLAN_ADMIN']),
  asyncHandler(async (req, res) => {
    const actor = actorFromReq(req);
    const tenantId =
      actor.role === 'SYSTEM_ADMIN'
        ? req.query.tenant_id || actor.tenantId
        : actor.tenantId;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        code: 'TENANT_ID_REQUIRED',
        message: 'Thiếu tenant. SYSTEM_ADMIN có thể truyền ?tenant_id=',
      });
    }

    const data = await tenantService.getTenantSettings(tenantId, actor);
    res.status(200).json({ success: true, status: 'success', data });
  })
);

router.patch(
  '/me',
  verifyToken,
  checkRole(['SYSTEM_ADMIN', 'CLAN_ADMIN']),
  asyncHandler(async (req, res) => {
    const actor = actorFromReq(req);
    const tenantId =
      actor.role === 'SYSTEM_ADMIN'
        ? req.body.tenant_id || actor.tenantId
        : actor.tenantId;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        code: 'TENANT_ID_REQUIRED',
        message: 'Thiếu tenant_id.',
      });
    }

    const data = await tenantService.updateTenantSettings(
      tenantId,
      actor,
      req.body || {}
    );
    res.status(200).json({
      success: true,
      status: 'success',
      message: 'Đã cập nhật thông tin dòng họ.',
      data,
    });
  })
);

router.patch(
  '/:id/settings',
  verifyToken,
  checkRole(['SYSTEM_ADMIN', 'CLAN_ADMIN']),
  asyncHandler(async (req, res) => {
    const actor = actorFromReq(req);
    const tenantId = req.params.id;
    const data = await tenantService.updateTenantSettings(
      tenantId,
      actor,
      req.body || {}
    );
    res.status(200).json({
      success: true,
      status: 'success',
      message: 'Đã cập nhật thông tin dòng họ.',
      data,
    });
  })
);

// --- PUBLIC get rules (Nội quy chung + Nội quy dòng họ trước khi gia nhập) ---
router.get(
  '/:id/rules',
  asyncHandler(async (req, res) => {
    const tenantId = String(req.params.id || '').trim();
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        code: 'TENANT_ID_REQUIRED',
        message: 'Thiếu mã định danh dòng họ.',
      });
    }

    const tenant = await basePrisma.tenants.findFirst({
      where: { id: tenantId, deleted_at: null },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        clan_profiles: {
          where: { deleted_at: null },
          select: {
            clan_rules: true,
            clan_rules_version: true,
          },
        },
      },
    });

    if (!tenant) {
      return res.status(404).json({
        success: false,
        code: 'TENANT_NOT_FOUND',
        message: 'Không tìm thấy dòng họ.',
      });
    }

    const cp = tenant.clan_profiles || null;
    const rawClanRules =
      cp && cp.clan_rules != null ? String(cp.clan_rules).trim() : '';

    return res.status(200).json({
      success: true,
      status: 'success',
      data: {
        tenantId: tenant.id,
        clanName: tenant.name,
        clanSlug: tenant.slug,
        tosVersion: DEFAULT_TOS_VERSION,
        platformRules: PLATFORM_GENERAL_RULES,
        clanRules: rawClanRules || null,
        clanRulesVersion: cp?.clan_rules_version || 1,
        hasCustomClanRules: Boolean(rawClanRules),
      },
    });
  })
);

// --- PUBLIC get by id (sau /me) ---
router.get('/:id', tenantCtrl.getById);

// --- PROTECTED CRUD ---
router.get(
  '/',
  verifyToken,
  checkRole(['SYSTEM_ADMIN']),
  asyncHandler(async (req, res) => {
    const actor = actorFromReq(req);
    const data = await tenantService.listTenantsDirectory(actor, req.query || {});
    res.status(200).json({ success: true, status: 'success', data });
  })
);

router.post(
  '/',
  verifyToken,
  checkRole(['SYSTEM_ADMIN']),
  validateMiddleware('tenants'),
  tenantCtrl.create
);

router.put(
  '/:id',
  verifyToken,
  checkRole(['CLAN_ADMIN']),
  validateMiddleware('tenants'),
  tenantCtrl.update
);

router.delete(
  '/:id',
  verifyToken,
  checkRole(['SYSTEM_ADMIN']),
  tenantCtrl.delete
);

router.post(
  '/:id/activate',
  verifyToken,
  checkRole(['SYSTEM_ADMIN', 'CLAN_ADMIN']),
  asyncHandler(async (req, res) => {
    const tenantId = req.params.id;
    const actor = actorFromReq(req);
    const result = await tenantService.activateTenant(tenantId, actor);
    res.status(200).json({
      status: 'success',
      message: 'Dòng họ đã được kích hoạt thành công.',
      data: result,
    });
  })
);

router.post(
  '/:id/sandbox/extend',
  verifyToken,
  checkRole(['SYSTEM_ADMIN']),
  asyncHandler(async (req, res) => {
    const tenantId = req.params.id;
    const actor = actorFromReq(req);
    const { extraDays = 15, note = '' } = req.body || {};
    const result = await tenantService.extendTenantSandbox(
      tenantId,
      actor,
      extraDays,
      note
    );
    res.status(200).json({
      success: true,
      status: 'success',
      message: 'Đã gia hạn thời gian dùng thử Sandbox.',
      data: result,
    });
  })
);

router.post(
  '/:id/sandbox/cleanup',
  verifyToken,
  checkRole(['SYSTEM_ADMIN']),
  asyncHandler(async (req, res) => {
    const tenantId = req.params.id;
    const actor = actorFromReq(req);
    const { note = '' } = req.body || {};
    const result = await tenantService.closeAndCleanSandboxTenant(
      tenantId,
      actor,
      note
    );
    res.status(200).json({
      success: true,
      status: 'success',
      message: 'Đã đóng dòng họ (NGUNG_HAN) và dọn dẹp dữ liệu dùng thử.',
      data: result,
    });
  })
);

module.exports = router;
