/**
 * PATH: src/modules/interactions/event.routes.js
 * DATETIME: 2026-07-16T12:15:00+07:00
 * VERSION: 1.0.0
 */

const express = require('express');
const router = express.Router();
const baseController = require('../../shared/controllers/base.controller');
const { verifyToken, checkRole } = require('../../middlewares/auth.middleware');

const eventCtrl = baseController('events');

router.get('/search', verifyToken, eventCtrl.search);
router.get('/', verifyToken, eventCtrl.getAll);
router.get('/:id', verifyToken, eventCtrl.getById);

router.post('/', verifyToken, checkRole(['CLAN_ADMIN']), eventCtrl.create);
router.put('/:id', verifyToken, checkRole(['CLAN_ADMIN']), eventCtrl.update);
router.delete('/:id', verifyToken, checkRole(['CLAN_ADMIN']), eventCtrl.delete);

module.exports = router;