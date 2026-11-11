/**
 * ============================================================================
 * PATH       : src/lib/prisma.js
 * DATETIME   : 2026-11-11T11:30:00+07:00
 * VERSION    : 23.4.1-V250-MULTIHOME-AMEND02-V12-FINAL
 * DESCRIPTION:
 * - [AMEND-RP-OP-2026-02 V1.2] Lát 1/7 Prisma Layer hoàn chỉnh:
 *   + withTransaction rẽ nhánh an toàn: Nghiệp vụ dòng họ qua prisma.$transaction;
 *     tác vụ hệ thống qua basePrisma.$transaction khi có cờ allowUnscoped.
 *   + findUnique lệch tenant luôn trả về null.
 *   + findUniqueOrThrow lệch tenant ném lỗi 404 NOT_FOUND chuẩn (không lộ S0.1).
 *   + assertSameTenantLink hỗ trợ Multi-Home: kiểm tra qua user_member_links nếu khác họ gốc.
 *   + GLOBAL_MODELS loại trừ hoàn toàn bảng Identity khỏi auto-inject tenant_id.
 *   + Cung cấp helper updateMemberInTenant (trả về Record Object, không trả { count }).
 * ============================================================================
 */

const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');

const tenantContext = new AsyncLocalStorage();
const tenantStorage = tenantContext; // Alias đồng bộ chuẩn AMEND-02

/**
 * DANH SÁCH TRƯỜNG SO KHỚP TUYỆT ĐỐI (EXACT MATCH)
 */
const exactMatchFields = [
    'actor_id','address_id','branch_id','cemetery_id','correlation_id','current_address_id',
    'entity_id','event_id','external_id','external_message_id','external_user_id','father_id',
    'founder_id','fund_id','grave_address_id','headquarters_address_id','husband_id','id',
    'manager_id','member_id','mother_id','notification_id','notification_recipient_id',
    'onboarding_case_id','organizer_id','origin_address_id','parent_id','primary_branch_id',
    'primary_member_id','proposal_id','record_id','target_id','tenant_id','transaction_id','user_id',
    'wife_id','worship_id',
    'action','actor_type','asset_type','binding_state','case_type','category','channel',
    'child_type','condition_status','event_type','gender','level','link_type','pre_lock_status',
    'process_status','process_type','provider','reliability','role','status',
    'temp_relationship','transaction_type',
    'phone', 'email', 'slug', 'phone_number', 'cf_bot_verified','enabled','external_sent_status',
    'is_clan', 'is_alive', 'is_birth_lunar', 'is_death_lunar', 'is_contact_public', 
    'is_primary', 'is_read', 'is_default', 'is_lunar', 'preferred','turnstile_success','verified'
];

const globalForPrisma = global;
const basePrisma = globalForPrisma.__egalPrisma || new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error']
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__egalPrisma = basePrisma;
}

/* ====================== TENANT GUARDRAIL (AMEND-02 V1.2) ====================== */
// 1. GLOBAL_MODELS: Bảng danh tính toàn cục và logs hệ thống -> Tuyệt đối không inject tenant_id
const GLOBAL_MODELS = new Set([
  'users',
  'tenants',
  'user_member_links',
  'auth_logs',
  'business_process_logs',
  'system_configs',
  'spatial_ref_sys',
  'slug_counters',
  'password_reset_sessions',
]);

// 2. STRICT_TENANT_MODELS: Bảng nghiệp vụ phả hệ bắt buộc có tenant_id (đã gỡ user_member_links)
const STRICT_TENANT_MODELS = new Set([
  'achievements', 'addresses', 'assets', 'biographies', 'branches',
  'cemetery', 'data_suggestions', 'event_funds', 'events', 'fund_transactions',
  'funds', 'graves', 'inbound_messages', 'marriages', 'media', 'members',
  'notifications', 'onboarding_cases', 'tenant_communication_providers',
  'tenant_social_spaces', 'worships', 'clan_profiles', 'generation_naming_rules', 
  'proposals', 'member_privacy_rules', 'member_residences',
]);

