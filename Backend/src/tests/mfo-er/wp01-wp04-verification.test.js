/**
 * PATH       : src/tests/mfo-er/wp01-wp04-verification.test.js
 * DATETIME   : 2026-11-25T16:50:00+07:00
 * VERSION    : 1.0.3-WP01-WP04-VERIFY-MOCK-FIX
 * DESCRIPTION:
 * - Bộ kiểm chứng tích hợp (sử dụng node:test & node:assert/strict) cho WP-01 ... WP-04
 *   đặt tại ./src/tests/mfo-er/wp01-wp04-verification.test.js.
 * - Bổ sung tx.$executeRawUnsafe và khớp kết quả [{ hit: 1 }] cho wouldCreateCycleInDb
 *   trong topology.guard.js.
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  acquireTopologyLock,
  assertNoInternalCycle,
  assertNoCycle,
} = require('../../modules/genealogy/topology.guard.js');
const {
  syncMemberParentages,
} = require('../../modules/genealogy/parentage.mapper.js');
const {
  runGenerationRecomputation,
} = require('../../modules/genealogy/generation-recompute.worker.js');
const {
  resolveCanonicalMemberId,
  resolveDuplicateEntity,
  CONFLICT_CIT_PREFIX,
} = require('../../modules/genealogy/entity-resolution.service.js');
const {
  executeMergeHandler,
} = require('../../modules/genealogy/entity-resolution.controller.js');
const {
  createSmallTree,
  updateSmallTreeStatus,
  mergeSmallTree,
} = require('../../modules/small-trees/small-trees.service.js');
const {
  canonicalMemberRedirectMiddleware,
} = require('../../middlewares/canonical-member-redirect.middleware.js');

function createInMemoryDb(seed = {}) {
  const state = {
    members: (seed.members || []).map((r) => ({ ...r })),
    parentages: (seed.parentages || []).map((r) => ({ ...r })),
    marriages: (seed.marriages || []).map((r) => ({ ...r })),
    sources: (seed.sources || []).map((r) => ({ ...r })),
    member_generation_assertions: (seed.member_generation_assertions || []).map((r) => ({ ...r })),
    small_trees: (seed.small_trees || []).map((r) => ({ ...r })),
    users: (seed.users || []).map((r) => ({ ...r })),
    user_member_links: (seed.user_member_links || []).map((r) => ({ ...r })),
    audit_logs: (seed.audit_logs || []).map((r) => ({ ...r })),
    business_process_logs: (seed.business_process_logs || []).map((r) => ({ ...r })),
    locks: [],
    rawSqlCalls: [],
  };

  let idSeq = 1;
  const nextId = (prefix) => `${prefix}-${idSeq++}`;

  function buildClient(targetState) {
    const client = {
      _state: targetState,
      $executeRawUnsafe: async (sql) => {
        targetState.rawSqlCalls.push({ sql: String(sql), values: [] });
        return 0;
      },
      $executeRaw: async (strings, ...values) => {
        const sqlText = Array.isArray(strings) ? strings.join('?') : String(strings);
        targetState.rawSqlCalls.push({ sql: sqlText, values });
        if (sqlText.includes('pg_advisory_xact_lock')) {
          targetState.locks.push({ tenantId: values[1] ?? values[0], at: Date.now() });
        }
        return 1;
      },
      $queryRaw: async (strings, ...values) => {
        const sqlText = Array.isArray(strings) ? strings.join('?') : String(strings);
        targetState.rawSqlCalls.push({ sql: sqlText, values });

        if (sqlText.includes('pg_advisory_xact_lock')) {
          targetState.locks.push({ tenantId: values[0], at: Date.now() });
          return [{ ok: 1 }];
        }

        // wouldCreateCycleInDb values order: [tenantId, parentId, tenantId, maxDepth, childId]
        if (sqlText.includes('WITH RECURSIVE')) {
          const tenantId = values[0];
          const startParentId = values[1];
          const targetChildId = values[values.length - 1];
          const adj = new Map();
          for (const p of targetState.parentages) {
            if (p.tenant_id !== tenantId || p.deleted_at || p.review_status !== 'ACCEPTED') continue;
            if (!adj.has(p.parent_id)) adj.set(p.parent_id, new Set());
            adj.get(p.parent_id).add(p.child_id);
          }
          // Check if targetChildId can reach startParentId via child->parent edges
          // i.e. startParentId is an ancestor of targetChildId, or targetChildId is in ancestor chain of startParentId
          const revAdj = new Map();
          for (const p of targetState.parentages) {
            if (p.tenant_id !== tenantId || p.deleted_at || p.review_status !== 'ACCEPTED') continue;
            if (!revAdj.has(p.child_id)) revAdj.set(p.child_id, new Set());
            revAdj.get(p.child_id).add(p.parent_id);
          }
          const queue = [startParentId];
          const visited = new Set([startParentId]);
          let hit = false;
          while (queue.length > 0) {
            const cur = queue.shift();
            if (cur === targetChildId) {
              hit = true;
              break;
            }
            for (const anc of revAdj.get(cur) || []) {
              if (!visited.has(anc)) {
                visited.add(anc);
                queue.push(anc);
              }
            }
          }
          return hit ? [{ hit: 1 }] : [];
        }

        return [];
      },
      members: {
        findFirst: async ({ where, select } = {}) => {
          const hit = targetState.members.find((m) => {
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
        findMany: async ({ where, select } = {}) => {
          const rows = targetState.members.filter((m) => {
            if (where?.tenant_id && m.tenant_id !== where.tenant_id) return false;
            if (where?.id?.in && !where.id.in.includes(m.id)) return false;
            if (where?.father_id && m.father_id !== where.father_id) return false;
            if (where?.mother_id && m.mother_id !== where.mother_id) return false;
            if (where?.deleted_at === null && m.deleted_at !== null) return false;
            return true;
          });
          return rows.map((hit) => {
            if (!select) return { ...hit };
            const out = {};
            for (const k of Object.keys(select)) if (select[k]) out[k] = hit[k];
            return out;
          });
        },
        create: async ({ data }) => {
          const row = {
            id: data.id || nextId('mem'),
            merged_into_id: null,
            deleted_at: null,
            ...data,
          };
          targetState.members.push(row);
          return { ...row };
        },
        update: async ({ where, data }) => {
          const idx = targetState.members.findIndex((m) => m.id === where.id);
          if (idx === -1) throw new Error(`Member not found: ${where.id}`);
          targetState.members[idx] = { ...targetState.members[idx], ...data };
          return { ...targetState.members[idx] };
        },
        updateMany: async ({ where, data }) => {
          let count = 0;
          targetState.members = targetState.members.map((m) => {
            if (where?.tenant_id && m.tenant_id !== where.tenant_id) return m;
            if (where?.father_id && m.father_id !== where.father_id) return m;
            if (where?.mother_id && m.mother_id !== where.mother_id) return m;
            if (where?.deleted_at === null && m.deleted_at !== null) return m;
            count += 1;
            return { ...m, ...data };
          });
          return { count };
        },
      },
      parentages: {
        findFirst: async ({ where, select } = {}) => {
          const hit = targetState.parentages.find((p) => {
            if (where?.tenant_id && p.tenant_id !== where.tenant_id) return false;
            if (where?.parent_id && p.parent_id !== where.parent_id) return false;
            if (where?.child_id && p.child_id !== where.child_id) return false;
            if (where?.relationship_type && p.relationship_type !== where.relationship_type) return false;
            if (where?.review_status && p.review_status !== where.review_status) return false;
            if (where?.deleted_at === null && p.deleted_at !== null) return false;
            return true;
          });
          if (!hit) return null;
          if (!select) return { ...hit };
          const out = {};
          for (const k of Object.keys(select)) if (select[k]) out[k] = hit[k];
          return out;
        },
        findMany: async ({ where, select } = {}) => {
          const rows = targetState.parentages.filter((p) => {
            if (where?.tenant_id && p.tenant_id !== where.tenant_id) return false;
            if (where?.parent_id && p.parent_id !== where.parent_id) return false;
            if (where?.child_id && p.child_id !== where.child_id) return false;
            if (where?.review_status && p.review_status !== where.review_status) return false;
            if (typeof where?.is_selected_for_lineage === 'boolean' && p.is_selected_for_lineage !== where.is_selected_for_lineage) {
              return false;
            }
            if (where?.deleted_at === null && p.deleted_at !== null) return false;
            return true;
          });
          return rows.map((hit) => {
            if (!select) return { ...hit };
            const out = {};
            for (const k of Object.keys(select)) if (select[k]) out[k] = hit[k];
            return out;
          });
        },
        create: async ({ data }) => {
          const row = {
            id: data.id || nextId('par'),
            deleted_at: null,
            metadata: {},
            ...data,
          };
          targetState.parentages.push(row);
          return { ...row };
        },
        update: async ({ where, data }) => {
          const idx = targetState.parentages.findIndex((p) => p.id === where.id);
          if (idx === -1) throw new Error(`Parentage not found: ${where.id}`);
          targetState.parentages[idx] = { ...targetState.parentages[idx], ...data };
          return { ...targetState.parentages[idx] };
        },
        updateMany: async ({ where, data }) => {
          let count = 0;
          targetState.parentages = targetState.parentages.map((p) => {
            if (where?.id?.in && !where.id.in.includes(p.id)) return p;
            count += 1;
            return { ...p, ...data };
          });
          return { count };
        },
      },
      marriages: {
        updateMany: async ({ where, data }) => {
          let count = 0;
          targetState.marriages = targetState.marriages.map((m) => {
            if (where?.tenant_id && m.tenant_id !== where.tenant_id) return m;
            if (where?.husband_id && m.husband_id !== where.husband_id) return m;
            if (where?.wife_id && m.wife_id !== where.wife_id) return m;
            if (where?.deleted_at === null && m.deleted_at !== null) return m;
            count += 1;
            return { ...m, ...data };
          });
          return { count };
        },
      },
      sources: {
        create: async ({ data }) => {
          const row = {
            id: data.id || nextId('src'),
            root_generation_offset: 0,
            ...data,
          };
          targetState.sources.push(row);
          return { ...row };
        },
      },
      member_generation_assertions: {
        findFirst: async ({ where, select } = {}) => {
          const hit = targetState.member_generation_assertions.find((a) => {
            if (where?.tenant_id && a.tenant_id !== where.tenant_id) return false;
            if (where?.member_id && a.member_id !== where.member_id) return false;
            if (where?.source_id && a.source_id !== where.source_id) return false;
            if (where?.citation_id && a.citation_id !== where.citation_id) return false;
            if (where?.deleted_at === null && a.deleted_at !== null) return false;
            return true;
          });
          if (!hit) return null;
          if (!select) return { ...hit };
          const out = {};
          for (const k of Object.keys(select)) if (select[k]) out[k] = hit[k];
          return out;
        },
        findMany: async ({ where, include } = {}) => {
          const rows = targetState.member_generation_assertions.filter((a) => {
            if (where?.tenant_id && a.tenant_id !== where.tenant_id) return false;
            if (where?.member_id && typeof where.member_id === 'string' && a.member_id !== where.member_id) return false;
            if (where?.member_id?.in && !where.member_id.in.includes(a.member_id)) return false;
            if (where?.deleted_at === null && a.deleted_at !== null) return false;
            return true;
          });
          return rows.map((a) => {
            const copy = { ...a };
            if (include?.sources) {
              copy.sources = targetState.sources.find((s) => s.id === a.source_id) || null;
            }
            return copy;
          });
        },
        count: async ({ where } = {}) => {
          return targetState.member_generation_assertions.filter((a) => {
            if (where?.tenant_id && a.tenant_id !== where.tenant_id) return false;
            if (where?.member_id && a.member_id !== where.member_id) return false;
            if (where?.deleted_at === null && a.deleted_at !== null) return false;
            return true;
          }).length;
        },
        create: async ({ data }) => {
          const dup = targetState.member_generation_assertions.find(
            (a) =>
              a.tenant_id === data.tenant_id &&
              a.member_id === data.member_id &&
              a.source_id === data.source_id &&
              a.citation_id === data.citation_id
          );
          if (dup) {
            const err = new Error('Unique constraint failed on uq_mga_tenant_member_source_citation');
            err.code = 'P2002';
            throw err;
          }
          const row = {
            id: data.id || nextId('mga'),
            deleted_at: null,
            status: 'ACTIVE',
            ...data,
          };
          targetState.member_generation_assertions.push(row);
          return { ...row };
        },
        update: async ({ where, data }) => {
          const idx = targetState.member_generation_assertions.findIndex((a) => a.id === where.id);
          if (idx === -1) throw new Error(`Assertion not found: ${where.id}`);
          const next = { ...targetState.member_generation_assertions[idx], ...data };
          const dup = targetState.member_generation_assertions.find(
            (a, i) =>
              i !== idx &&
              a.tenant_id === next.tenant_id &&
              a.member_id === next.member_id &&
              a.source_id === next.source_id &&
              a.citation_id === next.citation_id
          );
          if (dup) {
            const err = new Error('Unique constraint failed on uq_mga_tenant_member_source_citation');
            err.code = 'P2002';
            throw err;
          }
          targetState.member_generation_assertions[idx] = next;
          return { ...next };
        },
      },
      small_trees: {
        findFirst: async ({ where } = {}) => {
          const hit = targetState.small_trees.find((t) => {
            if (where?.id && t.id !== where.id) return false;
            if (where?.tenant_id && t.tenant_id !== where.tenant_id) return false;
            if (where?.deleted_at === null && t.deleted_at !== null) return false;
            return true;
          });
          return hit ? { ...hit } : null;
        },
        findMany: async ({ where } = {}) => {
          return targetState.small_trees
            .filter((t) => {
              if (where?.tenant_id && t.tenant_id !== where.tenant_id) return false;
              if (where?.deleted_at === null && t.deleted_at !== null) return false;
              if (where?.status && t.status !== where.status) return false;
              return true;
            })
            .map((t) => ({ ...t }));
        },
        create: async ({ data }) => {
          const row = {
            id: data.id || nextId('st'),
            deleted_at: null,
            created_at: new Date(),
            ...data,
          };
          targetState.small_trees.push(row);
          return { ...row };
        },
        update: async ({ where, data }) => {
          const idx = targetState.small_trees.findIndex((t) => t.id === where.id);
          if (idx === -1) throw new Error(`SmallTree not found: ${where.id}`);
          targetState.small_trees[idx] = { ...targetState.small_trees[idx], ...data };
          return { ...targetState.small_trees[idx] };
        },
      },
      users: {
        findMany: async () => [],
        findUnique: async () => null,
      },
      user_member_links: {
        findFirst: async () => null,
        findMany: async () => [],
      },
      audit_logs: {
        createMany: async ({ data }) => {
          targetState.audit_logs.push(...data);
          return { count: data.length };
        },
      },
      business_process_logs: {
        create: async ({ data }) => {
          targetState.business_process_logs.push({ ...data });
          return { ...data };
        },
      },
      $transaction: async (fn) => {
        const snapshot = JSON.parse(JSON.stringify(targetState));
        const txClient = buildClient(targetState);
        try {
          return await fn(txClient);
        } catch (err) {
          Object.assign(targetState, snapshot);
          throw err;
        }
      },
    };
    return client;
  }

  return { state, db: buildClient(state) };
}

describe('WP-01 ... WP-04 Verification Suite', () => {
  it('WP-01 & WP-02: Topology lock, cycle fail-closed, SUPERSEDED safe dual-write & branch-isolated recompute without touching assertions', async () => {
    const tenantId = 'tenant-1';
    const { state, db } = createInMemoryDb({
      members: [
        { id: 'm-root', tenant_id: tenantId, generation: 1, deleted_at: null },
        { id: 'm-child-a', tenant_id: tenantId, generation: 2, deleted_at: null },
        { id: 'm-grand-a', tenant_id: tenantId, generation: 3, deleted_at: null },
        { id: 'm-other-branch', tenant_id: tenantId, generation: 5, deleted_at: null },
      ],
      parentages: [
        {
          id: 'p-1',
          tenant_id: tenantId,
          parent_id: 'm-root',
          child_id: 'm-child-a',
          relationship_type: 'BIOLOGICAL',
          review_status: 'ACCEPTED',
          is_selected_for_lineage: true,
          deleted_at: null,
          metadata: { relative_level: 1 },
        },
        {
          id: 'p-2',
          tenant_id: tenantId,
          parent_id: 'm-child-a',
          child_id: 'm-grand-a',
          relationship_type: 'BIOLOGICAL',
          review_status: 'ACCEPTED',
          is_selected_for_lineage: true,
          deleted_at: null,
          metadata: { relative_level: 2 },
        },
        {
          id: 'p-other',
          tenant_id: tenantId,
          parent_id: 'm-other-branch',
          child_id: 'm-other-branch',
          relationship_type: 'BIOLOGICAL',
          review_status: 'ACCEPTED',
          is_selected_for_lineage: true,
          deleted_at: null,
          metadata: { relative_level: 1 },
        },
      ],
      sources: [
        { id: 'src-1', tenant_id: tenantId, title: 'Legacy Book', source_type: 'GENEALOGY_BOOK', root_generation_offset: 0 },
      ],
      member_generation_assertions: [
        {
          id: 'a-1',
          tenant_id: tenantId,
          member_id: 'm-grand-a',
          source_id: 'src-1',
          citation_id: 'SYS_CIT::DEFAULT',
          claimed_generation: 3,
          status: 'ACTIVE',
          deleted_at: null,
        },
      ],
    });

    await db.$transaction(async (tx) => {
      await acquireTopologyLock(tx, tenantId);
      assert.throws(() => assertNoInternalCycle([{ parentId: 'a', childId: 'b' }, { parentId: 'b', childId: 'a' }]));
      await assert.rejects(() =>
        assertNoCycle(tx, {
          tenantId,
          parentId: 'm-grand-a',
          childId: 'm-root',
          isNewChild: false,
        })
      );

      await syncMemberParentages(tx, {
        tenantId,
        childId: 'm-grand-a',
        fatherId: 'm-root',
        childType: 'CON_DE',
        actorId: 'actor-1',
        isNewChild: false,
      });
    });

    assert.equal(state.locks.length >= 1, true);
    const oldEdge = state.parentages.find((p) => p.id === 'p-2');
    assert.equal(oldEdge.review_status, 'SUPERSEDED');

    const recomputeRes = await runGenerationRecomputation({
      tenantId,
      anchorEdges: [{ parentId: 'm-root', childId: 'm-grand-a', baseGeneration: 1 }],
      actorId: 'actor-1',
      dbClient: db,
    });
    assert.equal(recomputeRes.ok, true);
    const grandAfter = state.members.find((m) => m.id === 'm-grand-a');
    assert.equal(grandAfter.generation, 2);
    const otherAfter = state.members.find((m) => m.id === 'm-other-branch');
    assert.equal(otherAfter.generation, 5);
    const assertionAfter = state.member_generation_assertions.find((a) => a.id === 'a-1');
    assert.equal(assertionAfter.claimed_generation, 3);
    assert.equal(assertionAfter.status, 'ACTIVE');
    assert.equal(state.business_process_logs.some((l) => l.process_type === 'GENERATION_RECOMPUTE'), true);
  });

  it('WP-03: Self-merge blocked (422), recursive redirect max 10 levels, conflict citation & soft warning offset', async () => {
    const tenantId = 'tenant-er';
    const { state, db } = createInMemoryDb({
      members: [
        { id: 'm-src', tenant_id: tenantId, full_name: 'Nguyen A', gender: 'NAM', generation: 2, merged_into_id: null, deleted_at: null },
        { id: 'm-tgt', tenant_id: tenantId, full_name: 'Nguyen A', gender: 'NAM', generation: 2, merged_into_id: null, deleted_at: null },
      ],
      sources: [
        { id: 'src-offset', tenant_id: tenantId, title: 'Chi phả offset', source_type: 'GENEALOGY_BOOK', root_generation_offset: 2 },
      ],
      member_generation_assertions: [
        {
          id: 'a-src-conflict',
          tenant_id: tenantId,
          member_id: 'm-src',
          source_id: 'src-offset',
          citation_id: 'CIT-1',
          claimed_generation: 3,
          status: 'ACTIVE',
          deleted_at: null,
          note: null,
        },
        {
          id: 'a-tgt-existing',
          tenant_id: tenantId,
          member_id: 'm-tgt',
          source_id: 'src-offset',
          citation_id: 'CIT-1',
          claimed_generation: 2,
          status: 'ACTIVE',
          deleted_at: null,
          note: null,
        },
      ],
    });

    await assert.rejects(
      () =>
        resolveDuplicateEntity({
          tenantId,
          sourceMemberId: 'm-src',
          targetMemberId: 'm-src',
          actorId: 'admin-1',
          dbClient: db,
        }),
      (err) => err.statusCode === 422 && err.code === 'ER_SELF_MERGE_FORBIDDEN'
    );

    let statusCodeSent = null;
    let bodySent = null;
    const mockRes = {
      status(code) {
        statusCodeSent = code;
        return {
          json(payload) {
            bodySent = payload;
            return payload;
          },
        };
      },
    };
    await executeMergeHandler(
      {
        user: { id: 'u-1', role: 'USER' },
        body: { tenant_id: tenantId, source_member_id: 'm-src', target_member_id: 'm-tgt' },
      },
      mockRes
    );
    assert.equal(statusCodeSent, 422);
    assert.equal(bodySent.ok, false);

    const res = await resolveDuplicateEntity({
      tenantId,
      sourceMemberId: 'm-src',
      targetMemberId: 'm-tgt',
      actorId: 'admin-1',
      actorType: 'USER',
      dbClient: db,
    });

    assert.equal(res.ok, true);
    assert.equal(res.conflict_count, 1);
    assert.equal(state.members.find((m) => m.id === 'm-src').merged_into_id, 'm-tgt');

    const tgtAssertion = state.member_generation_assertions.find((a) => a.id === 'a-tgt-existing');
    assert.equal(tgtAssertion.claimed_generation, 2);
    assert.equal(tgtAssertion.status, 'ACTIVE');

    const conflictAssertion = state.member_generation_assertions.find(
      (a) => a.citation_id === `${CONFLICT_CIT_PREFIX}a-src-conflict`
    );
    assert.ok(conflictAssertion);
    assert.equal(conflictAssertion.status, 'ACTIVE');
    assert.notEqual(conflictAssertion.status, 'DISPUTED');

    assert.equal(res.soft_warning.has_soft_warning, true);
    assert.equal(state.members.find((m) => m.id === 'm-tgt').generation, 2);

    const bpl = state.business_process_logs.find((l) => l.process_type === 'ENTITY_RESOLUTION_MERGE');
    assert.ok(bpl);
    assert.equal(bpl.metadata.conflict_count, 1);
    assert.equal(bpl.metadata.preserved_assertions, true);

    state.members = [];
    for (let i = 0; i <= 12; i += 1) {
      state.members.push({
        id: `chain-${i}`,
        tenant_id: tenantId,
        merged_into_id: i < 12 ? `chain-${i + 1}` : null,
      });
    }
    const chainRes = await resolveCanonicalMemberId(db, { tenantId, memberId: 'chain-0', maxDepth: 10 });
    assert.equal(chainRes.depth, 10);
    assert.equal(chainRes.memberId, 'chain-10');
    assert.equal(chainRes.truncated, true);

    // Middleware hardcodes real prisma client; full redirect path requires module mock or integration DB.
    // Early-return path (no matching param) is unit-testable and must call next().
    const mw = canonicalMemberRedirectMiddleware({ paramNames: ['id'] });
    const reqNoParam = { params: {}, query: { tenant_id: tenantId } };
    let nextCalled = false;
    await mw(
      reqNoParam,
      {
        status() { return { json() {} }; },
        setHeader() {},
      },
      () => { nextCalled = true; }
    );
    assert.equal(nextCalled, true);
    // Recursive redirect logic itself is already asserted via resolveCanonicalMemberId above.
  });

  it('WP-04: Small trees CRUD, CHO_GHEP -> DA_GHEP / HUY, USER_CONTRIBUTION source, citation_id = small_tree_id & ER reuse', async () => {
    const tenantId = 'tenant-st';
    const { state, db } = createInMemoryDb({
      members: [
        { id: 'm-root-st', tenant_id: tenantId, full_name: 'Tran Root', gender: 'NAM', generation: 3, merged_into_id: null, deleted_at: null },
        { id: 'm-anchor', tenant_id: tenantId, full_name: 'Tran Anchor', gender: 'NAM', generation: 2, merged_into_id: null, deleted_at: null },
        { id: 'm-dup-src', tenant_id: tenantId, full_name: 'Tran Dup', gender: 'NAM', generation: 4, merged_into_id: null, deleted_at: null },
        { id: 'm-dup-tgt', tenant_id: tenantId, full_name: 'Tran Dup', gender: 'NAM', generation: 4, merged_into_id: null, deleted_at: null },
      ],
      sources: [
        { id: 'src-shared', tenant_id: tenantId, title: 'Shared Source', source_type: 'GENEALOGY_BOOK', root_generation_offset: 0 },
      ],
      member_generation_assertions: [
        {
          id: 'a-dup-src',
          tenant_id: tenantId,
          member_id: 'm-dup-src',
          source_id: 'src-shared',
          citation_id: 'CIT-SHARED',
          claimed_generation: 5,
          status: 'ACTIVE',
          deleted_at: null,
        },
        {
          id: 'a-dup-tgt',
          tenant_id: tenantId,
          member_id: 'm-dup-tgt',
          source_id: 'src-shared',
          citation_id: 'CIT-SHARED',
          claimed_generation: 4,
          status: 'ACTIVE',
          deleted_at: null,
        },
      ],
    });

    const cancelTree = await createSmallTree({
      tenantId,
      ownerUserId: 'user-1',
      rootMemberId: 'm-root-st',
      createdByMemberId: 'm-anchor',
      dbClient: db,
    });
    assert.equal(cancelTree.status, 'CHO_GHEP');
    assert.equal(cancelTree.created_by_member_id, 'm-anchor');
    assert.equal(state.business_process_logs.some((l) => l.process_type === 'MFO_SMALL_TREE_CREATE'), true);

    const cancelled = await updateSmallTreeStatus({
      tenantId,
      smallTreeId: cancelTree.id,
      nextStatus: 'HUY',
      dbClient: db,
    });
    assert.equal(cancelled.status, 'HUY');

    const mergeTree = await createSmallTree({
      tenantId,
      ownerUserId: 'user-1',
      rootMemberId: 'm-root-st',
      createdByMemberId: 'm-anchor',
      dbClient: db,
    });

    const mergeOut = await mergeSmallTree({
      tenantId,
      smallTreeId: mergeTree.id,
      targetAnchorMemberId: 'm-anchor',
      memberAssertions: [{ member_id: 'm-root-st', claimed_generation: 3 }],
      duplicateMappings: [{ source_member_id: 'm-dup-src', target_member_id: 'm-dup-tgt' }],
      actorId: 'admin-1',
      dbClient: db,
    });

    assert.equal(mergeOut.ok, true);
    assert.equal(mergeOut.small_tree.status, 'DA_GHEP');
    assert.equal(mergeOut.source.source_type, 'USER_CONTRIBUTION');
    assert.equal(mergeOut.citation_id, mergeTree.id);

    const stAssertion = state.member_generation_assertions.find(
      (a) => a.member_id === 'm-root-st' && a.source_id === mergeOut.source.id
    );
    assert.ok(stAssertion);
    assert.equal(stAssertion.citation_id, mergeTree.id);
    assert.equal(stAssertion.status, 'ACTIVE');

    assert.equal(mergeOut.duplicate_merges.length, 1);
    assert.equal(state.members.find((m) => m.id === 'm-dup-src').merged_into_id, 'm-dup-tgt');
  });
});
