/**
 * PATH       : src/modules/tenants/tenant.routes.js
 * DATETIME   : 2026-08-25T16:10:00+07:00
 * VERSION    : 1.8.0-TENANT-SETTINGS
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

module.exports = router;
