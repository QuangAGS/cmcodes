/**
 * ============================================================================
 * PATH       : src/lib/prisma.js
 * DATETIME   : 2026-07-19T15:30:00+07:00
 * VERSION    : 23.1.0-S0-ISOLATION
 * DESCRIPTION:
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
    //registration_reason: true, 
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

/**
 * Tạo UUID correlation_id chuẩn.
 *
 * UUID này được dùng xuyên:
 *
 * - onboarding_cases
 * - business_process_logs
 * - audit_logs
 * - notifications
 * - notification_deliveries
 *
 * @returns {string}
 */
function createCorrelationId() {
  return crypto.randomUUID();
}

/**
 * Kiểm tra correlation ID.
 *
 * Không ép buộc UUID regex tuyệt đối vì trong tương lai hệ thống có thể dùng:
 *
 * - IMPORT-2026-001
 * - JOB-DAILY-2026-06-25
 * - BATCH-APPROVAL-001
 *
 * Tuy nhiên không chấp nhận empty string.
 *
 * @param {string} correlationId
 * @returns {boolean}
 */
function isValidCorrelationId(correlationId) {
  return typeof correlationId === 'string' && correlationId.trim().length > 0;
}

/**
 * ============================================================================
 * EXECUTION CONTEXT
 * ============================================================================
 *
 * Context được truyền xuyên suốt một request hoặc một business process.
 *
 * Ví dụ:
 *
 * const context = prisma.createExecutionContext({
 *   correlationId: req.correlationId,
 *   actorId: req.user.id,
 *   actorType: 'USER',
 *   tenantId: req.user.tenant_id,
 *   requestId: req.id,
 *   ipAddress: req.ip,
 *   userAgent: req.headers['user-agent']
 * });
 *
 * Không lưu toàn bộ context vào DB một cách mù quáng.
 *
 * Chỉ các service ledger mới chọn field nào cần snapshot.
 */

/**
 * @typedef {Object} ExecutionContext
 *
 * @property {string} correlationId
 * @property {string|null} actorId
 * @property {'USER'|'SYSTEM'|'CRON'|'JOB_RUNNER'|'IMPORT_TOOL'} actorType
 * @property {string|null} tenantId
 * @property {string|null} requestId
 * @property {string|null} ipAddress
 * @property {string|null} userAgent
 * @property {Object} extra
 */

/**
 * Chuẩn hóa execution context.
 *
 * @param {Object} input
 * @param {string} [input.correlationId]
 * @param {string|null} [input.actorId]
 * @param {string} [input.actorType]
 * @param {string|null} [input.tenantId]
 * @param {string|null} [input.requestId]
 * @param {string|null} [input.ipAddress]
 * @param {string|null} [input.userAgent]
 * @param {Object} [input.extra]
 *
 * @returns {ExecutionContext}
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
 *
 * S0.1: tenantScope() là cơ chế chính (explicit).
 * Extension chỉ fail-closed + AND tenant_id khi ALS có tenantId.
 * SYS: allowUnscoped trên ALS hoặc sysAccess + basePrisma — không coi
 * tên biến basePrisma là quyền.
 */

/**
 * Ghép tenant_id vào where condition.
 *
 * @param {ExecutionContext} context
 * @param {Object} [where]
 * @param {Object} [options]
 * @param {boolean} [options.required=true]
 *
 * @returns {Object}
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

/**
 * Bảo đảm metadata luôn là object.
 *
 * @param {unknown} value
 * @returns {Object}
 */
function normalizeJsonObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value;
}

/**
 * Tạo metadata context snapshot dùng chung.
 *
 * Không lưu secret.
 *
 * Không lưu:
 *
 * - password
 * - access token
 * - refresh token
 * - OTP
 * - raw authorization header
 *
 * @param {ExecutionContext} context
 * @param {Object} [extra]
 * @returns {Object}
 */
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
 *
 * Table:
 *
 * business_process_logs
 *
 * Doctrine:
 *
 * - Một correlation_id có thể có nhiều business process.
 * - Một business process có thể retry nhiều lần.
 * - attempt_no unique trong phạm vi correlation_id.
 *
 * Constraint:
 *
 * @@unique([correlation_id, attempt_no])
 */

