/**
 * PATH: src/modules/finance/fund.routes.js
 * DATETIME: 2026-07-16T12:15:00+07:00
 * VERSION: 1.0.0
 */

// fundactionRoutes.js
const express = require('express');
const router = express.Router();
const baseController = require('../../shared/controllers/base.controller');
const { verifyToken, checkRole } = require('../../middlewares/auth.middleware');

const fundCtrl = baseController('funds');

router.get('/', verifyToken, fundCtrl.getAll);
router.get('/:id', verifyToken, fundCtrl.getById);

// Chỉ Admin dòng họ mới được ghi chép thu chi
router.post('/', verifyToken, checkRole(['CLAN_ADMIN']), fundCtrl.create);
router.delete('/:id', verifyToken, checkRole(['CLAN_ADMIN']), fundCtrl.delete);

module.exports = router;