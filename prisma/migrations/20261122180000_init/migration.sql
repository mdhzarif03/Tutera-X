CREATE TYPE "Role" AS ENUM ('TEACHER', 'STUDENT', 'PARENT');
CREATE TYPE "AccountStatus" AS ENUM ('PENDING_ACTIVATION', 'ACTIVE', 'DISABLED');
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');
CREATE TYPE "ExamStatus" AS ENUM ('SCHEDULED', 'RESULTS_DRAFT', 'RESULTS_PUBLISHED', 'CANCELLED');
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BKASH', 'NAGAD', 'BANK_TRANSFER', 'OTHER');
CREATE TYPE "SmsPurpose" AS ENUM ('ABSENCE_NOTICE', 'EXAM_ANNOUNCEMENT', 'RESULT_PUBLISHED', 'ACCOUNT_ACTIVATION', 'TEACHER_INVITATION', 'PASSWORD_RESET', 'BULK_MESSAGE', 'INDIVIDUAL_MESSAGE');
CREATE TYPE "SmsStatus" AS ENUM ('QUEUED', 'SUBMITTING', 'ACCEPTED', 'SENT', 'FAILED', 'SKIPPED', 'CANCELLED');
CREATE TYPE "SmsDeliveryStatus" AS ENUM ('UNKNOWN', 'DELIVERED', 'UNDELIVERED', 'REJECTED');
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED_RETRYABLE', 'FAILED_PERMANENT');
CREATE TYPE "TeacherRole" AS ENUM ('OWNER', 'TEACHER');
CREATE TYPE "SmsAllowanceKind" AS ENUM ('GRANT', 'ADJUST', 'CONSUME', 'RELEASE', 'OVERAGE');

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "email" TEXT,
    "username" TEXT,
    "phoneE164" TEXT,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TeacherProfile" (
    "userId" TEXT NOT NULL,
    "role" "TeacherRole" NOT NULL DEFAULT 'TEACHER',
    "institutionName" TEXT,
    "absenceSmsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "smsAllowance" INTEGER NOT NULL DEFAULT 0,
    "smsCreditsUsed" INTEGER NOT NULL DEFAULT 0,
    "smsCreditsReserved" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeacherProfile_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "TeacherInvitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeacherInvitation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "csrfSecret" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudentActivation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudentActivation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudentProfile" (
    "userId" TEXT NOT NULL,
    "className" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "monthlyFee" DECIMAL(12,2) NOT NULL,
    "guardianId" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StudentProfile_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "Guardian" (
    "id" TEXT NOT NULL,
    "phoneE164" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Guardian_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ParentProfile" (
    "userId" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ParentProfile_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "TeacherStudent" (
    "teacherId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeacherStudent_pkey" PRIMARY KEY ("teacherId", "studentId")
);

CREATE TABLE "Batch" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "className" TEXT NOT NULL,
    "subject" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BatchStudent" (
    "batchId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    CONSTRAINT "BatchStudent_pkey" PRIMARY KEY ("batchId", "studentId")
);

CREATE TABLE "Schedule" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "room" TEXT,
    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "markedById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AttendanceChangeLog" (
    "id" TEXT NOT NULL,
    "attendanceId" TEXT NOT NULL,
    "previousStatus" "AttendanceStatus" NOT NULL,
    "newStatus" "AttendanceStatus" NOT NULL,
    "changedById" TEXT NOT NULL,
    "reason" TEXT,
    "absenceNoticeSent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AttendanceChangeLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Exam" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "examDate" DATE NOT NULL,
    "examTime" TEXT NOT NULL,
    "totalMarks" DECIMAL(7,2) NOT NULL,
    "passMarks" DECIMAL(7,2),
    "instructions" TEXT,
    "status" "ExamStatus" NOT NULL DEFAULT 'SCHEDULED',
    "resultsPublishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Exam_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExamBatch" (
    "examId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    CONSTRAINT "ExamBatch_pkey" PRIMARY KEY ("examId", "batchId")
);

CREATE TABLE "ExamResult" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "obtainedMarks" DECIMAL(7,2) NOT NULL,
    "isAbsent" BOOLEAN NOT NULL DEFAULT false,
    "totalMarksSnapshot" DECIMAL(7,2) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "enteredById" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExamResult_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExamResultRevision" (
    "id" TEXT NOT NULL,
    "examResultId" TEXT NOT NULL,
    "previousMarks" DECIMAL(7,2) NOT NULL,
    "newMarks" DECIMAL(7,2) NOT NULL,
    "changedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExamResultRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeeCharge" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "amountDue" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeeCharge_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "paidOn" DATE NOT NULL,
    "forPeriod" TEXT,
    "recordedById" TEXT NOT NULL,
    "note" TEXT,
    "reversedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentAdjustment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SmsMessage" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT,
    "purpose" "SmsPurpose" NOT NULL,
    "templateKey" TEXT,
    "body" TEXT NOT NULL,
    "encoding" TEXT,
    "segmentsEstimate" INTEGER,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SmsMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SmsRecipient" (
    "id" TEXT NOT NULL,
    "smsMessageId" TEXT NOT NULL,
    "phoneE164" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "studentId" TEXT,
    "status" "SmsStatus" NOT NULL DEFAULT 'QUEUED',
    "deliveryStatus" "SmsDeliveryStatus" NOT NULL DEFAULT 'UNKNOWN',
    "nishchitMessageId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "segments" INTEGER,
    "credits" INTEGER,
    "reservedCredits" INTEGER NOT NULL DEFAULT 0,
    "skipReason" TEXT,
    "lastErrorCode" TEXT,
    "lastRequestId" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SmsRecipient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SmsDeliveryAttempt" (
    "id" TEXT NOT NULL,
    "smsRecipientId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "httpStatus" INTEGER,
    "errorCode" TEXT,
    "retryable" BOOLEAN,
    "requestId" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SmsDeliveryAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SmsBalanceSnapshot" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "credits" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "nishchitAsOf" TIMESTAMP(3) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "apiStatus" TEXT NOT NULL,
    CONSTRAINT "SmsBalanceSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationJob" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "dedupeKey" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 30,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NotificationJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "changes" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SmsAllowanceEntry" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "kind" "SmsAllowanceKind" NOT NULL,
    "credits" INTEGER NOT NULL,
    "smsRecipientId" TEXT,
    "actorId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SmsAllowanceEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_phoneE164_key" ON "User"("phoneE164");
CREATE UNIQUE INDEX "TeacherInvitation_tokenHash_key" ON "TeacherInvitation"("tokenHash");
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE UNIQUE INDEX "StudentActivation_tokenHash_key" ON "StudentActivation"("tokenHash");
CREATE UNIQUE INDEX "Guardian_phoneE164_key" ON "Guardian"("phoneE164");
CREATE UNIQUE INDEX "ParentProfile_guardianId_key" ON "ParentProfile"("guardianId");
CREATE UNIQUE INDEX "Batch_teacherId_name_key" ON "Batch"("teacherId", "name");
CREATE UNIQUE INDEX "Attendance_batchId_studentId_date_key" ON "Attendance"("batchId", "studentId", "date");
CREATE UNIQUE INDEX "ExamResult_examId_studentId_key" ON "ExamResult"("examId", "studentId");
CREATE UNIQUE INDEX "FeeCharge_studentId_period_key" ON "FeeCharge"("studentId", "period");
CREATE UNIQUE INDEX "Payment_reversedById_key" ON "Payment"("reversedById");
CREATE UNIQUE INDEX "SmsMessage_dedupeKey_key" ON "SmsMessage"("dedupeKey");
CREATE UNIQUE INDEX "SmsRecipient_nishchitMessageId_key" ON "SmsRecipient"("nishchitMessageId");
CREATE UNIQUE INDEX "SmsRecipient_idempotencyKey_key" ON "SmsRecipient"("idempotencyKey");
CREATE UNIQUE INDEX "SmsDeliveryAttempt_smsRecipientId_attemptNumber_key" ON "SmsDeliveryAttempt"("smsRecipientId", "attemptNumber");
CREATE UNIQUE INDEX "NotificationJob_dedupeKey_key" ON "NotificationJob"("dedupeKey");

CREATE INDEX "User_role_status_idx" ON "User"("role", "status");
CREATE INDEX "TeacherInvitation_email_idx" ON "TeacherInvitation"("email");
CREATE INDEX "TeacherInvitation_expiresAt_idx" ON "TeacherInvitation"("expiresAt");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");
CREATE INDEX "StudentActivation_userId_idx" ON "StudentActivation"("userId");
CREATE INDEX "StudentProfile_guardianId_idx" ON "StudentProfile"("guardianId");
CREATE INDEX "StudentProfile_archivedAt_idx" ON "StudentProfile"("archivedAt");
CREATE INDEX "TeacherStudent_studentId_idx" ON "TeacherStudent"("studentId");
CREATE INDEX "Batch_teacherId_archivedAt_idx" ON "Batch"("teacherId", "archivedAt");
CREATE INDEX "BatchStudent_studentId_idx" ON "BatchStudent"("studentId");
CREATE INDEX "Schedule_batchId_idx" ON "Schedule"("batchId");
CREATE INDEX "Attendance_studentId_date_idx" ON "Attendance"("studentId", "date");
CREATE INDEX "Attendance_batchId_date_idx" ON "Attendance"("batchId", "date");
CREATE INDEX "AttendanceChangeLog_attendanceId_idx" ON "AttendanceChangeLog"("attendanceId");
CREATE INDEX "Exam_teacherId_examDate_idx" ON "Exam"("teacherId", "examDate");
CREATE INDEX "Exam_status_idx" ON "Exam"("status");
CREATE INDEX "ExamBatch_batchId_idx" ON "ExamBatch"("batchId");
CREATE INDEX "ExamResult_studentId_publishedAt_idx" ON "ExamResult"("studentId", "publishedAt");
CREATE INDEX "ExamResultRevision_examResultId_idx" ON "ExamResultRevision"("examResultId");
CREATE INDEX "FeeCharge_studentId_idx" ON "FeeCharge"("studentId");
CREATE INDEX "Payment_studentId_paidOn_idx" ON "Payment"("studentId", "paidOn");
CREATE INDEX "PaymentAdjustment_studentId_idx" ON "PaymentAdjustment"("studentId");
CREATE INDEX "SmsMessage_teacherId_createdAt_idx" ON "SmsMessage"("teacherId", "createdAt");
CREATE INDEX "SmsRecipient_smsMessageId_idx" ON "SmsRecipient"("smsMessageId");
CREATE INDEX "SmsRecipient_status_createdAt_idx" ON "SmsRecipient"("status", "createdAt");
CREATE INDEX "SmsRecipient_studentId_idx" ON "SmsRecipient"("studentId");
CREATE INDEX "NotificationJob_status_runAfter_idx" ON "NotificationJob"("status", "runAfter");
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX "SmsAllowanceEntry_teacherId_createdAt_idx" ON "SmsAllowanceEntry"("teacherId", "createdAt");

ALTER TABLE "TeacherProfile" ADD CONSTRAINT "TeacherProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TeacherInvitation" ADD CONSTRAINT "TeacherInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "TeacherProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentActivation" ADD CONSTRAINT "StudentActivation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "Guardian"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ParentProfile" ADD CONSTRAINT "ParentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ParentProfile" ADD CONSTRAINT "ParentProfile_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "Guardian"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TeacherStudent" ADD CONSTRAINT "TeacherStudent_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "TeacherProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TeacherStudent" ADD CONSTRAINT "TeacherStudent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "TeacherProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BatchStudent" ADD CONSTRAINT "BatchStudent_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BatchStudent" ADD CONSTRAINT "BatchStudent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceChangeLog" ADD CONSTRAINT "AttendanceChangeLog_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "TeacherProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExamBatch" ADD CONSTRAINT "ExamBatch_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExamBatch" ADD CONSTRAINT "ExamBatch_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExamResult" ADD CONSTRAINT "ExamResult_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExamResult" ADD CONSTRAINT "ExamResult_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExamResultRevision" ADD CONSTRAINT "ExamResultRevision_examResultId_fkey" FOREIGN KEY ("examResultId") REFERENCES "ExamResult"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FeeCharge" ADD CONSTRAINT "FeeCharge_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "TeacherProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentAdjustment" ADD CONSTRAINT "PaymentAdjustment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "TeacherProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SmsRecipient" ADD CONSTRAINT "SmsRecipient_smsMessageId_fkey" FOREIGN KEY ("smsMessageId") REFERENCES "SmsMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SmsDeliveryAttempt" ADD CONSTRAINT "SmsDeliveryAttempt_smsRecipientId_fkey" FOREIGN KEY ("smsRecipientId") REFERENCES "SmsRecipient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SmsAllowanceEntry" ADD CONSTRAINT "SmsAllowanceEntry_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "TeacherProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
