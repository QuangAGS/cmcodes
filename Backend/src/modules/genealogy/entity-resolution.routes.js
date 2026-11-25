/**
 * PATH       : src/modules/genealogy/entity-resolution.routes.js
 * DATETIME   : 2026-11-25T16:20:00+07:00
 * VERSION    : 1.1.0-WP03-WIRED
 * DESCRIPTION:
 * - Routes cho Wizard Entity Resolution của Admin (gắn verifyToken, checkRole, assertActiveLink).
 * CHANG LOGS:
 *   - 2026-11-25: Tạo mới routes với middleware xác thực và kiểm tra quyền.
 */

'use strict';

const express = require('express');
const {
  previewMergeHandler,
  executeMergeHandler,
  wizardSummaryHandler,
} = require('./entity-resolution.controller.js');
const {
  verifyToken,
  checkRole,
  assertActiveLink,
} = require('../../middlewares/auth.middleware');

const ADMIN_ROLES = ['CLAN_ADMIN', 'SYSTEM_ADMIN'];

const router = express.Router();

router.post('/preview', verifyToken, checkRole(ADMIN_ROLES), previewMergeHandler);
router.post('/merge', verifyToken, checkRole(ADMIN_ROLES), assertActiveLink, executeMergeHandler);
router.get('/wizard-summary', verifyToken, checkRole(ADMIN_ROLES), wizardSummaryHandler);

module.exports = router;
