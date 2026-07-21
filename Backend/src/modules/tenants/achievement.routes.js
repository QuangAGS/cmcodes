/**
 * PATH: src/modules/tenants/achievement.routes.js
 * DATETIME: 2026-07-16T12:15:00+07:00
 * VERSION: 1.0.0
 */

const express = require('express');
const router = express.Router();
const baseController = require('../../shared/controllers/base.controller');
const { verifyToken, checkRole } = require('../../middlewares/auth.middleware');
const validateMiddleware = require('../../middlewares/validate.middleware');

const achievementCtrl = baseController('achievements');

router.get('/search', verifyToken, achievementCtrl.search);
router.get('/', verifyToken, achievementCtrl.getAll);
router.get('/:id', verifyToken, achievementCtrl.getById);

router.post('/', verifyToken, checkRole(['USER', 'CLAN_ADMIN']), validateMiddleware('achievements'), achievementCtrl.create);
router.put('/:id', verifyToken, checkRole(['USER', 'CLAN_ADMIN']), validateMiddleware('achievements'), achievementCtrl.update);
router.delete('/:id', verifyToken, checkRole(['CLAN_ADMIN']), achievementCtrl.delete);

module.exports = router;