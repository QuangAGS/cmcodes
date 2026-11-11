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
CREATE UNIQUE INDEX "addresses_id_tenant_id_key" ON "addresses"("id", "tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "branches_id_tenant_id_key" ON "branches"("id", "tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "marriages_id_tenant_id_key" ON "marriages"("id", "tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "members_id_tenant_id_key" ON "members"("id", "tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_uml_user_tenant" ON "user_member_links"("user_id", "tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_uml_user_member" ON "user_member_links"("user_id", "member_id");

