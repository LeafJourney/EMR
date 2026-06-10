import { describe, it, expect, vi, afterEach } from "vitest";
import { withPhiRedaction } from "./redacting-model-client";
import type { ModelCallOptions, ModelClient } from "./types";

/** A client that records the (already-redacted) prompt it was handed. */
function recordingClient(): { client: ModelClient; lastPrompt: () => string } {
  let last = "";
  const client: ModelClient = {
    async complete(prompt: string) {
      last = prompt;
      return "ok";
    },
    async *stream(prompt: string, _options?: ModelCallOptions) {
      last = prompt;
      yield "ok";
    },
  };
  return { client, lastPrompt: () => last };
}

afterEach(() => vi.restoreAllMocks());

describe("withPhiRedaction", () => {
  it("scrubs structured PHI before the prompt reaches the model (complete)", async () => {
    const { client, lastPrompt } = recordingClient();
    vi.spyOn(console, "log").mockImplementation(() => {});
    const wrapped = withPhiRedaction(client, "test-agent");
    await wrapped.complete(
      "Call patient at 415-555-1234, SSN 123-45-6789, email a@b.com",
    );
    const sent = lastPrompt();
    expect(sent).not.toContain("415-555-1234");
    expect(sent).not.toContain("123-45-6789");
    expect(sent).not.toContain("a@b.com");
    expect(sent).toContain("[PHONE]");
    expect(sent).toContain("[SSN]");
    expect(sent).toContain("[EMAIL]");
  });

  it("scrubs patient names passed via redactNames", async () => {
    const { client, lastPrompt } = recordingClient();
    const wrapped = withPhiRedaction(client);
    await wrapped.complete("Patient Jane Doe reports improvement", {
      redactNames: ["Jane Doe"],
    });
    expect(lastPrompt()).not.toContain("Jane Doe");
    expect(lastPrompt()).toContain("[PATIENT]");
  });

  it("redacts on the streaming path too", async () => {
    const { client, lastPrompt } = recordingClient();
    const wrapped = withPhiRedaction(client);
    const chunks: string[] = [];
    for await (const c of wrapped.stream!("SSN 123-45-6789")) chunks.push(c);
    expect(lastPrompt()).toContain("[SSN]");
    expect(lastPrompt()).not.toContain("123-45-6789");
    expect(chunks.join("")).toBe("ok");
  });

  it("leaves clean clinical prompts unchanged", async () => {
    const { client, lastPrompt } = recordingClient();
    const wrapped = withPhiRedaction(client);
    const clinical = "Patient has chronic low back pain, on gabapentin 300mg TID";
    await wrapped.complete(clinical);
    expect(lastPrompt()).toBe(clinical);
  });

  it("omits the stream method when the underlying client cannot stream", () => {
    const completeOnly: ModelClient = { async complete() { return "x"; } };
    const wrapped = withPhiRedaction(completeOnly);
    expect(wrapped.stream).toBeUndefined();
  });
});
