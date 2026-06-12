// Urgency Priority Index — scoring, routing, and EMR-1090 regression
// fixtures (EMR-1146 / EMR-1147).

import { describe, expect, it } from "vitest";
import { scoreDistress } from "../distress";
import { extractEntities } from "../entities";
import {
  computeUpi,
  DEFAULT_WEIGHTS,
  deriveVulnerabilityFlags,
  RED_FLAG_FLOOR,
  triageMessage,
  URGENT_AUTO_REPLY,
  URGENT_THRESHOLD,
  vulnerabilityScore,
} from "../index";
import { triageThread } from "@/lib/domain/smart-inbox";

// ── Distress (S_distress) ──────────────────────────────────────────────

describe("scoreDistress", () => {
  it("scores calm administrative text near zero", () => {
    const d = scoreDistress("Could I reschedule my appointment to Friday?");
    expect(d.score).toBe(0);
    expect(d.panicTerms).toHaveLength(0);
  });

  it("saturates on caps + exclamations + panic vocabulary", () => {
    const d = scoreDistress("HELP ME I CAN'T BREATHE!!!");
    expect(d.score).toBe(1);
    expect(d.panicTerms.length).toBeGreaterThanOrEqual(2);
    expect(d.exclamationCount).toBe(3);
  });

  it("picks up panic vocabulary in otherwise calm text", () => {
    const d = scoreDistress("I'm terrified about these symptoms");
    expect(d.panicTerms).toContain("terrified");
    expect(d.score).toBeGreaterThan(0);
    expect(d.score).toBeLessThan(0.5);
  });

  it("is deterministic and clamped to [0, 1]", () => {
    const text = "SCARED!!!! please help, I'm panicking, bleeding out!!!!!";
    const a = scoreDistress(text);
    const b = scoreDistress(text);
    expect(a).toEqual(b);
    expect(a.score).toBeLessThanOrEqual(1);
    expect(a.score).toBeGreaterThanOrEqual(0);
  });
});

// ── computeUpi (weighted sum + factors) ────────────────────────────────

describe("computeUpi", () => {
  it("uses w1=0.65 / w2=0.15 / w3=0.20 by default", () => {
    expect(DEFAULT_WEIGHTS).toEqual({ acuity: 0.65, distress: 0.15, vulnerability: 0.2 });
  });

  it("returns a full factor breakdown whose contributions sum to the weighted sum", () => {
    const entities = extractEntities("I keep vomiting since yesterday");
    const distress = scoreDistress("I keep vomiting since yesterday");
    const { score, factors } = computeUpi({
      entities,
      distress,
      vulnerability: { postOpWithin30Days: true },
    });
    const sum =
      factors.acuity.contribution +
      factors.distress.contribution +
      factors.vulnerability.contribution;
    expect(factors.weightedSum).toBeCloseTo(sum, 10);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
    expect(factors.vulnerability.activeFlags).toEqual(["Within 30-day post-op window"]);
  });

  it("floors active red-flag entities at RED_FLAG_FLOOR even with zero distress", () => {
    // "chest pain" stated calmly: 0.65*0.9 = 0.585 unfloored — the exact
    // shape of the EMR-1090 under-escalation. The floor guarantees urgent.
    const entities = extractEntities("I have chest pain.");
    const distress = scoreDistress("I have chest pain.");
    const { score, factors } = computeUpi({ entities, distress });
    expect(factors.redFlagFloorApplied).toBe(true);
    expect(score).toBe(RED_FLAG_FLOOR);
    expect(score).toBeGreaterThanOrEqual(URGENT_THRESHOLD);
  });

  it("does NOT apply the floor when the red flag is negated", () => {
    const text = "No chest pain at all today";
    const { score, factors } = computeUpi({
      entities: extractEntities(text),
      distress: scoreDistress(text),
    });
    expect(factors.redFlagFloorApplied).toBe(false);
    expect(score).toBeLessThan(0.2);
  });
});

describe("vulnerabilityScore / deriveVulnerabilityFlags", () => {
  it("is 0 with no flags and clamps at 1 with all flags", () => {
    expect(vulnerabilityScore(undefined)).toBe(0);
    expect(vulnerabilityScore({})).toBe(0);
    expect(
      vulnerabilityScore({
        severeCardiovascularDisease: true,
        advancedMetabolicInstability: true,
        postOpWithin30Days: true,
      }),
    ).toBe(1);
  });

  it("derives cardiovascular + metabolic flags from chart condition text", () => {
    const flags = deriveVulnerabilityFlags({
      conditions: [
        { condition: "Congestive heart failure (NYHA III)" },
        { condition: "Type 1 diabetes" },
      ],
    });
    expect(flags.severeCardiovascularDisease).toBe(true);
    expect(flags.advancedMetabolicInstability).toBe(true);
    expect(flags.postOpWithin30Days).toBe(false);
  });

  it("flags the 30-day post-op window from surgery recency", () => {
    const now = new Date("2026-06-12T00:00:00Z");
    const tenDaysAgo = new Date("2026-06-02T00:00:00Z");
    const ninetyDaysAgo = new Date("2026-03-14T00:00:00Z");
    expect(
      deriveVulnerabilityFlags({ surgeries: [{ createdAt: tenDaysAgo }], now })
        .postOpWithin30Days,
    ).toBe(true);
    expect(
      deriveVulnerabilityFlags({ surgeries: [{ createdAt: ninetyDaysAgo }], now })
        .postOpWithin30Days,
    ).toBe(false);
  });
});

// ── EMR-1090 regression fixtures (end-to-end triageMessage) ────────────

