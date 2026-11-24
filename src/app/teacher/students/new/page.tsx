import Link from "next/link";
import { requireRole } from "@/lib/auth/guards";
import { createStudentAction } from "@/actions/teacher";
import { listBatches } from "@/services/batches";
import { Card, Field, Flash, PageHeader } from "@/components/ui";
import { ClassFields } from "@/components/class-fields";
import { pick } from "@/lib/params";

export const metadata = { title: "Add student" };

export default async function NewStudentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const t = await requireRole("TEACHER");
  const sp = await searchParams;
  const batches = await listBatches(t.id, false);

  return (
    <>
      <PageHeader
        title="Add a student"
        description="We text a welcome link to the parent's phone. The parent chooses a password, and the student signs in with the same login."
      />
      <Flash error={pick(sp, "error")} />
      <Card className="max-w-3xl">
        <form action={createStudentAction} className="grid gap-5 sm:grid-cols-2">
          <Field label="Student's name" htmlFor="name">
            <input id="name" name="name" required maxLength={120} className="input" />
          </Field>
          <Field label="Parent or guardian's phone" htmlFor="guardianPhone" hint="Required. The welcome link and messages go to this number.">
            <input id="guardianPhone" name="guardianPhone" required inputMode="tel" placeholder="01712345678" className="input" />
          </Field>
          <Field label="School or institute" htmlFor="institution">
            <input id="institution" name="institution" required maxLength={120} className="input" />
          </Field>
          <ClassFields />
          <Field label="Monthly fee (৳)" htmlFor="monthlyFee">
            <input id="monthlyFee" name="monthlyFee" type="number" min={0} max={1000000} step="0.01" required className="input" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Batch (optional)" htmlFor="batchId">
              <select id="batchId" name="batchId" className="select" defaultValue="">
                <option value="">Not now</option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="flex items-center gap-3 sm:col-span-2">
            <button type="submit" className="btn btn-primary">Save and send welcome link</button>
            <Link href="/teacher/students" className="text-sm text-slate-600 hover:underline">Cancel</Link>
          </div>
        </form>
      </Card>
    </>
  );
}
