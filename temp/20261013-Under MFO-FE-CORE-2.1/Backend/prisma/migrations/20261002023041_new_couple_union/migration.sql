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
ALTER TABLE "members" ADD COLUMN     "parent_union_id" VARCHAR(36);

-- CreateIndex
CREATE INDEX "idx_members_parent_union" ON "members"("parent_union_id");

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "fk_members_parent_union" FOREIGN KEY ("parent_union_id") REFERENCES "marriages"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

