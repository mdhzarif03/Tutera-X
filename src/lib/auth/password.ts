import { hash, verify } from "@node-rs/argon2";
import { assertPasswordPolicy } from "./policy";

export { assertPasswordPolicy };

// @node-rs/argon2 defaults to Argon2id. The hash string embeds its own parameters.

export async function hashPassword(password: string): Promise<string> {
  assertPasswordPolicy(password);
  return hash(password);
}

export async function verifyPassword(stored: string, candidate: string): Promise<boolean> {
  try {
    return await verify(stored, candidate);
  } catch {
    return false;
  }
}
