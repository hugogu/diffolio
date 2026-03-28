-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'REGULAR', 'SUBSCRIBED', 'READER');

-- CreateEnum
CREATE TYPE "ConfigStatus" AS ENUM ('PENDING', 'VALID', 'INVALID');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FileType" AS ENUM ('TXT', 'DOC', 'DOCX', 'PDF');

-- CreateEnum
CREATE TYPE "ErrorStatus" AS ENUM ('PENDING', 'CORRECTED', 'COMMITTED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "CompStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ChangeType" AS ENUM ('MATCHED', 'ADDED', 'DELETED', 'MATCHED_VARIANT');

-- CreateEnum
CREATE TYPE "SenseChangeType" AS ENUM ('MATCHED', 'DEFINITION_CHANGED', 'POS_CHANGED', 'EXAMPLE_CHANGED', 'RENUMBERED', 'SPLIT', 'MERGED', 'ADDED', 'DELETED');

-- CreateEnum
CREATE TYPE "ExportFormat" AS ENUM ('EXCEL');

-- CreateEnum
CREATE TYPE "TaxonomySourceStatus" AS ENUM ('PENDING', 'IMPORTING', 'ACTIVE', 'FAILED');

-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('BASIC', 'ADVANCED', 'PREMIUM', 'ELITE');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'GRACE', 'EXPIRED');

