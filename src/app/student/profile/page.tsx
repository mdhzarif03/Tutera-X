import { requireRole } from "@/lib/auth/guards";
import { studentDashboard } from "@/services/dashboards";
import { PasswordChangeCard } from "@/components/password-change";
import { Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Profile" };

// One profile for the student and the parent. Parents see exactly this too, from their own login.
export default async function StudentProfile() {
  const user = await requireRole("STUDENT");
  const data = await studentDashboard(user.id);
  const p = data.profile;
  const rows: [string, string][] = [
    ["Student", p.user.name],
    ["Login ID", p.user.username ?? "—"],
    ["Class", p.className],
    ...(p.studentGroup ? [["Group", p.studentGroup] as [string, string]] : []),
    ["Medium", p.version],
    ["School or institute", p.institution],
    ["Parent or guardian", p.guardian.name],
    ["Parent or guardian's phone", p.guardian.phoneE164],
  ];
  return (
    <>
      <PageHeader title="Profile" description="Your details. Ask your teacher to change anything here." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Student and parent">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-slate-500">{k}</dt>
                <dd className="font-medium text-slate-900">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <PasswordChangeCard />
      </div>
    </>
  );
}
