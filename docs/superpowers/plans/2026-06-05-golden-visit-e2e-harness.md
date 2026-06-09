# Golden Visit E2E Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic Golden Visit release gate that proves one scheduled patient can move from appointment booking through kiosk check-in, rooming, physician start, note finalization, and billing/closeout evidence without losing encounter continuity.

**Architecture:** Keep hard business assertions in a Vitest integration harness that uses existing domain/server-action functions and an in-memory Prisma double. Add a small Playwright smoke spec for route crash detection only. Add package scripts so CI/CD and local operators can run the deterministic harness and optional browser smoke by name.

**Tech Stack:** Next.js 14, TypeScript, Vitest, Playwright, Prisma mock doubles, existing LeafJourney visit-state/check-in/note/billing domain helpers.

---

## File Structure

- Create: `src/lib/domain/golden-visit-harness.test.ts`
  - Test-only deterministic Golden Visit harness.
  - Owns in-memory fixture state, Prisma mock, auth mock, helper assertions, and the full scheduled-visit journey.
  - Imports real workflow functions: `bookAppointment`, `ensureEncounterForAppointment`, `kioskVerifyDob`, `kioskCheckIn`, `moveQueueEncounter`, `saveRoomingHandoff`, `startVisit`, `saveAndFinalizeNote`, `buildVisitCompletionBundle`, `scrubClaim`, and `isClaimSubmittable`.
- Create: `e2e/golden-visit-surfaces.spec.ts`
  - Browser smoke spec for route health only.
  - Skips authed surfaces unless `.auth/clerk.json` or `TEST_USER_EMAIL`/`TEST_USER_PASSWORD` is available.
  - Fails on server-component error cards, HTTP 5xx, and obvious rendered crash text.
- Modify: `package.json`
  - Add `test:golden-visit`.
  - Add `e2e:golden-visit`.
- Optional after implementation exposes a real bug: modify the affected production file only after the failing Golden Visit test identifies the break.

---

## Task 1: Add Golden Visit Release-Gate Scripts

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Update package scripts**

Add two scripts after the existing `test` script:

```json
"test": "vitest run",
"test:golden-visit": "vitest run src/lib/domain/golden-visit-harness.test.ts",
"e2e:golden-visit": "playwright test e2e/golden-visit-surfaces.spec.ts",
"test:watch": "vitest",
```

- [ ] **Step 2: Verify package JSON parses**

Run:

```bash
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package.json ok')"
```

Expected:

```text
package.json ok
```

- [ ] **Step 3: Commit the script change**

```bash
git add package.json
git commit -m "test: add golden visit release gate scripts"
```

---

## Task 2: Create The Failing Golden Visit Harness Skeleton

**Files:**
- Create: `src/lib/domain/golden-visit-harness.test.ts`

- [ ] **Step 1: Add the initial failing test**

Create `src/lib/domain/golden-visit-harness.test.ts` with this content:

```ts
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
```

