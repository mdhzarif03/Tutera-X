import { requireRole } from "@/lib/auth/guards";
import { PasswordChangeCard } from "@/components/password-change";
import { PageHeader, Flash } from "@/components/ui";
import { pick } from "@/lib/params";

export const metadata = { title: "Settings" };

export default async function ParentSettings({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole("PARENT");
  const sp = await searchParams;
  return (
    <>
      <PageHeader title="Settings" description="Your sign-in details." />
      <Flash msg={pick(sp, "msg")} error={pick(sp, "error")} />
      <div className="max-w-xl">
        <PasswordChangeCard />
      </div>
    </>
  );
}
