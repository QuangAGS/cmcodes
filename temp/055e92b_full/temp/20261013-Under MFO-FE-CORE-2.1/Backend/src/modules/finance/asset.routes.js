/**
 * PATH: src/modules/finance/asset.routes.js
 * DATETIME: 2026-07-16T12:15:00+07:00
 * VERSION: 1.0.0
 */

const express = require('express');
const router = express.Router();
const baseController = require('../../shared/controllers/base.controller');
const { verifyToken, checkRole } = require('../../middlewares/auth.middleware');

const assetCtrl = baseController('assets');

router.get('/search', verifyToken, assetCtrl.search);
router.get('/', verifyToken, assetCtrl.getAll);
router.get('/:id', verifyToken, assetCtrl.getById);

router.post('/', verifyToken, checkRole(['CLAN_ADMIN']), assetCtrl.create);
router.put('/:id', verifyToken, checkRole(['CLAN_ADMIN']), assetCtrl.update);
router.delete('/:id', verifyToken, checkRole(['CLAN_ADMIN']), assetCtrl.delete);

module.exports = router;