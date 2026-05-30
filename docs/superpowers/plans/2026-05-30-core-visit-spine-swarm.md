# Core Visit Spine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the same-day visit spine that front desk, MA, and physician workflows can share without duplicate encounters or ambiguous states.

**Architecture:** `Encounter` becomes the same-day operational state spine; `Appointment` remains scheduling/reminder history and can link to an encounter. A central `visit-state` helper owns transitions and timestamp side effects; staff surfaces call that helper rather than writing status directly.

**Tech Stack:** Next.js 14 App Router, TypeScript, Prisma, Vitest, server actions/API routes, existing AuditLog patterns.

---

## File Ownership

Codex-owned files:

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260530000000_core_visit_spine/migration.sql`
- Create: `src/lib/domain/visit-state.ts`
- Create: `src/lib/domain/visit-state.test.ts`
- Modify: `src/lib/domain/queue-board.ts`
- Create: `src/lib/domain/queue-board.test.ts`
- Modify: `src/app/(operator)/ops/queue/page.tsx`
- Create: `src/app/(operator)/ops/queue/actions.ts`
- Modify: `src/app/(operator)/ops/queue/queue-board.tsx`
- Modify: `src/app/api/mobile/kiosk/check-in/route.ts`
- Create: `src/app/api/mobile/kiosk/check-in/route.test.ts`

Do not edit in Codex swarm unless coordinating a merge:

- `src/app/(clinician)/clinic/patients/[id]/actions.ts`
- `src/app/(clinician)/clinic/patients/[id]/prepare/actions.ts`
- `src/app/(clinician)/clinic/patients/[id]/notes/[noteId]/actions.ts`
- `src/lib/scheduling/send-reminders.ts`
- `src/lib/scheduling/intake-gate.ts`
- patient portal reminder/QR routes

## External Swarm Boundaries

Claude Code owns physician workflow:

- start visit selection
- briefing start permissions
- note finalization idempotency
- physician-visible rooming handoff

Gemini owns patient pre-visit and QR rescue:

- previsit readiness mapper
- 7d/2d/morning-of reminders
- non-PHI copy
- QR token helper and route tests

## Task 1: Visit State Schema And Helper

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260530000000_core_visit_spine/migration.sql`
- Create: `src/lib/domain/visit-state.ts`
- Create: `src/lib/domain/visit-state.test.ts`

- [ ] **Step 1: Write the failing visit-state tests**

Create `src/lib/domain/visit-state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  advanceVisitState,
  isVisitSpineStatus,
  type VisitSpineStatus,
} from "./visit-state";

describe("visit-state", () => {
  it("allows scheduled visits to check in and stamps checkedInAt once", () => {
    const now = new Date("2026-05-30T16:00:00.000Z");
    const result = advanceVisitState(
      { status: "scheduled", checkedInAt: null },
      "checked_in",
      now,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe("checked_in");
    expect(result.data.checkedInAt).toEqual(now);
  });

  it("does not replace an existing timestamp on idempotent transition", () => {
    const checkedInAt = new Date("2026-05-30T15:45:00.000Z");
    const now = new Date("2026-05-30T16:00:00.000Z");
    const result = advanceVisitState(
      { status: "checked_in", checkedInAt },
      "checked_in",
      now,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe("checked_in");
    expect(result.data.checkedInAt).toEqual(checkedInAt);
  });

  it("rejects jumping from scheduled directly to complete", () => {
    const result = advanceVisitState(
      { status: "scheduled", completedAt: null },
      "complete",
      new Date("2026-05-30T16:00:00.000Z"),
    );

    expect(result).toEqual({
      ok: false,
      error: "Cannot transition visit from scheduled to complete.",
    });
  });

  it("keeps legacy in_progress compatible with active visit", () => {
    const now = new Date("2026-05-30T16:00:00.000Z");
    const result = advanceVisitState(
      { status: "in_progress", startedAt: null },
      "in_visit",
      now,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe("in_visit");
    expect(result.data.startedAt).toEqual(now);
  });

  it("recognizes all canonical spine statuses", () => {
    const statuses: VisitSpineStatus[] = [
      "scheduled",
      "checked_in",
      "info_incomplete",
      "ready",
      "rooming",
      "roomed",
      "in_visit",
      "wrap_up",
      "complete",
      "cancelled",
      "no_show",
    ];

    expect(statuses.every(isVisitSpineStatus)).toBe(true);
    expect(isVisitSpineStatus("in_progress")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm test -- src/lib/domain/visit-state.test.ts
```

