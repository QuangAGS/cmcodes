-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateExtension
-- CREATE EXTENSION IF NOT EXISTS "supabase_vault";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CreateEnum
CREATE TYPE "onboarding_case_type" AS ENUM ('MEMBER_JOIN', 'CLAN_SETUP');

-- CreateEnum
CREATE TYPE "onboarding_case_status" AS ENUM ('DRAFT', 'PROFILE_COMPLETED', 'FAMILY_TREE_DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'NEEDS_REVISION', 'APPROVED', 'MERGING', 'MERGED', 'MERGE_FAILED', 'REJECTED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "branch_status" AS ENUM ('DRAFT', 'PROVISIONAL', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'MERGED', 'REJECTED', 'ARCHIVED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "business_process_type" ADD VALUE 'ONBOARDING_CASE_CREATE';
ALTER TYPE "business_process_type" ADD VALUE 'ONBOARDING_PROFILE_SAVE';
ALTER TYPE "business_process_type" ADD VALUE 'ONBOARDING_PROFILE_COMPLETE';
ALTER TYPE "business_process_type" ADD VALUE 'ONBOARDING_BRANCH_CREATE';
ALTER TYPE "business_process_type" ADD VALUE 'ONBOARDING_BRANCH_UPDATE';
ALTER TYPE "business_process_type" ADD VALUE 'ONBOARDING_BRANCH_SUBMIT';
ALTER TYPE "business_process_type" ADD VALUE 'ONBOARDING_SUBMIT';
ALTER TYPE "business_process_type" ADD VALUE 'ONBOARDING_REVIEW_START';
ALTER TYPE "business_process_type" ADD VALUE 'ONBOARDING_REVISION_REQUEST';
ALTER TYPE "business_process_type" ADD VALUE 'ONBOARDING_APPROVE';
ALTER TYPE "business_process_type" ADD VALUE 'ONBOARDING_REJECT';
ALTER TYPE "business_process_type" ADD VALUE 'ONBOARDING_CANCEL';
ALTER TYPE "business_process_type" ADD VALUE 'ONBOARDING_CASE_EXPIRE';
ALTER TYPE "business_process_type" ADD VALUE 'ONBOARDING_MERGE_START';
ALTER TYPE "business_process_type" ADD VALUE 'ONBOARDING_BRANCH_MERGE';
ALTER TYPE "business_process_type" ADD VALUE 'ONBOARDING_MERGE_FAILED';
ALTER TYPE "business_process_type" ADD VALUE 'ONBOARDING_COMPLETE';
ALTER TYPE "business_process_type" ADD VALUE 'ONBOARDING_BRANCH_ARCHIVE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "notification_event" ADD VALUE 'ONBOARDING_STARTED';
ALTER TYPE "notification_event" ADD VALUE 'ONBOARDING_PROFILE_COMPLETED';
ALTER TYPE "notification_event" ADD VALUE 'ONBOARDING_SUBMITTED';
ALTER TYPE "notification_event" ADD VALUE 'ONBOARDING_UNDER_REVIEW';
ALTER TYPE "notification_event" ADD VALUE 'ONBOARDING_REVISION_REQUESTED';
ALTER TYPE "notification_event" ADD VALUE 'ONBOARDING_APPROVED';
ALTER TYPE "notification_event" ADD VALUE 'ONBOARDING_REJECTED';
ALTER TYPE "notification_event" ADD VALUE 'ONBOARDING_CANCELLED';
ALTER TYPE "notification_event" ADD VALUE 'ONBOARDING_MERGING';
ALTER TYPE "notification_event" ADD VALUE 'ONBOARDING_MERGE_FAILED';
ALTER TYPE "notification_event" ADD VALUE 'ONBOARDING_BRANCH_MERGED';
ALTER TYPE "notification_event" ADD VALUE 'ONBOARDING_COMPLETED';

-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "onboarding_case_id" VARCHAR(36),
ADD COLUMN     "status" "branch_status" NOT NULL DEFAULT 'PROVISIONAL';

-- CreateTable
CREATE TABLE "onboarding_cases" (
    "id" VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "correlation_id" VARCHAR(36) NOT NULL,
    "case_type" "onboarding_case_type" NOT NULL,
    "status" "onboarding_case_status" NOT NULL DEFAULT 'DRAFT',
    "user_id" VARCHAR(36) NOT NULL,
    "tenant_id" VARCHAR(36),
    "primary_member_id" VARCHAR(36),
    "primary_branch_id" VARCHAR(36),
    "reviewed_by" VARCHAR(36),
    "submitted_at" TIMESTAMPTZ(6),
    "reviewed_at" TIMESTAMPTZ(6),
    "approved_at" TIMESTAMPTZ(6),
    "rejected_at" TIMESTAMPTZ(6),
    "merged_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "expired_at" TIMESTAMPTZ(6),
    "review_note" TEXT,
    "rejection_reason" TEXT,
    "revision_request" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "changed_by" VARCHAR(36),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "pk_onboarding_cases" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_onboarding_tenant_status_submitted" ON "onboarding_cases"("tenant_id", "status", "submitted_at" ASC);

-- CreateIndex
CREATE INDEX "idx_onboarding_user_status" ON "onboarding_cases"("user_id", "status");

-- CreateIndex
CREATE INDEX "idx_onboarding_reviewer" ON "onboarding_cases"("reviewed_by");

-- CreateIndex
CREATE INDEX "idx_onboarding_primary_member" ON "onboarding_cases"("primary_member_id");

-- CreateIndex
CREATE INDEX "idx_onboarding_created_at" ON "onboarding_cases"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_onboarding_deleted_at" ON "onboarding_cases"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_onboarding_cases_correlation" ON "onboarding_cases"("correlation_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_onboarding_cases_primary_branch" ON "onboarding_cases"("primary_branch_id");

-- CreateIndex
CREATE INDEX "idx_branches_tenant_status" ON "branches"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "idx_branches_onboarding_case" ON "branches"("onboarding_case_id");

-- CreateIndex
CREATE INDEX "idx_branches_tenant_case_status" ON "branches"("tenant_id", "onboarding_case_id", "status");

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "fk_branches_onboarding_case" FOREIGN KEY ("onboarding_case_id") REFERENCES "onboarding_cases"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "onboarding_cases" ADD CONSTRAINT "fk_onboarding_cases_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "onboarding_cases" ADD CONSTRAINT "fk_onboarding_cases_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "onboarding_cases" ADD CONSTRAINT "fk_onboarding_cases_primary_member" FOREIGN KEY ("primary_member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "onboarding_cases" ADD CONSTRAINT "fk_onboarding_cases_primary_branch" FOREIGN KEY ("primary_branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "onboarding_cases" ADD CONSTRAINT "fk_onboarding_cases_reviewer" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

