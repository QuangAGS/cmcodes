/**
 * PATH       : src/middlewares/canonical-member-redirect.middleware.js
 * DATETIME   : 2026-11-25T19:20:00+07:00
 * VERSION    : 1.2.0-WP06
 * DESCRIPTION:
 * - Middleware phân giải memberId đệ quy qua merged_into_id (tối đa 10 cấp) cho các request đọc/chiếu
 *   thành viên đã bị gộp, gắn thông tin chuỗi redirect vào req.canonicalMember.
 * - Hỗ trợ inject db qua options.db (mặc định dùng prisma SSOT) và đồng bộ activeTenantId/tenantId từ req.user.
 * CHANGE LOGS:
 * - [CHANGE-LOG-2026-02 V1.0] Lát 2/7:
 *   + Thêm middleware phân giải memberId đệ quy qua merged_into_id.
 */

'use strict';

const { prisma } = require('../lib/prisma.js');
const {
  MAX_REDIRECT_DEPTH,
  resolveCanonicalMemberId,
} = require('../modules/genealogy/entity-resolution.service.js');

function canonicalMemberRedirectMiddleware(options = {}) {
  const maxDepth = options.maxDepth || MAX_REDIRECT_DEPTH;
  const paramNames = options.paramNames || ['memberId', 'id'];
  const dbClient = options.db || prisma;

  return async function resolveMemberRedirect(req, res, next) {
    try {
      const tenantId =
        req.tenantId ||
        req.query?.tenant_id ||
        req.query?.tenantId ||
        req.body?.tenant_id ||
        req.body?.tenantId ||
        req.user?.activeTenantId ||
        req.user?.tenantId ||
        req.user?.tenant_id ||
        null;

      let rawMemberId = null;
      let matchedKey = null;

      for (const name of paramNames) {
        if (req.params && req.params[name]) {
          rawMemberId = req.params[name];
          matchedKey = name;
          break;
        }
      }

      if (!rawMemberId) {
        return next();
      }

      const resolved = await resolveCanonicalMemberId(dbClient, {
        tenantId,
        memberId: rawMemberId,
        maxDepth,
      });

      if (resolved.memberId && resolved.memberId !== rawMemberId) {
        req.originalMemberId = rawMemberId;
        req.params[matchedKey] = resolved.memberId;
        req.canonicalMember = resolved;
        if (typeof res?.setHeader === 'function') {
          res.setHeader('X-Canonical-Member-Id', resolved.memberId);
          res.setHeader('X-Merge-Redirect-Depth', String(resolved.depth));
        }
      }

      return next();
    } catch (err) {
      const status = Number(err?.statusCode || 500);
      if (typeof res?.status === 'function') {
        return res.status(status).json({
          ok: false,
          code: err?.code || 'ENTITY_REDIRECT_ERROR',
          message: err?.message || 'Lỗi phân giải thực thể đã gộp.',
          details: err?.details || null,
        });
      }
      return next(err);
    }
  };
}

module.exports = {
  canonicalMemberRedirectMiddleware,
};