Expected: fail because `src/lib/domain/visit-state.ts` does not exist.

- [ ] **Step 3: Add schema changes**

Modify `prisma/schema.prisma`:

```prisma
enum EncounterStatus {
  scheduled
  checked_in
  info_incomplete
  ready
  rooming
  roomed
  in_visit
  wrap_up
  in_progress
  complete
  cancelled
  no_show
}
```

Add to `Encounter`:

```prisma
  appointmentId        String?         @unique
  checkedInAt          DateTime?
  roomingStartedAt     DateTime?
  roomedAt             DateTime?
  wrapUpAt             DateTime?
  cancelledAt          DateTime?
  noShowAt             DateTime?
  appointment          Appointment?    @relation(fields: [appointmentId], references: [id], onDelete: SetNull)
```

Add to `Appointment`:

```prisma
  encounter Encounter?
```

Add to `Encounter` indexes:

```prisma
  @@index([organizationId, status, scheduledFor])
```

Create `prisma/migrations/20260530000000_core_visit_spine/migration.sql`:

```sql
-- Add the same-day visit-spine states while preserving legacy in_progress.
ALTER TYPE "EncounterStatus" ADD VALUE IF NOT EXISTS 'checked_in';
ALTER TYPE "EncounterStatus" ADD VALUE IF NOT EXISTS 'info_incomplete';
ALTER TYPE "EncounterStatus" ADD VALUE IF NOT EXISTS 'ready';
ALTER TYPE "EncounterStatus" ADD VALUE IF NOT EXISTS 'rooming';
ALTER TYPE "EncounterStatus" ADD VALUE IF NOT EXISTS 'roomed';
ALTER TYPE "EncounterStatus" ADD VALUE IF NOT EXISTS 'in_visit';
ALTER TYPE "EncounterStatus" ADD VALUE IF NOT EXISTS 'wrap_up';
ALTER TYPE "EncounterStatus" ADD VALUE IF NOT EXISTS 'no_show';

ALTER TABLE "Encounter"
  ADD COLUMN IF NOT EXISTS "appointmentId" TEXT,
  ADD COLUMN IF NOT EXISTS "checkedInAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "roomingStartedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "roomedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "wrapUpAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "noShowAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "Encounter_appointmentId_key"
  ON "Encounter"("appointmentId");

CREATE INDEX IF NOT EXISTS "Encounter_organizationId_status_scheduledFor_idx"
  ON "Encounter"("organizationId", "status", "scheduledFor");

ALTER TABLE "Encounter"
  ADD CONSTRAINT "Encounter_appointmentId_fkey"
  FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 4: Implement visit-state helper**

Create `src/lib/domain/visit-state.ts`:

```ts
export const VISIT_SPINE_STATUSES = [
  "scheduled",
  "checked_in",
  "info_incomplete",
  "ready",
  "rooming",
  "roomed",
  "in_visit",
  "wrap_up",
  "complete",
  "cancelled",
  "no_show",
] as const;

export type VisitSpineStatus = (typeof VISIT_SPINE_STATUSES)[number];
export type LegacyVisitStatus = "in_progress";
export type VisitStatus = VisitSpineStatus | LegacyVisitStatus;

export interface VisitStateFields {
  status: string;
  checkedInAt?: Date | null;
  roomingStartedAt?: Date | null;
  roomedAt?: Date | null;
  startedAt?: Date | null;
  wrapUpAt?: Date | null;
  completedAt?: Date | null;
  cancelledAt?: Date | null;
  noShowAt?: Date | null;
}

export type VisitTransitionResult =
  | { ok: true; data: Partial<VisitStateFields> }
  | { ok: false; error: string };

const STATUS_SET = new Set<string>(VISIT_SPINE_STATUSES);

const ALLOWED_TRANSITIONS: Record<string, ReadonlySet<VisitSpineStatus>> = {
  scheduled: new Set(["checked_in", "info_incomplete", "ready", "cancelled", "no_show"]),
  checked_in: new Set(["info_incomplete", "ready", "rooming", "cancelled", "no_show"]),
  info_incomplete: new Set(["ready", "cancelled", "no_show"]),
  ready: new Set(["rooming", "roomed", "in_visit", "cancelled", "no_show"]),
  rooming: new Set(["roomed", "ready", "cancelled"]),
  roomed: new Set(["in_visit", "wrap_up", "cancelled"]),
  in_visit: new Set(["wrap_up", "complete", "cancelled"]),
  wrap_up: new Set(["complete", "in_visit"]),
  complete: new Set([]),
  cancelled: new Set([]),
  no_show: new Set([]),
  in_progress: new Set(["in_visit", "wrap_up", "complete", "cancelled"]),
};