This intentionally references `runGoldenVisit` before it exists.

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test:golden-visit
```

Expected: FAIL with a TypeScript/runtime error that `runGoldenVisit` is not defined.

- [ ] **Step 3: Commit the failing skeleton**

```bash
git add src/lib/domain/golden-visit-harness.test.ts
git commit -m "test: sketch golden visit harness expectation"
```

---

## Task 3: Implement The In-Memory Fixture And Prisma Double

**Files:**
- Modify: `src/lib/domain/golden-visit-harness.test.ts`

- [ ] **Step 1: Add hoisted mocks and fixture state above the test**

Replace the file with this structure. Keep the final `describe` block from Task 2 at the bottom.

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const FIXED_NOW = new Date("2099-06-05T16:00:00.000Z");
const ORG_ID = "org_golden";
const PATIENT_ID = "patient_golden";
const PATIENT_USER_ID = "user_patient_golden";
const PROVIDER_ID = "provider_golden";
const PHYSICIAN_USER_ID = "user_physician_golden";
const FRONT_DESK_USER_ID = "user_front_desk_golden";
const MA_USER_ID = "user_ma_golden";
const KIOSK_USER_ID = "user_kiosk_golden";
const APPOINTMENT_ID = "appt_golden_1";
const ENCOUNTER_ID = "enc_golden_1";
const NOTE_ID = "note_golden_1";

type RoleUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
  organizationId: string;
  organizationName: string;
};

type GoldenState = {
  patients: any[];
  providers: any[];
  appointments: any[];
  encounters: any[];
  notes: any[];
  auditLogs: any[];
  financialEvents: any[];
  dispatchEvents: any[];
  user: RoleUser;
};

function user(id: string, roles: string[]): RoleUser {
  return {
    id,
    email: `${id}@golden.local`,
    firstName: id.includes("physician") ? "Golden" : "Test",
    lastName: id.includes("physician") ? "Physician" : "User",
    roles,
    organizationId: ORG_ID,
    organizationName: "Golden Clinic",
  };
}

const h = vi.hoisted(() => {
  const state: GoldenState = {
    patients: [],
    providers: [],
    appointments: [],
    encounters: [],
    notes: [],
    auditLogs: [],
    financialEvents: [],
    dispatchEvents: [],
    user: user(PATIENT_USER_ID, ["patient"]),
  };

  const now = () => new Date(FIXED_NOW);
  const clone = <T>(value: T): T => ({ ...(value as any) });

  function dayRangeContains(value: Date | null | undefined, range: any): boolean {
    if (!value) return false;
    const t = value.getTime();
    if (range?.gte && t < range.gte.getTime()) return false;
    if (range?.lte && t > range.lte.getTime()) return false;
    if (range?.lt && t >= range.lt.getTime()) return false;
    if (range?.gt && t <= range.gt.getTime()) return false;
    return true;
  }

  function patientMatches(row: any, where: any): boolean {
    if (!where) return true;
    if (where.id && row.id !== where.id) return false;
    if (where.userId && row.userId !== where.userId) return false;
    if (where.organizationId && row.organizationId !== where.organizationId) return false;
    if (where.deletedAt === null && row.deletedAt !== null) return false;
    return true;
  }

  function appointmentMatches(row: any, where: any): boolean {
    if (!where) return true;
    if (where.id && row.id !== where.id) return false;
    if (where.patientId && row.patientId !== where.patientId) return false;
    if (where.providerId && row.providerId !== where.providerId) return false;
    if (where.status?.in && !where.status.in.includes(row.status)) return false;
    if (typeof where.status === "string" && row.status !== where.status) return false;
    if (where.startAt?.lt && !dayRangeContains(row.startAt, { lt: where.startAt.lt })) return false;
    if (where.endAt?.gt && !dayRangeContains(row.endAt, { gt: where.endAt.gt })) return false;
    if (where.startAt?.gte || where.startAt?.lte) {
      if (!dayRangeContains(row.startAt, where.startAt)) return false;
    }
    if (where.encounter?.is === null && state.encounters.some((e) => e.appointmentId === row.id)) {
      return false;
    }
    if (where.patient?.userId) {
      const p = state.patients.find((x) => x.id === row.patientId);
      if (!p || p.userId !== where.patient.userId) return false;
    }
    if (where.patient?.organizationId) {
      const p = state.patients.find((x) => x.id === row.patientId);
      if (!p || p.organizationId !== where.patient.organizationId) return false;
    }
    if (where.patient?.deletedAt === null) {
      const p = state.patients.find((x) => x.id === row.patientId);
      if (!p || p.deletedAt !== null) return false;
    }
    if (where.NOT?.notes?.startsWith && row.notes?.startsWith(where.NOT.notes.startsWith)) return false;
    return true;
  }

  function encounterMatches(row: any, where: any): boolean {
    if (!where) return true;
    if (where.id && row.id !== where.id) return false;
    if (where.patientId && row.patientId !== where.patientId) return false;
    if (where.organizationId && row.organizationId !== where.organizationId) return false;
    if (where.appointmentId && row.appointmentId !== where.appointmentId) return false;
    if (where.status?.in && !where.status.in.includes(row.status)) return false;
    if (typeof where.status === "string" && row.status !== where.status) return false;
    if (where.OR) {
      const ok = where.OR.some((clause: any) => {
        if (clause.scheduledFor) return dayRangeContains(row.scheduledFor, clause.scheduledFor);
        if (clause.createdAt) return dayRangeContains(row.createdAt, clause.createdAt);
        return false;
      });
      if (!ok) return false;
    }
    if (where.chartingCompletedAt === null && row.chartingCompletedAt !== null) return false;
    return true;
  }

  function includeAppointment(row: any, include: any) {
    const result = clone(row);
    if (include?.encounter) {
      result.encounter = state.encounters.find((e) => e.appointmentId === row.id) ?? null;
    }
    if (include?.patient) {
      const p = state.patients.find((x) => x.id === row.patientId) ?? null;
      result.patient = p ? clone(p) : null;
    }
    return result;
  }

  function includeEncounter(row: any, include: any) {
    const result = clone(row);
    if (include?.provider) {
      const provider = state.providers.find((p) => p.id === row.providerId) ?? null;
      result.provider = provider
        ? { ...provider, user: { firstName: "Golden", lastName: "Physician" } }
        : null;
    }
    return result;
  }

  const prismaMock = {
    patient: {
      findFirst: vi.fn(async ({ where, select }: any) => {
        const row = state.patients.find((p) => patientMatches(p, where));
        if (!row) return null;
        if (select) {
          const selected: any = {};
          for (const key of Object.keys(select)) selected[key] = row[key];
          return selected;
        }
        return clone(row);
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const row = state.patients.find((p) => p.id === where.id);
        Object.assign(row, data);
        return clone(row);
      }),
    },
    provider: {
      findFirst: vi.fn(async ({ where, select }: any) => {
        const row = state.providers.find(
          (p) =>
            (!where.id || p.id === where.id) &&
            (!where.userId || p.userId === where.userId) &&
            (!where.organizationId || p.organizationId === where.organizationId) &&
            (where.active === undefined || p.active === where.active),
        );
        if (!row) return null;
        if (select) {
          const selected: any = {};
          for (const key of Object.keys(select)) selected[key] = row[key];
          return selected;
        }
        return clone(row);
      }),
    },
    appointment: {
      findFirst: vi.fn(async ({ where, orderBy }: any) => {
        const rows = state.appointments.filter((a) => appointmentMatches(a, where));
        if (orderBy?.startAt === "asc") rows.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
        return rows[0] ? clone(rows[0]) : null;
      }),
      findUnique: vi.fn(async ({ where, include }: any) => {
        const row = state.appointments.find((a) => a.id === where.id);
        return row ? includeAppointment(row, include) : null;
      }),
      create: vi.fn(async ({ data }: any) => {
        const row = {
          id: APPOINTMENT_ID,
          patientId: data.patientId,
          providerId: data.providerId,
          status: data.status,
          startAt: data.startAt,
          endAt: data.endAt,
          modality: data.modality,
          notes: data.notes ?? null,
        };
        state.appointments.push(row);
        return clone(row);
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const row = state.appointments.find((a) => a.id === where.id);
        Object.assign(row, data);
        return clone(row);
      }),
    },
    encounter: {
      findFirst: vi.fn(async ({ where, orderBy, include }: any) => {
        const rows = state.encounters.filter((e) => encounterMatches(e, where));
        if (orderBy?.scheduledFor === "asc") {
          rows.sort((a, b) => (a.scheduledFor?.getTime() ?? 0) - (b.scheduledFor?.getTime() ?? 0));
        }
        const row = rows[0];
        return row ? includeEncounter(row, include) : null;
      }),
      findMany: vi.fn(async ({ where, orderBy }: any) => {
        const rows = state.encounters.filter((e) => encounterMatches(e, where));
        if (orderBy?.scheduledFor === "desc") {
          rows.sort((a, b) => (b.scheduledFor?.getTime() ?? 0) - (a.scheduledFor?.getTime() ?? 0));
        }
        return rows.map(clone);
      }),
      findUnique: vi.fn(async ({ where }: any) => {
        const row = where.appointmentId
          ? state.encounters.find((e) => e.appointmentId === where.appointmentId)
          : state.encounters.find((e) => e.id === where.id);
        return row ? clone(row) : null;
      }),
      create: vi.fn(async ({ data }: any) => {
        const row = {
          id: ENCOUNTER_ID,
          organizationId: data.organizationId,
          patientId: data.patientId,
          providerId: data.providerId ?? null,
          renderingProviderId: data.renderingProviderId ?? null,
          appointmentId: data.appointmentId ?? null,
          status: data.status,
          scheduledFor: data.scheduledFor ?? now(),
          modality: data.modality ?? "in_person",
          reason: data.reason ?? null,
          createdAt: now(),
          startedAt: data.startedAt ?? null,
          checkedInAt: null,
          roomingStartedAt: null,
          roomedAt: null,
          completedAt: null,
          chartingCompletedAt: null,
          briefingContext: data.briefingContext ?? null,
        };
        state.encounters.push(row);
        return clone(row);
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const row = state.encounters.find((e) => e.id === where.id);
        Object.assign(row, data);
        return clone(row);
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        let count = 0;
        for (const row of state.encounters.filter((e) => encounterMatches(e, where))) {
          Object.assign(row, data);
          count += 1;
        }
        return { count };
      }),
    },
    note: {
      findFirst: vi.fn(async ({ where }: any) => {
        const rows = state.notes.filter((n) => !where.encounterId || n.encounterId === where.encounterId);
        return rows[0] ? clone(rows[0]) : null;
      }),
      findUnique: vi.fn(async ({ where, include }: any) => {
        const row = state.notes.find((n) => n.id === where.id);
        if (!row) return null;
        const result = clone(row);
        if (include?.encounter) result.encounter = clone(state.encounters.find((e) => e.id === row.encounterId));
        return result;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const row = state.notes.find((n) => n.id === where.id);
        Object.assign(row, data);
        return clone(row);
      }),
      count: vi.fn(async ({ where }: any) =>
        state.notes.filter((n) => n.encounterId === where.encounterId && n.status !== where.status.not).length,
      ),
    },
    auditLog: {
      create: vi.fn(async ({ data }: any) => {
        const row = { id: `audit_${state.auditLogs.length + 1}`, ...data };
        state.auditLogs.push(row);
        return clone(row);
      }),
    },
    agentJob: {
      findMany: vi.fn(async () => []),
    },
  };

  return {
    state,
    prismaMock,
    requireUserMock: vi.fn(async () => state.user),
    requireRoleMock: vi.fn(async () => state.user),
    dispatchMock: vi.fn(async (event: any) => {
      state.dispatchEvents.push(event);
      if (event.name === "encounter.note.draft.requested") return ["job_golden_1"];
      return [];
    }),
    runTickMock: vi.fn(async () => undefined),
    runJobMock: vi.fn(async () => undefined),
  };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: h.prismaMock }));
vi.mock("@/lib/auth/session", () => ({
  requireUser: () => h.requireUserMock(),
  requireRole: (role: string) => h.requireRoleMock(role),
}));
vi.mock("@/lib/orchestration/dispatch", () => ({ dispatch: h.dispatchMock }));
vi.mock("@/lib/orchestration/runner", () => ({
  runTick: h.runTickMock,
  runJob: h.runJobMock,
}));
vi.mock("@/lib/observability/log", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
```

