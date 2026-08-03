/**
 * PATH: src/modules/members/branch.routes.js
 * DATETIME: 2026-07-16T12:15:00+07:00
 * VERSION: 1.6.0
 */
const express = require('express');
const router = express.Router();
const baseController = require('../../shared/controllers/base.controller');
const branchController = require('./branch.controller'); // Giữ lại cho các hàm đặc thù
const { verifyToken, checkRole } = require('../../middlewares/auth.middleware');

// 1. Lấy bộ Controller chuẩn cho bảng branches
const branchCtrl = baseController('branches');

// --- NHÓM 1: LOGIC ĐẶC THÙ (Specialized) ---
// Phải nằm trên các route CRUD để tránh bị shadowing
router.get('/tree', verifyToken, branchController.getBranchTree);

// --- NHÓM 2: CRUD CHUẨN (Qua baseController) ---
router.get('/search', verifyToken, branchCtrl.search);
router.get('/', verifyToken, branchCtrl.getAll);
router.get('/:id', verifyToken, branchCtrl.getById);

router.post('/', verifyToken, checkRole(['USER', 'CLAN_ADMIN']), branchCtrl.create);
router.put('/:id', verifyToken, checkRole(['USER', 'CLAN_ADMIN']), branchCtrl.update);
router.delete('/:id', verifyToken, checkRole(['CLAN_ADMIN']), branchCtrl.delete);

module.exports = router;