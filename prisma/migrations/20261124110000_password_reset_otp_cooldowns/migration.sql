ALTER TABLE "User"
  ADD COLUMN "passwordChangedAt" TIMESTAMP(3),
  ADD COLUMN "passwordResetRequestedAt" TIMESTAMP(3);

ALTER TABLE "PasswordResetToken"
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
