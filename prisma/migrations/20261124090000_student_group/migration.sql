-- Adds the student group (Science, Commerce, Humanities) used for Class 9 to 12.
-- Nullable and additive: existing rows are unchanged.
ALTER TABLE "StudentProfile" ADD COLUMN "studentGroup" TEXT;
