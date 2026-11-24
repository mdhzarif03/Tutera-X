import { requireRole } from "@/lib/auth/guards";
import { studentDashboard } from "@/services/dashboards";
import { DashboardOverview } from "@/components/dashboard-sections";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Home" };

export default async function StudentHome() {
  const user = await requireRole("STUDENT");
  const data = await studentDashboard(user.id);
  return (
    <>
      <PageHeader
        title={`Hi, ${user.name.split(" ")[0] ?? user.name}`}
        description={`${data.profile.className} · ${data.profile.institution}`}
      />
      <DashboardOverview data={data} basePath="/student" showGroupLinks />
    </>
  );
}
