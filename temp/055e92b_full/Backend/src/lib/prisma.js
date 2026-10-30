/**
 * ============================================================================
 * PATH       : src/lib/prisma.js
 * DATETIME   : 2026-10-18T22:45:00+07:00
 * VERSION    : 23.1.1-BUG11-TX-TIMEOUT-FIX
 * DESCRIPTION:
 * - [23.1.1-BUG11] Cấu hình maxWait (10s) và timeout (30s) trực tiếp trên basePrisma.$transaction
 *   cho withTransaction, triệt tiêu triệt để lỗi P2028 Transaction expired khi duyệt Cửa 2.
 * - [23.1.0-S0] Đợt 1 S0.1–S0.5: fail-closed tenant guardrail + ALS bind
 *   trong withTransaction; không patch findUnique; SYS unscoped explicit.
 * - Merge EGAL-25.2.0 + 3.2.2 (giữ).
 * - basePrisma không phải authorization. Q1/Q2.
 * ============================================================================
 *
 * OLD DESCRIPTION
 * ----------------------------------------------------------------------------
 * Prisma Infrastructure Layer cho hệ thống EGAL.
 *
 * File này là điểm truy cập chuẩn duy nhất tới Prisma Client trong Backend.
 *
 * Nó cung cấp:
 *
 * 1. Prisma singleton:
 *    - Tránh tạo nhiều PrismaClient khi development / hot reload.
 *
 * 2. Transaction wrapper:
 *    - Bảo đảm các Business Process atomic transaction được thực hiện đúng.
 *
 * 3. Execution Context:
 *    - Chuẩn hóa correlation_id, actor, tenant, request metadata.
 *
 * 4. Tenant Scope:
 *    - Hỗ trợ query đa tenant một cách tường minh.
 *
 * 5. Ledger helper:
 *    - business_process_logs
 *    - audit_logs
 *    - notifications
 *    - notification_recipients
 *    - notification_deliveries
 *
 * DOCTRINE
 * ----------------------------------------------------------------------------
 *
 * A. Prisma không tự động ghi business log bằng middleware.
 *
 * Lý do:
 *
 * - Middleware không hiểu business intent.
 * - Một update Prisma có thể là update kỹ thuật, không phải business process.
 * - Middleware dễ tạo recursive write.
 * - Middleware khó kiểm soát transaction boundary.
 * - Middleware không biết metadata snapshot nào phải được đóng băng.
 *
 * Vì vậy:
 *
 * business_process_logs phải được gọi rõ ràng từ Business Service.
 *
 *
 * B. correlation_id là trace ID xuyên ledger.
 *
 * onboarding_cases
 *      ↓
 * business_process_logs
 *      ↓
 * audit_logs
 *      ↓
 * notifications
 *      ↓
 * notification_recipients
 *      ↓
 * notification_deliveries
 *
 *
 * C. Không dùng `id` thay cho `correlation_id`.
 *
 * - id là physical primary key.
 * - correlation_id là logical workflow trace identifier.
 *
 *
 * D. Không dùng members.status hoặc branches.status thay onboarding_cases.status.
 *
 * onboarding_cases.status là Aggregate Workflow State.
 *
 *
 * E. Transaction boundary:
 *
 * Một business process quan trọng phải dùng:
 *
 * prisma.withTransaction(context, async (tx, ctx) => {
 *   ...
 * })
 *
 * Trong callback:
 *
 * - dùng tx thay vì prisma
 * - mọi write liên quan phải nằm trong cùng transaction
 * - business log, audit log và notification có thể ghi cùng transaction
 *
 * ============================================================================
 */

const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');

const tenantContext = new AsyncLocalStorage();

/**
 * DANH SÁCH TRƯỜNG SO KHỚP TUYỆT ĐỐI (EXACT MATCH)
 * Vét cạn từ schema.prisma: Enum, UUID, ID, và định danh duy nhất.
 */
