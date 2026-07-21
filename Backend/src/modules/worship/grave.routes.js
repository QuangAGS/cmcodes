/**
 * PATH: src/modules/worship/grave.routes.js
 * DATETIME: 2026-07-16T12:15:00+07:00
 * VERSION: 1.0.0
 */


const express = require('express');
const router = express.Router();
const baseController = require('../../shared/controllers/base.controller');
const { verifyToken, checkRole } = require('../../middlewares/auth.middleware');

const graveCtrl = baseController('graves');

router.get('/search', verifyToken, graveCtrl.search);
router.get('/', verifyToken, graveCtrl.getAll);
router.get('/:id', verifyToken, graveCtrl.getById);

router.post('/', verifyToken, checkRole(['USER', 'CLAN_ADMIN']), graveCtrl.create);
router.put('/:id', verifyToken, checkRole(['USER', 'CLAN_ADMIN']), graveCtrl.update);
router.delete('/:id', verifyToken, checkRole(['CLAN_ADMIN']), graveCtrl.delete);

module.exports = router;
