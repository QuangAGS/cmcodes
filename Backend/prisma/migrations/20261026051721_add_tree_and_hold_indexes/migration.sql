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

-- CreateIndex
CREATE INDEX "idx_marriages_tenant_husband" ON "marriages"("tenant_id", "husband_id", "deleted_at");

-- CreateIndex
CREATE INDEX "idx_marriages_tenant_wife" ON "marriages"("tenant_id", "wife_id", "deleted_at");

-- CreateIndex
CREATE INDEX "idx_members_down_father" ON "members"("tenant_id", "father_id", "deleted_at");

-- CreateIndex
CREATE INDEX "idx_members_down_mother" ON "members"("tenant_id", "mother_id", "deleted_at");

-- CreateIndex
CREATE INDEX "idx_proposals_hold_members_gin" ON "proposals" USING GIN ("hold_member_ids");

