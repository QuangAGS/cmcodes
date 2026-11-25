/**
 * PATH       : src/tests/mfo-er/wp06-verification.test.js
 * DATETIME   : 2026-11-25T19:25:00+07:00
 * VERSION    : 1.0.1-WP06-VERIFY
 * DESCRIPTION:
 * - Bộ kiểm chứng WP-06 cho tầng controller/middleware/router:
 *   1) isAdminAuthorized hỗ trợ cả roleInTenant và role/tenantRole.
 *   2) wizardSummaryHandler chặn non-admin (422) và chặn self-merge (422).
 *   3) canonicalMemberRedirectMiddleware đồng bộ activeTenantId/tenantId từ req.user.
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  isAdminAuthorized,
  wizardSummaryHandler,
} = require('../../modules/genealogy/entity-resolution.controller.js');
const {
  canonicalMemberRedirectMiddleware,
} = require('../../middlewares/canonical-member-redirect.middleware.js');

describe('WP-06 Verification Suite', () => {
  it('isAdminAuthorized supports roleInTenant and rejects regular USER', () => {
    assert.equal(
      isAdminAuthorized({ user: { role: 'USER', roleInTenant: 'CLAN_ADMIN' } }, 't-1'),
      true
    );
    assert.equal(
      isAdminAuthorized({ user: { role: 'USER', roleInTenant: 'USER' } }, 't-1'),
      false
    );
  });

  it('wizardSummaryHandler blocks non-admin and self-merge with 422', async () => {
    let status1 = null;
    let body1 = null;
    await wizardSummaryHandler(
      {
        user: { id: 'u-1', role: 'USER', roleInTenant: 'USER' },
        query: { tenant_id: 't-1', source_member_id: 'm-1', target_member_id: 'm-2' },
      },
      {
        status(code) {
          status1 = code;
          return {
            json(payload) {
              body1 = payload;
              return payload;
            },
          };
        },
      }
    );
    assert.equal(status1, 422);
    assert.equal(body1.ok, false);
    assert.equal(body1.code, 'ER_ADMIN_PERMISSION_REQUIRED');

    let status2 = null;
    let body2 = null;
    await wizardSummaryHandler(
      {
        user: { id: 'a-1', role: 'CLAN_ADMIN', roleInTenant: 'CLAN_ADMIN' },
        query: { tenant_id: 't-1', source_member_id: 'm-same', target_member_id: 'm-same' },
      },
      {
        status(code) {
          status2 = code;
          return {
            json(payload) {
              body2 = payload;
              return payload;
            },
          };
        },
      }
    );
    assert.equal(status2, 422);
    assert.equal(body2.ok, false);
    assert.equal(body2.code, 'ER_SELF_MERGE_FORBIDDEN');
  });

  it('canonicalMemberRedirectMiddleware resolves canonical member via injected db and req.user.activeTenantId', async () => {
    const mockDb = {
      members: {
        findFirst: async ({ where }) => {
          if (where.id === 'm-old' && where.tenant_id === 't-active') {
            return { id: 'm-old', merged_into_id: 'm-canonical' };
          }
          if (where.id === 'm-canonical' && where.tenant_id === 't-active') {
            return { id: 'm-canonical', merged_into_id: null };
          }
          return null;
        },
      },
    };

    const mw = canonicalMemberRedirectMiddleware({ paramNames: ['id'], db: mockDb });
    const req = {
      params: { id: 'm-old' },
      user: { activeTenantId: 't-active' },
    };
    const headers = {};
    let calledNext = false;

    await mw(
      req,
      {
        setHeader(k, v) {
          headers[k] = v;
        },
        status(code) {
          return {
            json(payload) {
              throw new Error(`Unexpected status ${code}: ${JSON.stringify(payload)}`);
            },
          };
        },
      },
      () => {
        calledNext = true;
      }
    );

    assert.equal(calledNext, true);
    assert.equal(req.originalMemberId, 'm-old');
    assert.equal(req.params.id, 'm-canonical');
    assert.equal(headers['X-Canonical-Member-Id'], 'm-canonical');
    assert.equal(headers['X-Merge-Redirect-Depth'], '1');
  });
});