- [ ] **Step 2: Add fixture reset before each test**

Add this below the module mocks and imports:

```ts
import { bookAppointment } from "@/app/(patient)/portal/schedule/actions";
import { kioskCheckIn, kioskVerifyDob } from "@/app/kiosk/(console)/actions";
import { moveQueueEncounter, saveRoomingHandoff } from "@/app/(operator)/ops/queue/actions";
import { startVisit } from "@/app/(clinician)/clinic/patients/[id]/actions";
import { saveAndFinalizeNote } from "@/app/(clinician)/clinic/patients/[id]/notes/[noteId]/actions";
import { ensureEncounterForAppointment } from "./ensure-encounter";
import { buildVisitCompletionBundle } from "./visit-completion";
import {
  applyVisitCompletionAction,
  buildVisitCompletionReleasePayload,
  initializeVisitCompletionSelection,
} from "./visit-completion-selection";
import { scrubClaim, isClaimSubmittable } from "@/lib/billing/scrub";

beforeEach(() => {
  vi.clearAllMocks();
  h.state.patients.length = 0;
  h.state.providers.length = 0;
  h.state.appointments.length = 0;
  h.state.encounters.length = 0;
  h.state.notes.length = 0;
  h.state.auditLogs.length = 0;
  h.state.financialEvents.length = 0;
  h.state.dispatchEvents.length = 0;
  h.state.user = user(PATIENT_USER_ID, ["patient"]);

  h.state.patients.push({
    id: PATIENT_ID,
    userId: PATIENT_USER_ID,
    firstName: "Golden",
    lastName: "Patient",
    dateOfBirth: new Date("1954-02-11T00:00:00.000Z"),
    organizationId: ORG_ID,
    deletedAt: null,
    chartRestricted: false,
    restrictedProviderIds: [],
    chartRestrictedReason: null,
    intakeAnswers: {
      demographics: { confirmed: true },
      insurance: { payerName: "Blue Cross", memberId: "GOLD123" },
      signedForms: { consent: { signedAt: FIXED_NOW.toISOString() } },
    },
  });

  h.state.providers.push({
    id: PROVIDER_ID,
    userId: PHYSICIAN_USER_ID,
    organizationId: ORG_ID,
    active: true,
  });
});
```

