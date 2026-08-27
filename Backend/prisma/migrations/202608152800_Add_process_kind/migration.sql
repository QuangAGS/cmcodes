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
CREATE TYPE "onboarding_process_kind" AS ENUM ('REGISTER', 'MEMBER_PROMOTE');

-- AlterTable
ALTER TABLE "onboarding_cases" ADD COLUMN     "process_kind" "onboarding_process_kind" NOT NULL DEFAULT 'REGISTER';

-- CreateIndex
CREATE INDEX "idx_onboarding_user_kind_status" ON "onboarding_cases"("user_id", "process_kind", "status");

