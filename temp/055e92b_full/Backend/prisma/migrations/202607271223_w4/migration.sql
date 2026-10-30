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
ALTER TYPE "notification_status" ADD VALUE 'SENDING';

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "locked_at" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "idx_notifications_status_created" ON "notifications"("status", "created_at");

-- CreateIndex
CREATE INDEX "idx_notifications_status_locked" ON "notifications"("status", "locked_at");

