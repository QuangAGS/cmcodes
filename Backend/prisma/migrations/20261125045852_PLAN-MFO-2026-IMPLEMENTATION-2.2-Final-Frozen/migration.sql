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

-- =============================================================================
-- PHASE 1 — MFO & ENTITY RESOLUTION
-- Migration: tạo mới + bổ sung cột/relation cho Multi-Source Generation
-- An toàn khi chạy lại (IF NOT EXISTS + DO block cho constraint)
-- =============================================================================

-- 1. Enums mới
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'small_tree_status') THEN
    CREATE TYPE "small_tree_status" AS ENUM ('CHO_GHEP', 'DA_GHEP', 'HUY');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'assertion_status') THEN
    CREATE TYPE "assertion_status" AS ENUM ('ACTIVE', 'SUPERSEDED', 'DISPUTED');
  END IF;
END
$$;

ALTER TYPE "business_process_type" ADD VALUE IF NOT EXISTS 'MFO_SMALL_TREE_CREATE';
ALTER TYPE "business_process_type" ADD VALUE IF NOT EXISTS 'ENTITY_RESOLUTION_MERGE';
ALTER TYPE "business_process_type" ADD VALUE IF NOT EXISTS 'GENERATION_RECOMPUTE';
ALTER TYPE "business_process_type" ADD VALUE IF NOT EXISTS 'GENERATION_RECOMPUTE_FAILED';

-- 2. Bổ sung cột cho bảng hiện hữu
ALTER TABLE "members"
  ADD COLUMN IF NOT EXISTS "merged_into_id" VARCHAR(36);

CREATE INDEX IF NOT EXISTS "idx_members_tenant_merged_into"
  ON "members" ("tenant_id", "merged_into_id");

-- FK members.merged_into_id (an toàn khi chạy lại)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_members_merged_into'
  ) THEN
    ALTER TABLE "members"
      ADD CONSTRAINT "fk_members_merged_into"
      FOREIGN KEY ("merged_into_id") REFERENCES "members"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END
$$;

ALTER TABLE "parentages"
  ADD COLUMN IF NOT EXISTS "metadata" JSONB DEFAULT '{}';

ALTER TABLE "sources"
  ADD COLUMN IF NOT EXISTS "root_generation_offset" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "user_member_links"
  ADD COLUMN IF NOT EXISTS "pre_mfo_completed_at" TIMESTAMPTZ(6);

-- 3. Tạo bảng small_trees
CREATE TABLE IF NOT EXISTS "small_trees" (
  "id" VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
  "tenant_id" VARCHAR(36) NOT NULL,
  "owner_user_id" VARCHAR(36) NOT NULL,
  "created_by_member_id" VARCHAR(36),
  "root_member_id" VARCHAR(36) NOT NULL,
  "is_admin_owned" BOOLEAN NOT NULL DEFAULT false,
  "status" "small_tree_status" NOT NULL DEFAULT 'CHO_GHEP',
  "created_at" TIMESTAMPTZ(6) DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) DEFAULT now(),
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "pk_small_trees" PRIMARY KEY ("id"),
  CONSTRAINT "fk_small_trees_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_small_trees_owner_user" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_small_trees_creator_member" FOREIGN KEY ("created_by_member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT "fk_small_trees_root_member" FOREIGN KEY ("root_member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE INDEX IF NOT EXISTS "idx_small_trees_tenant_status" ON "small_trees" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "idx_small_trees_owner_user" ON "small_trees" ("owner_user_id");
CREATE INDEX IF NOT EXISTS "idx_small_trees_root_member" ON "small_trees" ("root_member_id");
CREATE INDEX IF NOT EXISTS "idx_small_trees_deleted_at" ON "small_trees" ("deleted_at");

-- 4. Tạo bảng member_generation_assertions
CREATE TABLE IF NOT EXISTS "member_generation_assertions" (
  "id" VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
  "tenant_id" VARCHAR(36) NOT NULL,
  "member_id" VARCHAR(36) NOT NULL,
  "source_id" VARCHAR(36) NOT NULL,
  "citation_id" VARCHAR(191) NOT NULL DEFAULT 'SYS_CIT::DEFAULT',
  "claimed_generation" INTEGER NOT NULL,
  "status" "assertion_status" NOT NULL DEFAULT 'ACTIVE',
  "note" VARCHAR(500),
  "created_at" TIMESTAMPTZ(6) DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) DEFAULT now(),
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "pk_member_generation_assertions" PRIMARY KEY ("id"),
  CONSTRAINT "fk_mga_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_mga_member" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_mga_source" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_mga_tenant_member_source_citation"
  ON "member_generation_assertions" ("tenant_id", "member_id", "source_id", "citation_id");
CREATE INDEX IF NOT EXISTS "idx_mga_tenant_member" ON "member_generation_assertions" ("tenant_id", "member_id");
CREATE INDEX IF NOT EXISTS "idx_mga_source" ON "member_generation_assertions" ("source_id");
CREATE INDEX IF NOT EXISTS "idx_mga_deleted_at" ON "member_generation_assertions" ("deleted_at");