- [ ] **Step 3: Run the test to identify the next missing implementation**

Run:

```bash
npm run test:golden-visit
```

Expected: FAIL because `runGoldenVisit` still does not exist.

---

## Task 4: Implement The Golden Visit Driver

**Files:**
- Modify: `src/lib/domain/golden-visit-harness.test.ts`

- [ ] **Step 1: Add helper assertions**

Add this above the `describe` block:

```ts
function activeEncountersForPatient() {
  return h.state.encounters.filter(
    (e: any) =>
      e.patientId === PATIENT_ID &&
      !["complete", "cancelled", "no_show"].includes(e.status),
  );
}

function expectSingleActiveEncounter(label: string) {
  const active = activeEncountersForPatient();
  expect(active, `${label}: duplicate active encounter count`).toHaveLength(1);
  expect(active[0].id, `${label}: encounter id continuity`).toBe(ENCOUNTER_ID);
  return active[0];
}

function dispatchCount(name: string) {
  return h.state.dispatchEvents.filter((event: any) => event.name === name).length;
}

function noteBlocks() {
  return [
    {
      heading: "Subjective",
      body: "Golden Patient reports chronic pain, mild daytime somnolence with CBD dose changes, and good adherence.",
    },
    {
      heading: "Objective",
      body: "BP 142/88, weight 168 lb. MA handoff: BP a little high.",
    },
    {
      heading: "Assessment",
      body: "Chronic pain with medication management. No acute red flags.",
    },
    {
      heading: "Plan",
      body: "Adjust evening regimen, monitor somnolence, repeat labs, and return to clinic in 6 weeks.",
    },
  ];
}
```

