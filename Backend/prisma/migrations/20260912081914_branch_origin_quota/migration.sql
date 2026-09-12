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

-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "max_generation_span" INTEGER,
ADD COLUMN     "origin_member_id" VARCHAR(36);

-- CreateIndex
CREATE INDEX "idx_branch_origin_member" ON "branches"("origin_member_id");

-- CreateIndex
CREATE INDEX "idx_branches_tenant_origin_member" ON "branches"("tenant_id", "origin_member_id");

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "fk_branch_origin_member" FOREIGN KEY ("origin_member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

