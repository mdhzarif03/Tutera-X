import Link from "next/link";
import { requireRole } from "@/lib/auth/guards";
import { createStudentAction } from "@/actions/teacher";
import { listBatches } from "@/services/batches";
import { Card, Field, Flash, PageHeader } from "@/components/ui";
import { pick } from "@/lib/params";

export const metadata = { title: "Add student" };

export default async function NewStudentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const t = await requireRole("TEACHER");
  const sp = await searchParams;
  const batches = await listBatches(t.id, false);

  return (
    <>
      <PageHeader title="Add a student" description="We save the student and parent, then text a welcome link so they can join. The parent's number is used if the student has no phone." />
      <Flash error={pick(sp, "error")} />
      <Card className="max-w-3xl">
        <form action={createStudentAction} className="grid gap-4 sm:grid-cols-2">
          <Field label="Student name" htmlFor="name"><input id="name" name="name" required maxLength={120} className="input" /></Field>
          <Field label="Student phone (optional)" htmlFor="phone" hint="Bangladesh mobile, e.g. 01712345678"><input id="phone" name="phone" inputMode="tel" className="input" /></Field>
          <Field label="Parent's name" htmlFor="guardianName"><input id="guardianName" name="guardianName" required maxLength={120} className="input" /></Field>
          <Field label="Parent's phone" htmlFor="guardianPhone" hint="Use the parent's number. Brothers and sisters can share it."><input id="guardianPhone" name="guardianPhone" required inputMode="tel" className="input" /></Field>
          <Field label="Class" htmlFor="className"><input id="className" name="className" required maxLength={40} className="input" placeholder="Class 9" /></Field>
          <Field label="School or institute" htmlFor="institution"><input id="institution" name="institution" required maxLength={120} className="input" /></Field>
          <Field label="Medium (e.g. English)" htmlFor="version"><input id="version" name="version" required maxLength={40} className="input" placeholder="English medium" /></Field>
          <Field label="Monthly fee (৳)" htmlFor="monthlyFee"><input id="monthlyFee" name="monthlyFee" type="number" min={0} max={1000000} step="0.01" required className="input" /></Field>
          <div className="sm:col-span-2">
            <Field label="Add to a batch (optional)" htmlFor="batchId">
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
