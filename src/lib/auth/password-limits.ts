export const PASSWORD_RESET_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;
export const PASSWORD_CHANGE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
export const PASSWORD_RESET_OTP_TTL_MINUTES = 10;
export const PASSWORD_RESET_MAX_ATTEMPTS = 5;

export function isPasswordActionAllowed(lastChangedAt: Date | null, cooldownMs: number, now: Date): boolean {
  return lastChangedAt === null || lastChangedAt.getTime() + cooldownMs <= now.getTime();
}
