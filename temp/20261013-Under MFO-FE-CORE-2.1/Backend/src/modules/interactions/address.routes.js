/**
 * PATH: src/modules/interactions/address.routes.js
 * DATETIME: 2026-07-16T12:15:00+07:00
 * VERSION: 1.6.2
 */
const express = require('express');
const router = express.Router();
const baseController = require('../../shared/controllers/base.controller');
const { verifyToken, checkRole } = require('../../middlewares/auth.middleware');
const validateMiddleware = require('../../middlewares/validate.middleware'); // Thêm

const addressCtrl = baseController('addresses');

router.get('/search', verifyToken, addressCtrl.search);
router.get('/', verifyToken, addressCtrl.getAll);
router.get('/:id', verifyToken, addressCtrl.getById);

router.post(
    '/', 
    verifyToken, 
    checkRole(['USER', 'CLAN_ADMIN']), 
    validateMiddleware('addresses'), // Thêm validation
    addressCtrl.create
);

router.put(
    '/:id', 
    verifyToken, 
    checkRole(['USER', 'CLAN_ADMIN']), 
    validateMiddleware('addresses'), // Thêm validation
    addressCtrl.update
);

router.delete('/:id', verifyToken, checkRole(['CLAN_ADMIN']), addressCtrl.delete);

module.exports = router;