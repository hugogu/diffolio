ALTER TABLE "users"
ADD COLUMN "reset_password_token" TEXT,
ADD COLUMN "reset_password_token_expiry" TIMESTAMP(3);

CREATE UNIQUE INDEX "users_reset_password_token_key" ON "users"("reset_password_token");
