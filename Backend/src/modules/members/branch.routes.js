/**
 * PATH       : src/modules/members/branch.routes.js
 * DATETIME   : 2026-09-10T16:10:00+07:00
 * VERSION    : 1.7.0-CYCLE
 */

const express = require('express');
const router = express.Router();
const baseController = require('../../shared/controllers/base.controller');
const branchController = require('./branch.controller');
const { verifyToken, checkRole } = require('../../middlewares/auth.middleware');

const branchCtrl = baseController('branches');

router.get('/tree', verifyToken, branchController.getBranchTree);

router.get('/search', verifyToken, branchCtrl.search);
router.get('/', verifyToken, branchCtrl.getAll);
router.get('/:id', verifyToken, branchCtrl.getById);

router.post('/', verifyToken, checkRole(['USER', 'CLAN_ADMIN']), branchController.create);
router.put('/:id', verifyToken, checkRole(['USER', 'CLAN_ADMIN']), branchController.update);
router.delete('/:id', verifyToken, checkRole(['CLAN_ADMIN']), branchCtrl.delete);

module.exports = router;
