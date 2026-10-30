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
CREATE TYPE "achievements_category" AS ENUM ('KHOA_BANG', 'QUAN_SU', 'CHINH_TRI', 'KINH_DOANH', 'TON_GIAO', 'DONG_GOP_XA_HOI', 'KHAC');

-- CreateEnum
CREATE TYPE "fund_transactions_transaction_type" AS ENUM ('THU', 'CHI');

-- CreateEnum
CREATE TYPE "assets_asset_type" AS ENUM ('BAT_DONG_SAN', 'DI_VAT_CO_VAT', 'GIA_PHA', 'TAI_LIEU', 'KHAC');

-- CreateEnum
CREATE TYPE "audit_logs_action" AS ENUM ('THEM_MOI', 'CAP_NHAT', 'XOA');

-- CreateEnum
CREATE TYPE "events_event_type" AS ENUM ('GIO_CHAP', 'HOP_HO', 'LE_TET', 'THANH_MINH', 'KHAC');

-- CreateEnum
CREATE TYPE "members_gender" AS ENUM ('NAM', 'NU', 'KHAC');

-- CreateEnum
CREATE TYPE "users_role" AS ENUM ('SYSTEM_ADMIN', 'CLAN_ADMIN', 'USER', 'KHAC', 'VIEWER', 'GUEST', 'EDITOR');

-- CreateEnum
CREATE TYPE "users_status" AS ENUM ('CHO_DUYET', 'DA_DUYET', 'BI_KHOA', 'BI_CAM', 'TAM_NGUNG', 'TU_CHOI');

-- CreateEnum
CREATE TYPE "users_temp_relationship" AS ENUM ('CON_DE', 'CON_NUOI', 'CON_RIENG', 'KHAC', 'CON_DAU', 'CON_RE', 'CON_DO_DAU');

-- CreateEnum
CREATE TYPE "graves_condition_status" AS ENUM ('MO_DAT', 'DA_SANG_CAT', 'HOA_TANG', 'THAT_LAC', 'CHUA_XAY', 'KHAC');

-- CreateEnum
CREATE TYPE "marriages_status" AS ENUM ('DANG_KET_HON', 'LY_HON', 'GOA', 'LY_THAN', 'KHAC');

-- CreateEnum
CREATE TYPE "members_child_type" AS ENUM ('CON_DE', 'CON_NUOI', 'CON_RIENG', 'KHAC', 'CON_DAU', 'CON_RE', 'CON_DO_DAU');

-- CreateEnum
CREATE TYPE "cemetery_cemetery_type" AS ENUM ('TAM_THOI', 'ON_DINH', 'KHAC');

-- CreateEnum
CREATE TYPE "worships_worship_type" AS ENUM ('TOT', 'CAN_SUA', 'CAN_XAY', 'KHAC');

-- CreateEnum
CREATE TYPE "members_roles" AS ENUM ('TRUONG_TOC', 'TRUONG_NGANH', 'TRUONG_CHI', 'THANH_VIEN', 'TRUONG_HO', 'KHAC');

-- CreateEnum
CREATE TYPE "data_suggestions_status" AS ENUM ('CHO_DUYET', 'DA_DUYET', 'TU_CHOI');

-- CreateEnum
CREATE TYPE "auth_logs_status" AS ENUM ('THANH_CONG', 'THAT_BAI', 'KHAC');

-- CreateEnum
CREATE TYPE "tenant_status" AS ENUM ('CHO_DUYET', 'HOAT_DONG', 'BI_KHOA', 'TAM_NGUNG', 'NGUNG_HAN', 'TU_CHOI');

-- CreateEnum
CREATE TYPE "communication_provider" AS ENUM ('IN_APP', 'EMAIL_SMTP', 'EMAIL_API', 'TELEGRAM_BOT', 'WHATSAPP_BUSINESS', 'ZALO_PZ_MANUAL', 'ZALO_OA', 'WEB_PUSH', 'SMS_PROVIDER', 'MOBILE_PUSH_PROVIDER');

-- CreateEnum
CREATE TYPE "contact_channel" AS ENUM ('IN_APP', 'EMAIL', 'TELEGRAM', 'WHATSAPP', 'ZALO', 'WEB_PUSH', 'SMS', 'MOBILE_PUSH');

-- CreateEnum
CREATE TYPE "notification_level" AS ENUM ('INFO', 'WARNING', 'IMPORTANT', 'CRITICAL');

-- CreateEnum
CREATE TYPE "notification_status" AS ENUM ('PENDING', 'SENT', 'FAILED', 'MANUAL_REQUIRED', 'READ', 'CANCELLED');

-- CreateEnum
CREATE TYPE "communication_binding_state" AS ENUM ('DECLARED', 'SUGGESTED', 'CONNECTED', 'DISABLED');

-- CreateEnum
CREATE TYPE "inbound_message_status" AS ENUM ('PENDING', 'PROCESSED', 'FAILED', 'IGNORED');

-- CreateEnum
CREATE TYPE "notification_event" AS ENUM ('USER_REGISTERED', 'USER_APPROVAL_PENDING', 'USER_APPROVED', 'USER_REJECTED', 'PASSWORD_RESET_REQUESTED', 'PASSWORD_CHANGED', 'LOGIN_SUCCESS', 'SUSPICIOUS_LOGIN', 'SECURITY_ALERT', 'ACCOUNT_LOCKED', 'RECOVERY_EMAIL_CHANGED', 'CLAN_INVITATION', 'CLAN_JOIN_REQUEST', 'MEMBERSHIP_APPROVED', 'MEMBERSHIP_REJECTED', 'ROLE_CHANGED', 'ADMIN_APPROVAL_REQUIRED', 'ADMIN_ACTION_REQUIRED', 'ONBOARDING_REMINDER', 'PROFILE_INCOMPLETE', 'COMMUNICATION_BINDING_REMINDER');