export function isVisitSpineStatus(value: string): value is VisitSpineStatus {
  return STATUS_SET.has(value);
}

export function advanceVisitState(
  current: VisitStateFields,
  target: VisitSpineStatus,
  now: Date = new Date(),
): VisitTransitionResult {
  if (current.status === target) {
    return { ok: true, data: applyTimestamp(current, target, now) };
  }

  const allowed = ALLOWED_TRANSITIONS[current.status];
  if (!allowed?.has(target)) {
    return {
      ok: false,
      error: `Cannot transition visit from ${current.status} to ${target}.`,
    };
  }

  return {
    ok: true,
    data: {
      status: target,
      ...applyTimestamp(current, target, now),
    },
  };
}

function applyTimestamp(
  current: VisitStateFields,
  target: VisitSpineStatus,
  now: Date,
): Partial<VisitStateFields> {
  switch (target) {
    case "checked_in":
    case "info_incomplete":
    case "ready":
      return { checkedInAt: current.checkedInAt ?? now };
    case "rooming":
      return { roomingStartedAt: current.roomingStartedAt ?? now };
    case "roomed":
      return { roomedAt: current.roomedAt ?? now };
    case "in_visit":
      return { startedAt: current.startedAt ?? now };
    case "wrap_up":
      return { wrapUpAt: current.wrapUpAt ?? now };
    case "complete":
      return { completedAt: current.completedAt ?? now };
    case "cancelled":
      return { cancelledAt: current.cancelledAt ?? now };
    case "no_show":
      return { noShowAt: current.noShowAt ?? now };
    case "scheduled":
      return {};
  }
}
```

- [ ] **Step 5: Run helper tests**

Run:

```bash
npm test -- src/lib/domain/visit-state.test.ts
```

Expected: pass.

## Task 2: Queue Projection And Staff State Actions

**Files:**

- Modify: `src/lib/domain/queue-board.ts`
- Create: `src/lib/domain/queue-board.test.ts`
- Modify: `src/app/(operator)/ops/queue/page.tsx`
- Create: `src/app/(operator)/ops/queue/actions.ts`

- [ ] **Step 1: Write failing queue projection tests**

Create `src/lib/domain/queue-board.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mapEncounterStatusToQueueStatus } from "./queue-board";

describe("queue-board status mapping", () => {
  it.each([
    ["scheduled", "scheduled"],
    ["checked_in", "arrived"],
    ["info_incomplete", "arrived"],
    ["ready", "arrived"],
    ["rooming", "rooming"],
    ["roomed", "rooming"],
    ["in_visit", "in_visit"],
    ["wrap_up", "checkout"],
    ["complete", "completed"],
    ["cancelled", "completed"],
    ["no_show", "completed"],
  ] as const)("maps %s to %s", (encounterStatus, queueStatus) => {
    expect(mapEncounterStatusToQueueStatus(encounterStatus)).toBe(queueStatus);
  });

  it("keeps legacy in_progress visible as in visit", () => {
    expect(mapEncounterStatusToQueueStatus("in_progress")).toBe("in_visit");
  });
});
```

- [ ] **Step 2: Run failing queue tests**

Run:

```bash
npm test -- src/lib/domain/queue-board.test.ts
```

Expected: fail because `mapEncounterStatusToQueueStatus` is not exported.

- [ ] **Step 3: Implement queue projection helper**

Modify `src/lib/domain/queue-board.ts`:

```ts
export function mapEncounterStatusToQueueStatus(status: string): QueueStatus {
  switch (status) {
    case "checked_in":
    case "info_incomplete":
    case "ready":
      return "arrived";
    case "rooming":
    case "roomed":
      return "rooming";
    case "in_visit":
    case "in_progress":
      return "in_visit";
    case "wrap_up":
      return "checkout";
    case "complete":
    case "cancelled":
    case "no_show":
      return "completed";
    case "scheduled":
    default:
      return "scheduled";
  }
}
```

Extend `QueueEntry`:

```ts
  readinessFlags?: string[];
  handoffNote?: string;
