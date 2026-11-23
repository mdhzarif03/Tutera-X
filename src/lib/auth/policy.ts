import { UserError } from "@/lib/errors";

// Kept free of native dependencies so it can be unit-tested without installing argon2.

export function assertPasswordPolicy(password: string): void {
  if (password.length < 8) throw new UserError("Password must be at least 8 characters.");
  if (password.length > 128) throw new UserError("Password must be 128 characters or fewer.");
}
