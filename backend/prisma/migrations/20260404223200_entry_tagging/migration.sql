-- CreateTable
CREATE TABLE "entry_tags" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entry_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entry_tag_assignments" (
    "id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entry_tag_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "entry_tags_user_id_name_idx" ON "entry_tags"("user_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "entry_tags_user_id_normalized_name_key" ON "entry_tags"("user_id", "normalized_name");

-- CreateIndex
CREATE INDEX "entry_tag_assignments_entry_id_idx" ON "entry_tag_assignments"("entry_id");

-- CreateIndex
CREATE INDEX "entry_tag_assignments_tag_id_idx" ON "entry_tag_assignments"("tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "entry_tag_assignments_tag_id_entry_id_key" ON "entry_tag_assignments"("tag_id", "entry_id");

-- AddForeignKey
ALTER TABLE "entry_tags" ADD CONSTRAINT "entry_tags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_tag_assignments" ADD CONSTRAINT "entry_tag_assignments_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "entry_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_tag_assignments" ADD CONSTRAINT "entry_tag_assignments_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

