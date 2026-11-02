-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CreateIndex: Tối ưu bộ lọc cờ JSONB cho bảng proposals (Cửa 1 & Cửa 2)
CREATE INDEX IF NOT EXISTS "idx_proposals_mfo_flags" ON "proposals" (
  "tenant_id",
  "ticket_type",
  "status",
  ((payload->>'plan_ok')::boolean),
  ((payload->>'result_ok')::boolean)
) WHERE "deleted_at" IS NULL;

-- CreateIndex: Tối ưu hồ sơ mở xưởng Workbench / kiểm tra hold conflict
CREATE INDEX IF NOT EXISTS "idx_proposals_active_workbench" ON "proposals" (
  "tenant_id",
  "requester_user_id"
) WHERE "deleted_at" IS NULL 
  AND "status" = 'APPROVED' 
  AND COALESCE((payload->>'result_ok')::boolean, false) = false;