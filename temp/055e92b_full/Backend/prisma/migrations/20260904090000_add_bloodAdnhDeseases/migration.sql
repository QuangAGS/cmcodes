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
CREATE TYPE "blood_group_code" AS ENUM ('A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'AB_POS', 'AB_NEG', 'O_POS', 'O_NEG', 'UNKNOWN');

-- AlterTable
ALTER TABLE "biographies" ADD COLUMN     "blood_group" VARCHAR(16),
ADD COLUMN     "blood_note" VARCHAR(255),
ADD COLUMN     "congenital_flags" JSONB,
ADD COLUMN     "congenital_none" BOOLEAN DEFAULT false,
ADD COLUMN     "congenital_summary" TEXT,
ADD COLUMN     "health_flags" JSONB,
ADD COLUMN     "health_none" BOOLEAN DEFAULT false,
ADD COLUMN     "health_summary" TEXT;

