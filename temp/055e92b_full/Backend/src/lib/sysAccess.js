/**
 * PATH       : src/lib/sysAccess.js
 * DATETIME   : 2026-08-27T19:40:00+07:00
 * VERSION    : 1.0.0-S0.5
 * DESCRIPTION:
 * SYS cross-tenant access path. basePrisma ở đây là client không policy,
 * không phải quyền. Mọi caller phải pass actor SYSTEM_ADMIN + reason.
 */

'use strict';

const { basePrisma } = require('./prisma.js');

function assertSysActor(actor) {
  if (!actor || actor.role !== 'SYSTEM_ADMIN') {
    const err = new Error('SYS repository chỉ dành cho SYSTEM_ADMIN.');
    err.statusCode = 403;
    err.code = 'FORBIDDEN';
    err.isOperational = true;
    throw err;
  }
}

async function sysFindManyTenants(actor, args = {}, meta = {}) {
  assertSysActor(actor);
  return basePrisma.tenants.findMany(args);
}

async function sysFindFirstTenant(actor, args = {}, meta = {}) {
  assertSysActor(actor);
  return basePrisma.tenants.findFirst(args);
}

async function sysUpdateTenant(actor, args = {}, meta = {}) {
  assertSysActor(actor);
  return basePrisma.tenants.update(args);
}

async function sysCountTenants(actor, args = {}, meta = {}) {
  assertSysActor(actor);
  return basePrisma.tenants.count(args);
}

module.exports = {
  assertSysActor,
  sysFindManyTenants,
  sysFindFirstTenant,
  sysUpdateTenant,
  sysCountTenants,
};
