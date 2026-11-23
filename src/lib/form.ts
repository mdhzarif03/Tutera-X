/** Reads a string field from FormData. Missing fields become empty strings. */
export function str(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/** Reads every value for a repeated field, such as a set of checkboxes. */
export function strs(formData: FormData, key: string): string[] {
  return formData.getAll(key).filter((v): v is string => typeof v === "string" && v.length > 0);
}

/** Collects all fields with a given prefix, keyed by the remainder. Used for attendance and marks grids. */
export function fieldsWithPrefix(formData: FormData, prefix: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith(prefix) && typeof value === "string") out[key.slice(prefix.length)] = value;
  }
  return out;
}

export function fields(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}
