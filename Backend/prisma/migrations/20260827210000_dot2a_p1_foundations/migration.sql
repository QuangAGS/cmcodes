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
CREATE TYPE "proposal_status" AS ENUM ('DRAFT', 'PENDING', 'UNDER_REVIEW', 'NEEDS_REVISION', 'REJECTED', 'APPROVED', 'APPLIED', 'WITHDRAWN', 'FAILED_TO_APPLY');

-- CreateEnum
CREATE TYPE "proposal_ticket_type" AS ENUM ('PROFILE_CORRECTION', 'TREE_MERGE', 'FUND_CONTRIBUTION');

-- CreateEnum
CREATE TYPE "privacy_field_group" AS ENUM ('CONTACT', 'ACHIEVEMENT', 'BIRTH_DATE');

-- CreateEnum
CREATE TYPE "privacy_visibility" AS ENUM ('SELF', 'TENANT');

-- CreateTable
CREATE TABLE "clan_profiles" (
    "id" VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "tenant_id" VARCHAR(36) NOT NULL,
    "origin_summary" TEXT,
    "progenitor_summary" TEXT,
    "clan_rules" TEXT,
    "welcome_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changed_by" VARCHAR(36),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "clan_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generation_naming_rules" (
    "id" VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "tenant_id" VARCHAR(36) NOT NULL,
    "generation_no" INTEGER NOT NULL,
    "middle_name" VARCHAR(100) NOT NULL,
    "notes" TEXT,
    "assigned_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changed_by" VARCHAR(36),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "generation_naming_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposals" (
    "id" VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "tenant_id" VARCHAR(36) NOT NULL,
    "ticket_type" "proposal_ticket_type" NOT NULL,
    "status" "proposal_status" NOT NULL DEFAULT 'DRAFT',
    "requester_user_id" VARCHAR(36) NOT NULL,
    "target_table" VARCHAR(50),
    "target_id" VARCHAR(36),
    "payload" JSONB NOT NULL DEFAULT '{}',
    "payload_schema_version" INTEGER NOT NULL DEFAULT 1,
    "admin_note" TEXT,
    "reviewed_by" VARCHAR(36),
    "reviewed_at" TIMESTAMPTZ(6),
    "applied_at" TIMESTAMPTZ(6),
    "correlation_id" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changed_by" VARCHAR(36),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_privacy_rules" (
    "id" VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "tenant_id" VARCHAR(36) NOT NULL,
    "member_id" VARCHAR(36) NOT NULL,
    "field_group" "privacy_field_group" NOT NULL,
    "visibility" "privacy_visibility" NOT NULL DEFAULT 'TENANT',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changed_by" VARCHAR(36),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "member_privacy_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clan_profiles_tenant_id_key" ON "clan_profiles"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_clan_profiles_deleted_at" ON "clan_profiles"("deleted_at");

-- CreateIndex
CREATE INDEX "idx_generation_naming_tenant" ON "generation_naming_rules"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_generation_naming_deleted_at" ON "generation_naming_rules"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_generation_naming_tenant_gen" ON "generation_naming_rules"("tenant_id", "generation_no");

-- CreateIndex
CREATE INDEX "idx_proposals_tenant_status" ON "proposals"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "idx_proposals_tenant_type" ON "proposals"("tenant_id", "ticket_type");

-- CreateIndex
CREATE INDEX "idx_proposals_requester" ON "proposals"("requester_user_id");

-- CreateIndex
CREATE INDEX "idx_proposals_correlation" ON "proposals"("correlation_id");

-- CreateIndex
CREATE INDEX "idx_proposals_deleted_at" ON "proposals"("deleted_at");

-- CreateIndex
CREATE INDEX "idx_privacy_tenant" ON "member_privacy_rules"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_privacy_deleted_at" ON "member_privacy_rules"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_privacy_member_group" ON "member_privacy_rules"("member_id", "field_group");

-- AddForeignKey
ALTER TABLE "clan_profiles" ADD CONSTRAINT "fk_clan_profiles_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "generation_naming_rules" ADD CONSTRAINT "fk_generation_naming_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "fk_proposals_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "fk_proposals_requester" FOREIGN KEY ("requester_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "fk_proposals_reviewer" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "member_privacy_rules" ADD CONSTRAINT "fk_privacy_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "member_privacy_rules" ADD CONSTRAINT "fk_privacy_member" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

