// The choices offered when adding or editing a student. Change the lists here only.
export const CLASS_OPTIONS = ["Class 6", "Class 7", "Class 8", "Class 9", "Class 10", "Class 11", "Class 12"] as const;
export const VERSION_OPTIONS = ["English Version", "English Medium", "Bangla Version"] as const;
export const GROUP_OPTIONS = ["Science", "Commerce", "Humanities"] as const;

const GROUP_CLASSES: readonly string[] = ["Class 9", "Class 10", "Class 11", "Class 12"];

/** A group is asked for only in Class 9 to 12. */
export function needsGroup(className: string): boolean {
  return GROUP_CLASSES.includes(className);
}

export interface ClassFields {
  className: string;
  version: string;
  studentGroup: string | null;
}

/**
 * Checks the class, medium and group together. Returns the values to store, or throws a plain
 * message naming what to fix. A group is stored only for Class 9 to 12.
 */
export function checkClassFields(raw: { className: string; version: string; studentGroup: string }): ClassFields {
  const className = raw.className.trim();
  const version = raw.version.trim();
  const group = raw.studentGroup.trim();
  if (!(CLASS_OPTIONS as readonly string[]).includes(className)) throw new Error("Choose a class from the list.");
  if (!(VERSION_OPTIONS as readonly string[]).includes(version)) throw new Error("Choose a medium from the list.");
  if (needsGroup(className)) {
    if (!(GROUP_OPTIONS as readonly string[]).includes(group)) throw new Error("Choose a group for Class 9 to 12.");
    return { className, version, studentGroup: group };
  }
  return { className, version, studentGroup: null };
}
