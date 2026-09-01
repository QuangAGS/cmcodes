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
ALTER TABLE "achievements" DROP COLUMN "organization",
ADD COLUMN     "ended_day" INTEGER,
ADD COLUMN     "ended_month" INTEGER,
ADD COLUMN     "ended_year" INTEGER,
ADD COLUMN     "is_current" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_lunar" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "issued_by" VARCHAR(255),
ADD COLUMN     "sort_order" INTEGER DEFAULT 0,
ADD COLUMN     "sub_category" VARCHAR(60);

-- CreateIndex
CREATE INDEX "idx_achievement_category" ON "achievements"("category");

-- CreateIndex
CREATE INDEX "idx_achievement_cat_sub" ON "achievements"("tenant_id", "category", "sub_category");

-- CreateIndex
CREATE INDEX "idx_achievement_member_year" ON "achievements"("member_id", "achieved_year");

