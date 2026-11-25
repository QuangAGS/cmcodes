/**
 * PATH       : backend/src/modules/genealogy/topology.guard.js
 * DATETIME   : 2026-11-25T13:32:00+07:00
 * VERSION    : 1.3.0-MULTI-OCCURRENCE-HARDENED
 * DESCRIPTION:
 * - Giữ pg_advisory_xact_lock (transaction-scoped, 3s timeout, fail-closed).
 * - Kiểm tra chu trình nội bộ trong bộ nhớ (assertNoInternalCycle) và fail-closed (assertNoCycle).
 * - Mở rộng wouldCreateCycleInDb để quét mọi cạnh review_status = 'ACCEPTED' (bỏ lọc
 *   is_selected_for_lineage = true) nhằm bao phủ Multiple Occurrences và tránh bỏ sót chu trình.
 * CHANGE LOGS:
 *   - 1.3.0: Cập nhật logic kiểm tra chu trình để bao phủ Multiple Occurrences.
 */

'use strict';

// 32-bit signed integer namespace cố định cho FTDI Topology Lock: ASCII 'FTDI' = 0x46544449
const TOPOLOGY_LOCK_NAMESPACE = 0x46544449;

/**
 * Lấy advisory lock theo tenant (transaction-scoped).
 * Bắt buộc gọi bên trong transaction. Timeout 3s → fail-closed.
 */
async function acquireTopologyLock(tx, tenantId) {
  if (!tenantId) {
    const err = new Error('Thiếu tenantId khi lấy topology lock.');
    err.code = 'TOPOLOGY_LOCK_MISSING_TENANT';
    err.statusCode = 500;
    throw err;
  }

  await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '3s'`);

  try {
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(${TOPOLOGY_LOCK_NAMESPACE}::integer, hashtext(${tenantId}::text)::integer)
    `;
  } catch (err) {
    const timeout = /lock timeout/i.test(String(err.message || err));
    const e = new Error(
      timeout
        ? 'Hệ thống đang xử lý thay đổi phả hệ khác cho dòng họ này. Vui lòng thử lại sau vài giây.'
        : 'Không thể lấy khóa bảo vệ cấu trúc cây.'
    );
    e.code = timeout ? 'TOPOLOGY_LOCK_TIMEOUT' : 'TOPOLOGY_LOCK_FAILED';
    e.statusCode = timeout ? 409 : 500;
    e.cause = err;
    throw e;
  }
}

/**
 * Kiểm tra chu trình cục bộ trong bộ nhớ tạm pendingEdges (In-Memory DFS).
 */
function assertNoInternalCycle(edges = []) {
  const adj = new Map();

  for (const { parentId, childId } of edges) {
    if (!parentId || !childId) continue;
    if (parentId === childId) {
      const err = new Error(`Phát hiện quan hệ tự trỏ chính mình: thành viên [${childId}].`);
      err.code = 'TOPOLOGY_CYCLE_DETECTED';
      err.statusCode = 422;
      throw err;
    }
    if (!adj.has(parentId)) adj.set(parentId, []);
    adj.get(parentId).push(childId);
  }

  const visited = new Map();

  function dfs(node) {
    visited.set(node, 1);
    const neighbors = adj.get(node) || [];
    for (const next of neighbors) {
      if (visited.get(next) === 1) return true;
      if (!visited.get(next) && dfs(next)) return true;
    }
    visited.set(node, 2);
    return false;
  }

  for (const node of adj.keys()) {
    if (!visited.get(node)) {
      if (dfs(node)) {
        const err = new Error('Phát hiện vòng lặp chu trình nội bộ trong danh sách quan hệ.');
        err.code = 'TOPOLOGY_CYCLE_DETECTED';
        err.statusCode = 422;
        throw err;
      }
    }
  }
}

/**
 * Kiểm tra xem việc thêm cạnh parent → child có tạo chu trình đối với dữ liệu DB hay không.
 * Quét toàn bộ cạnh có review_status = 'ACCEPTED' và deleted_at IS NULL (không giới hạn
 * is_selected_for_lineage = true) để bao phủ đầy đủ Multiple Occurrences.
 */
async function wouldCreateCycleInDb(tx, tenantId, parentId, childId, maxDepth = 100) {
  if (!parentId || !childId) return false;
  if (parentId === childId) return true;

  const result = await tx.$queryRaw`
    WITH RECURSIVE ancestor_path AS (
      SELECT 
        p.parent_id,
        p.child_id,
        1 AS depth,
        ARRAY[p.child_id::text, p.parent_id::text] AS path
      FROM parentages p
      WHERE p.tenant_id = ${tenantId}
        AND p.child_id = ${parentId}
        AND p.review_status = 'ACCEPTED'
        AND p.deleted_at IS NULL

      UNION ALL

      SELECT 
        next_p.parent_id,
        next_p.child_id,
        ap.depth + 1,
        ap.path || next_p.parent_id::text
      FROM parentages next_p
      INNER JOIN ancestor_path ap ON next_p.child_id = ap.parent_id
      WHERE next_p.tenant_id = ${tenantId}
        AND next_p.review_status = 'ACCEPTED'
        AND next_p.deleted_at IS NULL
        AND ap.depth < ${maxDepth}
        AND NOT (next_p.parent_id::text = ANY(ap.path))
    )
    SELECT 1 AS hit
    FROM ancestor_path
    WHERE parent_id = ${childId}
    LIMIT 1
  `;

  return Array.isArray(result) && result.length > 0;
}

/**
 * Kiểm tra chu trình kết hợp (fail-closed):
 * - Luôn kiểm tra tự trỏ chính mình và chu trình trong pendingEdges (bao gồm cả cạnh hiện tại).
 * - Kiểm tra chu trình đối với mọi cạnh ACCEPTED trong DB (bao phủ Multiple Occurrences).
 */
async function assertNoCycle(tx, { tenantId, parentId, childId, pendingEdges = [], isNewChild = false }) {
  if (!parentId || !childId) return;

  if (parentId === childId) {
    const err = new Error(`Không thể thiết lập quan hệ tự trỏ chính mình: [${childId}].`);
    err.code = 'TOPOLOGY_CYCLE_DETECTED';
    err.statusCode = 422;
    throw err;
  }

  const combinedEdges = [...pendingEdges, { parentId, childId }];
  assertNoInternalCycle(combinedEdges);

  const cycleInDb = await wouldCreateCycleInDb(tx, tenantId, parentId, childId);
  if (cycleInDb) {
    const err = new Error(
      `Phát hiện chu trình phả hệ: Quan hệ [${parentId} -> ${childId}] mâu thuẫn với các đời đã ghi sổ trong cơ sở dữ liệu.`
    );
    err.code = 'TOPOLOGY_CYCLE_DETECTED';
    err.statusCode = 422;
    err.details = { parentId, childId, tenantId, isNewChild: Boolean(isNewChild) };
    throw err;
  }
}

module.exports = {
  TOPOLOGY_LOCK_NAMESPACE,
  acquireTopologyLock,
  assertNoInternalCycle,
  wouldCreateCycleInDb,
  assertNoCycle,
};
