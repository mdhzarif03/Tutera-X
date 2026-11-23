// Server-rendered password fields. Browsers handle the native "required" and "minLength" checks;
// the server enforces the policy again.

export function NewPasswordFields() {
  return (
    <>
      <div>
        <label htmlFor="password" className="label">New password</label>
        <input id="password" name="password" type="password" required minLength={8} maxLength={128} autoComplete="new-password" className="input" />
        <p className="mt-1 text-xs text-slate-500">At least 8 characters.</p>
      </div>
      <div>
        <label htmlFor="confirm" className="label">Confirm password</label>
        <input id="confirm" name="confirm" type="password" required minLength={8} maxLength={128} autoComplete="new-password" className="input" />
      </div>
    </>
  );
}
