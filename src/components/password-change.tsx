import { changePasswordAction } from "@/actions/auth";
import { NewPasswordFields } from "./password-form";
import { Card } from "./ui";

export function PasswordChangeCard() {
  return (
    <Card title="Change password" description="You can change it without entering your old password. Password changes are limited to once every 7 days. Other devices are signed out.">
      <form action={changePasswordAction} className="grid max-w-md gap-4">
        <NewPasswordFields />
        <div>
          <button className="btn btn-primary" type="submit">Update password</button>
        </div>
      </form>
    </Card>
  );
}
