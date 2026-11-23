import { getEnv } from "@/lib/env";
import { applyWebhookEvent, type WebhookEvent } from "@/lib/sms/service";
import { verifyNishchitSignature } from "@/lib/sms/webhook";

export const runtime = "nodejs";


export async function POST(request: Request): Promise<Response> {
  const secret = getEnv().NISHCHIT_WEBHOOK_SECRET;
  if (!secret) return new Response("Webhook not configured", { status: 503 });

  const raw = await request.text();
  const header = request.headers.get("nishchit-signature") ?? "";
  if (!verifyNishchitSignature(raw, header, secret)) {
    return new Response("Invalid signature", { status: 400 });
  }

  let event: WebhookEvent;
  try {
    event = JSON.parse(raw) as WebhookEvent;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  if (!event?.data?.message_id || typeof event.type !== "string") {
    return new Response("Unsupported payload", { status: 400 });
  }

  try {
    const result = await applyWebhookEvent(event);
    return Response.json({ received: true, result });
  } catch {
    // A 5xx asks Nishchit to retry, which is correct for a database outage.
    return new Response("Temporarily unavailable", { status: 500 });
  }
}
