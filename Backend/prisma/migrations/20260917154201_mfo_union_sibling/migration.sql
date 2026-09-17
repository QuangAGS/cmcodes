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

-- DropIndex
DROP INDEX "unique_couple";

-- AlterTable
ALTER TABLE "marriages" ADD COLUMN     "note" VARCHAR(500);

-- AlterTable
ALTER TABLE "members" ADD COLUMN     "sibling_seq" INTEGER;

-- CreateIndex
CREATE INDEX "idx_marriage_husband" ON "marriages"("husband_id");

