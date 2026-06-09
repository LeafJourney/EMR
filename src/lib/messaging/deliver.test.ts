import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock prisma so deliverMessage's writes are observable without a DB
// (vi.hoisted runs before the module-under-test imports prisma).
const hoisted = vi.hoisted(() => {
  const prisma = {
    message: { create: vi.fn() },
    messageThread: { update: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return { prisma };
});
vi.mock("@/lib/db/prisma", () => ({ prisma: hoisted.prisma }));

import { attemptDelivery, deliverMessage } from "./deliver";
import { getMockSmsAdapter } from "@/lib/sms/adapter";

const { prisma } = hoisted;
const ORIG_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  getMockSmsAdapter().reset();
  delete process.env.RESEND_API_KEY;
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_FROM_NUMBER;
  prisma.message.create.mockResolvedValue({ id: "msg_1" });
  prisma.messageThread.update.mockResolvedValue({});
  prisma.auditLog.create.mockResolvedValue({});
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...ORIG_ENV };
});

describe("attemptDelivery", () => {
  it("portal → delivered (in-app, no external send)", async () => {
    const r = await attemptDelivery("portal", { body: "hi" });
    expect(r).toEqual({ delivery: "delivered", detail: null });
  });

  it("email with no recipient → recorded", async () => {
    const r = await attemptDelivery("email", { body: "hi" });
    expect(r.delivery).toBe("recorded");
  });

  it("email with no provider configured → recorded (honest, not 'delivered')", async () => {
    const r = await attemptDelivery("email", { recipient: "p@x.com", body: "hi" });
    expect(r.delivery).toBe("recorded");
    expect(r.detail).toMatch(/no mail provider/i);
  });

  it("email with provider + ok response → delivered", async () => {
    process.env.RESEND_API_KEY = "re_test";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "re_123" }) }));
    const r = await attemptDelivery("email", { recipient: "p@x.com", subject: "Hi", body: "hi" });
    expect(r.delivery).toBe("delivered");
    expect(r.detail).toBe("resend:re_123");
  });

  it("email with provider + http error → failed", async () => {
    process.env.RESEND_API_KEY = "re_test";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "boom" }));
    const r = await attemptDelivery("email", { recipient: "p@x.com", body: "hi" });
    expect(r.delivery).toBe("failed");
  });

  it("sms with invalid phone → recorded", async () => {
    const r = await attemptDelivery("sms", { recipient: "not-a-phone", body: "hi" });
    expect(r.delivery).toBe("recorded");
  });

  it("sms via mock adapter (dev) → recorded/simulated, NOT delivered", async () => {
    const r = await attemptDelivery("sms", { recipient: "+15551234567", body: "hi" });
    expect(r.delivery).toBe("recorded");
    expect(r.adapter).toBe("mock");
    expect(r.detail).toMatch(/simulated/i);
  });

  it("sms via Twilio + ok → delivered", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC";
    process.env.TWILIO_AUTH_TOKEN = "tok";
    process.env.TWILIO_FROM_NUMBER = "+15550000000";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ sid: "SM123" }) }));
    const r = await attemptDelivery("sms", { recipient: "+15551234567", body: "hi" });
    expect(r.delivery).toBe("delivered");
    expect(r.adapter).toBe("twilio");
    expect(r.detail).toBe("twilio:SM123");
  });

  it("fax → recorded (no adapter)", async () => {
    const r = await attemptDelivery("fax", { recipient: "+15551234567", body: "hi" });
    expect(r.delivery).toBe("recorded");
  });

  it("phone → recorded ('Call logged')", async () => {
    const r = await attemptDelivery("phone", { body: "call notes" });
    expect(r.delivery).toBe("recorded");
    expect(r.detail).toMatch(/call logged/i);
  });
});

describe("deliverMessage", () => {
  it("persists a portal message as delivered and does NOT audit it", async () => {
    const r = await deliverMessage({ threadId: "t1", channel: "portal", body: "hi", senderUserId: "u1" });
    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ channel: "portal", delivery: "delivered", status: "sent" }),
      }),
    );
    expect(prisma.messageThread.update).toHaveBeenCalled(); // bumps lastMessageAt
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    expect(r.delivery).toBe("delivered");
  });

  it("records an external email as 'recorded' (no provider) and writes a PHI-safe audit row", async () => {
    const r = await deliverMessage({
      threadId: "t1",
      channel: "email",
      body: "hi",
      recipient: "p@x.com",
      senderUserId: "u1",
      organizationId: "o1",
    });
    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ channel: "email", delivery: "recorded", recipient: "p@x.com" }),
      }),
    );
    const audit = prisma.auditLog.create.mock.calls[0][0];
    expect(audit.data.action).toBe("message.email.recorded");
    // PHI-safe: metadata must not carry the recipient or body.
    expect(JSON.stringify(audit.data.metadata)).not.toContain("p@x.com");
    expect(r.delivery).toBe("recorded");
  });
});
