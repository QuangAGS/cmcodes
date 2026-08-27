# **EGAL Prisma Migration Doctrine v1.0**

## **PostgreSQL \+ Prisma \+ Shadow Database**

**Version:** 1.0  
**Applies to:** Prisma 5.x, PostgreSQL, Supabase PostgreSQL

---

# **1\. Mục tiêu**

Doctrine này được xây dựng nhằm đạt các mục tiêu:

* Không bị Prisma yêu cầu reset database khi phát triển.  
* Không mất dữ liệu trong môi trường phát triển.  
* Có lịch sử migration đầy đủ.  
* Có thể review SQL trước khi áp dụng.  
* Tương thích với PostgreSQL và Supabase.

---

# **2\. Kiến trúc**

```
schema.prisma
        │
        ▼
Migration History
        │
        ▼
Shadow Database (Local PostgreSQL)
        │
        ▼
Review SQL
        │
        ▼
Production Database
```

Trong đó:

* **Production Database**: PostgreSQL/Supabase thật.  
* **Shadow Database**: PostgreSQL local chỉ dùng để replay migration.  
* Shadow Database **không chứa dữ liệu nghiệp vụ**.

---

# **3\. Chuẩn bị Shadow Database**

## **3.1 Docker Compose**

```
services:
  prisma-shadow-postgres:
    image: postgres:16-bookworm
    container_name: gia-pha-prisma-shadow
    restart: unless-stopped

    environment:
      POSTGRES_USER: prisma_shadow
      POSTGRES_PASSWORD: YOUR_PASSWORD
      POSTGRES_DB: gia_pha_prisma_shadow

    ports:
      - "127.0.0.1:5433:5432"

    volumes:
      - prisma_shadow_pgdata:/var/lib/postgresql/data

volumes:
  prisma_shadow_pgdata:
```

---

## **3.2 Khởi động**

```shell
docker compose -f docker-compose.shadow.yml up -d
```

---

## **3.3 Dừng**

```shell
docker compose -f docker-compose.shadow.yml down
```

---

## **3.4 Xóa hoàn toàn Shadow Database**

```shell
docker compose -f docker-compose.shadow.yml down -v
```

Chỉ thực hiện khi muốn tạo mới hoàn toàn.

---

# **4\. Kiểm tra Shadow Database**

## **Kiểm tra container**

```shell
docker ps
```

Kết quả mong đợi:

```
gia-pha-prisma-shadow
```

---

## **Kiểm tra PostgreSQL hoạt động**

```shell
docker exec -it gia-pha-prisma-shadow \
psql -U prisma_shadow -d gia_pha_prisma_shadow
```

Nếu xuất hiện:

```
gia_pha_prisma_shadow=#
```

thì PostgreSQL hoạt động.

---

## **Kiểm tra Prisma kết nối được**

```shell
echo "SELECT 1;" | \
npx prisma db execute \
--url "$SHADOW_DATABASE_URL" \
--stdin
```

Nếu:

```
Script executed successfully.
```

\=\> Prisma kết nối thành công.

---

# **5\. Cấu hình schema.prisma**

```
datasource db {
  provider = "postgresql"

  url               = env("DATABASE_URL")
  directUrl         = env("DIRECT_URL")
  shadowDatabaseUrl = env("SHADOW_DATABASE_URL")

  extensions = [
    citext,
    pgcrypto,
    uuid_ossp(map: "uuid-ossp"),
    pg_trgm
  ]
}
```

Lưu ý:

* Không đưa các extension chỉ có trên Supabase (ví dụ `supabase_vault`) vào migration nếu Shadow Database là PostgreSQL chuẩn.

---

# **6\. Cấu hình .env**

```
DATABASE_URL=...

DIRECT_URL=...

SHADOW_DATABASE_URL=postgresql://prisma_shadow:YOUR_PASSWORD@127.0.0.1:5433/gia_pha_prisma_shadow?schema=public
```

---

# **7\. Tạo baseline (init0)**

Khi database đã đồng bộ với schema:

```
npx prisma migrate diff \
  --from-empty \
  --to-schema-datamodel prisma/schema.prisma \
  --script \
  > prisma/migrations/init0/migration.sql
```

Sau đó:

```
npx prisma migrate resolve --applied init0
```

---

# **8\. Quy trình phát triển**

## **Bước 1**

Sửa:

```
schema.prisma
```

---

## **Bước 2**

Kiểm tra

```
npx prisma format
```

```
npx prisma validate
```

---

## **Bước 3**

Sinh migration SQL

```
Bước 3a) Tạo thư mục rỗng trước khi bốc dịch SQL mkdir -p prisma/migrations/<YYYYMMDDHHMM_description>

** Ghi chú: <YYYYMMDDHHMM_description> tên của cây thư mục

Bước 3b) Chạy
npx prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url "$SHADOW_DATABASE_URL" \
  --script \
  > prisma/migrations/<YYYYMMDDHHMM_description>/migration.sql
```

---

## **Bước 4**

Review SQL.

Kiểm tra:

* CREATE TABLE  
* ALTER TABLE  
* CREATE INDEX  
* ALTER TYPE

Đảm bảo không có:

* DROP TABLE  
* DROP COLUMN  
* DROP TYPE

(nếu không chủ đích).

---

## **Bước 5**

Áp dụng migration

```
npx prisma migrate deploy
```

---

# **9\. Không dùng db push trong trường hợp nào?**

Không dùng `db push` sau khi dự án đã có migration history.

`db push` chỉ phù hợp:

* tạo database ban đầu;  
* reset baseline;  
* thử nghiệm nhanh.

---

# **10\. Checklist trước khi commit**

□ prisma format

□ prisma validate

□ migration.sql đã review

□ Không có DROP ngoài ý muốn

□ migrate deploy chạy thành công

□ prisma migrate status \= Database schema is up to date

---

# **11\. Kinh nghiệm thực tế**

1. Shadow Database chỉ dùng để replay migration.  
2. Không bao giờ chứa dữ liệu nghiệp vụ.  
3. Không dùng cùng database với Production.  
4. Luôn review migration SQL trước khi deploy.  
5. Nếu project mới và chỉ có test data, nên reset baseline ngay khi phát hiện migration history chưa sạch.

---

# **12\. Doctrine EGAL**

Đối với dự án EGAL, workflow chuẩn là:

```
schema.prisma
        │
        ▼
format
        │
        ▼
validate
        │
        ▼
migrate diff
        │
        ▼
Review SQL
        │
        ▼
Commit
        │
        ▼
migrate deploy
```

Workflow này ưu tiên:

* kiểm soát thay đổi,  
* khả năng audit,  
* không phụ thuộc vào prompt của Prisma,  
* hạn chế tối đa rủi ro mất dữ liệu.

