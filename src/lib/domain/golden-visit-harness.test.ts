import { describe, expect, it } from "vitest";

describe("Golden Visit harness", () => {
  it("walks one scheduled patient from booking to closeout without losing encounter continuity", async () => {
    await expect(runGoldenVisit()).resolves.toMatchObject({
      appointmentId: "appt_golden_1",
      encounterId: "enc_golden_1",
      finalEncounterStatus: "complete",
      duplicateActiveEncounterCount: 0,
      roomingHandoffVisibleToPhysician: true,
      noteFinalizedDispatchCount: 1,
      encounterCompletedDispatchCount: 1,
      closeoutReady: true,
    });
  });
});
