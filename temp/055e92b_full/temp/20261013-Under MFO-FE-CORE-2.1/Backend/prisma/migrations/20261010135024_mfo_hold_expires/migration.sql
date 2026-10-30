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
ALTER TABLE "members" ALTER COLUMN "note" SET DATA TYPE VARCHAR(1024);

-- AlterTable
ALTER TABLE "proposals" ADD COLUMN     "expires_at" TIMESTAMPTZ(6),
ADD COLUMN     "hold_member_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];

