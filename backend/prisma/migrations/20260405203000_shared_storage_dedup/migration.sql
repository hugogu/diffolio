-- CreateEnum
CREATE TYPE "ConfigOwnerType" AS ENUM ('SYSTEM', 'USER');

-- CreateEnum
CREATE TYPE "ParseArtifactStatus" AS ENUM ('BUILDING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "MigrationKind" AS ENUM ('FILES', 'CONFIGS', 'ARTIFACTS', 'LINKS');

-- CreateEnum
CREATE TYPE "MigrationStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "format_configs"
ADD COLUMN     "config_profile_id" TEXT,
ADD COLUMN     "config_version_id" TEXT,
ADD COLUMN     "content_hash" TEXT;

-- AlterTable
ALTER TABLE "parse_tasks"
ADD COLUMN     "shared_file_asset_id" TEXT,
ADD COLUMN     "parse_artifact_id" TEXT,
ADD COLUMN     "content_hash" TEXT,
ADD COLUMN     "cache_hit" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "shared_file_assets" (
    "id" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "hash_algorithm" TEXT NOT NULL,
    "file_type" "FileType" NOT NULL,
    "original_extension" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "file_size" BIGINT NOT NULL,
    "created_by_task_id" TEXT,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_referenced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shared_file_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "version_file_references" (
    "id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "shared_file_asset_id" TEXT NOT NULL,
    "original_file_name" TEXT NOT NULL,
    "uploaded_by_user_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "detached_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "version_file_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config_profiles" (
    "id" TEXT NOT NULL,
    "owner_type" "ConfigOwnerType" NOT NULL,
    "owner_user_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "visibility" "ConfigVisibility",
    "created_by" TEXT NOT NULL,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "config_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config_versions" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "config_json" JSONB NOT NULL,
    "validation_status" "ConfigStatus" NOT NULL,
    "validation_report" JSONB,
    "content_hash" TEXT NOT NULL,
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "config_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shared_parse_artifacts" (
    "id" TEXT NOT NULL,
    "shared_file_asset_id" TEXT NOT NULL,
    "config_version_id" TEXT NOT NULL,
    "parser_fingerprint" TEXT NOT NULL,
    "status" "ParseArtifactStatus" NOT NULL,
    "total_entries" INTEGER NOT NULL DEFAULT 0,
    "failed_entries" INTEGER NOT NULL DEFAULT 0,
    "built_from_task_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "shared_parse_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parse_artifact_references" (
    "id" TEXT NOT NULL,
    "parse_artifact_id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "parse_task_id" TEXT,
    "user_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "detached_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parse_artifact_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artifact_entries" (
    "id" TEXT NOT NULL,
    "parse_artifact_id" TEXT NOT NULL,
    "raw_headword" TEXT NOT NULL,
    "normalized_headword" TEXT NOT NULL,
    "entry_sequence" INTEGER,
    "phonetic" TEXT,
    "page_number" INTEGER,
    "line_number" INTEGER,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "artifact_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artifact_senses" (
    "id" TEXT NOT NULL,
    "artifact_entry_id" TEXT NOT NULL,
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

    CONSTRAINT "artifact_senses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artifact_examples" (
    "id" TEXT NOT NULL,
    "artifact_sense_id" TEXT NOT NULL,
    "raw_text" TEXT NOT NULL,
    "normalized_text" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artifact_examples_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migration_batches" (
    "id" TEXT NOT NULL,
    "kind" "MigrationKind" NOT NULL,
    "status" "MigrationStatus" NOT NULL,
    "cursor" JSONB,
    "processed_count" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "notes" JSONB,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "migration_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shared_file_assets_content_hash_key" ON "shared_file_assets"("content_hash");

-- CreateIndex
CREATE INDEX "shared_file_assets_file_type_last_referenced_at_idx" ON "shared_file_assets"("file_type", "last_referenced_at");

-- CreateIndex
CREATE INDEX "version_file_references_version_id_is_active_idx" ON "version_file_references"("version_id", "is_active");

-- CreateIndex
CREATE INDEX "version_file_references_shared_file_asset_id_is_active_idx" ON "version_file_references"("shared_file_asset_id", "is_active");

-- CreateIndex
CREATE INDEX "version_file_references_uploaded_by_user_id_idx" ON "version_file_references"("uploaded_by_user_id");

-- CreateIndex
CREATE INDEX "config_profiles_owner_type_owner_user_id_idx" ON "config_profiles"("owner_type", "owner_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "config_versions_profile_id_version_number_key" ON "config_versions"("profile_id", "version_number");

-- CreateIndex
CREATE INDEX "config_versions_profile_id_is_current_idx" ON "config_versions"("profile_id", "is_current");

-- CreateIndex
CREATE INDEX "config_versions_content_hash_idx" ON "config_versions"("content_hash");

-- CreateIndex
CREATE UNIQUE INDEX "shared_parse_artifacts_shared_file_asset_id_config_version_id_parser_fingerprint_key"
ON "shared_parse_artifacts"("shared_file_asset_id", "config_version_id", "parser_fingerprint");

-- CreateIndex
CREATE INDEX "parse_artifact_references_version_id_is_active_idx" ON "parse_artifact_references"("version_id", "is_active");

-- CreateIndex
CREATE INDEX "parse_artifact_references_parse_artifact_id_is_active_idx" ON "parse_artifact_references"("parse_artifact_id", "is_active");

-- CreateIndex
CREATE INDEX "parse_artifact_references_user_id_is_active_idx" ON "parse_artifact_references"("user_id", "is_active");

-- CreateIndex
CREATE INDEX "artifact_entries_parse_artifact_id_normalized_headword_idx" ON "artifact_entries"("parse_artifact_id", "normalized_headword");

-- CreateIndex
CREATE INDEX "artifact_senses_artifact_entry_id_idx" ON "artifact_senses"("artifact_entry_id");

-- CreateIndex
CREATE INDEX "artifact_examples_artifact_sense_id_idx" ON "artifact_examples"("artifact_sense_id");

-- CreateIndex
CREATE UNIQUE INDEX "version_file_references_version_single_active_idx"
ON "version_file_references"("version_id")
WHERE "is_active" = true;

-- CreateIndex
CREATE UNIQUE INDEX "config_versions_profile_single_current_idx"
ON "config_versions"("profile_id")
WHERE "is_current" = true;

-- CreateIndex
CREATE UNIQUE INDEX "parse_artifact_references_version_single_active_idx"
ON "parse_artifact_references"("version_id")
WHERE "is_active" = true;

-- AddForeignKey
ALTER TABLE "format_configs" ADD CONSTRAINT "format_configs_config_profile_id_fkey" FOREIGN KEY ("config_profile_id") REFERENCES "config_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "format_configs" ADD CONSTRAINT "format_configs_config_version_id_fkey" FOREIGN KEY ("config_version_id") REFERENCES "config_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_file_assets" ADD CONSTRAINT "shared_file_assets_created_by_task_id_fkey" FOREIGN KEY ("created_by_task_id") REFERENCES "parse_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "version_file_references" ADD CONSTRAINT "version_file_references_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "dictionary_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "version_file_references" ADD CONSTRAINT "version_file_references_shared_file_asset_id_fkey" FOREIGN KEY ("shared_file_asset_id") REFERENCES "shared_file_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "version_file_references" ADD CONSTRAINT "version_file_references_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_profiles" ADD CONSTRAINT "config_profiles_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_profiles" ADD CONSTRAINT "config_profiles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_versions" ADD CONSTRAINT "config_versions_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "config_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_versions" ADD CONSTRAINT "config_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_parse_artifacts" ADD CONSTRAINT "shared_parse_artifacts_shared_file_asset_id_fkey" FOREIGN KEY ("shared_file_asset_id") REFERENCES "shared_file_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_parse_artifacts" ADD CONSTRAINT "shared_parse_artifacts_config_version_id_fkey" FOREIGN KEY ("config_version_id") REFERENCES "config_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_parse_artifacts" ADD CONSTRAINT "shared_parse_artifacts_built_from_task_id_fkey" FOREIGN KEY ("built_from_task_id") REFERENCES "parse_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parse_artifact_references" ADD CONSTRAINT "parse_artifact_references_parse_artifact_id_fkey" FOREIGN KEY ("parse_artifact_id") REFERENCES "shared_parse_artifacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parse_artifact_references" ADD CONSTRAINT "parse_artifact_references_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "dictionary_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parse_artifact_references" ADD CONSTRAINT "parse_artifact_references_parse_task_id_fkey" FOREIGN KEY ("parse_task_id") REFERENCES "parse_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parse_artifact_references" ADD CONSTRAINT "parse_artifact_references_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifact_entries" ADD CONSTRAINT "artifact_entries_parse_artifact_id_fkey" FOREIGN KEY ("parse_artifact_id") REFERENCES "shared_parse_artifacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifact_senses" ADD CONSTRAINT "artifact_senses_artifact_entry_id_fkey" FOREIGN KEY ("artifact_entry_id") REFERENCES "artifact_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifact_examples" ADD CONSTRAINT "artifact_examples_artifact_sense_id_fkey" FOREIGN KEY ("artifact_sense_id") REFERENCES "artifact_senses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parse_tasks" ADD CONSTRAINT "parse_tasks_shared_file_asset_id_fkey" FOREIGN KEY ("shared_file_asset_id") REFERENCES "shared_file_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parse_tasks" ADD CONSTRAINT "parse_tasks_parse_artifact_id_fkey" FOREIGN KEY ("parse_artifact_id") REFERENCES "shared_parse_artifacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
