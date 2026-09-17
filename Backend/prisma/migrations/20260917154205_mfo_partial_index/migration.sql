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

CREATE UNIQUE INDEX IF NOT EXISTS "uq_marriages_active_couple"
  ON "marriages" ("tenant_id", "husband_id", "wife_id")
  WHERE "deleted_at" IS NULL
    AND "status" = 'DANG_KET_HON'
    AND "husband_id" IS NOT NULL
    AND "wife_id" IS NOT NULL;