- [ ] **Step 2: Add `runGoldenVisit`**

Add this above the `describe` block:

```ts
async function runGoldenVisit() {
  vi.setSystemTime(FIXED_NOW);

  const booked = await bookAppointment({
    patientId: PATIENT_ID,
    providerId: PROVIDER_ID,
    slotDate: "2099-06-05",
    slotStartTime: "09:00",
    appointmentType: "follow_up",
    modality: "in_person",
    reason: "Golden Visit harness follow-up",
  });
  expect(booked).toEqual({ ok: true, id: APPOINTMENT_ID });

  h.state.appointments[0].status = "confirmed";

  const materialized = await ensureEncounterForAppointment(APPOINTMENT_ID);
  expect(materialized?.id).toBe(ENCOUNTER_ID);
  expectSingleActiveEncounter("after encounter materialization");

  h.state.user = user(KIOSK_USER_ID, ["kiosk"]);
  const verified = await kioskVerifyDob(PATIENT_ID, "1954-02-11");
  expect(verified.ok).toBe(true);
  expect(verified.context?.appointment?.encounterId).toBe(ENCOUNTER_ID);

  const checkedIn = await kioskCheckIn(PATIENT_ID);
  expect(checkedIn).toMatchObject({ ok: true, status: "checked_in", alreadyCheckedIn: false });
  expect(expectSingleActiveEncounter("after kiosk check-in").status).toBe("checked_in");

  const secondCheckIn = await kioskCheckIn(PATIENT_ID);
  expect(secondCheckIn).toMatchObject({ ok: true, status: "checked_in", alreadyCheckedIn: true });

  h.state.user = user(MA_USER_ID, ["back_office"]);
  await expect(moveQueueEncounter({ encounterId: ENCOUNTER_ID, target: "rooming" })).resolves.toEqual({ ok: true });
  expect(expectSingleActiveEncounter("after rooming start").status).toBe("rooming");

  await expect(
    saveRoomingHandoff({
      encounterId: ENCOUNTER_ID,
      room: "A3",
      handoffNote: "BP a little high; patient anxious about new dose.",
      readinessFlags: ["bp_recheck", "review_cbd_somnolence"],
    }),
  ).resolves.toEqual({ ok: true });

  await expect(moveQueueEncounter({ encounterId: ENCOUNTER_ID, target: "roomed" })).resolves.toEqual({ ok: true });
  const roomed = expectSingleActiveEncounter("after roomed");
  expect(roomed.status).toBe("roomed");
  expect(roomed.briefingContext.rooming).toMatchObject({
    room: "A3",
    handoffNote: "BP a little high; patient anxious about new dose.",
    readinessFlags: ["bp_recheck", "review_cbd_somnolence"],
  });

  h.state.user = user(PHYSICIAN_USER_ID, ["clinician"]);
  h.state.notes.push({
    id: NOTE_ID,
    encounterId: ENCOUNTER_ID,
    status: "draft",
    aiDrafted: false,
    blocks: noteBlocks(),
    authorUserId: null,
    createdAt: FIXED_NOW,
  });

  await expect(startVisit(PATIENT_ID)).rejects.toThrow(`redirect:/clinic/patients/${PATIENT_ID}/notes/${NOTE_ID}`);
  const inVisit = expectSingleActiveEncounter("after physician start");
  expect(inVisit.status).toBe("in_progress");
  expect(inVisit.providerId).toBe(PROVIDER_ID);
  expect(inVisit.briefingContext.rooming.handoffNote).toContain("BP a little high");

  await expect(startVisit(PATIENT_ID)).rejects.toThrow(`redirect:/clinic/patients/${PATIENT_ID}/notes/${NOTE_ID}`);
  expectSingleActiveEncounter("after repeat physician start");

  const finalized = await saveAndFinalizeNote(NOTE_ID, noteBlocks());
  expect(finalized).toEqual({ ok: true, status: "finalized" });
  expect(h.state.encounters.find((e: any) => e.id === ENCOUNTER_ID)?.status).toBe("complete");

  const repeatFinalize = await saveAndFinalizeNote(NOTE_ID, noteBlocks());
  expect(repeatFinalize).toEqual({ ok: true, status: "finalized" });

  const completionBundle = buildVisitCompletionBundle({
    patientFirstName: "Golden",
    blocks: noteBlocks(),
    hasFutureAppointment: false,
    codingSuggestion: {
      emLevel: "99214",
      rationale: "Medication management with chronic pain and follow-up planning.",
      icd10: [{ code: "G89.29", label: "Chronic pain", confidence: 0.91 }],
    },
  });

  let selection = initializeVisitCompletionSelection(completionBundle);
  for (const card of completionBundle.cards) {
    selection = applyVisitCompletionAction(completionBundle, selection, {
      type: "confirm_card",
      cardId: card.id,
      confirmationNote: `${card.title} reviewed in Golden Visit harness.`,
    });
  }
  const releasePayload = buildVisitCompletionReleasePayload(completionBundle, selection);
  expect(releasePayload.canRelease).toBe(true);

  const scrubIssues = scrubClaim({
    cptCodes: [{ code: "99214", label: "Established patient visit", chargeAmount: 18000 }],
    icd10Codes: [{ code: "G89.29", label: "Chronic pain" }],
    payerName: "Blue Cross",
    serviceDate: FIXED_NOW,
    providerId: PROVIDER_ID,
    patientCoverage: { eligibilityStatus: "active", payerName: "Blue Cross" },
  });
  expect(isClaimSubmittable(scrubIssues)).toBe(true);

  return {
    appointmentId: APPOINTMENT_ID,
    encounterId: ENCOUNTER_ID,
    finalEncounterStatus: h.state.encounters.find((e: any) => e.id === ENCOUNTER_ID)?.status,
    duplicateActiveEncounterCount: activeEncountersForPatient().filter((e: any) => e.id !== ENCOUNTER_ID).length,
    roomingHandoffVisibleToPhysician: Boolean(
      h.state.encounters.find((e: any) => e.id === ENCOUNTER_ID)?.briefingContext?.rooming?.handoffNote,
    ),
    noteFinalizedDispatchCount: dispatchCount("note.finalized"),
    encounterCompletedDispatchCount: dispatchCount("encounter.completed"),
    closeoutReady: releasePayload.canRelease && isClaimSubmittable(scrubIssues),
  };
}
```