```

- [ ] **Step 4: Update queue page mapping**

Modify `src/app/(operator)/ops/queue/page.tsx` to select `briefingContext` and use `mapEncounterStatusToQueueStatus(enc.status)`.

Rooming context shape:

```ts
type RoomingContext = {
  room?: string;
  readinessFlags?: string[];
  handoffNote?: string;
};
```

Extract from `enc.briefingContext.rooming` when present and pass `room`, `readinessFlags`, and `handoffNote` into `QueueEntry`.

- [ ] **Step 5: Add server actions for staff state changes**

Create `src/app/(operator)/ops/queue/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { advanceVisitState, type VisitSpineStatus } from "@/lib/domain/visit-state";

const TransitionSchema = z.object({
  encounterId: z.string().min(1),
  target: z.enum(["checked_in", "info_incomplete", "ready", "rooming", "roomed", "wrap_up", "cancelled", "no_show"]),
});

export async function moveQueueEncounter(payload: z.infer<typeof TransitionSchema>) {
  const user = await requireUser();
  const parsed = TransitionSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Invalid queue transition." };

  const encounter = await prisma.encounter.findFirst({
    where: { id: parsed.data.encounterId, organizationId: user.organizationId! },
  });
  if (!encounter) return { ok: false, error: "Encounter not found." };

  const next = advanceVisitState(encounter, parsed.data.target as VisitSpineStatus);
  if (!next.ok) return next;

  await prisma.encounter.update({
    where: { id: encounter.id },
    data: next.data as any,
  });

  await prisma.auditLog.create({
    data: {
      organizationId: encounter.organizationId,
      actorUserId: user.id,
      action: "encounter.visit_state.updated",
      subjectType: "Encounter",
      subjectId: encounter.id,
      metadata: { from: encounter.status, to: parsed.data.target },
    },
  });

  revalidatePath("/ops/queue");
  return { ok: true };
}
```

- [ ] **Step 6: Run queue tests**

Run:

```bash
npm test -- src/lib/domain/queue-board.test.ts
```

Expected: pass.

## Task 3: Kiosk Check-In Hardening

**Files:**

- Modify: `src/app/api/mobile/kiosk/check-in/route.ts`
- Create: `src/app/api/mobile/kiosk/check-in/route.test.ts`

- [ ] **Step 1: Write failing route tests**

Create `src/app/api/mobile/kiosk/check-in/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => {
  const mockPrisma = {
    encounter: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    patient: {
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  };
  const logger = {
    info: vi.fn(),
    error: vi.fn(),
  };

  return { mockPrisma, logger };
});

vi.mock("@/lib/db/prisma", () => ({
  prisma: hoisted.mockPrisma,
}));

vi.mock("@/lib/observability/log", () => ({
  logger: hoisted.logger,
}));

import { POST } from "./route";

