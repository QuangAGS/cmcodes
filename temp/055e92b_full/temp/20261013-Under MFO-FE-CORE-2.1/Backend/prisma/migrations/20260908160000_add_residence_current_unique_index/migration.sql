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

-- CreateUniqueIndex
CREATE UNIQUE INDEX "uq_residence_member_current"
ON "member_residences" ("member_id")
WHERE "is_current" = true
  AND "deleted_at" IS NULL;

--   Chỉ kiểm lúc ghi. death_year / birth_year NULL = chưa rõ (cho phép đã mất không biết năm).

ALTER TABLE members
  DROP CONSTRAINT IF EXISTS chk_members_birth_year_range,
  DROP CONSTRAINT IF EXISTS chk_members_death_year_range,
  DROP CONSTRAINT IF EXISTS chk_members_death_after_birth;

ALTER TABLE members
  ADD CONSTRAINT chk_members_birth_year_range
  CHECK (
    birth_year IS NULL
    OR (
      birth_year >= 1000
      AND birth_year <= (EXTRACT(YEAR FROM CURRENT_DATE))::int + 1
    )
  );

ALTER TABLE members
  ADD CONSTRAINT chk_members_death_year_range
  CHECK (
    death_year IS NULL
    OR (
      death_year >= 1000
      AND death_year <= (EXTRACT(YEAR FROM CURRENT_DATE))::int
    )
  );

ALTER TABLE members
  ADD CONSTRAINT chk_members_death_after_birth
  CHECK (
    birth_year IS NULL
    OR death_year IS NULL
    OR death_year >= birth_year
  );