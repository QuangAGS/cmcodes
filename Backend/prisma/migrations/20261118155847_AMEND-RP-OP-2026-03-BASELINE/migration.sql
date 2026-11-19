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

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "business_process_type" ADD VALUE 'ONBOARDING_REFERRAL_REQUEST';
ALTER TYPE "business_process_type" ADD VALUE 'ONBOARDING_REFERRAL_DECIDE';
ALTER TYPE "business_process_type" ADD VALUE 'ONBOARDING_BENEFICIARY_CONSENT';
ALTER TYPE "business_process_type" ADD VALUE 'ONBOARDING_QA_UNLOCK';
ALTER TYPE "business_process_type" ADD VALUE 'ONBOARDING_CLAIM_DISPUTED';
ALTER TYPE "business_process_type" ADD VALUE 'TOKEN_INVALIDATED';

-- AlterEnum
ALTER TYPE "onboarding_case_status" ADD VALUE 'PENDING_VERIFICATION';

-- AlterTable
ALTER TABLE "clan_profiles" ADD COLUMN     "clan_rules_version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "onboarding_cases" ADD COLUMN     "agreed_clan_rules_version" INTEGER,
ADD COLUMN     "agreed_rules_checksum" VARCHAR(64),
ADD COLUMN     "agreed_tos_version" VARCHAR(20),
ADD COLUMN     "beneficiary_token_expires_at" TIMESTAMPTZ(6),
ADD COLUMN     "beneficiary_token_hash" VARCHAR(64),
ADD COLUMN     "clan_scope" VARCHAR(20),
ADD COLUMN     "referral_attempt_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "referral_decided_at" TIMESTAMPTZ(6),
ADD COLUMN     "referral_expires_at" TIMESTAMPTZ(6),
ADD COLUMN     "referral_token_hash" VARCHAR(64);

-- AlterTable
ALTER TABLE "profile_edit_grants" ADD COLUMN     "grantee_user_id" VARCHAR(36),
ALTER COLUMN "grantee_member_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "idx_onboarding_referrer_status" ON "onboarding_cases"("referrer_user_id", "referral_status");

-- CreateIndex
CREATE INDEX "idx_onboarding_beneficiary" ON "onboarding_cases"("beneficiary_user_id");

-- CreateIndex
CREATE INDEX "idx_onboarding_dispute_lookup" ON "onboarding_cases"("tenant_id", "claim_mode", "primary_member_id", "status");

-- CreateIndex
CREATE INDEX "idx_peg_grantee_user" ON "profile_edit_grants"("grantee_user_id");

-- AddForeignKey
ALTER TABLE "onboarding_cases" ADD CONSTRAINT "onboarding_cases_referrer_member_id_tenant_id_fkey" FOREIGN KEY ("referrer_member_id", "tenant_id") REFERENCES "members"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- 1. Ràng buộc XOR grantee trên profile_edit_grants
ALTER TABLE "profile_edit_grants"
  ADD CONSTRAINT "chk_peg_grantee_xor"
    CHECK (
      ("grantee_member_id" IS NOT NULL AND "grantee_user_id" IS NULL) OR
      ("grantee_member_id" IS NULL AND "grantee_user_id" IS NOT NULL)
    );

-- 2. Ràng buộc giá trị trạng thái & độ dài snapshot trên onboarding_cases
ALTER TABLE "onboarding_cases"
  ADD CONSTRAINT "chk_claim_mode"
    CHECK ("claim_mode" IN ('CREATE_NEW', 'CLAIM_EXISTING')),
  ADD CONSTRAINT "chk_referral_status"
    CHECK ("referral_status" IN ('NONE', 'PENDING', 'CONFIRMED', 'DECLINED', 'EXPIRED', 'CANCELLED')),
  ADD CONSTRAINT "chk_beneficiary_status"
    CHECK ("beneficiary_consent_status" IN ('NONE', 'PENDING', 'CONFIRMED', 'EXPIRED')),
  ADD CONSTRAINT "chk_agreed_rules_snapshot_length"
    CHECK ("agreed_rules_snapshot" IS NULL OR char_length("agreed_rules_snapshot") <= 30000);

-- 3. Comment khóa quy ước Single-Slot UPSERT trên user_member_links
COMMENT ON TABLE "user_member_links" IS 'Single-slot per (user_id, tenant_id). DML must UPSERT via raw SQL bypassing soft-delete filters.';