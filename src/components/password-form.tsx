import { PasswordInput } from "./password-input";

// New-password fields with show/hide buttons. Browsers handle the native "required" and "minLength"
// checks; the server enforces the policy again.
export function NewPasswordFields() {
  return (
    <>
      <div>
        <label htmlFor="password" className="label">New password</label>
        <PasswordInput id="password" name="password" required minLength={8} maxLength={128} autoComplete="new-password" />
        <p className="mt-1 text-xs text-slate-500">At least 8 characters.</p>
      </div>
      <div>
        <label htmlFor="confirm" className="label">Confirm password</label>
        <PasswordInput id="confirm" name="confirm" required minLength={8} maxLength={128} autoComplete="new-password" />
      </div>
    </>
  );
}
