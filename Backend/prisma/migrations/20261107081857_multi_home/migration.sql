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

-- CreateEnum
CREATE TYPE "user_member_link_status" AS ENUM ('DRAFT', 'CHO_DUYET', 'DA_DUYET', 'TU_CHOI', 'HUY_LIEN_KET');

-- CreateEnum
CREATE TYPE "member_link_type" AS ENUM ('PRIMARY_PATERNAL', 'MATERNAL', 'SPOUSE_FAMILY', 'DESCENDANT_FAMILY', 'GUARDIAN', 'OTHER');

-- AlterEnum
ALTER TYPE "proposal_status" ADD VALUE 'DISPUTED';

-- AlterEnum
ALTER TYPE "proposal_ticket_type" ADD VALUE 'MEMBER_CLAIM';

-- CreateTable
CREATE TABLE "user_member_links" (
    "id" VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "user_id" VARCHAR(36) NOT NULL,
    "tenant_id" VARCHAR(36) NOT NULL,
    "member_id" VARCHAR(36) NOT NULL,
    "link_type" "member_link_type" NOT NULL DEFAULT 'PRIMARY_PATERNAL',
    "status" "user_member_link_status" NOT NULL DEFAULT 'CHO_DUYET',
    "role_in_tenant" VARCHAR(20) NOT NULL DEFAULT 'USER',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "claim_reason" TEXT,
    "proposal_id" VARCHAR(36),
    "approved_by" VARCHAR(36),
    "approved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changed_by" VARCHAR(36),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "user_member_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_uml_user" ON "user_member_links"("user_id");

-- CreateIndex
CREATE INDEX "idx_uml_tenant" ON "user_member_links"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_uml_member" ON "user_member_links"("member_id");

-- CreateIndex
CREATE INDEX "idx_uml_tenant_member" ON "user_member_links"("tenant_id", "member_id");

-- CreateIndex
CREATE INDEX "idx_uml_proposal" ON "user_member_links"("proposal_id");

-- CreateIndex
CREATE INDEX "idx_uml_approved_by" ON "user_member_links"("approved_by");

-- CreateIndex
CREATE INDEX "idx_uml_changed_by" ON "user_member_links"("changed_by");

-- CreateIndex
CREATE INDEX "idx_uml_user_default" ON "user_member_links"("user_id", "is_default", "deleted_at");

-- CreateIndex
CREATE INDEX "idx_uml_tenant_member_status" ON "user_member_links"("tenant_id", "member_id", "status");

-- CreateIndex
CREATE INDEX "idx_uml_tenant_status" ON "user_member_links"("tenant_id", "status");

-- CreateUniqueIndex
CREATE UNIQUE INDEX unique_active_member_per_tenant 
ON user_member_links (tenant_id, member_id) 
WHERE status = 'DA_DUYET' AND deleted_at IS NULL;

-- AddForeignKey
ALTER TABLE "user_member_links" ADD CONSTRAINT "fk_uml_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_member_links" ADD CONSTRAINT "fk_uml_approver" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_member_links" ADD CONSTRAINT "fk_uml_changed_by" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_member_links" ADD CONSTRAINT "fk_uml_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_member_links" ADD CONSTRAINT "fk_uml_member" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_member_links" ADD CONSTRAINT "fk_uml_proposal" FOREIGN KEY ("proposal_id") REFERENCES "proposals"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