function makeRequest(body: unknown): Request {
  return new Request("https://example.com/api/mobile/kiosk/check-in", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/mobile/kiosk/check-in", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = "development";
    hoisted.mockPrisma.patient.update.mockResolvedValue({ id: "pat_1" });
    hoisted.mockPrisma.auditLog.create.mockResolvedValue({ id: "audit_1" });
  });

  it("rejects mismatched encounter and patient ids", async () => {
    hoisted.mockPrisma.encounter.findFirst.mockResolvedValue(null);

    const res = await POST(
      makeRequest({ encounterId: "enc_1", patientId: "wrong_pat" }),
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Encounter not found for patient" });
    expect(hoisted.mockPrisma.encounter.update).not.toHaveBeenCalled();
    expect(hoisted.mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("moves a verified scheduled encounter to checked_in and audits it", async () => {
    const scheduledFor = new Date("2026-05-30T16:00:00.000Z");
    hoisted.mockPrisma.encounter.findFirst.mockResolvedValue({
      id: "enc_1",
      patientId: "pat_1",
      organizationId: "org_1",
      status: "scheduled",
      scheduledFor,
      checkedInAt: null,
    });
    hoisted.mockPrisma.encounter.update.mockResolvedValue({
      id: "enc_1",
      patientId: "pat_1",
      organizationId: "org_1",
      status: "checked_in",
    });

    const res = await POST(makeRequest({ encounterId: "enc_1", patientId: "pat_1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true, status: "checked_in" });
    expect(hoisted.mockPrisma.encounter.update).toHaveBeenCalledWith({
      where: { id: "enc_1" },
      data: expect.objectContaining({
        status: "checked_in",
        checkedInAt: expect.any(Date),
      }),
    });
    expect(hoisted.mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: "org_1",
        action: "encounter.kiosk_check_in.completed",
        subjectType: "Encounter",
        subjectId: "enc_1",
      }),
    });
  });

  it("verifies encounter ownership before updating state", async () => {
    hoisted.mockPrisma.encounter.findFirst.mockResolvedValue(null);

    await POST(makeRequest({ encounterId: "enc_1", patientId: "pat_1" }));

    expect(hoisted.mockPrisma.encounter.findFirst).toHaveBeenCalledWith({
      where: {
        id: "enc_1",
        patientId: "pat_1",
      },
      include: {
        patient: {
          select: {
            id: true,
            intakeAnswers: true,
            organizationId: true,
          },
        },
      },
    });
  });
});
```

- [ ] **Step 2: Run failing route tests**

Run:

```bash
npm test -- src/app/api/mobile/kiosk/check-in/route.test.ts
```

Expected: fail because current route updates by encounter id only and writes no audit row.

- [ ] **Step 3: Harden route**

Modify route to:

- parse with Zod
- verify `encounter.id`, `encounter.patientId`, and `encounter.patient.organizationId`
- use `advanceVisitState(encounter, "checked_in")`
- write `AuditLog` action `encounter.kiosk_check_in.completed`
- never write signed forms directly over the full `intakeAnswers` JSON without merging

- [ ] **Step 4: Run route tests**

Run:

```bash
npm test -- src/app/api/mobile/kiosk/check-in/route.test.ts
```

Expected: pass.

## Task 4: Queue UI Hooks For Front Desk And MA

**Files:**

- Modify: `src/app/(operator)/ops/queue/queue-board.tsx`
- Modify: `src/app/(operator)/ops/queue/actions.ts`

- [ ] **Step 1: Wire context-menu actions to server actions**

Replace placeholder `router.refresh()` handlers with calls to `moveQueueEncounter`:

```ts
await moveQueueEncounter({ encounterId: entry.encounterId, target: "checked_in" });
await moveQueueEncounter({ encounterId: entry.encounterId, target: "rooming" });
await moveQueueEncounter({ encounterId: entry.encounterId, target: "roomed" });
await moveQueueEncounter({ encounterId: entry.encounterId, target: "wrap_up" });
```

- [ ] **Step 2: Add a minimal handoff action**

Extend `actions.ts` with `saveRoomingHandoff`:

```ts
const RoomingSchema = z.object({
  encounterId: z.string().min(1),
  room: z.string().max(20).optional(),
  handoffNote: z.string().max(1000).optional(),
  readinessFlags: z.array(z.string().max(100)).max(10).default([]),
});
```

This action merges into `briefingContext.rooming` and audits `encounter.rooming.updated`.

- [ ] **Step 3: Keep UI minimal**

Expose room/readiness/handoff text on queue cards if present. Use compact text only; do not build a large modal in this slice unless all previous tests are green.

- [ ] **Step 4: Run targeted tests and typecheck**

Run:

```bash
npm test -- src/lib/domain/visit-state.test.ts src/lib/domain/queue-board.test.ts src/app/api/mobile/kiosk/check-in/route.test.ts
npm run typecheck
```

Expected: tests pass and typecheck is clean.

## Coordination Checkpoint

- [ ] **Step 1: Reconcile with Claude Code physician swarm**

Check whether Claude edited:

- `src/app/(clinician)/clinic/patients/[id]/actions.ts`
- `src/app/(clinician)/clinic/patients/[id]/prepare/actions.ts`
- `src/app/(clinician)/clinic/patients/[id]/notes/[noteId]/actions.ts`

If their code needs the visit-state helper, export stable types and avoid renaming functions.

- [ ] **Step 2: Reconcile with Gemini pre-visit swarm**

Check whether Gemini edited:

- `src/lib/scheduling/send-reminders.ts`
- `src/lib/scheduling/intake-gate.ts`
- QR token helpers/routes

If their readiness mapper needs encounter status, use the `Encounter.appointmentId` relation and `ready/info_incomplete` states.

- [ ] **Step 3: Final verification**

Run:

```bash
npm test -- src/lib/domain/visit-state.test.ts src/lib/domain/queue-board.test.ts src/app/api/mobile/kiosk/check-in/route.test.ts
npm run typecheck
```

Expected: all tests pass and typecheck is clean.
