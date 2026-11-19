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
ALTER TABLE "clan_profiles" ADD COLUMN     "security_questions" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "onboarding_cases" ADD COLUMN     "agreed_at" TIMESTAMPTZ(6),
ADD COLUMN     "agreed_rules_snapshot" TEXT,
ADD COLUMN     "beneficiary_consent_status" VARCHAR(20) NOT NULL DEFAULT 'NONE',
ADD COLUMN     "beneficiary_user_id" VARCHAR(36),
ADD COLUMN     "claim_mode" VARCHAR(20) NOT NULL DEFAULT 'CREATE_NEW',
ADD COLUMN     "is_disputed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_proxy" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "otp_verified_at" TIMESTAMPTZ(6),
ADD COLUMN     "qa_attempt_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "qa_locked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "referral_status" VARCHAR(20) NOT NULL DEFAULT 'NONE',
ADD COLUMN     "referrer_member_id" VARCHAR(36),
ADD COLUMN     "referrer_user_id" VARCHAR(36),
ADD COLUMN     "reopenable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "revision_reason" VARCHAR(20);

-- CreateIndex
CREATE INDEX "idx_onboarding_claim_hopping" ON "onboarding_cases"("user_id", "tenant_id", "claim_mode", "status", "reopenable", "updated_at");

-- RenameIndex
ALTER INDEX "uq_onboarding_cases_correlation" RENAME TO "onboarding_cases_correlation_id_key";

