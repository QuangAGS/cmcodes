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
ALTER TABLE "addresses" DROP CONSTRAINT "fk_address_tenant";

-- AlterTable
ALTER TABLE "addresses" DROP COLUMN "country",
DROP COLUMN "district_name",
DROP COLUMN "province_name",
DROP COLUMN "ward_name",
ADD COLUMN     "admin_area" VARCHAR(100),
ADD COLUMN     "country_code" CHAR(2) NOT NULL DEFAULT 'VN',
ADD COLUMN     "line1" VARCHAR(255),
ADD COLUMN     "line2" VARCHAR(255),
ADD COLUMN     "locality" VARCHAR(100),
ADD COLUMN     "postal_code" VARCHAR(20),
ADD COLUMN     "sub_locality" VARCHAR(100),
ALTER COLUMN "full_address" SET DATA TYPE VARCHAR(500),
ALTER COLUMN "created_at" SET NOT NULL,
ALTER COLUMN "updated_at" SET NOT NULL;

-- CreateIndex
CREATE INDEX "idx_address_country" ON "addresses"("country_code");

-- CreateIndex
CREATE INDEX "idx_address_admin_area" ON "addresses"("admin_area");

-- CreateIndex
CREATE INDEX "idx_addresses_deleted_at" ON "addresses"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_addresses_tenant_country_full" ON "addresses"("tenant_id", "country_code", "full_address");

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "fk_address_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

