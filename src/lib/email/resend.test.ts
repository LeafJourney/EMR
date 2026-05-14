import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("sendEmail", () => {
  const ORIGINAL_KEY = process.env.RESEND_API_KEY;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) {
      delete process.env.RESEND_API_KEY;
    } else {
      process.env.RESEND_API_KEY = ORIGINAL_KEY;
    }
    vi.restoreAllMocks();
  });

  it("returns no-api-key without calling fetch when RESEND_API_KEY is unset", async () => {
    delete process.env.RESEND_API_KEY;
    const fetchSpy = vi.spyOn(global, "fetch");
    const { sendEmail } = await import("./resend");

    const result = await sendEmail({
      to: ["a@example.com"],
      subject: "hi",
      text: "body",
    });

    expect(result).toEqual({ ok: false, reason: "no-api-key" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns ok with the Resend id on 200", async () => {
    process.env.RESEND_API_KEY = "test-key";
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "re_abc123" }), { status: 200 }),
    );
    const { sendEmail } = await import("./resend");

    const result = await sendEmail({
      to: ["a@example.com"],
      subject: "hi",
      text: "body",
    });

    expect(result).toEqual({ ok: true, id: "re_abc123" });
    expect(fetchSpy).toHaveBeenCalledOnce();
    const call = fetchSpy.mock.calls[0]!;
    expect(call[0]).toBe("https://api.resend.com/emails");
    const init = call[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer test-key",
    );
  });

  it("returns http-error on non-2xx response", async () => {
    process.env.RESEND_API_KEY = "test-key";
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("rate limited", { status: 429 }),
    );
    const { sendEmail } = await import("./resend");

    const result = await sendEmail({
      to: ["a@example.com"],
      subject: "hi",
      text: "body",
    });

    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "http-error") {
      expect(result.status).toBe(429);
      expect(result.message).toBe("rate limited");
    } else {
      throw new Error("expected http-error result");
    }
  });

  it("returns network-error when fetch throws", async () => {
    process.env.RESEND_API_KEY = "test-key";
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    const { sendEmail } = await import("./resend");

    const result = await sendEmail({
      to: ["a@example.com"],
      subject: "hi",
      text: "body",
    });

    expect(result).toEqual({
      ok: false,
      reason: "network-error",
      message: "ECONNREFUSED",
    });
  });
});