/**
 * Tìm attempt kế tiếp của correlation_id.
 *
 * Lưu ý:
 *
 * Hàm này chỉ an toàn tuyệt đối khi gọi bên trong transaction
 * và transaction đó bảo đảm serial workflow ownership.
 *
 * Với các process có retry cạnh tranh, nên truyền attemptNo rõ ràng
 * từ retry coordinator / job queue.
 *
 * @param {PrismaClient|Object} client
 * @param {string} correlationId
 * @returns {Promise<number>}
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

/**
 * Ghi Business Process Log.
 *
 * @param {PrismaClient|Object} client
 * @param {Object} input
 *
 * @param {string} input.correlationId
 * @param {number} [input.attemptNo]
 * @param {string} input.processType
 * @param {string} [input.processStatus='SUCCESS']
 * @param {string|null} [input.actorId]
 * @param {string} [input.actorType='USER']
 * @param {string|null} [input.tenantId]
 * @param {Object} [input.metadata]
 *
 * @returns {Promise<Object>}
 */
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
 *
 * audit_logs lưu thay đổi cấp record.
 *
 * business_process_logs lưu intent / workflow cấp business process.
 *
 * Không thay thế lẫn nhau.
 */

/**
 * Ghi audit log.
 *
 * @param {PrismaClient|Object} client
 * @param {Object} input
 *
 * @param {string} input.tableName
 * @param {string} input.recordId
 * @param {string} input.action
 * @param {string} input.tenantId
 * @param {string|null} [input.changedBy]
 * @param {string|null} [input.correlationId]
 * @param {Object|null} [input.oldData]
 * @param {Object|null} [input.newData]
 * @param {string|null} [input.changeReason]
 *
 * @returns {Promise<Object>}
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
 *
 * notifications:
 *   Communication Intent Ledger
 *
 * notification_recipients:
 *   Audience Ledger
 *
 * notification_deliveries:
 *   Delivery Ledger
 */

/**
 * Tạo notification intent.
 *
 * Lưu ý:
 *
 * notifications.user_id hiện là required trong schema.
 *
 * Vì vậy notification intent luôn cần một user owner.
 *
 * Nếu notification gửi nhiều người:
 *
 * - user_id có thể là user khởi tạo / owner
 * - danh sách người nhận thực nằm ở notification_recipients
 *
 * @param {PrismaClient|Object} client
 * @param {Object} input
 *
 * @param {string} input.userId
 * @param {string|null} [input.tenantId]
 * @param {string} input.correlationId
 * @param {string} [input.eventType]
 * @param {string} [input.type='HE_THONG']
 * @param {string} [input.title]
 * @param {string} [input.content]
 * @param {string} [input.level='INFO']
 * @param {string} [input.status='PENDING']
 * @param {string} [input.reliability='LOW']
 * @param {Object} [input.metadata]
 * @param {string|null} [input.changedBy]
 *
 * @returns {Promise<Object>}
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

/**
 * Thêm recipient vào notification.
 *
 * @param {PrismaClient|Object} client
 * @param {Object} input
 * @param {string} input.notificationId
 * @param {string} input.userId
 * @param {string|null} [input.changedBy]
 *
 * @returns {Promise<Object>}
 */
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

/**
 * Tạo delivery intent cho một channel.
 *
 * @param {PrismaClient|Object} client
 * @param {Object} input
 *
 * @param {string} input.notificationId
 * @param {string} input.channel
 * @param {string|null} [input.provider]
 * @param {string|null} [input.recipient]
 * @param {string|null} [input.notificationRecipientId]
 * @param {string|null} [input.handledBy]
 * @param {Object} [input.rawResponse]
 *
 * @returns {Promise<Object>}
 */
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

/**
 * Cập nhật delivery result.
 *
 * @param {PrismaClient|Object} client
 * @param {Object} input
 *
 * @param {string} input.deliveryId
 * @param {string} input.status
 * @param {string|null} [input.externalId]
 * @param {Object} [input.rawResponse]
 * @param {string|null} [input.error]
 * @param {Date|null} [input.sentAt]
 * @param {Date|null} [input.deliveredAt]
 * @param {Date|null} [input.failedAt]
 *
 * @returns {Promise<Object>}
 */
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

/**
 * Tạo onboarding case.
 *
 * correlation_id phải được tạo trước khi tạo case.
 *
 * Một onboarding case có một root correlation_id duy nhất.
 *
 * @param {PrismaClient|Object} client
 * @param {Object} input
 *
 * @param {string} input.correlationId
 * @param {string} input.caseType
 * @param {string} input.userId
 * @param {string|null} [input.tenantId]
 * @param {string|null} [input.primaryMemberId]
 * @param {string|null} [input.primaryBranchId]
 * @param {Object} [input.metadata]
 * @param {string|null} [input.changedBy]
 *
 * @returns {Promise<Object>}
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

/**
 * Cập nhật workflow state onboarding.
 *
 * Không dùng helper này để thực hiện merge nghiệp vụ.
 *
 * Merge phải dùng service chuyên biệt và transaction riêng,
 * vì merge có thể update:
 *
 * - onboarding_cases
 * - branches
 * - members
 * - users
 * - audit_logs
 * - business_process_logs
 * - notifications
 *
 * @param {PrismaClient|Object} client
 * @param {Object} input
 *
 * @param {string} input.caseId
 * @param {string} input.status
 * @param {string|null} [input.reviewedBy]
 * @param {string|null} [input.reviewNote]
 * @param {string|null} [input.rejectionReason]
 * @param {string|null} [input.revisionRequest]
 * @param {Object|null} [input.metadata]
 * @param {string|null} [input.changedBy]
 *
 * @returns {Promise<Object>}
 */
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

  /**
   * Timestamp workflow được set rõ ràng.
   *
   * Không dựa vào trigger ẩn.
   */
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

