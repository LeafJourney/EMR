/**
 * EMR-727 — EmergencyRevokeDialog: submit-gate unit test.
 *
 * Vitest in this repo runs in a node environment (no DOM, no
 * @testing-library/react). We export the dialog's pure validation predicate
 * `canSubmitEmergencyRevoke` so the same function the disabled-state of the
 * destructive button consults can be tested without rendering JSX.
 *
 * If this test ever passes while the dialog's button is enabled in a state
 * it should not be, the dialog has diverged from its predicate — fix the
 * dialog, not the test.
 *
 * Acceptance gate (from the EMR-727 UI ticket):
 *   - Dialog blocks submit until the operator types the target's email
 *     correctly AND supplies a reason ≥10 characters.
 */

import { describe, expect, it } from "vitest";
import { canSubmitEmergencyRevoke } from "../emergency-revoke-dialog";

const TARGET_EMAIL = "alice@leafjourney.com";
const GOOD_REASON = "compromised at 14:02 PT, see #incident-413"; // 41 chars

describe("canSubmitEmergencyRevoke", () => {
  it("blocks submit when nothing has been typed", () => {
    expect(
      canSubmitEmergencyRevoke({
        targetEmail: TARGET_EMAIL,
        confirmEmail: "",
        reason: "",
        submitting: false,
      }),
    ).toBe(false);
  });

  it("blocks submit when only the reason is provided (email empty)", () => {
    expect(
      canSubmitEmergencyRevoke({
        targetEmail: TARGET_EMAIL,
        confirmEmail: "",
        reason: GOOD_REASON,
        submitting: false,
      }),
    ).toBe(false);
  });

  it("blocks submit when only the email is provided (reason empty)", () => {
    expect(
      canSubmitEmergencyRevoke({
        targetEmail: TARGET_EMAIL,
        confirmEmail: TARGET_EMAIL,
        reason: "",
        submitting: false,
      }),
    ).toBe(false);
  });

  it("blocks submit when the email is wrong (typo)", () => {
    expect(
      canSubmitEmergencyRevoke({
        targetEmail: TARGET_EMAIL,
        confirmEmail: "alice@leafjourny.com", // missing 'e'
        reason: GOOD_REASON,
        submitting: false,
      }),
    ).toBe(false);
  });

  it("blocks submit when the reason is < 10 characters after trim", () => {
    expect(
      canSubmitEmergencyRevoke({
        targetEmail: TARGET_EMAIL,
        confirmEmail: TARGET_EMAIL,
        reason: "too short",
        submitting: false,
      }),
    ).toBe(false);
    expect(
      canSubmitEmergencyRevoke({
        targetEmail: TARGET_EMAIL,
        confirmEmail: TARGET_EMAIL,
        reason: "         exactly9", // trimmed to "exactly9" = 8 chars
        submitting: false,
      }),
    ).toBe(false);
  });

  it("blocks submit when the reason is > 500 characters", () => {
    const tooLong = "x".repeat(501);
    expect(
      canSubmitEmergencyRevoke({
        targetEmail: TARGET_EMAIL,
        confirmEmail: TARGET_EMAIL,
        reason: tooLong,
        submitting: false,
      }),
    ).toBe(false);
  });

  it("blocks submit while a previous request is in flight", () => {
    expect(
      canSubmitEmergencyRevoke({
        targetEmail: TARGET_EMAIL,
        confirmEmail: TARGET_EMAIL,
        reason: GOOD_REASON,
        submitting: true,
      }),
    ).toBe(false);
  });

  it("allows submit when email matches and reason is ≥10 chars", () => {
    expect(
      canSubmitEmergencyRevoke({
        targetEmail: TARGET_EMAIL,
        confirmEmail: TARGET_EMAIL,
        reason: GOOD_REASON,
        submitting: false,
      }),
    ).toBe(true);
  });

  it("accepts a case-insensitive email match with surrounding whitespace (matches server check)", () => {
    expect(
      canSubmitEmergencyRevoke({
        targetEmail: TARGET_EMAIL,
        confirmEmail: "  ALICE@LeafJourney.com  ",
        reason: GOOD_REASON,
        submitting: false,
      }),
    ).toBe(true);
  });

  it("accepts a reason at exactly 10 characters", () => {
    expect(
      canSubmitEmergencyRevoke({
        targetEmail: TARGET_EMAIL,
        confirmEmail: TARGET_EMAIL,
        reason: "1234567890", // 10 chars
        submitting: false,
      }),
    ).toBe(true);
  });

  it("accepts a reason at exactly 500 characters", () => {
    expect(
      canSubmitEmergencyRevoke({
        targetEmail: TARGET_EMAIL,
        confirmEmail: TARGET_EMAIL,
        reason: "x".repeat(500),
        submitting: false,
      }),
    ).toBe(true);
  });
});
