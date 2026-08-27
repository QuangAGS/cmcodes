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

-- DropIndex
DROP INDEX "idx_user_member";

-- CreateIndex
CREATE INDEX "idx_users_tenant_member" ON "users"("tenant_id", "member_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_users_member_id" ON "users"("member_id");