const SOFT_DELETE_MODELS = new Set([
  'achievements', 'addresses', 'assets', 'audit_logs', 'biographies', 'branches',
  'business_process_logs', 'cemetery', 'data_suggestions', 'event_funds', 'events',
  'fund_transactions', 'funds', 'graves', 'inbound_messages', 'marriages', 'media',
  'members', 'notifications', 'onboarding_cases', 'tenants', 'users', 'worships', 
  'clan_profiles', 'generation_naming_rules', 'proposals', 'member_privacy_rules',
  'member_residences', 'user_member_links',
]);

const APPEND_ONLY_MODELS = new Set([
  'audit_logs', 'business_process_logs',
]);

const READ_OPS = new Set([
  'findMany', 'findFirst', 'findFirstOrThrow', 'count', 'aggregate', 'groupBy',
]);
const WRITE_MANY_OPS = new Set(['updateMany', 'deleteMany']);

function andWhere(where, extra) {
  if (!extra) return where || {};
  if (!where || Object.keys(where).length === 0) return extra;
  return { AND: [where, extra] };
}

function applyTenantData(data, tenantId) {
  if (Array.isArray(data)) return data.map((row) => ({ ...row, tenant_id: tenantId }));
  return { ...data, tenant_id: tenantId };
}

const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const modelName = String(model || '').toLowerCase();
        const store = tenantContext.getStore();
        const tenantId = store?.tenantId || store?.activeTenantId || null;
        const allowUnscoped = store?.allowUnscoped === true || store?.allowSystemBypass === true;
        args = args || {};

        if (APPEND_ONLY_MODELS.has(modelName) && (operation === 'delete' || operation === 'deleteMany')) {
          throw new Error(`S0.4: ${modelName} is append-only — không delete/archive.`);
        }

        // BƯỚC 1: Bảng Global -> Thực thi trực tiếp không inject tenant_id
        if (GLOBAL_MODELS.has(modelName)) {
          if (SOFT_DELETE_MODELS.has(modelName) && READ_OPS.has(operation)) {
            args.where = andWhere(args.where, { deleted_at: null });
          }
          return query(args);
        }

        // BƯỚC 2: Kiểm tra Fail-closed trên các bảng nghiệp vụ phả hệ
        if (STRICT_TENANT_MODELS.has(modelName) && !tenantId && !allowUnscoped) {
          throw new Error(
            `S0.1 Tenant context missing: ${model}.${operation}. ` +
              'Gắn ALS từ JWT hoặc sysAccess.allowUnscoped / withTransaction({ tenantId }).'
          );
        }

        // BƯỚC 3: Xử lý Soft-delete cho Tenant models
        if (SOFT_DELETE_MODELS.has(modelName) && READ_OPS.has(operation)) {
          args.where = andWhere(args.where, { deleted_at: null });
        }

        if (SOFT_DELETE_MODELS.has(modelName) && operation === 'delete') {
          const where = tenantId
            ? andWhere(args.where, { tenant_id: tenantId, deleted_at: null })
            : andWhere(args.where, { deleted_at: null });
          return basePrisma[modelName].updateMany({
            where,
            data: { deleted_at: new Date() },
          });
        }

        // BƯỚC 4: Tiêm tenant_id tự động cho STRICT_TENANT_MODELS
        const scoped = STRICT_TENANT_MODELS.has(modelName) && tenantId;

        if (scoped) {
          if (READ_OPS.has(operation) || WRITE_MANY_OPS.has(operation)) {
            args.where = andWhere(args.where, { tenant_id: tenantId });
          }
          if (operation === 'create' && args.data) {
            args.data = applyTenantData(args.data, tenantId);
          }
          if (operation === 'createMany' && args.data) {
            args.data = applyTenantData(args.data, tenantId);
          }
          if (operation === 'upsert') {
            args.create = applyTenantData(args.create || {}, tenantId);
            args.update = args.update || {};
          }
          // AMEND-02 V1.2: findUnique lệch tenant luôn trả về null (chống UUID probing)
          // findUniqueOrThrow ném lỗi chuẩn 404 NOT_FOUND (không để lộ mã S0.1 hay 403)
          if (operation === 'findUnique' || operation === 'findUniqueOrThrow') {
            return query({
              ...args,
              where: args.where,
            }).then(async (row) => {
              if (row && row.tenant_id && row.tenant_id !== tenantId) {
                if (operation === 'findUniqueOrThrow') {
                  const err = new Error('Không tìm thấy bản ghi.');
                  err.statusCode = 404;
                  err.code = 'NOT_FOUND';
                  throw err;
                }
                return null;
              }
              return row;
            });
          }
        }

        return query(args);
      },
    },
  },
});

