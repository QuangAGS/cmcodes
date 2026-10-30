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
CREATE TYPE "profile_grant_status" AS ENUM ('CHO_DUYET', 'HIEU_LUC', 'HET_HAN', 'TU_CHOI', 'THU_HOI');

-- CreateEnum
CREATE TYPE "profile_grant_scope" AS ENUM ('PROFILE', 'BRANCH_PROFILE');

-- CreateEnum
CREATE TYPE "member_office_code" AS ENUM ('TRUONG_HO', 'TRUONG_TOC', 'TRUONG_NGANH', 'TRUONG_CHI', 'TRUONG_BRANCH');

-- CreateEnum
CREATE TYPE "member_office_status" AS ENUM ('HIEU_LUC', 'HET_NHIEM', 'THU_HOI');

-- AlterTable
ALTER TABLE "members" ADD COLUMN     "created_by" VARCHAR(36),
ADD COLUMN     "created_by_member_id" VARCHAR(36);

-- CreateTable
CREATE TABLE "profile_edit_grants" (
    "id" VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "tenant_id" VARCHAR(36) NOT NULL,
    "target_member_id" VARCHAR(36) NOT NULL,
    "target_branch_id" VARCHAR(36),
    "grantor_member_id" VARCHAR(36),
    "grantee_member_id" VARCHAR(36) NOT NULL,
    "scope" "profile_grant_scope" NOT NULL DEFAULT 'PROFILE',
    "status" "profile_grant_status" NOT NULL DEFAULT 'CHO_DUYET',
    "expires_at" TIMESTAMPTZ(6),
    "reason" VARCHAR(255),
    "approved_by" VARCHAR(36),
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changed_by" VARCHAR(36),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "profile_edit_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_offices" (
    "id" VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "tenant_id" VARCHAR(36) NOT NULL,
    "member_id" VARCHAR(36) NOT NULL,
    "office" "member_office_code" NOT NULL,
    "branch_id" VARCHAR(36),
    "status" "member_office_status" NOT NULL DEFAULT 'HIEU_LUC',
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "appointed_by" VARCHAR(36),
    "note" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changed_by" VARCHAR(36),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "member_offices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "profile_edit_grants_tenant_id_idx" ON "profile_edit_grants"("tenant_id");

-- CreateIndex
CREATE INDEX "profile_edit_grants_target_member_id_idx" ON "profile_edit_grants"("target_member_id");

-- CreateIndex
CREATE INDEX "profile_edit_grants_grantee_member_id_idx" ON "profile_edit_grants"("grantee_member_id");

-- CreateIndex
CREATE INDEX "member_offices_tenant_id_idx" ON "member_offices"("tenant_id");

-- CreateIndex
CREATE INDEX "member_offices_member_id_idx" ON "member_offices"("member_id");

-- CreateIndex
CREATE INDEX "member_offices_branch_id_idx" ON "member_offices"("branch_id");

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_created_by_member_id_fkey" FOREIGN KEY ("created_by_member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

