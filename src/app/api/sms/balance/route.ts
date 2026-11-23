import { requireApiRole } from "@/lib/auth/api";
import { getSmsBalance } from "@/services/comms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/sms/balance?refresh=1. Teachers only. Credits come from the cached Nishchit balance. */
export async function GET(request: Request): Promise<Response> {
  const user = await requireApiRole("TEACHER");
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const force = new URL(request.url).searchParams.get("refresh") === "1";
  const balance = await getSmsBalance({ force });
  return Response.json({
    credits: balance.credits,
    currency: balance.currency,
    asOf: balance.asOf,
    fetchedAt: balance.fetchedAt,
    status: balance.status,
    mode: balance.mode,
  });
}