-- CreateEnum
CREATE TYPE "notification_reliability" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH');

-- CreateEnum
CREATE TYPE "members_status" AS ENUM ('DU_BI', 'CHINH_THUC');

-- CreateEnum
CREATE TYPE "actor_type" AS ENUM ('USER', 'SYSTEM', 'JOB_RUNNER', 'CRON', 'IMPORT_TOOL');

-- CreateEnum
CREATE TYPE "business_process_type" AS ENUM ('USER_REGISTER', 'USER_APPROVAL', 'USER_REJECTION', 'PASSWORD_RESET_REQUESTED', 'CLAN_CREATE', 'CLAN_JOIN', 'MEMBER_ADD', 'MEMBER_REMOVE', 'USER_LOCK', 'USER_UNLOCK', 'USER_BAN', 'USER_UNBAN');

-- CreateEnum
CREATE TYPE "process_status_type" AS ENUM ('SUCCESS', 'FAILED', 'ROLLBACKED', 'CANCELLED', 'PENDING');

-- CreateTable
CREATE TABLE "data_suggestions" (
    "id" VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "tenant_id" VARCHAR(36),
    "target_table" VARCHAR(50),
    "target_id" VARCHAR(36),
    "suggested_data" JSONB,
    "status" "data_suggestions_status" DEFAULT 'CHO_DUYET',
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "changed_by" VARCHAR(36),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "data_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(10) NOT NULL,
    "description" TEXT,
    "logo_url" VARCHAR(255),
    "theme_color" VARCHAR(7),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "changed_by" VARCHAR(36),
    "deleted_at" TIMESTAMPTZ(6),
    "social_configs" JSONB DEFAULT '{}',
    "status" "tenant_status" DEFAULT 'CHO_DUYET',
    "slogan" VARCHAR(255),

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "achievements" (
    "id" VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "member_id" VARCHAR(36) NOT NULL,
    "category" "achievements_category" NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "organization" VARCHAR(255),
    "achieved_year" INTEGER NOT NULL,
    "achieved_month" INTEGER,
    "achieved_day" INTEGER,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "changed_by" VARCHAR(36),
    "deleted_at" TIMESTAMPTZ(6),
    "tenant_id" VARCHAR(36) NOT NULL,

    CONSTRAINT "achievements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addresses" (
    "id" VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "full_address" VARCHAR(255) NOT NULL,
    "ward_name" VARCHAR(100),
    "district_name" VARCHAR(100),
    "province_name" VARCHAR(100),
    "country" VARCHAR(45) DEFAULT 'VIETNAM',
    "notes" VARCHAR(255),
    "latitude" DECIMAL(10,8),
    "longitude" DECIMAL(11,8),
    "location_url" TEXT,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "changed_by" VARCHAR(36),
    "deleted_at" TIMESTAMPTZ(6),
    "tenant_id" VARCHAR(36) NOT NULL,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "branch_id" VARCHAR(36),
    "worship_id" VARCHAR(36),
    "name" VARCHAR(255) NOT NULL,
    "asset_type" "assets_asset_type" NOT NULL,
    "description" TEXT,
    "current_value" DECIMAL(15,2),
    "manager_id" VARCHAR(36),
    "address_id" VARCHAR(36),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "changed_by" VARCHAR(36),
    "deleted_at" TIMESTAMPTZ(6),
    "tenant_id" VARCHAR(36) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "table_name" VARCHAR(50) NOT NULL,
    "record_id" VARCHAR(36) NOT NULL,
    "action" "audit_logs_action" NOT NULL,
    "old_data" JSONB,
    "new_data" JSONB,
    "tenant_id" VARCHAR(36) NOT NULL,
    "change_reason" VARCHAR(500),
    "changed_by" VARCHAR(36),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "correlation_id" VARCHAR(36),

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "biographies" (
    "id" VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "member_id" VARCHAR(36),
    "childhood_summary" TEXT,
    "education_history" TEXT,
    "career_history" TEXT,
    "later_life_summary" TEXT,
    "personality_traits" VARCHAR(500),
    "notable_quotes" TEXT,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "changed_by" VARCHAR(36),
    "deleted_at" TIMESTAMPTZ(6),
    "tenant_id" VARCHAR(36),

    CONSTRAINT "biographies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "parent_id" VARCHAR(36),
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "headquarters_address_id" VARCHAR(36),
    "social_groups" JSONB,
    "contact_phone" VARCHAR(20),
    "contact_email" VARCHAR(100),
    "changed_by" VARCHAR(36),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "founder_id" VARCHAR(36),
    "tenant_id" VARCHAR(36) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "branch_id" VARCHAR(36),
    "name" VARCHAR(255) NOT NULL,
    "event_type" "events_event_type" NOT NULL,
    "event_day" INTEGER,
    "event_month" INTEGER,
    "event_year" INTEGER,
    "is_lunar" BOOLEAN DEFAULT false,
    "description" TEXT,
    "address_id" VARCHAR(36),
    "organizer_id" VARCHAR(36),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "changed_by" VARCHAR(36),
    "deleted_at" TIMESTAMPTZ(6),
    "tenant_id" VARCHAR(36) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_funds" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "event_id" VARCHAR(36) NOT NULL,
    "transaction_id" VARCHAR(36) NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "changed_by" VARCHAR(36),
    "deleted_at" TIMESTAMPTZ(6),
    "tenant_id" VARCHAR(36) NOT NULL,

    CONSTRAINT "event_funds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fund_transactions" (
    "id" VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "fund_id" VARCHAR(36) NOT NULL,
    "transaction_type" "fund_transactions_transaction_type" NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "transaction_date" DATE NOT NULL,
    "member_id" VARCHAR(36),
    "guest_name" VARCHAR(100),
    "note" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "changed_by" VARCHAR(36),
    "deleted_at" TIMESTAMPTZ(6),
    "tenant_id" VARCHAR(36) NOT NULL,

    CONSTRAINT "fund_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "funds" (
    "id" VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "current_balance" DECIMAL(15,2) DEFAULT 0.00,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "changed_by" VARCHAR(36),
    "deleted_at" TIMESTAMPTZ(6),
    "tenant_id" VARCHAR(36) NOT NULL,

    CONSTRAINT "funds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "graves" (
    "id" VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "member_id" VARCHAR(36) NOT NULL,
    "cemetery_id" VARCHAR(36),
    "plot_details" VARCHAR(255),
    "grave_address_id" VARCHAR(36),
    "condition_status" "graves_condition_status" DEFAULT 'DA_SANG_CAT',
    "guide_notes" TEXT,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "changed_by" VARCHAR(36),
    "deleted_at" TIMESTAMPTZ(6),
    "tenant_id" VARCHAR(36) NOT NULL,

    CONSTRAINT "graves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marriages" (
    "id" VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "husband_id" VARCHAR(36),
    "wife_id" VARCHAR(36),
    "husband_marriage_order" INTEGER DEFAULT 1,
    "wife_marriage_order" INTEGER DEFAULT 1,
    "status" "marriages_status" DEFAULT 'DANG_KET_HON',
    "start_date" DATE,
    "end_date" DATE,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "changed_by" VARCHAR(36),
    "deleted_at" TIMESTAMPTZ(6),
    "spouse_name_literal" VARCHAR(255),
    "tenant_id" VARCHAR(36) NOT NULL,

    CONSTRAINT "marriages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media" (
    "id" VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "entity_id" VARCHAR(36) NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "file_url" VARCHAR(1000),
    "file_name" VARCHAR(255),
    "file_type" VARCHAR(50),
    "file_size" INTEGER,
    "is_primary" BOOLEAN DEFAULT false,
    "uploaded_by" VARCHAR(36),
    "changed_by" VARCHAR(36),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "tenant_id" VARCHAR(36) NOT NULL,
    "storage_provider" VARCHAR(30) DEFAULT 'GOOGLE_DRIVE',
    "storage_key" VARCHAR(512),

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "members" (
    "id" VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "is_clan" BOOLEAN DEFAULT true,
    "branch_id" VARCHAR(36),
    "full_name" VARCHAR(255) NOT NULL,
    "note" VARCHAR(255),
    "alias" VARCHAR(255),
    "gender" "members_gender" NOT NULL,
    "is_alive" BOOLEAN DEFAULT true,
    "generation" INTEGER,
    "child_type" "members_child_type" DEFAULT 'CON_DE',
    "father_id" VARCHAR(36),
    "mother_id" VARCHAR(36),
    "birth_day" INTEGER,
    "birth_month" INTEGER,
    "birth_year" INTEGER,
    "is_birth_lunar" BOOLEAN DEFAULT false,
    "birth_note" VARCHAR(100),
    "death_day" INTEGER,
    "death_month" INTEGER,
    "death_year" INTEGER,
    "is_death_lunar" BOOLEAN DEFAULT true,
    "death_note" VARCHAR(100),
    "current_address_id" VARCHAR(36),
    "origin_address_id" VARCHAR(36),
    "phone_number" VARCHAR(20),
    "email" VARCHAR(100),
    "social_profiles" JSONB,
    "is_contact_public" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "changed_by" VARCHAR(36),
    "deleted_at" TIMESTAMPTZ(6),
    "tenant_id" VARCHAR(36) NOT NULL,
    "role" "members_roles" DEFAULT 'THANH_VIEN',
    "status" "members_status" NOT NULL DEFAULT 'DU_BI',

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "phone" VARCHAR(20),
    "email" VARCHAR(255),
    "name" VARCHAR(255) NOT NULL,
    "password" VARCHAR(255) NOT NULL,
    "role" "users_role" DEFAULT 'VIEWER',
    "status" "users_status" DEFAULT 'CHO_DUYET',
    "temp_full_name" VARCHAR(100),
    "temp_father_name" VARCHAR(100),
    "temp_grandfather_name" VARCHAR(100),
    "temp_address" VARCHAR(255),
    "temp_birth_year" INTEGER,
    "temp_branch_name" VARCHAR(100),
    "temp_relationship" "users_temp_relationship",
    "temp_note" TEXT,
    "branch_id" VARCHAR(36),
    "member_id" VARCHAR(36),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "changed_by" VARCHAR(36),
    "deleted_at" TIMESTAMPTZ(6),
    "tenant_id" VARCHAR(36),
    "locked_until" TIMESTAMPTZ(6),
    "reset_expires" TIMESTAMPTZ(6),
    "reset_token" VARCHAR(128),
    "temp_social_profiles" JSONB DEFAULT '{}',
    "last_login_at" TIMESTAMPTZ(6),
    "pre_lock_status" "users_status",
    "attempt_count" INTEGER DEFAULT 0,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cemetery" (
    "id" VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "branch_id" VARCHAR(36),
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "address_id" VARCHAR(36),
    "status" "cemetery_cemetery_type" NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "changed_by" VARCHAR(36),
    "deleted_at" TIMESTAMPTZ(6),
    "tenant_id" VARCHAR(36) NOT NULL,

    CONSTRAINT "cemetery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worships" (
    "id" VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "branch_id" VARCHAR(36),
    "name" VARCHAR(50) NOT NULL,
    "address_id" VARCHAR(36),
    "status" "worships_worship_type" NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "changed_by" VARCHAR(36),
    "deleted_at" TIMESTAMPTZ(6),
    "tenant_id" VARCHAR(36) NOT NULL,

    CONSTRAINT "worships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_logs" (
    "id" VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "identifier" VARCHAR(100) NOT NULL,
    "ip_address" VARCHAR(45) NOT NULL,
    "user_agent" TEXT NOT NULL,
    "status" "auth_logs_status" DEFAULT 'THANH_CONG',
    "failure_reason" TEXT,
    "attempt_count" INTEGER DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "changed_by" VARCHAR(36),
    "deleted_at" TIMESTAMPTZ(6),
    "turnstile_success" BOOLEAN,
    "turnstile_error_code" VARCHAR(50),
    "turnstile_action" VARCHAR(50),
    "turnstile_hostname" VARCHAR(255),
    "turnstile_score" DECIMAL(3,2),
    "cf_bot_score" INTEGER,
    "cf_bot_verified" BOOLEAN,

    CONSTRAINT "auth_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "user_id" VARCHAR(36) NOT NULL,
    "type" VARCHAR(20) DEFAULT 'HE_THONG',
    "title" VARCHAR(255),
    "content" TEXT,
    "is_read" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "changed_by" VARCHAR(36),
    "deleted_at" TIMESTAMPTZ(6),
    "external_sent_status" BOOLEAN DEFAULT false,
    "level" "notification_level" DEFAULT 'INFO',
    "status" "notification_status" DEFAULT 'PENDING',
    "read_at" TIMESTAMPTZ(6),
    "metadata" JSONB DEFAULT '{}',
    "event_type" "notification_event",
    "reliability" "notification_reliability" NOT NULL DEFAULT 'LOW',
    "correlation_id" VARCHAR(36) NOT NULL,
    "tenant_id" VARCHAR(36),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slug_counters" (
    "year" INTEGER NOT NULL,
    "last_value" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "changed_by" VARCHAR(36),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "slug_counters_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "inbound_messages" (
    "id" VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "tenant_id" VARCHAR(36),
    "user_id" VARCHAR(36),
    "channel" "contact_channel" NOT NULL,
    "provider" "communication_provider" NOT NULL,
    "external_user_id" VARCHAR(255),
    "external_message_id" VARCHAR(255),
    "sender_name" VARCHAR(255),
    "content" TEXT,
    "raw_payload" JSONB NOT NULL DEFAULT '{}',
    "received_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "changed_by" VARCHAR(36),
    "deleted_at" TIMESTAMPTZ(6),
    "status" "inbound_message_status" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,

    CONSTRAINT "inbound_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "notification_id" VARCHAR(36) NOT NULL,
    "channel" "contact_channel" NOT NULL,
    "provider" "communication_provider",
    "status" "notification_status" NOT NULL DEFAULT 'PENDING',
    "recipient" VARCHAR(255),
    "external_id" VARCHAR(255),
    "sent_at" TIMESTAMPTZ(6),
    "failed_at" TIMESTAMPTZ(6),
    "error" TEXT,
    "raw_response" JSONB NOT NULL DEFAULT '{}',
    "manual_note" TEXT,
    "handled_by" VARCHAR(36),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "changed_by" VARCHAR(36),
    "deleted_at" TIMESTAMPTZ(6),
    "notification_recipient_id" VARCHAR(36),
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "delivered_at" TIMESTAMPTZ(6),
    "read_at" TIMESTAMPTZ(6),

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_communication_providers" (
    "id" VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "tenant_id" VARCHAR(36) NOT NULL,
    "provider" "communication_provider" NOT NULL,
    "name" VARCHAR(100),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL DEFAULT '{}',
    "secrets_ref" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "changed_by" VARCHAR(36),
    "deleted_at" TIMESTAMPTZ(6),
    "channel" "contact_channel",
    "priority" INTEGER NOT NULL DEFAULT 100,

    CONSTRAINT "tenant_communication_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_contact_preferences" (
    "id" VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "user_id" VARCHAR(36) NOT NULL,
    "channel" "contact_channel" NOT NULL,
    "value" VARCHAR(255),
    "preferred" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "changed_by" VARCHAR(36),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "user_contact_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "web_push_subscriptions" (
    "id" VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "user_id" VARCHAR(36) NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "user_agent" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "changed_by" VARCHAR(36),
    "deleted_at" TIMESTAMPTZ(6),
    "last_seen_at" TIMESTAMPTZ(6),
    "failed_at" TIMESTAMPTZ(6),
    "failure_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "web_push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_sessions" (
    "id" VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "user_id" VARCHAR(36) NOT NULL,
    "identifier" VARCHAR(255) NOT NULL,
    "otp_hash" VARCHAR(255),
    "reset_token_hash" VARCHAR(255),
    "status" VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    "request_count" INTEGER NOT NULL DEFAULT 1,
    "resend_count" INTEGER NOT NULL DEFAULT 0,
    "verify_attempt_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "verified_at" TIMESTAMPTZ(6),
    "locked_until" TIMESTAMPTZ(6),
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "changed_by" VARCHAR(36),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "password_reset_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_bindings" (
    "id" VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "user_id" VARCHAR(36) NOT NULL,
    "channel" "contact_channel" NOT NULL,
    "binding_state" "communication_binding_state" NOT NULL DEFAULT 'DECLARED',
    "external_id" VARCHAR(255),
    "display_name" VARCHAR(255),
    "connected_at" TIMESTAMPTZ(6),
    "disabled_at" TIMESTAMPTZ(6),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "changed_by" VARCHAR(36),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "communication_bindings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_recipients" (
    "id" VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "notification_id" VARCHAR(36) NOT NULL,
    "user_id" VARCHAR(36) NOT NULL,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "changed_by" VARCHAR(36),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "notification_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_social_spaces" (
    "id" VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "tenant_id" VARCHAR(36) NOT NULL,
    "platform" VARCHAR(32) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT,
    "display_order" INTEGER DEFAULT 0,
    "enabled" BOOLEAN DEFAULT true,
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "changed_by" VARCHAR(36),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "tenant_social_spaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_process_logs" (
    "id" VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "correlation_id" VARCHAR(36) NOT NULL,
    "attempt_no" INTEGER NOT NULL DEFAULT 1,
    "process_type" "business_process_type" NOT NULL,
    "actor_type" "actor_type" NOT NULL DEFAULT 'USER',
    "actor_id" VARCHAR(36) NOT NULL,
    "tenant_id" VARCHAR(36),
    "process_status" "process_status_type" NOT NULL DEFAULT 'SUCCESS',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_business_process_logs" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_attempt_number" (
    "id" VARCHAR(36) NOT NULL DEFAULT gen_random_uuid(),
    "identifier" VARCHAR(100) NOT NULL,
    "ip_address" VARCHAR(45) NOT NULL DEFAULT '0.0.0.0',
    "action_type" VARCHAR(30) NOT NULL DEFAULT 'LOGIN',
    "attempt_count" INTEGER NOT NULL DEFAULT 1,
    "last_failed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_attempt_number_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_suggestions_tenant" ON "data_suggestions"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_suggestions_deleted" ON "data_suggestions"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "trgm_idx_tenants_name" ON "tenants" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "idx_achievement_tenant" ON "achievements"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_achievement_member" ON "achievements"("member_id");

-- CreateIndex
CREATE INDEX "idx_achievements_user" ON "achievements"("changed_by");

-- CreateIndex
CREATE INDEX "idx_achievements_deleted_at" ON "achievements"("deleted_at");

-- CreateIndex
CREATE INDEX "idx_address_tenant" ON "addresses"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_addresses_user" ON "addresses"("changed_by");

-- CreateIndex
CREATE INDEX "trgm_idx_addresses_full_address" ON "addresses" USING GIN ("full_address" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "idx_assets_tenant" ON "assets"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_asset_address" ON "assets"("address_id");

-- CreateIndex
CREATE INDEX "idx_asset_branch" ON "assets"("branch_id");

-- CreateIndex
CREATE INDEX "idx_asset_manager" ON "assets"("manager_id");

-- CreateIndex
CREATE INDEX "idx_assets_user" ON "assets"("changed_by");

-- CreateIndex
CREATE INDEX "idx_asset_worship" ON "assets"("worship_id");

-- CreateIndex
CREATE INDEX "idx_assets_deleted_at" ON "assets"("deleted_at");

-- CreateIndex
CREATE INDEX "trgm_idx_assets_name" ON "assets" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "idx_audit_user" ON "audit_logs"("changed_by");

-- CreateIndex
CREATE INDEX "idx_audit_record" ON "audit_logs"("table_name", "record_id");

-- CreateIndex
CREATE INDEX "idx_audit_tenant" ON "audit_logs"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_audit_logs_correlation_id" ON "audit_logs"("correlation_id");

-- CreateIndex
CREATE INDEX "idx_audit_logs_query_perf" ON "audit_logs"("tenant_id", "table_name", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_bibliography_tenant" ON "biographies"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_biographies_user" ON "biographies"("changed_by");

-- CreateIndex
CREATE INDEX "idx_biographies_deleted_at" ON "biographies"("deleted_at");

-- CreateIndex
CREATE INDEX "idx_biography_member" ON "biographies"("member_id");

-- CreateIndex
CREATE INDEX "idx_branch_tenant" ON "branches"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_branch_address" ON "branches"("headquarters_address_id");

-- CreateIndex
CREATE INDEX "idx_branches_user" ON "branches"("changed_by");

-- CreateIndex
CREATE INDEX "idx_branches_deleted_at" ON "branches"("deleted_at");

-- CreateIndex
CREATE INDEX "trgm_idx_branches_name" ON "branches" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "idx_event_tenant" ON "events"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_event_address" ON "events"("address_id");

-- CreateIndex
CREATE INDEX "idx_event_branch" ON "events"("branch_id");

-- CreateIndex
CREATE INDEX "idx_event_organizer" ON "events"("organizer_id");

-- CreateIndex
CREATE INDEX "idx_events_user" ON "events"("changed_by");

-- CreateIndex
CREATE INDEX "idx_events_deleted_at" ON "events"("deleted_at");

-- CreateIndex
CREATE INDEX "idx_event_fund_tenant" ON "event_funds"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_events_funds_deleted_at" ON "event_funds"("deleted_at");

-- CreateIndex
CREATE INDEX "idx_fund_trs_tenant" ON "fund_transactions"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_fund_trans_user" ON "fund_transactions"("changed_by");

-- CreateIndex
CREATE INDEX "idx_transaction_fund" ON "fund_transactions"("fund_id");

-- CreateIndex
CREATE INDEX "idx_transaction_member" ON "fund_transactions"("member_id");

-- CreateIndex
CREATE INDEX "idx_funds_trs_deleted_at" ON "fund_transactions"("deleted_at");

-- CreateIndex
CREATE INDEX "idx_funds_tenant" ON "funds"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_funds_user" ON "funds"("changed_by");

-- CreateIndex
CREATE INDEX "idx_funds_deleted_at" ON "funds"("deleted_at");

-- CreateIndex
CREATE INDEX "trgm_idx_funds_name" ON "funds" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "graves_member_id" ON "graves"("member_id");

-- CreateIndex
CREATE INDEX "idx_graves_tenant" ON "graves"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_grave_address" ON "graves"("grave_address_id");

-- CreateIndex
CREATE INDEX "idx_graves_user" ON "graves"("changed_by");

-- CreateIndex
CREATE INDEX "idx_grave_cemetery" ON "graves"("cemetery_id");

-- CreateIndex
CREATE INDEX "idx_graves_deleted_at" ON "graves"("deleted_at");

-- CreateIndex
CREATE INDEX "idx_marriages_tenant" ON "marriages"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_marriage_wife" ON "marriages"("wife_id");

-- CreateIndex
CREATE INDEX "idx_marriages_user" ON "marriages"("changed_by");

-- CreateIndex
CREATE INDEX "idx_marriages_deleted_at" ON "marriages"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "unique_couple" ON "marriages"("husband_id", "wife_id");

-- CreateIndex
CREATE INDEX "idx_media_tenant" ON "media"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_media_user" ON "media"("uploaded_by");

-- CreateIndex
CREATE INDEX "idx_media_deleted_at" ON "media"("deleted_at");

-- CreateIndex
CREATE INDEX "idx_media_polymorphic_lookup" ON "media"("tenant_id", "entity_type", "entity_id", "deleted_at");

-- CreateIndex
CREATE INDEX "idx_members_tenant" ON "members"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_member_branch" ON "members"("branch_id");

-- CreateIndex
CREATE INDEX "idx_member_current_addr" ON "members"("current_address_id");

-- CreateIndex
CREATE INDEX "idx_member_father" ON "members"("father_id");

-- CreateIndex
CREATE INDEX "idx_member_mother" ON "members"("mother_id");

-- CreateIndex
CREATE INDEX "idx_member_origin_addr" ON "members"("origin_address_id");

-- CreateIndex
CREATE INDEX "idx_members_user" ON "members"("changed_by");

-- CreateIndex
CREATE INDEX "idx_members_deleted_at" ON "members"("deleted_at");

-- CreateIndex
CREATE INDEX "trgm_idx_members_alias" ON "members" USING GIN ("alias" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "trgm_idx_members_full_name" ON "members" USING GIN ("full_name" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_email" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_users_tenant" ON "users"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_user_branch" ON "users"("branch_id");

-- CreateIndex
CREATE INDEX "idx_user_member" ON "users"("member_id");

-- CreateIndex
CREATE INDEX "idx_users_user" ON "users"("changed_by");

-- CreateIndex
CREATE INDEX "idx_users_deleted_at" ON "users"("deleted_at");

-- CreateIndex
CREATE INDEX "idx_users_locked_until" ON "users"("locked_until");

-- CreateIndex
CREATE INDEX "trgm_idx_users_email" ON "users" USING GIN ("email" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "trgm_idx_users_name" ON "users" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "trgm_idx_users_phone" ON "users" USING GIN ("phone" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "idx_cemetery_tenant" ON "cemetery"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_cemetery_address" ON "cemetery"("address_id");

-- CreateIndex
CREATE INDEX "idx_cemetery_branch" ON "cemetery"("branch_id");

-- CreateIndex
CREATE INDEX "idx_cemetery_deleted_at" ON "cemetery"("deleted_at");

-- CreateIndex
CREATE INDEX "idx_worship_tenant" ON "worships"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_worship_address" ON "worships"("address_id");

-- CreateIndex
CREATE INDEX "idx_worship_branch" ON "worships"("branch_id");

-- CreateIndex
CREATE INDEX "idx_worship_deleted_at" ON "worships"("deleted_at");

-- CreateIndex
CREATE INDEX "idx_auth_logs_identifier_ip" ON "auth_logs"("identifier", "ip_address");

-- CreateIndex
CREATE INDEX "idx_auth_logs_identifier_time" ON "auth_logs"("identifier", "created_at");

-- CreateIndex
CREATE INDEX "idx_notifications_level" ON "notifications"("level");

-- CreateIndex
CREATE INDEX "idx_notifications_status" ON "notifications"("status");

-- CreateIndex
CREATE INDEX "idx_notifications_created_at" ON "notifications"("created_at");

-- CreateIndex
CREATE INDEX "idx_notifications_deleted_at" ON "notifications"("deleted_at");

-- CreateIndex
CREATE INDEX "idx_notifications_event_type" ON "notifications"("event_type");

-- CreateIndex
CREATE INDEX "idx_notifications_reliability" ON "notifications"("reliability");

-- CreateIndex
CREATE INDEX "idx_notifications_user" ON "notifications"("user_id");

-- CreateIndex
CREATE INDEX "idx_notifications_correlation" ON "notifications"("correlation_id");

-- CreateIndex
CREATE INDEX "idx_notifications_tenants" ON "notifications"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_im_channel" ON "inbound_messages"("channel");

-- CreateIndex
CREATE INDEX "idx_im_deleted_at" ON "inbound_messages"("deleted_at");

-- CreateIndex
CREATE INDEX "idx_im_provider" ON "inbound_messages"("provider");

-- CreateIndex
CREATE INDEX "idx_im_tenant" ON "inbound_messages"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_im_user" ON "inbound_messages"("user_id");

-- CreateIndex
CREATE INDEX "idx_im_received_at" ON "inbound_messages"("received_at");

-- CreateIndex
CREATE INDEX "idx_im_status" ON "inbound_messages"("status");

-- CreateIndex
CREATE INDEX "idx_nd_channel" ON "notification_deliveries"("channel");

-- CreateIndex
CREATE INDEX "idx_nd_deleted_at" ON "notification_deliveries"("deleted_at");

-- CreateIndex
CREATE INDEX "idx_nd_notification" ON "notification_deliveries"("notification_id");

-- CreateIndex
CREATE INDEX "idx_nd_provider" ON "notification_deliveries"("provider");

-- CreateIndex
CREATE INDEX "idx_nd_status" ON "notification_deliveries"("status");

-- CreateIndex
CREATE INDEX "idx_nd_created_at" ON "notification_deliveries"("created_at");

-- CreateIndex
CREATE INDEX "idx_nd_recipient" ON "notification_deliveries"("notification_recipient_id");

-- CreateIndex
CREATE INDEX "idx_nd_retry_count" ON "notification_deliveries"("retry_count");

-- CreateIndex
CREATE INDEX "idx_tcp_deleted_at" ON "tenant_communication_providers"("deleted_at");

-- CreateIndex
CREATE INDEX "idx_tcp_provider" ON "tenant_communication_providers"("provider");

-- CreateIndex
CREATE INDEX "idx_tcp_tenant" ON "tenant_communication_providers"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_tcp_channel" ON "tenant_communication_providers"("channel");

-- CreateIndex
CREATE INDEX "idx_tcp_enabled" ON "tenant_communication_providers"("enabled");

-- CreateIndex
CREATE INDEX "idx_tcp_tenant_provider" ON "tenant_communication_providers"("tenant_id", "provider");

-- CreateIndex
CREATE INDEX "idx_ucp_channel" ON "user_contact_preferences"("channel");

-- CreateIndex
CREATE INDEX "idx_ucp_deleted_at" ON "user_contact_preferences"("deleted_at");

-- CreateIndex
CREATE INDEX "idx_ucp_user" ON "user_contact_preferences"("user_id");

-- CreateIndex
CREATE INDEX "idx_wps_deleted_at" ON "web_push_subscriptions"("deleted_at");

-- CreateIndex
CREATE INDEX "idx_wps_user" ON "web_push_subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "idx_wps_enabled" ON "web_push_subscriptions"("enabled");

-- CreateIndex
CREATE INDEX "idx_wps_failed_at" ON "web_push_subscriptions"("failed_at");

-- CreateIndex
CREATE INDEX "idx_wps_last_seen_at" ON "web_push_subscriptions"("last_seen_at");

-- CreateIndex
CREATE INDEX "idx_prs_deleted_at" ON "password_reset_sessions"("deleted_at");

-- CreateIndex
CREATE INDEX "idx_prs_expires_at" ON "password_reset_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "idx_prs_identifier" ON "password_reset_sessions"("identifier");

-- CreateIndex
CREATE INDEX "idx_prs_locked_until" ON "password_reset_sessions"("locked_until");

-- CreateIndex
CREATE INDEX "idx_prs_status" ON "password_reset_sessions"("status");

-- CreateIndex
CREATE INDEX "idx_prs_user" ON "password_reset_sessions"("user_id");

-- CreateIndex
CREATE INDEX "idx_cb_channel" ON "communication_bindings"("channel");

-- CreateIndex
CREATE INDEX "idx_cb_deleted_at" ON "communication_bindings"("deleted_at");

-- CreateIndex
CREATE INDEX "idx_cb_state" ON "communication_bindings"("binding_state");

-- CreateIndex
CREATE INDEX "idx_cb_user" ON "communication_bindings"("user_id");

-- CreateIndex
CREATE INDEX "idx_nr_deleted_at" ON "notification_recipients"("deleted_at");

-- CreateIndex
CREATE INDEX "idx_nr_notification" ON "notification_recipients"("notification_id");

-- CreateIndex
CREATE INDEX "idx_nr_read_at" ON "notification_recipients"("read_at");

-- CreateIndex
CREATE INDEX "idx_nr_user" ON "notification_recipients"("user_id");

-- CreateIndex
CREATE INDEX "idx_tss_deleted_at" ON "tenant_social_spaces"("deleted_at");

-- CreateIndex
CREATE INDEX "idx_process_log_tenant" ON "business_process_logs"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_process_log_time" ON "business_process_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_process_log_type" ON "business_process_logs"("process_type");

-- CreateIndex
CREATE INDEX "idx_process_log_correlation" ON "business_process_logs"("correlation_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_process_log_attempt" ON "business_process_logs"("correlation_id", "attempt_no");

-- CreateIndex
CREATE UNIQUE INDEX "user_attempt_number_identifier_ip_address_action_type_key" ON "user_attempt_number"("identifier", "ip_address", "action_type");

-- AddForeignKey
ALTER TABLE "data_suggestions" ADD CONSTRAINT "fk_data_suggestions_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "achievements" ADD CONSTRAINT "fk_achievement_member" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "achievements" ADD CONSTRAINT "fk_achievement_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "achievements" ADD CONSTRAINT "fk_achievements_user" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "fk_address_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "fk_addresses_user" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "fk_asset_address" FOREIGN KEY ("address_id") REFERENCES "addresses"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "fk_asset_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "fk_asset_manager" FOREIGN KEY ("manager_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "fk_asset_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "fk_asset_worship" FOREIGN KEY ("worship_id") REFERENCES "worships"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "fk_assets_user" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "fk_audit_user" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "biographies" ADD CONSTRAINT "fk_bibliography_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "biographies" ADD CONSTRAINT "fk_biographies_user" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "biographies" ADD CONSTRAINT "fk_biography_member" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "fk_branch_address" FOREIGN KEY ("headquarters_address_id") REFERENCES "addresses"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "fk_branch_founder" FOREIGN KEY ("founder_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "fk_branch_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "fk_branches_user" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "fk_event_address" FOREIGN KEY ("address_id") REFERENCES "addresses"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "fk_event_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "fk_event_organizer" FOREIGN KEY ("organizer_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "fk_event_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "fk_events_user" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "event_funds" ADD CONSTRAINT "event_funds_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_funds" ADD CONSTRAINT "event_funds_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "fund_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_funds" ADD CONSTRAINT "fk_event_fund_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fund_transactions" ADD CONSTRAINT "fk_fund_trans_user" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "fund_transactions" ADD CONSTRAINT "fk_fund_trs_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fund_transactions" ADD CONSTRAINT "fk_transaction_fund" FOREIGN KEY ("fund_id") REFERENCES "funds"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "fund_transactions" ADD CONSTRAINT "fk_transaction_member" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "funds" ADD CONSTRAINT "fk_funds_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funds" ADD CONSTRAINT "fk_funds_user" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "graves" ADD CONSTRAINT "fk_grave_address" FOREIGN KEY ("grave_address_id") REFERENCES "addresses"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "graves" ADD CONSTRAINT "fk_grave_cemetery" FOREIGN KEY ("cemetery_id") REFERENCES "cemetery"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "graves" ADD CONSTRAINT "fk_grave_member" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "graves" ADD CONSTRAINT "fk_graves_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graves" ADD CONSTRAINT "fk_graves_user" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "marriages" ADD CONSTRAINT "fk_marriage_husband" FOREIGN KEY ("husband_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "marriages" ADD CONSTRAINT "fk_marriage_wife" FOREIGN KEY ("wife_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "marriages" ADD CONSTRAINT "fk_marriages_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marriages" ADD CONSTRAINT "fk_marriages_user" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "fk_media_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "fk_media_user" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "fk_member_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "fk_member_current_addr" FOREIGN KEY ("current_address_id") REFERENCES "addresses"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "fk_member_father" FOREIGN KEY ("father_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "fk_member_mother" FOREIGN KEY ("mother_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "fk_member_origin_addr" FOREIGN KEY ("origin_address_id") REFERENCES "addresses"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "fk_members_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "fk_members_user" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "fk_user_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "fk_user_member" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "fk_users_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "fk_users_user" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cemetery" ADD CONSTRAINT "fk_cemetery_address" FOREIGN KEY ("address_id") REFERENCES "addresses"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cemetery" ADD CONSTRAINT "fk_cemetery_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cemetery" ADD CONSTRAINT "fk_cemetery_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worships" ADD CONSTRAINT "fk_worship_address" FOREIGN KEY ("address_id") REFERENCES "addresses"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "worships" ADD CONSTRAINT "fk_worship_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "worships" ADD CONSTRAINT "fk_worship_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "fk_notifications_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "fk_tenants_notifications" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_messages" ADD CONSTRAINT "fk_im_changed_by" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "inbound_messages" ADD CONSTRAINT "fk_im_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "inbound_messages" ADD CONSTRAINT "fk_im_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "fk_nd_changed_by" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "fk_nd_handled_by" FOREIGN KEY ("handled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "fk_nd_notification" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "fk_nd_recipient" FOREIGN KEY ("notification_recipient_id") REFERENCES "notification_recipients"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tenant_communication_providers" ADD CONSTRAINT "fk_tcp_changed_by" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tenant_communication_providers" ADD CONSTRAINT "fk_tcp_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_contact_preferences" ADD CONSTRAINT "fk_ucp_changed_by" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_contact_preferences" ADD CONSTRAINT "fk_ucp_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "web_push_subscriptions" ADD CONSTRAINT "fk_wps_changed_by" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "web_push_subscriptions" ADD CONSTRAINT "fk_wps_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "password_reset_sessions" ADD CONSTRAINT "fk_prs_changed_by" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "password_reset_sessions" ADD CONSTRAINT "fk_prs_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "communication_bindings" ADD CONSTRAINT "fk_cb_changed_by" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "communication_bindings" ADD CONSTRAINT "fk_cb_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notification_recipients" ADD CONSTRAINT "fk_nr_changed_by" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notification_recipients" ADD CONSTRAINT "fk_nr_notification" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notification_recipients" ADD CONSTRAINT "fk_nr_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tenant_social_spaces" ADD CONSTRAINT "tenant_social_spaces_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "business_process_logs" ADD CONSTRAINT "fk_process_log_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

