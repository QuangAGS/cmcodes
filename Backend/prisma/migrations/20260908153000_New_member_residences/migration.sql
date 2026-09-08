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
CREATE TYPE "member_residences_kind" AS ENUM ('ORIGIN', 'RESIDENCE', 'TEMPORARY', 'LAST');

-- CreateTable
CREATE TABLE "member_residences" (
    "id" VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "tenant_id" VARCHAR(36) NOT NULL,
    "member_id" VARCHAR(36) NOT NULL,
    "address_id" VARCHAR(36) NOT NULL,
    "kind" "member_residences_kind" NOT NULL DEFAULT 'RESIDENCE',
    "from_year" INTEGER,
    "from_month" INTEGER,
    "from_day" INTEGER,
    "to_year" INTEGER,
    "to_month" INTEGER,
    "to_day" INTEGER,
    "is_lunar" BOOLEAN NOT NULL DEFAULT false,
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "note" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changed_by" VARCHAR(36),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "member_residences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_residence_tenant" ON "member_residences"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_residence_member" ON "member_residences"("member_id");

-- CreateIndex
CREATE INDEX "idx_residence_address" ON "member_residences"("address_id");

-- CreateIndex
CREATE INDEX "idx_residence_tenant_member" ON "member_residences"("tenant_id", "member_id");

-- CreateIndex
CREATE INDEX "idx_residence_member_from" ON "member_residences"("member_id", "from_year");

-- CreateIndex
CREATE INDEX "idx_residences_user" ON "member_residences"("changed_by");

-- CreateIndex
CREATE INDEX "idx_residences_deleted_at" ON "member_residences"("deleted_at");

-- AddForeignKey
ALTER TABLE "member_residences" ADD CONSTRAINT "fk_residence_member" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "member_residences" ADD CONSTRAINT "fk_residence_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "member_residences" ADD CONSTRAINT "fk_residence_address" FOREIGN KEY ("address_id") REFERENCES "addresses"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "member_residences" ADD CONSTRAINT "fk_residences_user" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