const exactMatchFields = [
    // 1. Các trường ID & Khóa ngoại (UUID) 
    'actor_id','address_id','branch_id','cemetery_id','correlation_id','current_address_id',
    'entity_id','event_id','external_id','external_message_id','external_user_id','father_id',
    'founder_id','fund_id','grave_address_id','headquarters_address_id','husband_id','id',
    'manager_id','member_id','mother_id','notification_id','notification_recipient_id',
    'onboarding_case_id','organizer_id','origin_address_id','parent_id','primary_branch_id',
    'primary_member_id','record_id','target_id','tenant_id','transaction_id','user_id',
    'wife_id','worship_id',

    // 2. Các trường Enum (Quan trọng: Phải dùng equals) 
    'action','actor_type','asset_type','binding_state','case_type','category','channel',
    'child_type','condition_status','event_type','gender','level','pre_lock_status',
    'process_status','process_type','provider','reliability','role','status',
    'temp_relationship','transaction_type',

    // 3. Các trường Định danh & Boolean 
    'phone', 'email', 'slug', 'phone_number', 'cf_bot_verified','enabled','external_sent_status',
    'is_clan', 'is_alive', 'is_birth_lunar', 'is_death_lunar', 'is_contact_public', 
    'is_primary', 'is_read', 'is_death_lunar','is_default', 'is_lunar','is_primary',
    'preferred','turnstile_success','verified'
];

/**
 * ============================================================================
 * GLOBAL PRISMA SINGLETON
 * ============================================================================
 *
 * Trong development, nodemon / vite / hot reload có thể reload module nhiều lần.
 *
 * Nếu mỗi lần reload tạo một PrismaClient mới:
 *
 * - tăng connection PostgreSQL
 * - gây 'too many connections'
 * - gây lỗi Supabase connection pool
 *
 * Vì vậy PrismaClient được giữ trong global object.
 */

const globalForPrisma = global;
const basePrisma = globalForPrisma.__egalPrisma || new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error']
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__egalPrisma = basePrisma;
}

/* ====================== TENANT GUARDRAIL (S0.1) ======================
 * Explicit tenantScope() + service guard = cơ chế chính.
 * Extension = fail-closed + soft-delete filter. Không phải authorization.
 * SYS cross-tenant: store.allowUnscoped === true (verifyToken SYSTEM_ADMIN)
 *   hoặc gọi basePrisma qua sysAccess.js (có actor + reason).
 */
const STRICT_TENANT_MODELS = new Set([
  'achievements', 'addresses', 'assets', 'biographies', 'branches',
  'cemetery', 'data_suggestions', 'event_funds', 'events', 'fund_transactions',
  'funds', 'graves', 'inbound_messages', 'marriages', 'media', 'members',
  'notifications', 'onboarding_cases', 'tenant_communication_providers',
  'tenant_social_spaces', 'worships', 'clan_profiles', 'generation_naming_rules', 'proposals','member_privacy_rules',
]);

const OPTIONAL_TENANT_MODELS = new Set([
  'users', 'audit_logs', 'business_process_logs',
]);