/* ====================== HELPER CẬP NHẬT TRÁNH BẪY COUNT ====================== */
async function updateMemberInTenant(memberId, patch, activeTenantId) {
  const result = await prisma.members.updateMany({
    where: { id: memberId, tenant_id: activeTenantId, deleted_at: null },
    data: patch,
  });
  if (result.count === 0) {
    const err = new Error('Không tìm thấy thành viên trong dòng họ.');
    err.statusCode = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }
  return prisma.members.findFirst({ where: { id: memberId, deleted_at: null } });
}

/* ====================== SELECTS & EXECUTION CONTEXT ====================== */
const PRISMA_SELECTS = {
  USER_REGISTRATION: {
    id: true, name: true, email: true, phone: true, status: true, role: true,
    tenant_id: true, member_id: true, temp_full_name: true, temp_father_name: true, 
    temp_grandfather_name: true, temp_birth_year: true, temp_address: true, 
    temp_branch_name: true, temp_relationship: true, temp_note: true, 
    temp_social_profiles: true, created_at: true, updated_at: true,
  },
  TENANT_STANDARD: {
    id: true, name: true, description: true, slug: true, status: true,
  },
  USER_BASIC: {
    id: true, name: true, email: true, phone: true, status: true, role: true,
  }
};

function createCorrelationId() {
  return crypto.randomUUID();
}

function isValidCorrelationId(correlationId) {
  return typeof correlationId === 'string' && correlationId.trim().length > 0;
}

function createExecutionContext(input = {}) {
  const correlationId =
    input.correlationId && isValidCorrelationId(input.correlationId)
      ? input.correlationId
      : createCorrelationId();

  return {
    correlationId,
    actorId: input.actorId || null,
    actorType: input.actorType || 'USER',
    tenantId: input.activeTenantId || input.tenantId || null,
    activeTenantId: input.activeTenantId || input.tenantId || null,
    activeMemberId: input.activeMemberId || input.memberId || null,
    activeLinkStatus: input.activeLinkStatus || null,
    requestId: input.requestId || null,
    ipAddress: input.ipAddress || null,
    userAgent: input.userAgent || null,
    extra: input.extra || {}
  };
}

function tenantScope(context, where = {}, options = {}) {
  const required = typeof options.required === 'boolean' ? options.required : true;
  const resolvedTenantId = context?.activeTenantId || context?.tenantId;
  if (!context || !resolvedTenantId) {
    if (required) throw new Error('Tenant scope is required but context.tenantId is missing.');
    return { ...where };
  }
  return { ...where, tenant_id: resolvedTenantId };
}

function normalizeJsonObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function buildMetadataContext(context, extra = {}) {
  return {
    correlation_id: context?.correlationId || null,
    request_id: context?.requestId || null,
    actor_type: context?.actorType || null,
    actor_id: context?.actorId || null,
    ip_address: context?.ipAddress || null,
    user_agent: context?.userAgent || null,
    ...normalizeJsonObject(extra)
  };
}

