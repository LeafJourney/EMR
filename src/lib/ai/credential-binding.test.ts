import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type KeyResolver,
  decryptString,
  encryptString,
  getKeyResolver,
  setKeyResolver,
} from "@/lib/security/encryption-framework";

// Validates the security contract credential-store.ts relies on: the BYOK key
// is encrypted under purpose "byok-credential" with aad = organizationId, so a
// ciphertext is cryptographically bound to its org and cannot be transplanted.

const PURPOSE = "byok-credential";

class FixedKeyResolver implements KeyResolver {
  private readonly key = Buffer.alloc(32, 7); // deterministic 32-byte KEK
  async getKek(): Promise<Buffer> {
    return this.key;
  }
}

describe("BYOK credential encryption binding", () => {
  let prev: KeyResolver;
  beforeAll(() => {
    prev = getKeyResolver();
    setKeyResolver(new FixedKeyResolver());
  });
  afterAll(() => setKeyResolver(prev));

  it("round-trips the key for the same org", async () => {
    const org = "org_abc";
    const key = "sk-or-v1-secret-key-value";
    const env = await encryptString(key, { purpose: PURPOSE, aad: org });
    expect(env).not.toContain(key); // ciphertext, not plaintext
    const back = await decryptString(env, { purpose: PURPOSE, aad: org });
    expect(back).toBe(key);
  });

  it("refuses to decrypt a ciphertext bound to a different org", async () => {
    const env = await encryptString("sk-secret", { purpose: PURPOSE, aad: "org_a" });
    await expect(
      decryptString(env, { purpose: PURPOSE, aad: "org_b" }),
    ).rejects.toThrow();
  });
});
