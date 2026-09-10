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
ALTER TABLE "branches" ADD COLUMN     "origin_address_id" VARCHAR(36);

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "origin_address_id" VARCHAR(36);

-- CreateIndex
CREATE INDEX "idx_branch_parent" ON "branches"("parent_id");

-- CreateIndex
CREATE INDEX "idx_branch_origin_addr" ON "branches"("origin_address_id");

-- CreateIndex
CREATE INDEX "idx_tenant_origin_addr" ON "tenants"("origin_address_id");

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "fk_tenant_origin_addr" FOREIGN KEY ("origin_address_id") REFERENCES "addresses"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "fk_branch_parent" FOREIGN KEY ("parent_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "fk_branch_origin_addr" FOREIGN KEY ("origin_address_id") REFERENCES "addresses"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

