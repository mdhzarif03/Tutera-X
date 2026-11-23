import { changePasswordAction } from "@/actions/auth";
import { Card } from "./ui";

export function PasswordChangeCard() {
  return (
    <Card title="Change password" description="Other devices are signed out when you change it.">
      <form action={changePasswordAction} className="grid max-w-md gap-4">
        <div>
          <label htmlFor="current" className="label">Current password</label>
          <input id="current" name="current" type="password" required autoComplete="current-password" className="input" />
        </div>
        <div>
          <label htmlFor="next" className="label">New password</label>
          <input id="next" name="next" type="password" required minLength={8} maxLength={128} autoComplete="new-password" className="input" />
        </div>
        <div>
          <label htmlFor="confirm" className="label">Confirm new password</label>
          <input id="confirm" name="confirm" type="password" required minLength={8} maxLength={128} autoComplete="new-password" className="input" />
        </div>
        <div>
          <button className="btn btn-primary" type="submit">Update password</button>
        </div>
      </form>
    </Card>
  );
}