- [ ] **Step 3: Add fake timers cleanup**

Add this after `beforeEach`:

```ts
afterEach(() => {
  vi.useRealTimers();
});
```

Also update the Vitest import:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
```

Inside `runGoldenVisit`, add before `vi.setSystemTime(FIXED_NOW);`:

```ts
vi.useFakeTimers();
```

- [ ] **Step 4: Run the harness**

Run:

```bash
npm run test:golden-visit
```

Expected: PASS. If it fails because a production function has a real continuity bug, keep the failing assertion, fix the production bug in the smallest affected file, and re-run.

- [ ] **Step 5: Commit the deterministic harness**

```bash
git add src/lib/domain/golden-visit-harness.test.ts
git commit -m "test: add deterministic golden visit harness"
```

---

## Task 5: Add Optional Playwright Route Smoke

**Files:**
- Create: `e2e/golden-visit-surfaces.spec.ts`

- [ ] **Step 1: Add the browser smoke spec**

Create `e2e/golden-visit-surfaces.spec.ts`:

```ts
import { test, expect, type Page } from "@playwright/test";
import { existsSync } from "node:fs";

const AUTH_FILE = ".auth/clerk.json";
const PUBLIC_ROUTES = ["/kiosk"];
const AUTHED_ROUTES = ["/portal", "/ops/queue", "/clinic"];

