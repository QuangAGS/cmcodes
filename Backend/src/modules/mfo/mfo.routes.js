/**
 * PATH       : backend/src/modules/mfo/mfo.routes.js
 * DATETIME   : 2026-11-11T12:25:00+07:00
 * VERSION    : 3.1.0-MFO-HEAVY-WRITE-GUARD
 * DESCRIPTION:
 * - [AMEND-RP-OP-2026-02 V1.2] Lát 2/7:
 *   + Gắn assertActiveLink vào các thao tác trình, duyệt, trả sửa, bác bỏ Cửa 1 & Cửa 2.
 *   + Bảo vệ toàn vẹn tiến trình phả đồ MFO không bị thao túng bởi phiên bị thu hồi quyền.
 */

'use strict';

const express = require('express');
const router = express.Router();
const mfoController = require('./mfo.controller');
const {
  verifyToken,
  checkRole,
  assertActiveLink,
} = require('../../middlewares/auth.middleware');

const READ = ['USER', 'VIEWER', 'CLAN_ADMIN', 'SYSTEM_ADMIN'];
const WRITE = ['USER', 'CLAN_ADMIN', 'SYSTEM_ADMIN'];
const ADMIN = ['CLAN_ADMIN', 'SYSTEM_ADMIN'];

// =============================================================================
// 1. NHÓM API TRUY VẤN CÂY PHẢ HỆ & FULL-SET (CANVAS 5L) - READ-ONLY
// =============================================================================
router.get('/origins/:originId/tree', verifyToken, checkRole(READ), mfoController.getOriginTree);
router.get('/origins/:originId/full-set', verifyToken, checkRole(READ), mfoController.getFullMfoSet);

// =============================================================================
// 2. NHÓM API DANH SÁCH & BẢN NHÁP (DRAFT - STAGING)
// =============================================================================
router.get('/plans/can-create', verifyToken, checkRole(READ), mfoController.canCreate);
router.get('/plans', verifyToken, checkRole(READ), mfoController.listPlans);
router.get('/plans/:id/draft-payload', verifyToken, checkRole(READ), mfoController.getDraftPayload);
router.get('/plans/:id', verifyToken, checkRole(READ), mfoController.getPlan);

router.post('/plans/draft', verifyToken, checkRole(WRITE), mfoController.saveDraft);
router.put('/plans/:id', verifyToken, checkRole(WRITE), mfoController.updatePlan);
router.delete('/plans/:id/draft', verifyToken, checkRole(WRITE), mfoController.deleteDraft);
router.post('/plans/:id/staging', verifyToken, checkRole(WRITE), mfoController.saveStaging);
router.post('/plans/:id/abort', verifyToken, checkRole(WRITE), mfoController.abortPlan);

// =============================================================================
// 3. NHÓM API TRÌNH & THẨM ĐỊNH KHUNG 5L (GATE 1) - HEAVY WRITE
// =============================================================================
router.post(
  '/plans',
  verifyToken,
  checkRole(WRITE),
  assertActiveLink, // <-- Heavy-write
  mfoController.createPlan
);

router.post(
  '/plans/:id/approve',
  verifyToken,
  checkRole(ADMIN),
  assertActiveLink, // <-- Heavy-write
  mfoController.approvePlan
);

router.post(
  '/plans/:id/return',
  verifyToken,
  checkRole(ADMIN),
  assertActiveLink, // <-- Heavy-write
  mfoController.returnPlanForRevision
);

router.post(
  '/plans/:id/reject',
  verifyToken,
  checkRole(ADMIN),
  assertActiveLink, // <-- Heavy-write
  mfoController.rejectPlan
);

// =============================================================================
// 4. NHÓM API TRÌNH & NGHIỆM THU TỜ KHAI (GATE 2) - HEAVY WRITE
// =============================================================================
router.post(
  '/plans/:id/result',
  verifyToken,
  checkRole(WRITE),
  assertActiveLink, // <-- Heavy-write
  mfoController.submitResult
);

router.post(
  '/plans/:id/result/approve',
  verifyToken,
  checkRole(ADMIN),
  assertActiveLink, // <-- Heavy-write
  mfoController.approveResult
);

router.post(
  '/plans/:id/result/reject',
  verifyToken,
  checkRole(ADMIN),
  assertActiveLink, // <-- Heavy-write
  mfoController.terminateResult
);

router.post(
  '/plans/:id/result/return',
  verifyToken,
  checkRole(ADMIN),
  assertActiveLink, // <-- Heavy-write
  mfoController.rejectResult
);

module.exports = router;