-- CreateEnum
CREATE TYPE "EnergyEventType" AS ENUM ('MONTHLY_RESET', 'WORD_UNLOCK', 'BULK_UNLOCK', 'TOPUP_CREDIT', 'ADMIN_CREDIT', 'UPLOAD_DEDUCTION', 'PARSE_DEDUCTION', 'COMPARE_DEDUCTION');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT,
    "email" TEXT NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "verification_token" TEXT,
    "verification_token_expiry" TIMESTAMP(3),
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'REGULAR',
    "export_enabled" BOOLEAN NOT NULL DEFAULT false,
    "max_versions" INTEGER NOT NULL DEFAULT 2,
    "max_books" INTEGER NOT NULL DEFAULT 1,
    "can_edit_builtin_configs" BOOLEAN NOT NULL DEFAULT false,
    "watermark_enabled" BOOLEAN NOT NULL DEFAULT true,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "agreed_to_terms" BOOLEAN NOT NULL DEFAULT false,
    "terms_agreed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "dictionaries" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "publisher" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'zh',
    "encoding_scheme" TEXT NOT NULL,
    "description" TEXT,
    "user_id" TEXT,
    "last_accessed_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dictionaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dictionary_versions" (
    "id" TEXT NOT NULL,
    "dictionary_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "published_year" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dictionary_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "format_configs" (
    "id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "parent_config_id" TEXT,
    "name" TEXT NOT NULL,
    "config_json" JSONB NOT NULL,
    "validation_status" "ConfigStatus" NOT NULL DEFAULT 'PENDING',
    "validation_report" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "format_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parse_tasks" (
    "id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "bullmq_job_id" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "file_type" "FileType" NOT NULL,
    "original_file_name" TEXT NOT NULL,
    "stored_file_path" TEXT NOT NULL,
    "total_pages" INTEGER,
    "total_entries" INTEGER,
    "processed_pages" INTEGER NOT NULL DEFAULT 0,
    "processed_entries" INTEGER NOT NULL DEFAULT 0,
    "failed_entries" INTEGER NOT NULL DEFAULT 0,
    "checkpoint_offset" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parse_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parse_errors" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "page_number" INTEGER,
    "line_number" INTEGER,
    "raw_text" TEXT NOT NULL,
    "field_name" TEXT NOT NULL,
    "error_code" TEXT NOT NULL,
    "error_detail" TEXT NOT NULL,
    "status" "ErrorStatus" NOT NULL DEFAULT 'PENDING',
    "corrected_text" TEXT,
    "corrected_by" TEXT,
    "corrected_at" TIMESTAMP(3),
    "retried_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parse_errors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entries" (
    "id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "task_id" TEXT,
    "raw_headword" TEXT NOT NULL,
    "normalized_headword" TEXT NOT NULL,
    "entry_sequence" INTEGER,
    "phonetic" TEXT,
    "page_number" INTEGER,
    "line_number" INTEGER,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "senses" (
    "id" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "raw_number" TEXT NOT NULL,
    "normalized_number" TEXT NOT NULL,
    "definition" TEXT NOT NULL,
    "raw_definition" TEXT NOT NULL,
    "phonetic" TEXT,
    "grammatical_cat" TEXT,
    "register" TEXT,
    "etymology" TEXT,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "senses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "examples" (
    "id" TEXT NOT NULL,
    "sense_id" TEXT NOT NULL,
    "raw_text" TEXT NOT NULL,
    "normalized_text" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "examples_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comparisons" (
    "id" TEXT NOT NULL,
    "version_a_id" TEXT NOT NULL,
    "version_b_id" TEXT NOT NULL,
    "status" "CompStatus" NOT NULL DEFAULT 'PENDING',
    "total_a" INTEGER,
    "total_b" INTEGER,
    "matched" INTEGER,
    "added_in_b" INTEGER,
    "deleted_from_a" INTEGER,
    "bullmq_job_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "comparisons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entry_alignments" (
    "id" TEXT NOT NULL,
    "comparison_id" TEXT NOT NULL,
    "entry_a_id" TEXT,
    "entry_b_id" TEXT,
    "change_type" "ChangeType" NOT NULL,
    "align_score" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entry_alignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sense_diffs" (
    "id" TEXT NOT NULL,
    "alignment_id" TEXT NOT NULL,
    "sense_a_id" TEXT,
    "sense_b_id" TEXT,
    "change_type" "SenseChangeType" NOT NULL,
    "diff_summary" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sense_diffs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_jobs" (
    "id" TEXT NOT NULL,
    "comparison_id" TEXT NOT NULL,
    "format" "ExportFormat" NOT NULL DEFAULT 'EXCEL',
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "bullmq_job_id" TEXT,
    "order_by" TEXT,
    "taxonomy_source_id" TEXT,
    "download_path" TEXT,
    "download_url" TEXT,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "export_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "taxonomy_sources" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source_file_path" TEXT,
    "config_json" JSONB NOT NULL,
    "status" "TaxonomySourceStatus" NOT NULL DEFAULT 'PENDING',
    "total_entries" INTEGER,
    "user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "taxonomy_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "taxonomy_import_tasks" (
    "id" TEXT NOT NULL,
    "taxonomy_source_id" TEXT NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "processed_lines" INTEGER NOT NULL DEFAULT 0,
    "failed_lines" INTEGER NOT NULL DEFAULT 0,
    "checkpoint_offset" INTEGER NOT NULL DEFAULT 0,
    "error_log" JSONB,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "taxonomy_import_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "taxonomy_nodes" (
    "id" TEXT NOT NULL,
    "taxonomy_source_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "level" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "sequence_position" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "taxonomy_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "taxonomy_entries" (
    "id" TEXT NOT NULL,
    "node_id" TEXT NOT NULL,
    "taxonomy_source_id" TEXT NOT NULL,
    "headword" TEXT NOT NULL,
    "normalized_headword" TEXT NOT NULL,
    "sequence_position" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "taxonomy_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tier" "SubscriptionTier" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "monthly_energy_alloc" INTEGER NOT NULL,
    "slot_count" INTEGER NOT NULL,
    "grace_period_started_at" TIMESTAMP(3),
    "warning_email_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "energy_balances" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "monthly_remaining" INTEGER NOT NULL DEFAULT 0,
    "purchased_remaining" INTEGER NOT NULL DEFAULT 0,
    "frozen_purchased_remaining" INTEGER NOT NULL DEFAULT 0,
    "lifetime_used" INTEGER NOT NULL DEFAULT 0,
    "last_monthly_reset_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "energy_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "energy_events" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "event_type" "EnergyEventType" NOT NULL,
    "description" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reference_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "energy_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "word_unlocks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "dictionary_id" TEXT NOT NULL,
    "normalized_headword" TEXT NOT NULL,
    "unlocked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "word_unlocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" TEXT NOT NULL,
    "tier" "SubscriptionTier" NOT NULL,
    "monthly_energy_alloc" INTEGER NOT NULL,
    "slot_count" INTEGER NOT NULL,
    "price_yuan" DECIMAL(10,2) NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_qr_configs" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "qr_image_path" TEXT NOT NULL DEFAULT '',
    "instruction_text" TEXT NOT NULL DEFAULT '',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_qr_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "dictionaries_name_key" ON "dictionaries"("name");

-- CreateIndex
CREATE UNIQUE INDEX "dictionary_versions_dictionary_id_label_key" ON "dictionary_versions"("dictionary_id", "label");

-- CreateIndex
CREATE UNIQUE INDEX "format_configs_version_id_key" ON "format_configs"("version_id");

-- CreateIndex
CREATE UNIQUE INDEX "parse_tasks_bullmq_job_id_key" ON "parse_tasks"("bullmq_job_id");

-- CreateIndex
CREATE INDEX "entries_version_id_normalized_headword_idx" ON "entries"("version_id", "normalized_headword");

-- CreateIndex
CREATE INDEX "senses_entry_id_idx" ON "senses"("entry_id");

-- CreateIndex
CREATE INDEX "examples_sense_id_idx" ON "examples"("sense_id");

-- CreateIndex
CREATE UNIQUE INDEX "comparisons_version_a_id_version_b_id_key" ON "comparisons"("version_a_id", "version_b_id");

-- CreateIndex
CREATE INDEX "entry_alignments_comparison_id_change_type_idx" ON "entry_alignments"("comparison_id", "change_type");

-- CreateIndex
CREATE INDEX "entry_alignments_entry_a_id_idx" ON "entry_alignments"("entry_a_id");

-- CreateIndex
CREATE INDEX "entry_alignments_entry_b_id_idx" ON "entry_alignments"("entry_b_id");

-- CreateIndex
CREATE INDEX "sense_diffs_alignment_id_idx" ON "sense_diffs"("alignment_id");

-- CreateIndex
CREATE INDEX "taxonomy_nodes_taxonomy_source_id_level_idx" ON "taxonomy_nodes"("taxonomy_source_id", "level");

-- CreateIndex
CREATE INDEX "taxonomy_nodes_parent_id_idx" ON "taxonomy_nodes"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "taxonomy_nodes_taxonomy_source_id_path_key" ON "taxonomy_nodes"("taxonomy_source_id", "path");

-- CreateIndex
CREATE INDEX "taxonomy_entries_taxonomy_source_id_normalized_headword_idx" ON "taxonomy_entries"("taxonomy_source_id", "normalized_headword");

-- CreateIndex
CREATE INDEX "taxonomy_entries_node_id_sequence_position_idx" ON "taxonomy_entries"("node_id", "sequence_position");

-- CreateIndex
CREATE UNIQUE INDEX "user_subscriptions_user_id_key" ON "user_subscriptions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "energy_balances_user_id_key" ON "energy_balances"("user_id");

-- CreateIndex
CREATE INDEX "energy_events_user_id_created_at_idx" ON "energy_events"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "energy_events_user_id_event_type_reference_id_idx" ON "energy_events"("user_id", "event_type", "reference_id");

-- CreateIndex
CREATE INDEX "word_unlocks_user_id_dictionary_id_idx" ON "word_unlocks"("user_id", "dictionary_id");

-- CreateIndex
CREATE UNIQUE INDEX "word_unlocks_user_id_dictionary_id_normalized_headword_key" ON "word_unlocks"("user_id", "dictionary_id", "normalized_headword");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_tier_key" ON "subscription_plans"("tier");

-- CreateIndex
CREATE UNIQUE INDEX "payment_qr_configs_channel_key" ON "payment_qr_configs"("channel");

-- AddForeignKey
ALTER TABLE "dictionaries" ADD CONSTRAINT "dictionaries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dictionary_versions" ADD CONSTRAINT "dictionary_versions_dictionary_id_fkey" FOREIGN KEY ("dictionary_id") REFERENCES "dictionaries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "format_configs" ADD CONSTRAINT "format_configs_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "dictionary_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parse_tasks" ADD CONSTRAINT "parse_tasks_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "dictionary_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parse_errors" ADD CONSTRAINT "parse_errors_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "parse_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entries" ADD CONSTRAINT "entries_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "dictionary_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "senses" ADD CONSTRAINT "senses_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examples" ADD CONSTRAINT "examples_sense_id_fkey" FOREIGN KEY ("sense_id") REFERENCES "senses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_version_a_id_fkey" FOREIGN KEY ("version_a_id") REFERENCES "dictionary_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_version_b_id_fkey" FOREIGN KEY ("version_b_id") REFERENCES "dictionary_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_alignments" ADD CONSTRAINT "entry_alignments_comparison_id_fkey" FOREIGN KEY ("comparison_id") REFERENCES "comparisons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_alignments" ADD CONSTRAINT "entry_alignments_entry_a_id_fkey" FOREIGN KEY ("entry_a_id") REFERENCES "entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_alignments" ADD CONSTRAINT "entry_alignments_entry_b_id_fkey" FOREIGN KEY ("entry_b_id") REFERENCES "entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sense_diffs" ADD CONSTRAINT "sense_diffs_alignment_id_fkey" FOREIGN KEY ("alignment_id") REFERENCES "entry_alignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_comparison_id_fkey" FOREIGN KEY ("comparison_id") REFERENCES "comparisons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taxonomy_sources" ADD CONSTRAINT "taxonomy_sources_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taxonomy_import_tasks" ADD CONSTRAINT "taxonomy_import_tasks_taxonomy_source_id_fkey" FOREIGN KEY ("taxonomy_source_id") REFERENCES "taxonomy_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taxonomy_nodes" ADD CONSTRAINT "taxonomy_nodes_taxonomy_source_id_fkey" FOREIGN KEY ("taxonomy_source_id") REFERENCES "taxonomy_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taxonomy_nodes" ADD CONSTRAINT "taxonomy_nodes_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "taxonomy_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taxonomy_entries" ADD CONSTRAINT "taxonomy_entries_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "taxonomy_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "energy_balances" ADD CONSTRAINT "energy_balances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "energy_events" ADD CONSTRAINT "energy_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "word_unlocks" ADD CONSTRAINT "word_unlocks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "word_unlocks" ADD CONSTRAINT "word_unlocks_dictionary_id_fkey" FOREIGN KEY ("dictionary_id") REFERENCES "dictionaries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

