import { describe, expect, it, beforeAll } from "vitest";
import { randomBytes } from "node:crypto";
import {
  COMPLIANCE_CONTROLS,
  EnvironmentKeyResolver,
  FRAMEWORK_DOC_PATH,
  FRAMEWORK_VERSION,
  decryptString,
  deidentify,
  deriveSubKey,
  encryptString,
  hashPassword,
  hmacSha256,
  parseEnvelope,
  serializeEnvelope,
  setKeyResolver,
  sha256Hex,
  verifyPassword,
} from "./encryption-framework";

beforeAll(() => {
  // Tests need a stable KEK. Generate a 32-byte key and base64url-encode it.
  process.env.EMR_PHI_KEK = randomBytes(32).toString("base64url");
  setKeyResolver(new EnvironmentKeyResolver("EMR_PHI_KEK"));
});

describe("envelope serialization", () => {
  it("round-trips through parse/serialize", () => {
    const env = {
      version: 1 as const,
      iv: "iv",
      tag: "tag",
      wrappedDek: "wrapped",
      ciphertext: "ct",
    };
    const s = serializeEnvelope(env);
    expect(s.startsWith("v1:")).toBe(true);
    expect(parseEnvelope(s)).toEqual(env);
  });

  it("rejects an envelope with the wrong number of segments", () => {
    expect(() => parseEnvelope("v1:a:b")).toThrow(/wrong segment count/);
  });

  it("rejects an unsupported version", () => {
    expect(() => parseEnvelope("v2:a:b:c:d")).toThrow(/Unsupported envelope/);
  });
});

describe("encryptString / decryptString", () => {
  it("round-trips a plaintext string", async () => {
    const env = await encryptString("hello world", { purpose: "phi-field" });
    const out = await decryptString(env, { purpose: "phi-field" });
    expect(out).toBe("hello world");
  });

  it("produces a different ciphertext on every call (fresh IV + DEK)", async () => {
    const a = await encryptString("hello", { purpose: "phi-field" });
    const b = await encryptString("hello", { purpose: "phi-field" });
    expect(a).not.toBe(b);
  });

  it("fails decryption with a mismatched purpose (HKDF derivation differs)", async () => {
    const env = await encryptString("secret", { purpose: "phi-field" });
    await expect(
      decryptString(env, { purpose: "msg-body" }),
    ).rejects.toThrow();
  });

  it("binds additional-authenticated-data and rejects tampered AAD", async () => {
    const env = await encryptString("secret", {
      purpose: "phi-field",
      aad: "record-id-123",
    });
    await expect(
      decryptString(env, { purpose: "phi-field", aad: "record-id-999" }),
    ).rejects.toThrow();
    const ok = await decryptString(env, {
      purpose: "phi-field",
      aad: "record-id-123",
    });
    expect(ok).toBe("secret");
  });

  it("rejects when the auth tag is tampered with", async () => {
    const env = await encryptString("secret", { purpose: "phi-field" });
    // Flip a character in the tag segment.
    const parts = env.split(":");
    const tag = Buffer.from(parts[2], "base64url");
    tag[0] ^= 0xff;
    parts[2] = tag.toString("base64url");
    const tampered = parts.join(":");
    await expect(
      decryptString(tampered, { purpose: "phi-field" }),
    ).rejects.toThrow();
  });
});

describe("deriveSubKey", () => {
  it("produces deterministic but purpose-distinct keys", () => {
    const kek = randomBytes(32);
    const a1 = deriveSubKey(kek, "phi");
    const a2 = deriveSubKey(kek, "phi");
    const b = deriveSubKey(kek, "msg");
    expect(a1.equals(a2)).toBe(true);
    expect(a1.equals(b)).toBe(false);
  });
});

describe("password hashing", () => {
  it("verifies a correct password", () => {
    const stored = hashPassword("correct horse battery staple");
    expect(verifyPassword("correct horse battery staple", stored)).toBe(true);
  });

  it("rejects an incorrect password", () => {
    const stored = hashPassword("hunter2");
    expect(verifyPassword("hunter3", stored)).toBe(false);
  });

  it("rejects when the stored algo is unknown", () => {
    const stored = hashPassword("test");
    const broken = { ...stored, algo: "md5" as const };
    // @ts-expect-error — purposely passing a non-scrypt algo.
    expect(verifyPassword("test", broken)).toBe(false);
  });
});

describe("digests + integrity", () => {
  it("hashes deterministically with SHA-256", () => {
    expect(sha256Hex("abc")).toBe(sha256Hex("abc"));
    expect(sha256Hex("abc")).not.toBe(sha256Hex("abcd"));
  });

  it("HMAC depends on the key", () => {
    const a = hmacSha256(Buffer.alloc(32, 1), "x");
    const b = hmacSha256(Buffer.alloc(32, 2), "x");
    expect(a.equals(b)).toBe(false);
  });
});

describe("deidentify", () => {
  it("produces stable de-identification hashes for the same value", async () => {
    const a = await deidentify("scott@example.com");
    const b = await deidentify("scott@example.com");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes hash when the purpose changes", async () => {
    const a = await deidentify("scott@example.com", "research");
    const b = await deidentify("scott@example.com", "billing");
    expect(a).not.toBe(b);
  });
});

describe("EnvironmentKeyResolver", () => {
  it("throws when EMR_PHI_KEK is missing", async () => {
    const prev = process.env.EMR_PHI_KEK;
    delete process.env.EMR_PHI_KEK;
    const r = new EnvironmentKeyResolver("EMR_PHI_KEK");
    await expect(r.getKek()).rejects.toThrow(/refusing to encrypt PHI/);
    if (prev) process.env.EMR_PHI_KEK = prev;
  });

  it("throws when EMR_PHI_KEK is the wrong length", async () => {
    const prev = process.env.EMR_PHI_KEK;
    process.env.EMR_PHI_KEK = "short";
    const r = new EnvironmentKeyResolver("EMR_PHI_KEK");
    await expect(r.getKek()).rejects.toThrow(/must be 32 bytes/);
    if (prev) process.env.EMR_PHI_KEK = prev;
  });
});

describe("COMPLIANCE_CONTROLS catalog", () => {
  it("publishes at least the HIPAA encryption + audit controls", () => {
    const ids = COMPLIANCE_CONTROLS.map((c) => c.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "HIPAA-164.312(a)(2)(iv)",
        "HIPAA-164.312(b)",
        "HIPAA-Safe-Harbor",
      ]),
    );
  });

  it("references the companion docs path", () => {
    expect(FRAMEWORK_DOC_PATH).toBe("docs/compliance/encryption.md");
    expect(FRAMEWORK_VERSION).toBe(1);
  });
});
