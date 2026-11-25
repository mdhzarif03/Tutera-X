import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth/guards";
import { createBatchPageAction } from "@/actions/teacher";
import { Card, Field, Flash, PageHeader } from "@/components/ui";
import { pick } from "@/lib/params";

export const metadata = { title: "New batch" };

export default async function NewBatchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole("TEACHER");
  const sp = await searchParams;

  return (
    <>
      <Link
        href="/batches"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-700"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Batches
      </Link>

      <PageHeader title="New batch" description="Create a group, then add students to it." />
      <Flash error={pick(sp, "error")} />

      <div className="max-w-xl">
        <Card>
          <form action={createBatchPageAction} className="grid gap-4">
            <Field label="Batch name" htmlFor="name">
              <input id="name" name="name" required maxLength={80} className="input" placeholder="Morning A" />
            </Field>
            <Field label="Class" htmlFor="className">
              <input id="className" name="className" required maxLength={40} className="input" placeholder="Class 9" />
            </Field>
            <Field label="Subject (optional)" htmlFor="subject">
              <input id="subject" name="subject" maxLength={60} className="input" />
            </Field>
            <Field
              label="WhatsApp group link (optional)"
              htmlFor="whatsappLink"
              hint="Students in this batch will see a button to join the group."
            >
              <input
                id="whatsappLink"
                name="whatsappLink"
                type="text"
                inputMode="url"
                maxLength={200}
                className="input"
                placeholder="https://chat.whatsapp.com/…"
              />
            </Field>

            <div className="mt-2 grid gap-2 sm:flex sm:justify-end">
              <Link href="/batches" className="btn btn-secondary">
                Cancel
              </Link>
              <button type="submit" className="btn btn-primary">
                Create batch
              </button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
