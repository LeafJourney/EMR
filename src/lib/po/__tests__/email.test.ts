import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SupplyOrderForEmail } from "../types";

const base: SupplyOrderForEmail = {
  poRef: "PO-acme-0042",
  practice: {
    name: "Acme Pain Clinic",
    addressLines: ["123 Mission St", "San Francisco, CA 94103"],
    email: "billing@acmepain.example",
  },
  supplier: { name: "Henry Schein Medical", email: "orders@hs.example" },
  line: { supplyName: "Nitrile Exam Gloves, M", qty: 4, unitCostCents: 1875 },
  expectedDeliveryAt: new Date("2026-06-01T00:00:00Z"),
  paymentTermsDays: 30,
  createdAt: new Date("2026-05-22T17:00:00Z"),
};
const fixture = (o: Partial<SupplyOrderForEmail> = {}): SupplyOrderForEmail =>
  ({ ...base, ...o });

vi.mock("@/lib/email/resend", () => ({ sendEmail: vi.fn() }));

describe("sendSupplyOrderEmail", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.clearAllMocks());

  it("calls sendEmail with the right subject, recipient, and attachment", async () => {
    const { sendEmail } = await import("@/lib/email/resend");
    vi.mocked(sendEmail).mockResolvedValue({ ok: true, id: "re_zzz999" });

    const { sendSupplyOrderEmail } = await import("../email");
    const pdf = Buffer.from("pretend-pdf-bytes", "utf8");
    const result = await sendSupplyOrderEmail(fixture(), pdf);

    expect(vi.mocked(sendEmail)).toHaveBeenCalledOnce();
    const arg = vi.mocked(sendEmail).mock.calls[0]![0];
    expect(arg.to).toEqual(["orders@hs.example"]);
    expect(arg.replyTo).toBe("billing@acmepain.example");
    expect(arg.subject).toBe(
      "[Acme Pain Clinic] Purchase Order PO-acme-0042",
    );
    expect(arg.text).toContain("4 × Nitrile Exam Gloves, M");
    expect(arg.text).toContain("net 30");
    expect(arg.html).toContain("PO-acme-0042");
    expect(arg.attachments).toHaveLength(1);
    expect(arg.attachments![0].filename).toBe("PO-acme-0042.html");
    expect(arg.attachments![0].content).toBe(pdf);
    expect(arg.tags).toEqual([
      { name: "kind", value: "supply-order" },
      { name: "po_ref", value: "PO-acme-0042" },
    ]);
    expect(result.messageId).toBe("re_zzz999");
    expect(result.sentAt).toBeInstanceOf(Date);
  });

  it("throws SupplyOrderEmailError when the supplier has no email", async () => {
    const { sendSupplyOrderEmail, SupplyOrderEmailError } =
      await import("../email");
    await expect(
      sendSupplyOrderEmail(
        fixture({ supplier: { name: "No Email Co" } }),
        Buffer.from("x"),
      ),
    ).rejects.toBeInstanceOf(SupplyOrderEmailError);
  });

  it("throws when the provider reports failure", async () => {
    const { sendEmail } = await import("@/lib/email/resend");
    vi.mocked(sendEmail).mockResolvedValue({
      ok: false,
      reason: "http-error",
      status: 500,
      message: "boom",
    });
    const { sendSupplyOrderEmail, SupplyOrderEmailError } =
      await import("../email");
    await expect(
      sendSupplyOrderEmail(fixture(), Buffer.from("x")),
    ).rejects.toBeInstanceOf(SupplyOrderEmailError);
  });

  it("surfaces no-api-key with a typed reason", async () => {
    const { sendEmail } = await import("@/lib/email/resend");
    vi.mocked(sendEmail).mockResolvedValue({ ok: false, reason: "no-api-key" });
    const { sendSupplyOrderEmail } = await import("../email");
    await expect(
      sendSupplyOrderEmail(fixture(), Buffer.from("x")),
    ).rejects.toMatchObject({
      name: "SupplyOrderEmailError",
      reason: "no-api-key",
    });
  });
});
