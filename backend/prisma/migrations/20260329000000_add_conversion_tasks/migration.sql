-- CreateEnum
CREATE TYPE "ConversionInputFormat" AS ENUM ('MDX');

-- CreateEnum
CREATE TYPE "ConversionOutputFormat" AS ENUM ('TXT', 'DOCX');

-- CreateEnum
CREATE TYPE "ConversionStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'EXPIRED');

-- CreateTable
CREATE TABLE "conversion_tasks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "input_format" "ConversionInputFormat" NOT NULL,
    "output_format" "ConversionOutputFormat" NOT NULL,
    "input_file_path" TEXT NOT NULL,
    "output_file_path" TEXT,
    "status" "ConversionStatus" NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "file_size" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "conversion_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversion_tasks_user_id_idx" ON "conversion_tasks"("user_id");

-- CreateIndex
CREATE INDEX "conversion_tasks_status_idx" ON "conversion_tasks"("status");

-- CreateIndex
CREATE INDEX "conversion_tasks_created_at_idx" ON "conversion_tasks"("created_at");

-- AddForeignKey
ALTER TABLE "conversion_tasks" ADD CONSTRAINT "conversion_tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
