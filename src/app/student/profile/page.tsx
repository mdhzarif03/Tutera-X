import { requireRole } from "@/lib/auth/guards";
import { studentDashboard } from "@/services/dashboards";
import { PasswordChangeCard } from "@/components/password-change";
import { Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Profile" };

export default async function StudentProfile() {
  const user = await requireRole("STUDENT");
  const data = await studentDashboard(user.id);
  const p = data.profile;
  return (
    <>
      <PageHeader title="Profile" description="Your details. Ask your teacher to change anything here." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Your details">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-slate-500">Name</dt><dd>{p.user.name}</dd>
            <dt className="text-slate-500">Login ID</dt><dd className="font-mono">{p.user.username}</dd>
            <dt className="text-slate-500">Class</dt><dd>{p.className}</dd>
            <dt className="text-slate-500">Institution</dt><dd>{p.institution}</dd>
            <dt className="text-slate-500">Version</dt><dd>{p.version}</dd>
            <dt className="text-slate-500">Parent</dt><dd>{p.guardian.name}</dd>
            <dt className="text-slate-500">Parent's phone</dt><dd>{p.guardian.phoneE164}</dd>
          </dl>
        </Card>
        <PasswordChangeCard />
      </div>
    </>
  );
}
