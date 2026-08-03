/**
 * PATH: src/modules/interactions/suggestion.routes.js
 * DATETIME: 2026-07-16T12:15:00+07:00
 * VERSION: 1.0.0
 */

const express = require('express');
const router = express.Router();
const baseController = require('../../shared/controllers/base.controller');
const { verifyToken, checkRole } = require('../../middlewares/auth.middleware');

const suggestionCtrl = baseController('suggestions');

router.get('/search', verifyToken, suggestionCtrl.search);
router.get('/', verifyToken, suggestionCtrl.getAll);
router.get('/:id', verifyToken, suggestionCtrl.getById);

router.post('/', verifyToken, checkRole(['CLAN_ADMIN']), suggestionCtrl.create);
router.put('/:id', verifyToken, checkRole(['CLAN_ADMIN']), suggestionCtrl.update);
router.delete('/:id', verifyToken, checkRole(['CLAN_ADMIN']), suggestionCtrl.delete);

module.exports = router;