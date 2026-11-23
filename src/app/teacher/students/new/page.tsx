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
      <PageHeader title="Add a student" description="The student and guardian are saved, and an activation link is sent by SMS. The guardian's phone is used when the student has none." />
      <Flash error={pick(sp, "error")} />
      <Card className="max-w-3xl">
        <form action={createStudentAction} className="grid gap-4 sm:grid-cols-2">
          <Field label="Student name" htmlFor="name"><input id="name" name="name" required maxLength={120} className="input" /></Field>
          <Field label="Student phone (optional)" htmlFor="phone" hint="Bangladesh mobile, e.g. 01712345678"><input id="phone" name="phone" inputMode="tel" className="input" /></Field>
          <Field label="Guardian name" htmlFor="guardianName"><input id="guardianName" name="guardianName" required maxLength={120} className="input" /></Field>
          <Field label="Guardian phone" htmlFor="guardianPhone" hint="One phone number is one guardian, even with several children."><input id="guardianPhone" name="guardianPhone" required inputMode="tel" className="input" /></Field>
          <Field label="Class" htmlFor="className"><input id="className" name="className" required maxLength={40} className="input" placeholder="Class 9" /></Field>
          <Field label="Institution" htmlFor="institution"><input id="institution" name="institution" required maxLength={120} className="input" /></Field>
          <Field label="Version / medium" htmlFor="version"><input id="version" name="version" required maxLength={40} className="input" placeholder="English medium" /></Field>
          <Field label="Monthly tuition (৳)" htmlFor="monthlyFee"><input id="monthlyFee" name="monthlyFee" type="number" min={0} max={1000000} step="0.01" required className="input" /></Field>
          <div className="sm:col-span-2">
            <Field label="Add to a batch (optional)" htmlFor="batchId">
              <select id="batchId" name="batchId" className="select" defaultValue="">
                <option value="">Not yet</option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="flex items-center gap-3 sm:col-span-2">
            <button type="submit" className="btn btn-primary">Save and send activation</button>
            <Link href="/teacher/students" className="text-sm text-slate-600 hover:underline">Cancel</Link>
          </div>
        </form>
      </Card>
    </>
  );
}