describe("triageMessage — EMR-1090 regressions", () => {
  it("(a) explicit emergency routes urgent with the 911/ED auto-reply", () => {
    const d = triageMessage(
      "I have crushing chest pain radiating to my arm, I'm terrified",
    );
    expect(d.upi).toBeGreaterThanOrEqual(0.75);
    expect(d.route).toBe("urgent");
    expect(d.autoReply).toBe(URGENT_AUTO_REPLY);
    expect(d.autoReply).toContain("911");
  });

  it("(b) benign logistics message with third-party resolved symptom stays low", () => {
    const d = triageMessage(
      "Can I move my appointment to Friday? My daughter had a rash last month but it's gone",
    );
    expect(d.upi).toBeLessThan(0.4);
    expect(d.route).toBe("standard");
    expect(d.autoReply).toBeUndefined();
    // the rash was seen but suppressed — visible in the factor breakdown
    const rash = d.factors.acuity.entities.find((e) => e.id === "rash");
    expect(rash).toBeDefined();
    expect(rash!.thirdParty || rash!.negated).toBe(true);
  });

  it("(c) negated symptom + refill question does not escalate", () => {
    const d = triageMessage("No chest pain, just a refill question");
    expect(d.route).toBe("standard");
    expect(d.upi).toBeLessThan(0.4);
    expect(d.factors.redFlagFloorApplied).toBe(false);
  });

  it("(d) third-party symptoms do not escalate", () => {
    const d = triageMessage(
      "My husband has been having seizures, can you recommend a neurologist for him?",
    );
    expect(d.route).toBe("standard");
    expect(d.upi).toBeLessThan(0.4);
  });

  it("(e) vulnerability multiplier raises a borderline case past the threshold", () => {
    const text = "I fainted twice today!! Scared it will happen again";
    const withoutFlags = triageMessage(text);
    expect(withoutFlags.route).toBe("standard");
    expect(withoutFlags.upi).toBeLessThan(URGENT_THRESHOLD);

    const withFlags = triageMessage(text, {
      vulnerability: { severeCardiovascularDisease: true },
    });
    expect(withFlags.route).toBe("urgent");
    expect(withFlags.upi).toBeGreaterThanOrEqual(URGENT_THRESHOLD);
    expect(withFlags.autoReply).toBe(URGENT_AUTO_REPLY);
    expect(withFlags.factors.vulnerability.activeFlags).toContain(
      "Severe cardiovascular disease",
    );
  });
});

// ── Wiring: triageThread (Smart Inbox) uses UPI as the primary signal ──

function msgs(...bodies: string[]) {
  return bodies.map((body, i) => ({
    body,
    senderUserId: "patient-user-1",
    senderAgent: null,
    createdAt: new Date(Date.UTC(2026, 5, 12, 8, i)).toISOString(),
  }));
}

describe("triageThread wiring (EMR-1090 regressions through the Smart Inbox path)", () => {
  it("escalates a real emergency to urgent with the UPI decision attached", () => {
    const r = triageThread(
      msgs("I have crushing chest pain radiating to my arm, I'm terrified"),
      "patient-user-1",
    );
    expect(r.priority).toBe("urgent");
    expect(r.needsClinician).toBe(true);
    expect(r.upi?.route).toBe("urgent");
    expect(r.upi?.autoReply).toContain("911");
  });

  it("does not over-triage the benign appointment + daughter's-rash message", () => {
    const r = triageThread(
      msgs(
        "Can I move my appointment to Friday? My daughter had a rash last month but it's gone",
      ),
      "patient-user-1",
    );
    expect(r.priority).toBe("routine");
    expect(r.category).toBe("appointment_request");
    expect(r.category).not.toBe("adverse_reaction");
    expect(r.upi?.route).toBe("standard");
    expect(r.upi?.upi ?? 1).toBeLessThan(0.4);
  });

  it("routes 'no chest pain, just a refill question' as a routine refill", () => {
    const r = triageThread(msgs("No chest pain, just a refill question"), "patient-user-1");
    expect(r.priority).toBe("routine");
    expect(r.category).toBe("refill_request");
    // legacy urgent keyword hit is surfaced as a suppressed advisory note
    expect(r.triageReason).toContain("suppressed");
  });

  it("keeps third-party emergencies out of the urgent queue", () => {
    const r = triageThread(
      msgs("My husband has been having seizures, can you recommend a neurologist for him?"),
      "patient-user-1",
    );
    expect(r.priority).not.toBe("urgent");
    expect(r.priority).not.toBe("high");
  });

  it("passes patient vulnerability context through to the UPI engine", () => {
    const messages = msgs("I fainted twice today!! Scared it will happen again");
    const without = triageThread(messages, "patient-user-1");
    expect(without.priority).not.toBe("urgent");

    const withContext = triageThread(messages, "patient-user-1", {
      vulnerability: { severeCardiovascularDisease: true },
    });
    expect(withContext.priority).toBe("urgent");
  });

  it("still classifies active mid-tier symptoms as high (fever + rash combo)", () => {
    const r = triageThread(
      msgs("I have a fever and a rash on my stomach since starting the new tincture"),
      "patient-user-1",
    );
    expect(r.priority).toBe("high");
    expect(r.category).toBe("adverse_reaction");
  });

  it("ignores clinician/agent messages when scoring", () => {
    const r = triageThread(
      [
        {
          body: "If you ever have chest pain, call 911 right away.",
          senderUserId: "clinician-user-9",
          senderAgent: null,
          createdAt: new Date().toISOString(),
        },
        {
          body: "Thanks! Just need my refill.",
          senderUserId: "patient-user-1",
          senderAgent: null,
          createdAt: new Date().toISOString(),
        },
      ],
      "patient-user-1",
    );
    expect(r.priority).toBe("routine");
    expect(r.category).toBe("refill_request");
  });
});
