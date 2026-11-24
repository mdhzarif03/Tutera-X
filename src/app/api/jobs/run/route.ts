import { timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";
import { runDueJobs } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Processes due SMS jobs. Use this when JOB_RUNNER=off, from a scheduler that sends
 * "Authorization: Bearer <CRON_SECRET>" every minute.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = getEnv().CRON_SECRET;
  if (!secret) return new Response("Not configured", { status: 404 });

  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return new Response("Unauthorized", { status: 401 });

  const processed = await runDueJobs(50);
  return Response.json({ processed });
}

/** Vercel Cron sends GET requests with the same bearer secret, so GET runs the same guarded job pass. */
export async function GET(request: Request): Promise<Response> {
  return POST(request);
}