const SOFT_DELETE_MODELS = new Set([
  'achievements', 'addresses', 'assets', 'audit_logs', 'biographies', 'branches',
  'business_process_logs', 'cemetery', 'data_suggestions', 'event_funds', 'events',
  'fund_transactions', 'funds', 'graves', 'inbound_messages', 'marriages', 'media',
  'members', 'notifications', 'onboarding_cases', 'tenants', 'users', 'worships', 
  'clan_profiles', 'generation_naming_rules', 'proposals','member_privacy_rules',
  'member_residences',
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
        const tenantId = store?.tenantId || null;
        const allowUnscoped = store?.allowUnscoped === true;
        args = args || {};

        if (APPEND_ONLY_MODELS.has(modelName) && (operation === 'delete' || operation === 'deleteMany')) {
          throw new Error(`S0.4: ${modelName} is append-only — không delete/archive.`);
        }

        if (STRICT_TENANT_MODELS.has(modelName) && !tenantId && !allowUnscoped) {
          throw new Error(
            `S0.1 Tenant context missing: ${model}.${operation}. ` +
              'Gắn ALS từ JWT hoặc sysAccess.allowUnscoped / withTransaction({ tenantId }).'
          );
        }

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

        const scoped = (STRICT_TENANT_MODELS.has(modelName) || OPTIONAL_TENANT_MODELS.has(modelName)) && tenantId;

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
          if (operation === 'findUnique' || operation === 'findUniqueOrThrow') {
            return query({
              ...args,
              where: args.where,
            }).then(async (row) => {
              if (row && row.tenant_id && row.tenant_id !== tenantId) {
                if (operation === 'findUniqueOrThrow') {
                  throw new Error(`S0.1 Cross-tenant ${model} denied.`);
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

/* ====================== PRISMA_SELECTS (fix lỗi USER_REGISTRATION) ====================== */
const PRISMA_SELECTS = {
  USER_REGISTRATION: {
    id: true, 
    name: true, 
    email: true, 
    phone: true, 
    status: true, 
    role: true,
    tenant_id: true, 
    member_id: true,
    temp_full_name: true, 
    temp_father_name: true, 
    temp_grandfather_name: true,
    temp_birth_year: true, 
    temp_address: true, 
    temp_branch_name: true,
    temp_relationship: true, 
    temp_note: true, 
    temp_social_profiles: true,
    created_at: true, 
    updated_at: true,
  },
  TENANT_STANDARD: {
    id: true, name: true, description: true, slug: true, status: true,
  },
  USER_BASIC: {
    id: true, name: true, email: true, phone: true, status: true, role: true,
  }
};

/**
 * ============================================================================
 * CORRELATION ID
 * ============================================================================
 */

function createCorrelationId() {
  return crypto.randomUUID();
}

function isValidCorrelationId(correlationId) {
  return typeof correlationId === 'string' && correlationId.trim().length > 0;
}

/**
 * ============================================================================
 * EXECUTION CONTEXT
 * ============================================================================
 */

function createExecutionContext(input = {}) {
  const correlationId =
    input.correlationId && isValidCorrelationId(input.correlationId)
      ? input.correlationId
      : createCorrelationId();

  return {
    correlationId,
    actorId: input.actorId || null,
    actorType: input.actorType || 'USER',
    tenantId: input.tenantId || null,
    requestId: input.requestId || null,
    ipAddress: input.ipAddress || null,
    userAgent: input.userAgent || null,
    extra: input.extra || {}
  };
}

/**
 * ============================================================================
 * TENANT SCOPE
 * ============================================================================
 */

function tenantScope(context, where = {}, options = {}) {
  const required =
    typeof options.required === 'boolean' ? options.required : true;

  if (!context || !context.tenantId) {
    if (required) {
      throw new Error(
        'Tenant scope is required but context.tenantId is missing.'
      );
    }

    return { ...where };
  }

  return {
    ...where,
    tenant_id: context.tenantId
  };
}

/**
 * ============================================================================
 * SAFE JSON HELPERS
 * ============================================================================
 */

function normalizeJsonObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

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

/**
 * ============================================================================
 * BUSINESS PROCESS LEDGER
 * ============================================================================
 */

async function getNextBusinessAttemptNo(client, correlationId) {
  const latest = await client.business_process_logs.findFirst({
    where: {
      correlation_id: correlationId
    },
    orderBy: {
      attempt_no: 'desc'
    },
    select: {
      attempt_no: true
    }
  });

  return latest ? latest.attempt_no + 1 : 1;
}

async function createBusinessProcessLog(client, input = {}) {
  if (!input.correlationId) {
    throw new Error(
      'createBusinessProcessLog requires correlationId.'
    );
  }

  if (!input.processType) {
    throw new Error(
      'createBusinessProcessLog requires processType.'
    );
  }

  if (!input.actorId) {
    throw new Error(
      'createBusinessProcessLog requires actorId.'
    );
  }

  const attemptNo =
    input.attemptNo ||
    (await getNextBusinessAttemptNo(client, input.correlationId));

  return client.business_process_logs.create({
    data: {
      correlation_id: input.correlationId,
      attempt_no: Number.parseInt(attemptNo, 10),
      process_type: input.processType,
      actor_type: input.actorType || 'USER',
      actor_id: input.actorId,
      tenant_id: input.tenantId || null,
      process_status: input.processStatus || 'SUCCESS',
      metadata: normalizeJsonObject(input.metadata)
    }
  });
}

/**
 * ============================================================================
 * AUDIT LEDGER
 * ============================================================================
 */

async function createAuditLog(client, input = {}) {
  if (!input.tableName) {
    throw new Error('createAuditLog requires tableName.');
  }

  if (!input.recordId) {
    throw new Error('createAuditLog requires recordId.');
  }

  if (!input.action) {
    throw new Error('createAuditLog requires action.');
  }

  if (!input.tenantId) {
    throw new Error('createAuditLog requires tenantId.');
  }

  return client.audit_logs.create({
    data: {
      table_name: input.tableName,
      record_id: input.recordId,
      action: input.action,
      old_data: input.oldData || null,
      new_data: input.newData || null,
      tenant_id: input.tenantId,
      change_reason: input.changeReason || null,
      changed_by: input.changedBy || null,
      correlation_id: input.correlationId || null
    }
  });
}

/**
 * ============================================================================
 * COMMUNICATION LEDGER
 * ============================================================================
 */

async function createNotification(client, input = {}) {
  if (!input.userId) {
    throw new Error('createNotification requires userId.');
  }

  if (!input.correlationId) {
    throw new Error('createNotification requires correlationId.');
  }

  return client.notifications.create({
    data: {
      user_id: input.userId,
      tenant_id: input.tenantId || null,
      correlation_id: input.correlationId,
      event_type: input.eventType || null,
      type: input.type || 'HE_THONG',
      title: input.title || null,
      content: input.content || null,
      level: input.level || 'INFO',
      status: input.status || 'PENDING',
      reliability: input.reliability || 'LOW',
      metadata: normalizeJsonObject(input.metadata),
      changed_by: input.changedBy || null
    }
  });
}

async function createNotificationRecipient(client, input = {}) {
  if (!input.notificationId) {
    throw new Error(
      'createNotificationRecipient requires notificationId.'
    );
  }

  if (!input.userId) {
    throw new Error(
      'createNotificationRecipient requires userId.'
    );
  }

  return client.notification_recipients.create({
    data: {
      notification_id: input.notificationId,
      user_id: input.userId,
      changed_by: input.changedBy || null
    }
  });
}

async function createNotificationDelivery(client, input = {}) {
  if (!input.notificationId) {
    throw new Error(
      'createNotificationDelivery requires notificationId.'
    );
  }

  if (!input.channel) {
    throw new Error(
      'createNotificationDelivery requires channel.'
    );
  }

  return client.notification_deliveries.create({
    data: {
      notification_id: input.notificationId,
      notification_recipient_id:
        input.notificationRecipientId || null,
      channel: input.channel,
      provider: input.provider || null,
      recipient: input.recipient || null,
      handled_by: input.handledBy || null,
      raw_response: normalizeJsonObject(input.rawResponse)
    }
  });
}

async function updateNotificationDeliveryResult(client, input = {}) {
  if (!input.deliveryId) {
    throw new Error(
      'updateNotificationDeliveryResult requires deliveryId.'
    );
  }

  if (!input.status) {
    throw new Error(
      'updateNotificationDeliveryResult requires status.'
    );
  }

  const data = {
    status: input.status,
    external_id: input.externalId || null,
    raw_response: normalizeJsonObject(input.rawResponse),
    error: input.error || null
  };

  if (input.sentAt) data.sent_at = input.sentAt;
  if (input.deliveredAt) data.delivered_at = input.deliveredAt;
  if (input.failedAt) data.failed_at = input.failedAt;

  return client.notification_deliveries.update({
    where: {
      id: input.deliveryId
    },
    data
  });
}

/**
 * ============================================================================
 * ONBOARDING CASE HELPERS
 * ============================================================================
 */

async function createOnboardingCase(client, input = {}) {
  if (!input.correlationId) {
    throw new Error(
      'createOnboardingCase requires correlationId.'
    );
  }

  if (!input.caseType) {
    throw new Error(
      'createOnboardingCase requires caseType.'
    );
  }

  if (!input.userId) {
    throw new Error(
      'createOnboardingCase requires userId.'
    );
  }

  return client.onboarding_cases.create({
    data: {
      correlation_id: input.correlationId,
      case_type: input.caseType,
      user_id: input.userId,
      tenant_id: input.tenantId || null,
      primary_member_id: input.primaryMemberId || null,
      primary_branch_id: input.primaryBranchId || null,
      metadata: normalizeJsonObject(input.metadata),
      changed_by: input.changedBy || null
    }
  });
}

async function updateOnboardingCaseStatus(client, input = {}) {
  if (!input.caseId) {
    throw new Error(
      'updateOnboardingCaseStatus requires caseId.'
    );
  }

  if (!input.status) {
    throw new Error(
      'updateOnboardingCaseStatus requires status.'
    );
  }

  const now = new Date();

  const data = {
    status: input.status,
    changed_by: input.changedBy || null
  };

  if (input.reviewedBy !== undefined) {
    data.reviewed_by = input.reviewedBy || null;
  }

  if (input.reviewNote !== undefined) {
    data.review_note = input.reviewNote || null;
  }

  if (input.rejectionReason !== undefined) {
    data.rejection_reason = input.rejectionReason || null;
  }

  if (input.revisionRequest !== undefined) {
    data.revision_request = input.revisionRequest || null;
  }

  if (input.metadata !== undefined) {
    data.metadata = normalizeJsonObject(input.metadata);
  }

  switch (input.status) {
    case 'SUBMITTED':
      data.submitted_at = now;
      break;

    case 'UNDER_REVIEW':
      data.reviewed_at = now;
      break;

    case 'APPROVED':
      data.approved_at = now;
      break;

    case 'REJECTED':
      data.rejected_at = now;
      break;

    case 'MERGED':
      data.merged_at = now;
      break;

    case 'CANCELLED':
      data.cancelled_at = now;
      break;

    case 'EXPIRED':
      data.expired_at = now;
      break;

    default:
      break;
  }

  return client.onboarding_cases.update({
    where: {
      id: input.caseId
    },
    data
  });
}

/**
 * ============================================================================
 * BRANCH HELPERS
 * ============================================================================
 */

async function updateBranchStatus(client, input = {}) {
  if (!input.branchId) {
    throw new Error('updateBranchStatus requires branchId.');
  }

  if (!input.status) {
    throw new Error('updateBranchStatus requires status.');
  }

  return client.branches.update({
    where: {
      id: input.branchId
    },
    data: {
      status: input.status,
      changed_by: input.changedBy || null
    }
  });
}

/**
 * ============================================================================
 * TRANSACTION WRAPPER
 * ============================================================================
 */

/**
 * @param {ExecutionContext|Object} contextInput
 * @param {(tx: Object, context: ExecutionContext) => Promise<any>} callback
 * @param {Object} [options]
 * @param {number} [options.maxWait=10000]
 * @param {number} [options.timeout=30000]
 *
 * @returns {Promise<any>}
 */
async function withTransaction(contextInput, callback, options = {}) {
  if (typeof callback !== 'function') {
    throw new TypeError('withTransaction requires callback(tx, context)');
  }

  const context = createExecutionContext(contextInput);

  const store = {
    tenantId: context.tenantId || null,
    userId: context.actorId || null,
    requestId: context.requestId || null,
    correlationId: context.correlationId || null,
    allowUnscoped: contextInput?.allowUnscoped === true,
  };

  const maxWait = options.maxWait ?? 10000;
  const timeout = options.timeout ?? 30000;

  return tenantContext.run(store, () =>
    basePrisma.$transaction(
      async (tx) => callback(tx, context),
      {
        maxWait,
        timeout,
      }
    )
  );
}

function runWithTenantContext(store = {}, callback) {
  if (typeof callback !== 'function') {
    throw new TypeError('runWithTenantContext requires callback');
  }
  return tenantContext.run(
    {
      tenantId: store.tenantId || null,
      userId: store.userId || store.actorId || null,
      allowUnscoped: store.allowUnscoped === true,
      requestId: store.requestId || null,
      correlationId: store.correlationId || null,
    },
    callback
  );
}

/**
 * S0.3 — Link user↔member cùng tenant. Unlink chỉ NULL member_id.
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
  if (!user || !member) {
    throw new Error('S0.3 User hoặc member không tồn tại.');
  }
  if (!user.tenant_id || !member.tenant_id || user.tenant_id !== member.tenant_id) {
    throw new Error('S0.3 users.tenant_id phải trùng members.tenant_id.');
  }
  return { user, member };
}

async function linkUserToMember(client, userId, memberId) {
  await assertSameTenantLink(client, userId, memberId);
  return client.users.update({
    where: { id: userId },
    data: { member_id: memberId },
  });
}

async function unlinkUserFromMember(client, userId) {
  return client.users.update({
    where: { id: userId },
    data: { member_id: null },
  });
}

/**
 * ============================================================================
 * DOMAIN API
 * ============================================================================
 */

const egalPrisma = Object.assign(prisma, {
  client: prisma,

  correlation: {
    create: createCorrelationId,
    isValid: isValidCorrelationId
  },

  context: {
    create: createExecutionContext,
    buildMetadata: buildMetadataContext
  },

  tenant: {
    scope: tenantScope
  },

  withTransaction,

  businessProcess: {
    getNextAttemptNo: getNextBusinessAttemptNo,
    create: createBusinessProcessLog,

    findByCorrelationId(client, correlationId) {
      return client.business_process_logs.findMany({
        where: {
          correlation_id: correlationId
        },
        orderBy: [
          {
            attempt_no: 'asc'
          },
          {
            created_at: 'asc'
          }
        ]
      });
    }
  },

  audit: {
    create: createAuditLog,

    findByCorrelationId(client, correlationId) {
      return client.audit_logs.findMany({
        where: {
          correlation_id: correlationId
        },
        orderBy: {
          created_at: 'asc'
        }
      });
    },

    findRecordHistory(client, { tableName, recordId }) {
      return client.audit_logs.findMany({
        where: {
          table_name: tableName,
          record_id: recordId
        },
        orderBy: {
          created_at: 'asc'
        }
      });
    }
  },

  notification: {
    create: createNotification,
    createRecipient: createNotificationRecipient,
    createDelivery: createNotificationDelivery,
    updateDeliveryResult: updateNotificationDeliveryResult,

    findByCorrelationId(client, correlationId) {
      return client.notifications.findMany({
        where: {
          correlation_id: correlationId
        },
        include: {
          notification_recipients: true,
          notification_deliveries: true
        },
        orderBy: {
          created_at: 'asc'
        }
      });
    }
  },

  onboarding: {
    createCase: createOnboardingCase,
    updateCaseStatus: updateOnboardingCaseStatus,

    findCaseByCorrelationId(client, correlationId) {
      return client.onboarding_cases.findUnique({
        where: {
          correlation_id: correlationId
        },
        include: {
          primary_member: true,
          primary_branch: true,
          branches: true,
          reviewer: true,
          users: true
        }
      });
    },

    findTenantCases(client, context, status) {
      return client.onboarding_cases.findMany({
        where: tenantScope(context, {
          ...(status ? { status } : {}),
          deleted_at: null
        }),
        orderBy: {
          submitted_at: 'asc'
        }
      });
    }
  },

  branch: {
    updateStatus: updateBranchStatus,

    findCaseBranches(client, onboardingCaseId) {
      return client.branches.findMany({
        where: {
          onboarding_case_id: onboardingCaseId,
          deleted_at: null
        },
        orderBy: {
          created_at: 'asc'
        }
      });
    }
  }
});

module.exports = {
  prisma,
  basePrisma,
  tenantContext,
  runWithTenantContext,
  withTransaction,
  PRISMA_SELECTS,
  exactMatchFields,
  assertSameTenantLink,
  linkUserToMember,
  unlinkUserFromMember,
  STRICT_TENANT_MODELS,
  ...egalPrisma,
  egalPrisma,
};