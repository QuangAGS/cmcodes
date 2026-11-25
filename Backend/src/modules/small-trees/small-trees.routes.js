/**
 * PATH       : src/modules/small-trees/small-trees.routes.js
 * DATETIME   : 2026-11-25T16:20:00+07:00
 * VERSION    : 1.1.0-WP04-WIRED
 * DESCRIPTION:
 * - Routes cho CRUD & duyệt ghép Small Trees (Path B - WP-04, gắn verifyToken, checkRole, assertActiveLink).
 * CHANGE LOGS:
 *   - 2026-11-25: Cập nhật routes với middleware xác thực và kiểm tra quyền.
 */

'use strict';

const express = require('express');
const {
  createSmallTreeHandler,
  listSmallTreesHandler,
  getSmallTreeHandler,
  updateSmallTreeStatusHandler,
  mergeSmallTreeHandler,
  listPendingMergeSmallTreesHandler,
} = require('./small-trees.controller.js');
const {
  verifyToken,
  checkRole,
  assertActiveLink,
} = require('../../middlewares/auth.middleware');

const READ_ROLES = ['USER', 'VIEWER', 'CLAN_ADMIN', 'SYSTEM_ADMIN'];
const WRITE_ROLES = ['USER', 'CLAN_ADMIN', 'SYSTEM_ADMIN'];
const MERGE_ROLES = ['CLAN_ADMIN', 'SYSTEM_ADMIN'];

const router = express.Router();

router.post('/', verifyToken, checkRole(WRITE_ROLES), assertActiveLink, createSmallTreeHandler);
router.get('/', verifyToken, checkRole(READ_ROLES), listSmallTreesHandler);
router.get('/pending-merge', verifyToken, checkRole(MERGE_ROLES), listPendingMergeSmallTreesHandler);
router.get('/:id', verifyToken, checkRole(READ_ROLES), getSmallTreeHandler);
router.patch('/:id/status', verifyToken, checkRole(WRITE_ROLES), assertActiveLink, updateSmallTreeStatusHandler);
router.post('/:id/merge', verifyToken, checkRole(MERGE_ROLES), assertActiveLink, mergeSmallTreeHandler);

module.exports = router;
