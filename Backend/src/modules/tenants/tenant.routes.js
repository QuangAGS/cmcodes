/**
 * PATH       : src/modules/tenants/tenant.routes.js
 * DATETIME   : 2026-08-09T19:00:00+07:00
 * VERSION    : 1.7.0-OP-2
 * DESCRIPTION:
 * - OP-2: Thêm POST /:id/activate (TAM_NGUNG → HOAT_DONG).
 * - Q1: Bảo tồn toàn bộ route CRUD hiện có.
 * - Không gắn tenantStatusHeavy trên route activate (vì tenant đang TAM_NGUNG).
 *
 * CHANGELOG:
 * - 1.6.6 (2026-07-16): Sửa lỗi Shadowing + đồng bộ Onboarding BR3.
 * - 1.7.0-OP-2 (2026-08-09): Thêm activate endpoint.
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

// --- NHÓM 1: PUBLIC ROUTES (Dành cho Onboarding/Guest) ---

// Tìm kiếm slug: Phải đặt lên đầu để tránh bị nhầm với :id
router.get('/search', tenantCtrl.search);

// Xem chi tiết: Công khai (Để lấy Logo/Màu sắc dòng họ khi xem cây công khai)
router.get('/:id', tenantCtrl.getById);


// --- NHÓM 2: PROTECTED ROUTES (Yêu cầu Token & Quyền hạn) ---

// 1. Xem danh sách: Chỉ SYSTEM_ADMIN
router.get('/', verifyToken, checkRole(['SYSTEM_ADMIN']), tenantCtrl.getAll);

// 2. Tạo mới (Quản trị): Chỉ SYSTEM_ADMIN tạo trực tiếp tại đây
// Lưu ý: Người dùng bình thường tạo Tenant qua route /api/auth/register
router.post(
  '/',
  verifyToken,
  checkRole(['SYSTEM_ADMIN']),
  validateMiddleware('tenants'),
  tenantCtrl.create
);

// 3. Cập nhật: CLAN_ADMIN sửa dòng họ mình
router.put(
  '/:id',
  verifyToken,
  checkRole(['CLAN_ADMIN']),
  validateMiddleware('tenants'),
  tenantCtrl.update
);

// 4. Xóa: Chỉ SYSTEM_ADMIN
router.delete('/:id', verifyToken, checkRole(['SYSTEM_ADMIN']), tenantCtrl.delete);

// ==========================================================================
// OP-2: Tenant Activate (TAM_NGUNG → HOAT_DONG)
// ==========================================================================
// Authz chi tiết nằm trong tenant.service.activateTenant (CLAN_ADMIN + DA_DUYET + cùng tenant
// hoặc SYSTEM_ADMIN). Không dùng tenantStatusHeavy vì tenant đang ở TAM_NGUNG.
router.post(
  '/:id/activate',
  verifyToken,
  checkRole(['SYSTEM_ADMIN', 'CLAN_ADMIN']),
  asyncHandler(async (req, res) => {
    const tenantId = req.params.id;

    const actor = {
      id: req.user.userId || req.user.id,
      role: req.user.role,
      tenantId: req.user.tenantId || req.user.tenant_id,
      status: req.user.status,
    };

    const result = await tenantService.activateTenant(tenantId, actor);

    res.status(200).json({
      status: 'success',
      message: 'Dòng họ đã được kích hoạt thành công.',
      data: result,
    });
  })
);

module.exports = router;