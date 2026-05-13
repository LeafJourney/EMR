import { describe, expect, it } from "vitest";
import {
  COMPLIANCE_ATTESTATIONS,
  INTELLECTUAL_PROPERTY,
  LICENSEE_TIERS,
  SAMPLE_CONTRACTS,
  buildFrameworkSummary,
} from "./licensing-framework";

describe("licensing framework data", () => {
  it("declares every required licensee tier", () => {
    const kinds = LICENSEE_TIERS.map((t) => t.kind);
    expect(kinds).toEqual(
      expect.arrayContaining([
        "outpatient_clinic",
        "specialty_practice",
        "hospital",
        "health_system",
        "ehr_vendor_partner",
        "research_institution",
      ]),
    );
  });

  it("never lists a tier with negative pricing", () => {
    for (const t of LICENSEE_TIERS) {
      expect(t.startingPricePerProvider).toBeGreaterThanOrEqual(0);
    }
  });

  it("includes patent + trademark + trade-secret claims", () => {
    const kinds = new Set(INTELLECTUAL_PROPERTY.map((c) => c.kind));
    expect(kinds.has("patent_pending")).toBe(true);
    expect(kinds.has("trademark")).toBe(true);
    expect(kinds.has("trade_secret")).toBe(true);
  });

  it("publishes BAA + MSA + DPA contract templates", () => {
    const kinds = SAMPLE_CONTRACTS.map((c) => c.kind);
    expect(kinds).toEqual(
      expect.arrayContaining([
        "master_services_agreement",
        "business_associate_agreement",
        "data_processing_addendum",
      ]),
    );
  });

  it("references HIPAA, 42 CFR Part 2, and Joint Commission in attestations", () => {
    const frameworks = COMPLIANCE_ATTESTATIONS.map((a) => a.framework);
    expect(frameworks).toEqual(
      expect.arrayContaining(["HIPAA", "42 CFR Part 2", "Joint Commission"]),
    );
  });

  it("each attestation lists at least one evidence artifact", () => {
    for (const a of COMPLIANCE_ATTESTATIONS) {
      expect(a.evidenceArtifacts.length).toBeGreaterThan(0);
    }
  });
});

describe("buildFrameworkSummary", () => {
  it("counts IP claims by kind", () => {
    const s = buildFrameworkSummary();
    const total =
      s.ipCounts.patent_pending +
      s.ipCounts.patent_filed +
      s.ipCounts.trademark +
      s.ipCounts.trade_secret +
      s.ipCounts.copyright;
    expect(total).toBe(INTELLECTUAL_PROPERTY.length);
  });

  it("sets hasPatentPending iff there's at least one patent-pending claim", () => {
    const s = buildFrameworkSummary();
    expect(s.hasPatentPending).toBe(s.ipCounts.patent_pending > 0);
  });

  it("returns all attestation frameworks for the badge row", () => {
    const s = buildFrameworkSummary();
    expect(s.attestationFrameworks.length).toBe(COMPLIANCE_ATTESTATIONS.length);
  });
});