async function assertNoServerCrash(page: Page) {
  const body = await page.locator("body").innerText();
  expect(body).not.toContain("Something went wrong");
  expect(body).not.toContain("We couldn't load that");
  expect(body).not.toContain("An error occurred in the Server Components render");
  expect(body).not.toContain("[object Object]");
}

test.describe("Golden Visit route smoke", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`public surface loads: ${route}`, async ({ page, request }) => {
      const res = await request.get(route, { maxRedirects: 0 });
      expect(res.status()).toBeLessThan(500);

      const pageRes = await page.goto(route, { waitUntil: "domcontentloaded" });
      expect(pageRes?.status() ?? 200).toBeLessThan(500);
      await assertNoServerCrash(page);
    });
  }

  test.describe("authenticated surfaces", () => {
    test.skip(
      !existsSync(AUTH_FILE) && (!process.env.TEST_USER_EMAIL || !process.env.TEST_USER_PASSWORD),
      "Golden Visit authed smoke requires .auth/clerk.json or TEST_USER_EMAIL/TEST_USER_PASSWORD.",
    );

    for (const route of AUTHED_ROUTES) {
      test(`authed surface loads: ${route}`, async ({ page, request }) => {
        const res = await request.get(route, { maxRedirects: 2 });
        expect(res.status()).toBeLessThan(500);

        const pageRes = await page.goto(route, { waitUntil: "domcontentloaded" });
        expect(pageRes?.status() ?? 200).toBeLessThan(500);
        await assertNoServerCrash(page);
      });
    }
  });
});
```

- [ ] **Step 2: Run the smoke spec only when a local server is running**

Run:

```bash
npm run e2e:golden-visit
```

Expected with no dev server: FAIL in `e2e/global-setup.ts` with the existing actionable "dev server is not running" message.

Expected with dev server and auth unavailable: public `/kiosk` check runs; authenticated checks skip.

- [ ] **Step 3: Commit the smoke spec**

```bash
git add e2e/golden-visit-surfaces.spec.ts
git commit -m "test: add golden visit route smoke"
```

---

## Task 6: Verification Gate

**Files:**
- No new files unless a real bug fix was required.

- [ ] **Step 1: Run the Golden Visit harness**

```bash
npm run test:golden-visit
```

Expected: PASS.

- [ ] **Step 2: Run adjacent regression tests**

```bash
npm test -- src/lib/domain/visit-journey.integration.test.ts src/lib/domain/ensure-encounter.test.ts src/app/api/mobile/kiosk/check-in/route.test.ts src/app/\(operator\)/ops/queue/actions.test.ts src/app/\(clinician\)/clinic/patients/\[id\]/actions.start-visit.test.ts src/app/\(clinician\)/clinic/patients/\[id\]/notes/\[noteId\]/actions.finalize-idempotent.test.ts src/lib/domain/visit-completion.test.ts src/lib/domain/visit-completion-selection.test.ts src/lib/agents/billing/charge-integrity-agent.test.ts src/lib/agents/billing/clearinghouse-submission-agent.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Run lint**

