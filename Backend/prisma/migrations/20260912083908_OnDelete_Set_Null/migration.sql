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

-- DropForeignKey
ALTER TABLE "branches" DROP CONSTRAINT "fk_branch_origin_member";

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "fk_branch_origin_member" FOREIGN KEY ("origin_member_id") REFERENCES "members"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

