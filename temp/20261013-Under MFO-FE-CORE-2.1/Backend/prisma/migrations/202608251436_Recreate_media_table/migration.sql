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
CREATE TYPE "media_purpose" AS ENUM ('LOGO', 'AVATAR', 'DOCUMENT', 'CERTIFICATE', 'GALLERY', 'ONBOARDING', 'OTHER');

-- CreateEnum
CREATE TYPE "media_storage_provider" AS ENUM ('CLOUDFLARE_R2', 'LOCAL', 'EXTERNAL');

-- AlterTable
ALTER TABLE "media" DROP COLUMN "file_type",
ADD COLUMN     "caption" VARCHAR(500),
ADD COLUMN     "checksum" VARCHAR(64),
ADD COLUMN     "file_ext" VARCHAR(20),
ADD COLUMN     "height" INTEGER,
ADD COLUMN     "mime_type" VARCHAR(100),
ADD COLUMN     "purpose" "media_purpose" NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "sort_order" INTEGER DEFAULT 0,
ADD COLUMN     "width" INTEGER,
ALTER COLUMN "is_primary" SET NOT NULL,
DROP COLUMN "storage_provider",
ADD COLUMN     "storage_provider" "media_storage_provider" NOT NULL DEFAULT 'CLOUDFLARE_R2';

-- CreateIndex
CREATE INDEX "idx_media_storage_key" ON "media"("storage_key");

-- CreateIndex
CREATE INDEX "idx_media_purpose_lookup" ON "media"("tenant_id", "purpose", "entity_type", "entity_id", "deleted_at");

-- CreateIndex
CREATE INDEX "idx_media_primary_lookup" ON "media"("tenant_id", "purpose", "is_primary", "deleted_at");

