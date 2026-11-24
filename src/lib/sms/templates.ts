// Message templates. Keep them in GSM-7 characters where possible: one non-GSM character
// switches the whole message to UCS-2 and roughly triples the cost.

export const templates = {
  absence: "Dear Guardian, your child {student} was marked absent from {batch} on {date}. - {teacher}",
  examAnnouncement: "Dear Guardian, {student} has {exam} on {date} at {time}. - {teacher}",
  resultPublished: "Dear Guardian, {student} achieved {marks} out of {total} in {exam}. - {teacher}",
  resultAbsent: "Dear Guardian, {student} was marked absent for {exam}. - {teacher}",
  studentActivation: "Dear Guardian, {student} can now use Tutera-X. Login ID: {username}. Set a password within 72 hours: {link}",
  teacherInvitation: "Tutera-X: You have been invited to join as a teacher. Set up your profile within 72 hours: {link}",
  passwordReset: "Tutera-X: reset your password within 1 hour: {link}",
  absenceCorrection: "Dear Guardian, please ignore the absence notice for {student} on {date}. It was sent in error. - {teacher}",
  resultCorrection: "Dear Guardian, a correction: {student} got {marks} out of {total} in {exam}. - {teacher}",
} as const;

export type TemplateName = keyof typeof templates;

export function render(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ""));
}

/** Account prefix Nishchit adds in front of every message. Counted toward segments. */
export const PLATFORM_PREFIX = "Tutera-X";