/* ====================== TRANSACTION & ALS HELPERS ====================== */
async function withTransaction(contextInput, callback, options = {}) {
  if (typeof callback !== 'function') throw new TypeError('withTransaction requires callback(tx, context)');
  const context = createExecutionContext(contextInput);
  const allowUnscoped = contextInput?.allowUnscoped === true || contextInput?.allowSystemBypass === true;
  
  const store = {
    tenantId: context.activeTenantId || context.tenantId || null,
    activeTenantId: context.activeTenantId || context.tenantId || null,
    activeMemberId: context.activeMemberId || null,
    activeLinkStatus: context.activeLinkStatus || null,
    userId: context.actorId || null,
    requestId: context.requestId || null,
    correlationId: context.correlationId || null,
    allowUnscoped,
    allowSystemBypass: allowUnscoped,
  };
  const maxWait = options.maxWait ?? 10000;
  const timeout = options.timeout ?? 30000;

  // Lựa chọn client transaction phù hợp theo V1.2
  const txClient = allowUnscoped ? basePrisma : prisma;

  return tenantContext.run(store, () =>
    txClient.$transaction(async (tx) => callback(tx, context), { maxWait, timeout })
  );
}

function runWithTenantContext(store = {}, callback) {
  if (typeof callback !== 'function') throw new TypeError('runWithTenantContext requires callback');
  const allowUnscoped = store.allowUnscoped === true || store.allowSystemBypass === true;
  const normalizedStore = {
    tenantId: store.activeTenantId || store.tenantId || null,
    activeTenantId: store.activeTenantId || store.tenantId || null,
    activeMemberId: store.activeMemberId || store.memberId || null,
    activeLinkStatus: store.activeLinkStatus || null,
    userId: store.userId || store.actorId || null,
    allowUnscoped,
    allowSystemBypass: allowUnscoped,
    requestId: store.requestId || null,
    correlationId: store.correlationId || null,
  };
  return tenantContext.run(normalizedStore, callback);
}

/**
 * assertSameTenantLink hỗ trợ Multi-Home:
 * Cho phép liên kết nếu user có liên kết hợp lệ tới dòng họ của member qua user_member_links.
 */
async function assertSameTenantLink(client, userId, memberId) {
  const user = await client.users.findFirst({
    where: { id: userId, deleted_at: null },
    select: { id: true, tenant_id: true, member_id: true },
  });
  const member = await client.members.findFirst({
    where: { id: memberId, deleted_at: null },
    select: { id: true, tenant_id: true },
  });
  if (!user || !member) throw new Error('S0.3 User hoặc member không tồn tại.');

  const isDefaultTenant = user.tenant_id && user.tenant_id === member.tenant_id;
  if (!isDefaultTenant) {
    const hasLink = await client.user_member_links.findFirst({
      where: {
        user_id: userId,
        tenant_id: member.tenant_id,
        deleted_at: null,
      },
    });
    if (!hasLink) {
      throw new Error('S0.3 User không có liên kết hợp lệ tới dòng họ của member.');
    }
  }
  return { user, member };
}

async function linkUserToMember(client, userId, memberId) {
  await assertSameTenantLink(client, userId, memberId);
  return client.users.update({ where: { id: userId }, data: { member_id: memberId } });
}

async function unlinkUserFromMember(client, userId) {
  return client.users.update({ where: { id: userId }, data: { member_id: null } });
}

const egalPrisma = Object.assign(prisma, {
  client: prisma,
  correlation: { create: createCorrelationId, isValid: isValidCorrelationId },
  context: { create: createExecutionContext, buildMetadata: buildMetadataContext },
  tenant: { scope: tenantScope },
  withTransaction,
});

module.exports = {
  prisma,
  basePrisma,
  tenantContext,
  tenantStorage,
  runWithTenantContext,
  withTransaction,
  updateMemberInTenant,
  PRISMA_SELECTS,
  exactMatchFields,
  assertSameTenantLink,
  linkUserToMember,
  unlinkUserFromMember,
  STRICT_TENANT_MODELS,
  GLOBAL_MODELS,
  ...egalPrisma,
  egalPrisma,
};