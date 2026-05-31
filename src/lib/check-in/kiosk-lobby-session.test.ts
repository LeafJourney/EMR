import { describe, expect, it } from "vitest";

import {
  generateLobbySessionToken,
  isLobbySessionExpired,
} from "./kiosk-lobby-session";

const NOW = new Date("2026-06-01T12:00:00.000Z");

describe("isLobbySessionExpired", () => {
  it("is expired at or past the expiry instant", () => {
    expect(isLobbySessionExpired(new Date(NOW.getTime() - 1), NOW)).toBe(true);
    expect(isLobbySessionExpired(NOW, NOW)).toBe(true);
  });
  it("is not expired while there is time left", () => {
    expect(isLobbySessionExpired(new Date(NOW.getTime() + 1000), NOW)).toBe(false);
  });
});

describe("generateLobbySessionToken", () => {
  it("produces a 64-char hex opaque token that differs each call", () => {
    const a = generateLobbySessionToken();
    const b = generateLobbySessionToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });
});
