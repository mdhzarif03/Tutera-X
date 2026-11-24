-- Teacher invitations now target a phone number. Keep email invitations valid for links
-- already sent before this migration.
ALTER TABLE "TeacherInvitation" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "TeacherInvitation" ADD COLUMN "phoneE164" TEXT;
CREATE UNIQUE INDEX "TeacherInvitation_phoneE164_key" ON "TeacherInvitation"("phoneE164");

-- Collect optional onboarding details when an invited teacher joins.
ALTER TABLE "TeacherProfile" ADD COLUMN "subjects" TEXT;
