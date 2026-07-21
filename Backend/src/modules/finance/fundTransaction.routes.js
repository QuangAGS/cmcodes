/**
 * PATH: src/modules/finance/fundTransaction.routes.js
 * DATETIME: 2026-07-16T12:15:00+07:00
 * VERSION: 1.0.0
 */

// fundTransactionRoutes.js
const express = require('express');
const router = express.Router();
const baseController = require('../../shared/controllers/base.controller');
const { verifyToken, checkRole } = require('../../middlewares/auth.middleware');

const fundTransCtrl = baseController('fund_transactions');

router.get('/', verifyToken, fundTransCtrl.getAll);
router.get('/:id', verifyToken, fundTransCtrl.getById);

// Chỉ Admin dòng họ mới được ghi chép thu chi
router.post('/', verifyToken, checkRole(['CLAN_ADMIN']), fundTransCtrl.create);
router.delete('/:id', verifyToken, checkRole(['CLAN_ADMIN']), fundTransCtrl.delete);

module.exports = router;