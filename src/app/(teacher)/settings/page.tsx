import { requireRole } from "@/lib/auth/guards";
import { PasswordChangeCard } from "@/components/password-change";
import { PageHeader, Card, Flash } from "@/components/ui";
import { pick } from "@/lib/params";

export const metadata = { title: "Settings" };

export default async function TeacherSettings({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const t = await requireRole("TEACHER");
  const sp = await searchParams;
  return (
    <>
      <PageHeader title="Settings" description="Your account." />
      <Flash msg={pick(sp, "msg")} error={pick(sp, "error")} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Account">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-slate-500">Name</dt><dd className="text-slate-900">{t.name}</dd>
            <dt className="text-slate-500">Phone</dt><dd className="text-slate-900">{t.phoneE164 ?? "Not set"}</dd>
            <dt className="text-slate-500">Role</dt><dd className="text-slate-900">{t.teacherRole === "OWNER" ? "Owner" : "Teacher"}</dd>
          </dl>
          <p className="mt-4 text-xs text-slate-500">Profile name changes are made by the owner. Contact them if your details need updating.</p>
        </Card>
        <PasswordChangeCard />
      </div>
    </>
  );
}
