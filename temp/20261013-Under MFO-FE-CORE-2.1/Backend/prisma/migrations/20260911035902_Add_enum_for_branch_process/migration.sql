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


ALTER TYPE "business_process_type" ADD VALUE 'BRANCH_DRAFT_CREATE';
ALTER TYPE "business_process_type" ADD VALUE 'BRANCH_SUBMIT';
ALTER TYPE "business_process_type" ADD VALUE 'BRANCH_APPROVE';
ALTER TYPE "business_process_type" ADD VALUE 'BRANCH_REJECT';
ALTER TYPE "business_process_type" ADD VALUE 'BRANCH_EDITOR_GRANT';
ALTER TYPE "business_process_type" ADD VALUE 'BRANCH_EDITOR_REVOKE';
ALTER TYPE "business_process_type" ADD VALUE 'BRANCH_MERGE';
ALTER TYPE "business_process_type" ADD VALUE 'BRANCH_MEMBER_ATTACH';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "notification_event" ADD VALUE 'BRANCH_SUBMITTED';
ALTER TYPE "notification_event" ADD VALUE 'BRANCH_APPROVED';
ALTER TYPE "notification_event" ADD VALUE 'BRANCH_REJECTED';
ALTER TYPE "notification_event" ADD VALUE 'BRANCH_MERGED';
ALTER TYPE "notification_event" ADD VALUE 'BRANCH_EDITOR_ASSIGNED';
ALTER TYPE "notification_event" ADD VALUE 'BRANCH_EDITOR_REVOKED';
ALTER TYPE "notification_event" ADD VALUE 'BRANCH_MEMBER_ATTACHED';

-- AlterEnum
ALTER TYPE "proposal_ticket_type" ADD VALUE 'BRANCH_REVIEW';

