/**
 * PATH       : src/modules/small-trees/small-trees.controller.js
 * DATETIME   : 2026-11-25T16:03:00+07:00
 * VERSION    : 1.0.0-WP04
 * DESCRIPTION:
 * - Controller cho CRUD & duyệt ghép Small Trees (Path B - WP-04).
 * CHANGE LOGS:
 *   - 2026-11-25: Tạo mới controller với các handler cho Small Trees.
 */

'use strict';

const {
  createSmallTree,
  listSmallTrees,
  getSmallTreeById,
  updateSmallTreeStatus,
  mergeSmallTree,
} = require('./small-trees.service.js');

function sendError(res, err) {
  const status = Number(err?.statusCode || err?.status || 500);
  return res.status(status).json({
    ok: false,
    code: err?.code || 'SMALL_TREE_ERROR',
    message: err?.message || 'Lỗi xử lý cây nhỏ (Small Tree).',
    details: err?.details || null,
  });
}

async function createSmallTreeHandler(req, res) {
  try {
    const body = req.body || {};
    const tenantId = body.tenant_id || body.tenantId || req.tenantId || req.user?.tenant_id;
    const ownerUserId = body.owner_user_id || body.ownerUserId || req.user?.id;
    const rootMemberId = body.root_member_id || body.rootMemberId;
    const createdByMemberId = body.created_by_member_id || body.createdByMemberId || null;
    const isAdminOwned = Boolean(body.is_admin_owned ?? body.isAdminOwned ?? false);
    const actorId = req.user?.id || body.actor_id || ownerUserId || null;
    const correlationId = body.correlation_id || req.headers?.['x-correlation-id'] || null;

    const data = await createSmallTree({
      tenantId,
      ownerUserId,
      rootMemberId,
      createdByMemberId,
      isAdminOwned,
      actorId,
      actorType: 'USER',
      correlationId,
    });

    return res.status(201).json({ ok: true, data });
  } catch (err) {
    return sendError(res, err);
  }
}

async function listSmallTreesHandler(req, res) {
  try {
    const tenantId = req.query?.tenant_id || req.query?.tenantId || req.tenantId || req.user?.tenant_id;
    const status = req.query?.status || null;
    const ownerUserId = req.query?.owner_user_id || req.query?.ownerUserId || null;

    const data = await listSmallTrees({ tenantId, status, ownerUserId });
    return res.status(200).json({ ok: true, data });
  } catch (err) {
    return sendError(res, err);
  }
}

async function getSmallTreeHandler(req, res) {
  try {
    const tenantId = req.query?.tenant_id || req.query?.tenantId || req.tenantId || req.user?.tenant_id;
    const smallTreeId = req.params.id;
    const data = await getSmallTreeById({ tenantId, smallTreeId });
    return res.status(200).json({ ok: true, data });
  } catch (err) {
    return sendError(res, err);
  }
}

async function updateSmallTreeStatusHandler(req, res) {
  try {
    const body = req.body || {};
    const tenantId = body.tenant_id || body.tenantId || req.tenantId || req.user?.tenant_id;
    const smallTreeId = req.params.id;
    const nextStatus = body.status || body.next_status || body.nextStatus;
    const actorId = req.user?.id || body.actor_id || null;

    const data = await updateSmallTreeStatus({
      tenantId,
      smallTreeId,
      nextStatus,
      actorId,
    });

    return res.status(200).json({ ok: true, data });
  } catch (err) {
    return sendError(res, err);
  }
}

async function mergeSmallTreeHandler(req, res) {
  try {
    const body = req.body || {};
    const tenantId = body.tenant_id || body.tenantId || req.tenantId || req.user?.tenant_id;
    const smallTreeId = req.params.id;
    const targetAnchorMemberId = body.target_anchor_member_id || body.targetAnchorMemberId || null;
    const memberAssertions = Array.isArray(body.member_assertions || body.memberAssertions)
      ? (body.member_assertions || body.memberAssertions)
      : [];
    const duplicateMappings = Array.isArray(body.duplicate_mappings || body.duplicateMappings)
      ? (body.duplicate_mappings || body.duplicateMappings)
      : [];
    const actorId = req.user?.id || body.actor_id || null;
    const correlationId = body.correlation_id || req.headers?.['x-correlation-id'] || null;

    const data = await mergeSmallTree({
      tenantId,
      smallTreeId,
      targetAnchorMemberId,
      memberAssertions,
      duplicateMappings,
      actorId,
      actorType: 'USER',
      correlationId,
    });

    return res.status(200).json({ ok: true, data });
  } catch (err) {
    return sendError(res, err);
  }
}

async function listPendingMergeSmallTreesHandler(req, res) {
  try {
    const tenantId = req.query?.tenant_id || req.query?.tenantId || req.tenantId || req.user?.tenant_id;
    const ownerUserId = req.query?.owner_user_id || req.query?.ownerUserId || null;

    const data = await listSmallTrees({ tenantId, status: 'CHO_GHEP', ownerUserId });
    return res.status(200).json({ ok: true, data });
  } catch (err) {
    return sendError(res, err);
  }
}

module.exports = {
  createSmallTreeHandler,
  listSmallTreesHandler,
  getSmallTreeHandler,
  updateSmallTreeStatusHandler,
  mergeSmallTreeHandler,
  listPendingMergeSmallTreesHandler,
};
