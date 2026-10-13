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


ALTER TYPE "business_process_type" ADD VALUE 'MFO_PLAN_SUBMIT';
ALTER TYPE "business_process_type" ADD VALUE 'MFO_PLAN_APPROVE';
ALTER TYPE "business_process_type" ADD VALUE 'MFO_PLAN_REJECT';
ALTER TYPE "business_process_type" ADD VALUE 'MFO_RESULT_SUBMIT';
ALTER TYPE "business_process_type" ADD VALUE 'MFO_RESULT_APPROVE';
ALTER TYPE "business_process_type" ADD VALUE 'MFO_RESULT_REJECT';
ALTER TYPE "business_process_type" ADD VALUE 'MFO_MEMBER_CREATE';
ALTER TYPE "business_process_type" ADD VALUE 'MFO_SPOUSE_ATTACH';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "notification_event" ADD VALUE 'MFO_PLAN_SUBMITTED';
ALTER TYPE "notification_event" ADD VALUE 'MFO_PLAN_APPROVED';
ALTER TYPE "notification_event" ADD VALUE 'MFO_PLAN_REJECTED';
ALTER TYPE "notification_event" ADD VALUE 'MFO_RESULT_SUBMITTED';
ALTER TYPE "notification_event" ADD VALUE 'MFO_RESULT_APPROVED';
ALTER TYPE "notification_event" ADD VALUE 'MFO_RESULT_REJECTED';
ALTER TYPE "notification_event" ADD VALUE 'MFO_MEMBER_CREATED';
ALTER TYPE "notification_event" ADD VALUE 'MFO_SPOUSE_ATTACHED';

-- AlterEnum
ALTER TYPE "proposal_ticket_type" ADD VALUE 'MFO_REVIEW';

