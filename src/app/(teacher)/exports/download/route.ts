import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { logUnexpectedError, UserError } from "@/lib/errors";
import { buildExport } from "@/services/exports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  if (user.role !== "TEACHER") return new NextResponse("Only teachers can export records.", { status: 403 });

  try {
    const { buffer, filename } = await buildExport(user.id, req.nextUrl.searchParams);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof UserError ? err.message : "Could not create the export. Please try again.";
    if (!(err instanceof UserError)) logUnexpectedError("[export] failed", { operation: "export" }, err);
    return NextResponse.redirect(new URL(`/exports?error=${encodeURIComponent(message)}`, req.url));
  }
}