/**
 * Cập nhật trạng thái branch.
 *
 * @param {PrismaClient|Object} client
 * @param {Object} input
 * @param {string} input.branchId
 * @param {string} input.status
 * @param {string|null} [input.changedBy]
 *
 * @returns {Promise<Object>}
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
 *
 * Đây là helper transaction chuẩn của EGAL.
 *
 * Ví dụ:
 *
 * const context = prisma.createExecutionContext({
 *   actorId: req.user.id,
 *   actorType: 'USER',
 *   tenantId: req.user.tenant_id
 * });
 *
 * const result = await prisma.withTransaction(
 *   context,
 *   async (tx, ctx) => {
 *
 *     const onboardingCase =
 *       await prisma.onboarding.createCase(tx, {...});
 *
 *     await prisma.businessProcess.create(tx, {...});
 *
 *     await prisma.audit.create(tx, {...});
 *
 *     return onboardingCase;
 *   }
 * );
 */

/**
 * @param {ExecutionContext|Object} contextInput
 * @param {(tx: Object, context: ExecutionContext) => Promise<any>} callback
 * @param {Object} [options]
 * @param {number} [options.maxWait=5000]
 * @param {number} [options.timeout=20000]
 *
 * @returns {Promise<any>}
 */
/* CHÚ Ý:
 * 1) withTransaction() tạo ExecutionContext một lần.
 * 2) Callback luôn nhận (tx, context).
 * 3) Mọi write liên quan BP phải dùng tx.
 * 4) Không service nào tự dùng prisma global khi đang nằm trong BP transaction.
 * 5) Không gửi Email/Zalo/Telegram trực tiếp trong transaction; chỉ tạo notification/delivery record trong transaction,
 *  còn gửi thực tế do worker xử lý sau commit.
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

  return tenantContext.run(store, () =>
    prisma.$transaction(
      async (tx) => callback(tx, context),
      {
        maxWait: options.maxWait ?? 5000,
        timeout: options.timeout ?? 20000,
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
 *
 * Các namespace này không thay Prisma model delegate.
 *
 * Chúng là helper service cấp infrastructure.
 *
 * Prisma model gốc vẫn có thể dùng:
 *
 * prisma.users.findUnique(...)
 * prisma.members.update(...)
 * prisma.branches.findMany(...)
 *
 * Các namespace bên dưới dùng cho logic ledger/workflow chuẩn hóa.
 */

const egalPrisma = Object.assign(prisma, {
  /**
   * Prisma singleton gốc.
   */
  client: prisma,

  /**
   * Correlation helpers.
   */
  correlation: {
    create: createCorrelationId,
    isValid: isValidCorrelationId
  },

  /**
   * Execution context helpers.
   */
  context: {
    create: createExecutionContext,
    buildMetadata: buildMetadataContext
  },

  /**
   * Tenant query helpers.
   */
  tenant: {
    scope: tenantScope
  },

  /**
   * Transaction helper.
   */
  withTransaction,

  /**
   * Business Process Ledger helper.
   */
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

  /**
   * Audit Ledger helper.
   */
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

  /**
   * Communication Ledger helper.
   */
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

  /**
   * Onboarding Aggregate helper.
   */
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

  /**
   * Branch workflow helper.
   */
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
// export cả hai để tương thích với codes cũ

/** Phân tích chi tiết:
 * ...egalPrisma (spread operator)
 * Copy toàn bộ thuộc tính và method của egalPrisma ra object mới.
 * Ví dụ: client, withTransaction, audit, notification, onboarding, v.v... đều được copy ra.

 * 1) basePrisma: egalPrisma
 * Tạo thêm một key tên basePrisma, trỏ đến cùng object egalPrisma.
 * Mục đích: Những file cũ đang import { basePrisma } vẫn hoạt động bình thường.

 * 2) egalPrisma
 * Tạo key egalPrisma trỏ đến object chính.
 * Cho phép import kiểu const egalPrisma = require('./prisma') hoặc const { egalPrisma } = require...
 *************** */

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
   