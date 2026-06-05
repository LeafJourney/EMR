import { describe, it, expect, vi, afterEach } from "vitest";
import { OpenRouterModelClient, isModelError } from "./model-client";

// Build a minimal fetch Response stand-in for the non-streaming path.
function fakeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    body: null,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    json: async () => body,
  } as unknown as Response;
}

function okBody(content: string) {
  return { choices: [{ message: { content } }] };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("OpenRouterModelClient — timeout", () => {
  it("throws a `timeout` ModelError when the provider never responds", async () => {
    // fetch hangs until its signal aborts (mirrors real fetch on AbortController).
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise<Response>((_, reject) => {
            init.signal.addEventListener("abort", () =>
              reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
            );
          }),
      ),
    );
    const client = new OpenRouterModelClient({
      apiKey: "test-key",
      timeoutMs: 40,
      maxRetries: 0,
    });
    const err = await client.complete("hi").catch((e) => e);
    expect(isModelError(err)).toBe(true);
    expect(err.code).toBe("timeout");
  });
});

describe("OpenRouterModelClient — retry", () => {
  it("retries a transient 5xx and then succeeds", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls++;
        return calls === 1
          ? fakeResponse(500, { error: { message: "upstream blip" } })
          : fakeResponse(200, okBody("recovered"));
      }),
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const client = new OpenRouterModelClient({
      apiKey: "test-key",
      maxRetries: 2,
      timeoutMs: 5000,
    });
    const out = await client.complete("hi");
    expect(out).toBe("recovered");
    expect(calls).toBe(2);
  });

  it("does NOT retry a deterministic 400", async () => {
    const fetchMock = vi.fn(async () =>
      fakeResponse(400, { error: { message: "bad prompt" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = new OpenRouterModelClient({
      apiKey: "test-key",
      maxRetries: 2,
      timeoutMs: 5000,
    });
    const err = await client.complete("hi").catch((e) => e);
    expect(err.code).toBe("bad_request");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("OpenRouterModelClient — credit fallback + classification", () => {
  it("falls back to the free model on a 402 credit limit", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls++;
        return calls === 1
          ? fakeResponse(402, { error: { message: "you can only afford 100" } })
          : fakeResponse(200, okBody("from free model"));
      }),
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const client = new OpenRouterModelClient({
      apiKey: "test-key",
      model: "anthropic/claude-sonnet-4.5",
      maxRetries: 0,
      timeoutMs: 5000,
    });
    const out = await client.complete("hi");
    expect(out).toBe("from free model");
    expect(calls).toBe(2);
  });

  it.each([
    [401, "unauthorized"],
    [429, "rate_limited"],
    [500, "server_error"],
  ])("classifies HTTP %i as %s", async (status, code) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => fakeResponse(status, { error: { message: "x" } })),
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});
    // maxRetries:0 so server_error/rate_limited aren't retried away here.
    const client = new OpenRouterModelClient({
      apiKey: "test-key",
      maxRetries: 0,
      timeoutMs: 5000,
    });
    const err = await client.complete("hi").catch((e) => e);
    expect(err.code).toBe(code);
  });
});
