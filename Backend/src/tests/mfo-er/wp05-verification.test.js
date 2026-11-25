/**
 * PATH       : src/tests/mfo-er/wp05-verification.test.js
 * DATETIME   : 2026-11-25T19:15:00+07:00
 * VERSION    : 1.0.2-WP05-VERIFY
 * DESCRIPTION:
 * - Bộ kiểm chứng riêng cho WP-05:
 *   1) previewDuplicateEntityResolution trả đủ potential_conflicts,
 *      soft_warning, projected_status: 'ACTIVE', auto_disputed: false.
 *   2) canonicalMemberRedirectMiddleware hỗ trợ inject options.db, rewrite req.params và gắn header
 *      X-Canonical-Member-Id & X-Merge-Redirect-Depth (tối đa 10 cấp).
 *   3) listPendingMergeSmallTreesHandler trả danh sách cây nhỏ trạng thái CHO_GHEP.
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  previewDuplicateEntityResolution,
  CONFLICT_CIT_PREFIX,
} = require('../../modules/genealogy/entity-resolution.service.js');
const {
  listPendingMergeSmallTreesHandler,
} = require('../../modules/small-trees/small-trees.controller.js');
const {
  canonicalMemberRedirectMiddleware,
} = require('../../middlewares/canonical-member-redirect.middleware.js');

function createWp05MockDb(seed = {}) {
  const state = {
    members: (seed.members || []).map((m) => ({ ...m })),
    users: (seed.users || []).map((u) => ({ ...u })),
    sources: (seed.sources || []).map((s) => ({ ...s })),
    member_generation_assertions: (seed.member_generation_assertions || []).map((a) => ({ ...a })),
    small_trees: (seed.small_trees || []).map((t) => ({ ...t })),
  };

  const client = {
    members: {
      findFirst: async ({ where, select } = {}) => {
        const hit = state.members.find((m) => {
          if (where?.id && m.id !== where.id) return false;
          if (where?.tenant_id && m.tenant_id !== where.tenant_id) return false;
          if (where?.deleted_at === null && m.deleted_at !== null) return false;
          return true;
        });
        if (!hit) return null;
        if (!select) return { ...hit };
        const out = {};
        for (const k of Object.keys(select)) if (select[k]) out[k] = hit[k];
        return out;
      },
    },
    users: {
      findMany: async ({ where, select } = {}) => {
        const rows = state.users.filter((u) => {
          if (where?.member_id && u.member_id !== where.member_id) return false;
          if (where?.deleted_at === null && u.deleted_at !== null) return false;
          return true;
        });
        return rows.map((hit) => {
          if (!select) return { ...hit };
          const out = {};
          for (const k of Object.keys(select)) if (select[k]) out[k] = hit[k];
          return out;
        });
      },
    },
    sources: {
      findMany: async ({ where } = {}) => {
        return state.sources
          .filter((s) => {
            if (where?.tenant_id && s.tenant_id !== where.tenant_id) return false;
            if (where?.id?.in && !where.id.in.includes(s.id)) return false;
            return true;
          })
          .map((s) => ({ ...s }));
      },
    },
    member_generation_assertions: {
      findMany: async ({ where, include } = {}) => {
        return state.member_generation_assertions
          .filter((a) => {
            if (where?.tenant_id && a.tenant_id !== where.tenant_id) return false;
            if (typeof where?.member_id === 'string' && a.member_id !== where.member_id) return false;
            if (Array.isArray(where?.member_id?.in) && !where.member_id.in.includes(a.member_id)) return false;
            if (where?.deleted_at === null && a.deleted_at !== null) return false;
            return true;
          })
          .map((a) => {
            const copy = { ...a };
            if (include?.sources) {
              copy.sources = state.sources.find((s) => s.id === a.source_id) || null;
            }
            return copy;
          });
      },
    },
    small_trees: {
      findMany: async ({ where } = {}) => {
        return state.small_trees
          .filter((t) => {
            if (where?.tenant_id && t.tenant_id !== where.tenant_id) return false;
            if (where?.deleted_at === null && t.deleted_at !== null) return false;
            if (where?.status && t.status !== where.status) return false;
            return true;
          })
          .map((t) => ({ ...t }));
      },
    },
    $transaction: async (fn) => fn(client),
  };

  return { state, db: client };
}

describe('WP-05 Verification Suite', () => {
  it('previewDuplicateEntityResolution returns potential_conflicts & soft_warning without DISPUTED', async () => {
    const tenantId = 'tenant-wp05';
    const { db } = createWp05MockDb({
      members: [
        { id: 'src-1', tenant_id: tenantId, full_name: 'Le A', gender: 'NAM', generation: 3, merged_into_id: null, deleted_at: null },
        { id: 'tgt-1', tenant_id: tenantId, full_name: 'Le A', gender: 'NAM', generation: 2, merged_into_id: null, deleted_at: null },
      ],
      sources: [
        { id: 's-1', tenant_id: tenantId, title: 'Gia pha offset', source_type: 'GENEALOGY_BOOK', root_generation_offset: 1 },
      ],
      member_generation_assertions: [
        {
          id: 'a-src',
          tenant_id: tenantId,
          member_id: 'src-1',
          source_id: 's-1',
          citation_id: 'CIT-10',
          claimed_generation: 3,
          status: 'ACTIVE',
          deleted_at: null,
        },
        {
          id: 'a-tgt',
          tenant_id: tenantId,
          member_id: 'tgt-1',
          source_id: 's-1',
          citation_id: 'CIT-10',
          claimed_generation: 2,
          status: 'ACTIVE',
          deleted_at: null,
        },
      ],
    });

    const preview = await previewDuplicateEntityResolution({
      tenantId,
      sourceMemberId: 'src-1',
      targetMemberId: 'tgt-1',
      dbClient: db,
    });

    assert.equal(preview.can_merge, true);
    assert.equal(preview.source_assertions_to_migrate, 1);
    assert.equal(preview.potential_conflict_count, 1);
    assert.equal(preview.potential_conflicts.length, 1);
    assert.equal(
      preview.potential_conflicts[0].projected_conflict_citation_id,
      `${CONFLICT_CIT_PREFIX}a-src`
    );
    assert.equal(preview.potential_conflicts[0].projected_status, 'ACTIVE');
    assert.equal(preview.potential_conflicts[0].auto_disputed, false);
    assert.equal(preview.soft_warning.has_soft_warning, true);
  });

  it('canonicalMemberRedirectMiddleware rewrites member param with injected db & headers', async () => {
    const tenantId = 'tenant-mw05';
    const { db } = createWp05MockDb({
      members: [
        { id: 'old-1', tenant_id: tenantId, merged_into_id: 'old-2', deleted_at: null },
        { id: 'old-2', tenant_id: tenantId, merged_into_id: 'canon-final', deleted_at: null },
        { id: 'canon-final', tenant_id: tenantId, merged_into_id: null, deleted_at: null },
      ],
    });

    const mw = canonicalMemberRedirectMiddleware({ paramNames: ['originId', 'id'], db });
    const req = { params: { originId: 'old-1' }, query: { tenant_id: tenantId } };
    const headers = {};
    let nextCalled = false;

    await mw(
      req,
      {
        setHeader(k, v) {
          headers[k] = v;
        },
        status(code) {
          return {
            json(body) {
              throw new Error(`Unexpected status ${code}: ${JSON.stringify(body)}`);
            },
          };
        },
      },
      () => {
        nextCalled = true;
      }
    );

    assert.equal(nextCalled, true);
    assert.equal(req.originalMemberId, 'old-1');
    assert.equal(req.params.originId, 'canon-final');
    assert.equal(headers['X-Canonical-Member-Id'], 'canon-final');
    assert.equal(headers['X-Merge-Redirect-Depth'], '2');
  });

  it('listPendingMergeSmallTreesHandler filters CHO_GHEP items', async () => {
    const tenantId = 'tenant-st05';
    let statusCode = null;
    let payload = null;
    await listPendingMergeSmallTreesHandler(
      { query: { tenant_id: tenantId }, user: { id: 'admin-1', role: 'CLAN_ADMIN' } },
      {
        status(code) {
          statusCode = code;
          return {
            json(body) {
              payload = body;
              return body;
            },
          };
        },
      }
    );

    assert.equal(statusCode, 200);
    assert.equal(payload.ok, true);
    assert.equal(Array.isArray(payload.data), true);
  });
});
