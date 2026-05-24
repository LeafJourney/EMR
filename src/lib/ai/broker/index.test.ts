// EMR-754 — broker contract tests. Covers the synchronous decisions the
// broker makes before touching the network (max_tokens cap, missing API
// key). The HTTP path is exercised via integration testing once
// PracticeAiConfig + LlmUsage land.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { invoke } from "./index";

describe("broker.invoke pre-flight checks", () => {
  const ORIG_KEY = process.env.OPENROUTER_API_KEY;

  beforeEach(() => {
    delete process.env.OPENROUTER_API_KEY;
  });

  afterEach(() => {
    if (ORIG_KEY === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = ORIG_KEY;
    vi.restoreAllMocks();
  });

  it("rejects when max_tokens exceeds broker cap", async () => {
    const res = await invoke({
      practiceId: "p1",
      agentBucket: "charting",
      agentName: "charting.note-summarize",
      model: null,
      messages: [{ role: "user", content: "hi" }],
      maxOutputTokens: 100_000,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("max_tokens_too_high");
  });

  it("returns no_api_key when OPENROUTER_API_KEY is unset", async () => {
    const res = await invoke({
      practiceId: "p1",
      agentBucket: "billing",
      agentName: "billing.eligibility-check",
      model: null,
      messages: [{ role: "user", content: "hi" }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("no_api_key");
  });
});
