-- CreateEnum
CREATE TYPE "ConfigVisibility" AS ENUM ('ALL_USERS', 'SPECIFIC_USERS');

-- CreateEnum
CREATE TYPE "ConfigSourceType" AS ENUM ('SYSTEM', 'USER');

-- AlterTable
ALTER TABLE "format_configs" ADD COLUMN     "source_config_id" TEXT,
ADD COLUMN     "source_config_type" "ConfigSourceType";

-- CreateTable
CREATE TABLE "system_format_configs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "config_json" JSONB NOT NULL,
    "validation_status" "ConfigStatus" NOT NULL DEFAULT 'PENDING',
    "validation_report" JSONB,
    "visibility" "ConfigVisibility" NOT NULL DEFAULT 'ALL_USERS',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_format_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_config_visibility" (
    "id" TEXT NOT NULL,
    "system_config_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_config_visibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_format_configs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "config_json" JSONB NOT NULL,
    "validation_status" "ConfigStatus" NOT NULL DEFAULT 'PENDING',
    "validation_report" JSONB,
    "cloned_from_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_format_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "system_format_configs_visibility_idx" ON "system_format_configs"("visibility");

-- CreateIndex
CREATE INDEX "system_format_configs_created_by_idx" ON "system_format_configs"("created_by");

-- CreateIndex
CREATE INDEX "system_config_visibility_user_id_idx" ON "system_config_visibility"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "system_config_visibility_system_config_id_user_id_key" ON "system_config_visibility"("system_config_id", "user_id");

-- CreateIndex
CREATE INDEX "user_format_configs_user_id_idx" ON "user_format_configs"("user_id");

-- AddForeignKey
ALTER TABLE "system_format_configs" ADD CONSTRAINT "system_format_configs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_config_visibility" ADD CONSTRAINT "system_config_visibility_system_config_id_fkey" FOREIGN KEY ("system_config_id") REFERENCES "system_format_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_config_visibility" ADD CONSTRAINT "system_config_visibility_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_format_configs" ADD CONSTRAINT "user_format_configs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
