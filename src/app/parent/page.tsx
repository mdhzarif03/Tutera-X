import Link from "next/link";
import { requireRole } from "@/lib/auth/guards";
import { parentChildren, studentDashboard } from "@/services/dashboards";
import { DashboardOverview } from "@/components/dashboard-sections";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { pick } from "@/lib/params";

export const metadata = { title: "Home" };

export default async function ParentHome({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireRole("PARENT");
  const sp = await searchParams;
  const { guardian, children } = await parentChildren(user.id);

  if (children.length === 0) {
    return (
      <>
        <PageHeader title={`Welcome, ${guardian.name}`} />
        <EmptyState title="No linked children yet" body="Your child's teacher links your account to their record. Once that's done, their attendance, results and fees appear here." />
      </>
    );
  }

  const requested = pick(sp, "child");
  const selected = children.find((c) => c.userId === requested) ?? children[0];
  if (!selected) throw new Error("unreachable: children is non-empty");
  const data = await studentDashboard(selected.userId);

  return (
    <>
      <PageHeader
        title={selected.user.name}
        description={`${selected.className} · ${selected.institution}. You are viewing read-only information.`}
      />
      {children.length > 1 ? (
        <nav aria-label="Children" className="mb-6 flex flex-wrap gap-2">
          {children.map((c) => (
            <Link
              key={c.userId}
              href={`/parent?child=${c.userId}`}
              aria-current={c.userId === selected.userId ? "page" : undefined}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${c.userId === selected.userId ? "bg-teal-700 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"}`}
            >
              {c.user.name}
            </Link>
          ))}
        </nav>
      ) : null}
      <DashboardOverview data={data} basePath="" />
      <Card title="Contact" className="mt-6">
        <p className="text-sm text-slate-600">Questions about attendance, marks or fees? Contact the class teacher directly.</p>
      </Card>
    </>
  );
}
