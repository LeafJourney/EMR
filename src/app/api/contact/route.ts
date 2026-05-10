import { NextResponse } from "next/server";
import { logger } from "@/lib/observability/log";

const RECIPIENTS = ["neal@leafjourney.com", "scott@leafjourney.com"];

type ContactPayload = {
  name?: string;
  email?: string;
  subject?: string;
  message?: string;
  role?: string;
};

export async function POST(request: Request) {
  let body: ContactPayload;
  try {
    body = (await request.json()) as ContactPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, email, subject, message, role } = body;

  if (!name || !email || !message) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  // SMTP integration is intentionally deferred — wire up Resend / SendGrid
  // and replace this block. Until then, log the submission so it's visible in
  // server logs and queue it for manual delivery.
  logger.info({
    event: "contact.inbound",
    to: RECIPIENTS,
    name,
    email,
    role,
    subject,
    messagePreview: message.slice(0, 200),
    receivedAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, recipients: RECIPIENTS });
}
