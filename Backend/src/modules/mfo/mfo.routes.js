/**
 * PATH       : backend/src/modules/mfo/mfo.routes.js
 * DATETIME   : 2026-10-09T12:25:00+07:00
 * VERSION    : 3.0.0-SRPF-ROUTES-FINAL
 * DESCRIPTION:
 * - Khai báo danh mục Endpoint REST API cho Phân hệ MFO 5L.
 * - Phân định rõ nhóm API Canvas, Nháp DRAFT, Gate 1 (MFO_PLAN), Workbench và Gate 2 (MFO_RESULT).
 * - Middleware Auth & CheckRole đảm bảo an toàn truy cập chặt chẽ.
 * REFERENCE  : MFO Core Lifecycle 2.0 Architectural Specification
 */

const express = require('express');
const router = express.Router();
const mfoController = require('./mfo.controller');
const { verifyToken, checkRole } = require('../../middlewares/auth.middleware');

const READ = ['USER', 'VIEWER', 'CLAN_ADMIN', 'SYSTEM_ADMIN'];
const WRITE = ['USER', 'CLAN_ADMIN', 'SYSTEM_ADMIN'];
const ADMIN = ['CLAN_ADMIN', 'SYSTEM_ADMIN'];

// =============================================================================
// 1. NHÓM API TRUY VẤN CÂY PHẢ HỆ & FULL-SET (CANVAS 5L)
// =============================================================================
router.get(
  '/origins/:originId/tree',
  verifyToken,
  checkRole(READ),
  mfoController.getOriginTree
);

router.get(
  '/origins/:originId/full-set',
  verifyToken,
  checkRole(READ),
  mfoController.getFullMfoSet
);

// =============================================================================
// 2. NHÓM API DANH SÁCH & BẢN NHÁP (DRAFT - STAGING)
// =============================================================================
router.get('/plans', verifyToken, checkRole(READ), mfoController.listPlans);

// Lưu nháp Khung 5L
router.post('/plans/draft', verifyToken, checkRole(WRITE), mfoController.saveDraft);

// Xóa mềm nháp / Tờ trình ở trạng thái DRAFT, NEEDS_REVISION, REJECTED
router.delete('/plans/:id/draft', verifyToken, checkRole(WRITE), mfoController.deleteDraft);

// Đọc trọn vẹn Payload Lớp Đôi để Hydrate Canvas
router.get(
  '/plans/:id/draft-payload',
  verifyToken,
  checkRole(READ),
  mfoController.getDraftPayload
);

// =============================================================================
// 3. NHÓM API TRÌNH & THẨM ĐỊNH KHUNG 5L (GATE 1 - MFO_PLAN)
// =============================================================================
// Trình Khung 5L chính thức (DRAFT -> PENDING)
router.post('/plans', verifyToken, checkRole(WRITE), mfoController.createPlan);

// Chi tiết Tờ trình Khung
router.get('/plans/:id', verifyToken, checkRole(READ), mfoController.getPlan);

// Admin Phê duyệt Khung 5L (Cấp tem plan_ok = true & chốt granted_generation)
router.post(
  '/plans/:id/approve',
  verifyToken,
  checkRole(ADMIN),
  mfoController.approvePlan
);

// Admin Trả về yêu cầu hiệu chỉnh (Itemized Return -> NEEDS_REVISION)
router.post(
  '/plans/:id/return',
  verifyToken,
  checkRole(ADMIN),
  mfoController.returnPlanForRevision
);

// Admin Bác bỏ vĩnh viễn Khung 5L (REJECTED)
router.post(
  '/plans/:id/reject',
  verifyToken,
  checkRole(ADMIN),
  mfoController.rejectPlan
);

// Người trình chủ động rút hồ sơ (WITHDRAWN)
router.post(
  '/plans/:id/abort',
  verifyToken,
  checkRole(WRITE),
  mfoController.abortPlan
);

// =============================================================================
// 4. NHÓM API TRÌNH & NGHIỆM THU TỜ KHAI (GATE 2 - MFO_RESULT)
// =============================================================================
// Người trình nộp Tờ khai Nghiệm thu Kết quả Xưởng
router.post(
  '/plans/:id/result',
  verifyToken,
  checkRole(WRITE),
  mfoController.submitResult
);

// Admin Phê duyệt Nghiệm thu & Chốt Sổ thật (APPROVE Gate 2 -> result_ok = true)
router.post(
  '/plans/:id/result/approve',
  verifyToken,
  checkRole(ADMIN),
  mfoController.approveResult
);

// Admin Trả về Tờ khai Nghiệm thu yêu cầu sửa lại (NEEDS_REVISION)
router.post(
  '/plans/:id/result/reject',
  verifyToken,
  checkRole(ADMIN),
  mfoController.rejectResult
);

module.exports = router;