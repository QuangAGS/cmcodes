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
CREATE TYPE "parentage_type" AS ENUM ('BIOLOGICAL', 'ADOPTIVE', 'FOSTER', 'STEPCHILD', 'OTHER');

-- CreateEnum
CREATE TYPE "claim_review_status" AS ENUM ('PROPOSED', 'ACCEPTED', 'DISPUTED', 'REJECTED', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "parentages" (
    "id" VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "tenant_id" VARCHAR(36) NOT NULL,
    "parent_id" VARCHAR(36) NOT NULL,
    "child_id" VARCHAR(36) NOT NULL,
    "relationship_type" "parentage_type" NOT NULL DEFAULT 'BIOLOGICAL',
    "union_id" VARCHAR(36),
    "review_status" "claim_review_status" NOT NULL DEFAULT 'ACCEPTED',
    "certainty" DECIMAL(3,2),
    "is_selected_for_lineage" BOOLEAN NOT NULL DEFAULT true,
    "note" VARCHAR(500),
    "primary_citation_id" VARCHAR(36),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "changed_by" VARCHAR(36),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "parentages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sources" (
    "id" VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "tenant_id" VARCHAR(36) NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "source_type" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(36),

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "citations" (
    "id" VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "tenant_id" VARCHAR(36) NOT NULL,
    "source_id" VARCHAR(36) NOT NULL,
    "locator" VARCHAR(500),
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "citations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_links" (
    "id" VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "tenant_id" VARCHAR(36) NOT NULL,
    "citation_id" VARCHAR(36) NOT NULL,
    "target_type" VARCHAR(50) NOT NULL,
    "target_id" VARCHAR(36) NOT NULL,
    "relation_role" VARCHAR(50) NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_parentage_tree_lookup" ON "parentages"("tenant_id", "child_id", "review_status", "is_selected_for_lineage");

-- CreateIndex
CREATE INDEX "parentages_parent_id_idx" ON "parentages"("parent_id");

-- CreateIndex
CREATE INDEX "parentages_child_id_idx" ON "parentages"("child_id");

-- CreateIndex
CREATE INDEX "parentages_union_id_idx" ON "parentages"("union_id");

-- CreateIndex
CREATE INDEX "parentages_primary_citation_id_idx" ON "parentages"("primary_citation_id");

-- CreateIndex
CREATE INDEX "parentages_deleted_at_idx" ON "parentages"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_parentage_assertion" ON "parentages"("tenant_id", "parent_id", "child_id", "relationship_type", "review_status");

-- CreateIndex
CREATE INDEX "sources_tenant_id_idx" ON "sources"("tenant_id");

-- CreateIndex
CREATE INDEX "citations_tenant_id_idx" ON "citations"("tenant_id");

-- CreateIndex
CREATE INDEX "citations_source_id_idx" ON "citations"("source_id");

-- CreateIndex
CREATE INDEX "evidence_links_tenant_id_idx" ON "evidence_links"("tenant_id");

-- CreateIndex
CREATE INDEX "evidence_links_citation_id_idx" ON "evidence_links"("citation_id");

-- CreateIndex
CREATE INDEX "evidence_links_target_type_target_id_idx" ON "evidence_links"("target_type", "target_id");

-- AddForeignKey
ALTER TABLE "parentages" ADD CONSTRAINT "parentages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parentages" ADD CONSTRAINT "parentages_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parentages" ADD CONSTRAINT "parentages_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parentages" ADD CONSTRAINT "parentages_union_id_fkey" FOREIGN KEY ("union_id") REFERENCES "marriages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parentages" ADD CONSTRAINT "parentages_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parentages" ADD CONSTRAINT "parentages_primary_citation_id_fkey" FOREIGN KEY ("primary_citation_id") REFERENCES "citations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sources" ADD CONSTRAINT "sources_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citations" ADD CONSTRAINT "citations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citations" ADD CONSTRAINT "citations_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_links" ADD CONSTRAINT "evidence_links_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_links" ADD CONSTRAINT "evidence_links_citation_id_fkey" FOREIGN KEY ("citation_id") REFERENCES "citations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