```bash
npm run lint
```

Expected: PASS, or report the exact pre-existing lint failure if the repo has a known lint baseline issue.

- [ ] **Step 5: Run build when typecheck/lint pass**

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit any verification-only documentation if needed**

If implementation exposed no production bug and only test/script files changed, no extra commit is needed beyond prior task commits.

If a production bug was fixed, use `git status --short` to identify the exact changed production and test files, then commit those exact paths with a message that names the failed Golden Visit phase. For example, if the queue rooming transition was the failing phase:

```bash
git add src/app/\(operator\)/ops/queue/actions.ts src/lib/domain/golden-visit-harness.test.ts
git commit -m "fix: preserve golden visit continuity during queue rooming"
```

---

## Task 7: Publish And Update Linear

**Files:**
- No file changes expected.

- [ ] **Step 1: Inspect final branch state**

```bash
git status -sb
git log --oneline --decorate --max-count=8
```

Expected: clean working tree on `test/golden-visit-e2e`.

- [ ] **Step 2: Push branch**

```bash
git push -u origin test/golden-visit-e2e
```

Expected: branch pushed to origin.

- [ ] **Step 3: Open PR**

Use GitHub tooling or `gh pr create` with this title:

```text
EMR-1001: Add Golden Visit E2E harness
```

PR body:

```markdown
## Summary

- adds deterministic Golden Visit Vitest harness from appointment booking through closeout evidence
- adds optional Playwright route smoke for the critical visit surfaces
- adds named release-gate scripts for CI/local execution

## Verification

- npm run test:golden-visit
- npm test -- src/lib/domain/visit-journey.integration.test.ts src/lib/domain/ensure-encounter.test.ts src/app/api/mobile/kiosk/check-in/route.test.ts src/app/(operator)/ops/queue/actions.test.ts src/app/(clinician)/clinic/patients/[id]/actions.start-visit.test.ts src/app/(clinician)/clinic/patients/[id]/notes/[noteId]/actions.finalize-idempotent.test.ts src/lib/domain/visit-completion.test.ts src/lib/domain/visit-completion-selection.test.ts src/lib/agents/billing/charge-integrity-agent.test.ts src/lib/agents/billing/clearinghouse-submission-agent.test.ts
- npm run typecheck
- npm run lint
- npm run build

Linear: EMR-1001
```

- [ ] **Step 4: Update Linear `EMR-1001`**

Set state to `In Review` after the PR is open.

Add a comment:

```markdown
Golden Visit E2E harness branch is pushed and in PR.

Release gate added:
- `npm run test:golden-visit`
- optional browser smoke: `npm run e2e:golden-visit`

Verification results:
- paste exact command results from Task 6
```

---

## Self-Review

Spec coverage:

- Scheduled synthetic patient journey: Task 4.
- Kiosk check-in: Task 4 via `kioskVerifyDob` and `kioskCheckIn`.
- MA rooming/vitals/handoff continuity: Task 4 via `saveRoomingHandoff` and assertions on `briefingContext.rooming`.
- Physician start reduces cognitive load by preserving rooming handoff and reusing the same encounter: Task 4.
- Dictation/documentation proxy: Task 4 uses structured note blocks and `saveAndFinalizeNote`; real audio is intentionally out of first-harness scope per design.
- Coding/billing/RCM evidence: Task 4 uses `buildVisitCompletionBundle`, release payload generation, `scrubClaim`, and `isClaimSubmittable`.
- Browser route crash coverage: Task 5.
- CI/CD health: Task 6 and Task 7.

Placeholder scan:

- No plan step uses unresolved placeholders.

Type consistency:

- Encounter status expectations match the current `visit-state` bridge: physician visit maps to `in_progress`, closeout maps to `complete`.
- Queue targets match `moveQueueEncounter` schema.
- Visit completion payload fields match existing `visit-completion-selection` tests.
