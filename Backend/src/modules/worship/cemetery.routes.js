/**
 * PATH: src/modules/worship/cemetery.routes.js
 * DATETIME: 2026-07-16T12:15:00+07:00
 * VERSION: 1.0.0
 */


const express = require('express');
const router = express.Router();
const baseController = require('../../shared/controllers/base.controller');
const { verifyToken, checkRole } = require('../../middlewares/auth.middleware');

const cemeteryCtrl = baseController('cemetery');

router.get('/search', verifyToken, cemeteryCtrl.search);
router.get('/', verifyToken, cemeteryCtrl.getAll);
router.get('/:id', verifyToken, cemeteryCtrl.getById);

router.post('/', verifyToken, checkRole(['USER', 'CLAN_ADMIN']), cemeteryCtrl.create);
router.put('/:id', verifyToken, checkRole(['USER', 'CLAN_ADMIN']), cemeteryCtrl.update);
router.delete('/:id', verifyToken, checkRole(['CLAN_ADMIN']), cemeteryCtrl.delete);

module.exports = router;
