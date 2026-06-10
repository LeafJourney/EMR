import { describe, expect, it } from "vitest";
import {
  type PhiAccessEvent,
  detectBroadAccess,
} from "./breach-detection";

const NOW = new Date("2026-06-06T12:00:00.000Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

/** N reads of distinct patients by one actor, all `minsAgo` minutes back. */
function reads(
  actor: string,
  org: string,
  patientCount: number,
  minsAgo = 1,
): PhiAccessEvent[] {
  return Array.from({ length: patientCount }, (_, i) => ({
    organizationId: org,
    actorUserId: actor,
    subjectId: `pt-${i}`,
    createdAt: minutesAgo(minsAgo),
  }));
}

describe("detectBroadAccess (EMR-633)", () => {
  it("flags an actor over the distinct-patient threshold", () => {
    const findings = detectBroadAccess(reads("u1", "org1", 60), {
      now: NOW,
      distinctPatientThreshold: 50,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      organizationId: "org1",
      actorUserId: "u1",
      distinctPatients: 60,
      totalReads: 60,
      threshold: 50,
    });
  });

  it("does not flag normal-volume access", () => {
    const findings = detectBroadAccess(reads("u1", "org1", 10), {
      now: NOW,
      distinctPatientThreshold: 50,
    });
    expect(findings).toEqual([]);
  });

  it("counts DISTINCT patients, not raw reads", () => {
    // 100 reads but only of 3 patients → below a 50-distinct threshold.
    const events: PhiAccessEvent[] = Array.from({ length: 100 }, (_, i) => ({
      organizationId: "org1",
      actorUserId: "u1",
      subjectId: `pt-${i % 3}`,
      createdAt: minutesAgo(1),
    }));
    expect(
      detectBroadAccess(events, { now: NOW, distinctPatientThreshold: 50 }),
    ).toEqual([]);
  });

  it("ignores events outside the trailing window", () => {
    const old = reads("u1", "org1", 60, 120); // 2h ago, window is 60m
    expect(
      detectBroadAccess(old, {
        now: NOW,
        windowMs: 60 * 60_000,
        distinctPatientThreshold: 50,
      }),
    ).toEqual([]);
  });

  it("scopes per (org, actor) and skips events missing identifiers", () => {
    const events: PhiAccessEvent[] = [
      ...reads("u1", "org1", 60),
      ...reads("u1", "org2", 10), // same actor, different org — separate group
      { organizationId: null, actorUserId: "u1", subjectId: "x", createdAt: minutesAgo(1) },
      { organizationId: "org1", actorUserId: null, subjectId: "x", createdAt: minutesAgo(1) },
    ];
    const findings = detectBroadAccess(events, {
      now: NOW,
      distinctPatientThreshold: 50,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].organizationId).toBe("org1");
  });

  it("sorts findings by distinct-patient count desc", () => {
    const events = [...reads("low", "org1", 55), ...reads("high", "org1", 90)];
    const findings = detectBroadAccess(events, {
      now: NOW,
      distinctPatientThreshold: 50,
    });
    expect(findings.map((f) => f.actorUserId)).toEqual(["high", "low"]);
  });
});
