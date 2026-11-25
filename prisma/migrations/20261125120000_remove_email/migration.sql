-- Accounts sign in with a login ID or a phone number only. Email is no longer stored.
DROP INDEX IF EXISTS "User_email_key";
ALTER TABLE "User" DROP COLUMN IF EXISTS "email";
DROP INDEX IF EXISTS "TeacherInvitation_email_idx";
ALTER TABLE "TeacherInvitation" DROP COLUMN IF EXISTS "email";
