-- Adds the foreign key behind the Prisma relation SmsRecipient.student.
-- It changes no data. It stops, with a clear message, if any existing recipient points at a missing student.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM "SmsRecipient" r
     WHERE r."studentId" IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM "StudentProfile" s WHERE s."userId" = r."studentId")
  ) THEN
    RAISE EXCEPTION 'SmsRecipient rows reference students that do not exist. Correct them, then re-run this migration.';
  END IF;
END $$;

-- AddForeignKey
ALTER TABLE "SmsRecipient" ADD CONSTRAINT "SmsRecipient_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
