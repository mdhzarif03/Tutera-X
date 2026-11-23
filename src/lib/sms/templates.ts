// Message templates. Keep them in GSM-7 characters where possible: one non-GSM character
// switches the whole message to UCS-2 and roughly triples the cost.

export const templates = {
  absence: "Dear Guardian, your child {student} was marked absent from {batch} on {date}. - {teacher}",
  examAnnouncement: "Dear {student}, your {exam} examination is scheduled for {date} at {time}. - {teacher}",
  resultPublished: "Dear Guardian, {student} achieved {marks} out of {total} in {exam}. - {teacher}",
  resultAbsent: "Dear Guardian, {student} was marked absent for {exam}. - {teacher}",
  studentActivation: "Dear {name}, your Tutera-X username is {username}. Set your password within 72 hours: {link}",
  parentActivation: "Dear {name}, your Tutera-X parent login is {username}. Set your password within 72 hours: {link}",
  passwordReset: "Tutera-X: reset your password within 1 hour: {link}",
} as const;

export type TemplateName = keyof typeof templates;

export function render(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ""));
}

/** Account prefix Nishchit adds in front of every message. Counted toward segments. */
export const PLATFORM_PREFIX = "Tutera-X";
