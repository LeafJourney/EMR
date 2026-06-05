import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  // Keep this local-time based because bookAppointment parses slotDate +
  // slotStartTime in the process timezone. 08:00 local keeps the 09:00 slot in
  // the future under UTC, Pacific, and CI timezones.
  const FIXED_NOW = new Date(2099, 5, 5, 8, 0, 0, 0);
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

  const users = {
    patient: {
      id: PATIENT_USER_ID,
      email: "golden.patient@example.test",
      firstName: "Goldie",
      lastName: "Patient",
      roles: ["patient"],
      organizationId: ORG_ID,
      organizationName: "Golden Care",
    },
    physician: {
      id: PHYSICIAN_USER_ID,
      email: "golden.physician@example.test",
      firstName: "Ada",
      lastName: "Physician",
      roles: ["clinician"],
      organizationId: ORG_ID,
      organizationName: "Golden Care",
    },
    frontDesk: {
      id: FRONT_DESK_USER_ID,
      email: "golden.frontdesk@example.test",
      firstName: "Fran",
      lastName: "Desk",
      roles: ["front_office"],
      organizationId: ORG_ID,
      organizationName: "Golden Care",
    },
    ma: {
      id: MA_USER_ID,
      email: "golden.ma@example.test",
      firstName: "Mara",
      lastName: "Assistant",
      roles: ["back_office"],
      organizationId: ORG_ID,
      organizationName: "Golden Care",
    },
    kiosk: {
      id: KIOSK_USER_ID,
      email: "golden.kiosk@example.test",
      firstName: "Golden",
      lastName: "Kiosk",
      roles: ["kiosk"],
      organizationId: ORG_ID,
      organizationName: "Golden Care",
    },
  };

  const db = {
    patients: [] as any[],
    providers: [] as any[],
    appointments: [] as any[],
    encounters: [] as any[],
    notes: [] as any[],
    auditLogs: [] as any[],
    agentJobs: [] as any[],
  };

  const fixture = {
    db,
    users,
    dispatchEvents: [] as any[],
    session: { currentUser: users.patient as any },
  };

  function clone<T>(value: T): T {
    return value == null ? value : structuredClone(value);
  }

  function userForId(userId: string | null | undefined) {
    return Object.values(users).find((user) => user.id === userId) ?? null;
  }

  function isPlainObject(value: unknown): value is Record<string, any> {
    return (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      !(value instanceof Date)
    );
  }

  function compareValues(actual: any, expected: any): boolean {
    if (actual instanceof Date && expected instanceof Date) {
      return actual.getTime() === expected.getTime();
    }
    return actual === expected;
  }

  function relationFor(row: any, relation: string): any {
    if (relation === "patient") {
      return db.patients.find((patient) => patient.id === row.patientId) ?? null;
    }
    if (relation === "provider") {
      return db.providers.find((provider) => provider.id === row.providerId) ?? null;
    }
    if (relation === "encounter") {
      if ("startAt" in row && "endAt" in row) {
        return db.encounters.find((encounter) => encounter.appointmentId === row.id) ?? null;
      }
      if (row.encounterId) {
        return db.encounters.find((encounter) => encounter.id === row.encounterId) ?? null;
      }
    }
    return null;
  }

  function matchesOperator(actual: any, expected: Record<string, any>): boolean {
    for (const [op, value] of Object.entries(expected)) {
      if (op === "in") {
        if (!Array.isArray(value) || !value.includes(actual)) return false;
      } else if (op === "not") {
        if (compareValues(actual, value)) return false;
      } else if (op === "lt") {
        if (!(actual < value)) return false;
      } else if (op === "lte") {
        if (!(actual <= value)) return false;
      } else if (op === "gt") {
        if (!(actual > value)) return false;
      } else if (op === "gte") {
        if (!(actual >= value)) return false;
      } else if (op === "startsWith") {
        if (typeof actual !== "string" || !actual.startsWith(String(value))) return false;
      } else if (op === "is") {
        if (value === null && actual !== null) return false;
        if (value !== null && !matchesWhere(actual, value)) return false;
      } else if (!compareValues(actual?.[op], value)) {
        return false;
      }
    }
    return true;
  }

  function matchesWhere(row: any, where: Record<string, any> = {}): boolean {
    if (!row) return false;

    for (const [key, expected] of Object.entries(where)) {
      if (key === "OR") {
        if (!Array.isArray(expected) || !expected.some((branch) => matchesWhere(row, branch))) {
          return false;
        }
        continue;
      }
      if (key === "AND") {
        if (!Array.isArray(expected) || !expected.every((branch) => matchesWhere(row, branch))) {
          return false;
        }
        continue;
      }
      if (key === "NOT") {
        if (matchesWhere(row, expected)) return false;
        continue;
      }

      const relation = ["patient", "provider", "encounter"].includes(key)
        ? relationFor(row, key)
        : undefined;
      if (relation !== undefined) {
        if (isPlainObject(expected) && "is" in expected) {
          if (expected.is === null) {
            if (relation !== null) return false;
          } else if (!matchesWhere(relation, expected.is)) {
            return false;
          }
        } else if (!matchesWhere(relation, expected)) {
          return false;
        }
        continue;
      }

      const actual = row[key];
      if (isPlainObject(expected)) {
        if (!matchesOperator(actual, expected)) return false;
      } else if (!compareValues(actual, expected)) {
        return false;
      }
    }

    return true;
  }

  function orderRows(rows: any[], orderBy: Record<string, "asc" | "desc"> | undefined) {
    if (!orderBy) return rows;
    const [[field, direction]] = Object.entries(orderBy);
    return [...rows].sort((a, b) => {
      const av = a[field] instanceof Date ? a[field].getTime() : (a[field] ?? Infinity);
      const bv = b[field] instanceof Date ? b[field].getTime() : (b[field] ?? Infinity);
      return direction === "desc" ? bv - av : av - bv;
    });
  }

  function selectRow(row: any, select: Record<string, any> | undefined): any {
    if (!select) return row;
    const out: Record<string, any> = {};
    for (const [field, selection] of Object.entries(select)) {
      if (selection === true) {
        out[field] = row[field];
      } else if (field === "user" && row.userId) {
        out.user = materializeProviderUser(userForId(row.userId), selection as any);
      }
    }
    return out;
  }

  function materializeProviderUser(user: any, selection: any): any {
    if (!user) return null;
    const selected = selection?.select;
    return selected ? selectRow(user, selected) : clone(user);
  }

  function materializePatient(row: any, args: any = {}) {
    return clone(selectRow(row, args.select));
  }

  function materializeProvider(row: any, args: any = {}) {
    const provider = clone(selectRow(row, args.select));
    if (args.include?.user) {
      provider.user = materializeProviderUser(userForId(row.userId), args.include.user);
    }
    return provider;
  }

  function materializeAppointment(row: any, args: any = {}) {
    const appointment = clone(selectRow(row, args.select));
    if (args.include?.patient) {
      const patient = db.patients.find((candidate) => candidate.id === row.patientId) ?? null;
      appointment.patient = patient ? materializePatient(patient, args.include.patient) : null;
    }
    if (args.include?.encounter) {
      const encounter =
        db.encounters.find((candidate) => candidate.appointmentId === row.id) ?? null;
      appointment.encounter = encounter ? materializeEncounter(encounter, args.include.encounter) : null;
    }
    return appointment;
  }

  function materializeEncounter(row: any, args: any = {}) {
    const encounter = clone(selectRow(row, args.select));
    if (args.include?.provider) {
      const provider = db.providers.find((candidate) => candidate.id === row.providerId) ?? null;
      encounter.provider = provider ? materializeProvider(provider, args.include.provider) : null;
    }
    if (args.include?.patient) {
      const patient = db.patients.find((candidate) => candidate.id === row.patientId) ?? null;
      encounter.patient = patient ? materializePatient(patient, args.include.patient) : null;
    }
    return encounter;
  }

  function materializeNote(row: any, args: any = {}) {
    const note = clone(selectRow(row, args.select));
    if (args.include?.encounter) {
      const encounter = db.encounters.find((candidate) => candidate.id === row.encounterId) ?? null;
      note.encounter = encounter ? materializeEncounter(encounter, args.include.encounter) : null;
    }
    return note;
  }

  function firstFrom(rows: any[], args: any, materialize: (row: any, args?: any) => any) {
    const matches = rows.filter((row) => matchesWhere(row, args?.where));
    const ordered = orderRows(matches, args?.orderBy);
    const row = typeof args?.take === "number" ? ordered.slice(0, args.take)[0] : ordered[0];
    return row ? materialize(row, args) : null;
  }

  function manyFrom(rows: any[], args: any, materialize: (row: any, args?: any) => any) {
    const matches = rows.filter((row) => matchesWhere(row, args?.where));
    const ordered = orderRows(matches, args?.orderBy);
    const limited = typeof args?.take === "number" ? ordered.slice(0, args.take) : ordered;
    return limited.map((row) => materialize(row, args));
  }

  function updateRow(
    rows: any[],
    where: Record<string, any>,
    data: Record<string, any>,
    materialize: (row: any, args?: any) => any,
  ) {
    const row = rows.find((candidate) => matchesWhere(candidate, where));
    if (!row) throw new Error("Fixture row not found");
    Object.assign(row, clone(data), { updatedAt: data.updatedAt ?? row.updatedAt });
    return materialize(row);
  }

  function createAppointment(data: Record<string, any>) {
    const row = {
      id: data.id ?? (db.appointments.length === 0 ? APPOINTMENT_ID : `appt_golden_${db.appointments.length + 1}`),
      status: "requested",
      modality: "video",
      createdAt: new Date(),
      ...clone(data),
    };
    db.appointments.push(row);
    return materializeAppointment(row);
  }

  function createEncounter(data: Record<string, any>) {
    const row = {
      id: data.id ?? (db.encounters.length === 0 ? ENCOUNTER_ID : `enc_golden_${db.encounters.length + 1}`),
      status: "scheduled",
      scheduledFor: null,
      checkedInAt: null,
      roomingStartedAt: null,
      roomedAt: null,
      startedAt: null,
      wrapUpAt: null,
      completedAt: null,
      cancelledAt: null,
      noShowAt: null,
      chartingCompletedAt: null,
      modality: "in_person",
      placeOfService: null,
      renderingProviderId: null,
      reason: null,
      briefingContext: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...clone(data),
    };
    db.encounters.push(row);
    return materializeEncounter(row);
  }

  function createNote(data: Record<string, any>) {
    const row = {
      id: data.id ?? (db.notes.length === 0 ? NOTE_ID : `note_golden_${db.notes.length + 1}`),
      authorUserId: null,
      status: "draft",
      blocks: [],
      narrative: null,
      aiDrafted: false,
      aiConfidence: null,
      finalizedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...clone(data),
    };
    db.notes.push(row);
    return materializeNote(row);
  }

  const prisma = {
    patient: {
      findFirst: vi.fn(async (args?: any) => firstFrom(db.patients, args, materializePatient)),
      findMany: vi.fn(async (args?: any) => manyFrom(db.patients, args, materializePatient)),
      update: vi.fn(async ({ where, data }: any) =>
        updateRow(db.patients, where, data, materializePatient),
      ),
    },
    provider: {
      findFirst: vi.fn(async (args?: any) => firstFrom(db.providers, args, materializeProvider)),
      findMany: vi.fn(async (args?: any) => manyFrom(db.providers, args, materializeProvider)),
    },
    appointment: {
      findFirst: vi.fn(async (args?: any) => firstFrom(db.appointments, args, materializeAppointment)),
      findMany: vi.fn(async (args?: any) => manyFrom(db.appointments, args, materializeAppointment)),
      findUnique: vi.fn(async (args?: any) => firstFrom(db.appointments, args, materializeAppointment)),
      create: vi.fn(async ({ data }: any) => createAppointment(data)),
      update: vi.fn(async ({ where, data }: any) =>
        updateRow(db.appointments, where, data, materializeAppointment),
      ),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const rows = db.appointments.filter((row) => matchesWhere(row, where));
        rows.forEach((row) => Object.assign(row, clone(data)));
        return { count: rows.length };
      }),
    },
    encounter: {
      findFirst: vi.fn(async (args?: any) => firstFrom(db.encounters, args, materializeEncounter)),
      findMany: vi.fn(async (args?: any) => manyFrom(db.encounters, args, materializeEncounter)),
      findUnique: vi.fn(async (args?: any) => firstFrom(db.encounters, args, materializeEncounter)),
      create: vi.fn(async ({ data }: any) => createEncounter(data)),
      update: vi.fn(async ({ where, data }: any) =>
        updateRow(db.encounters, where, data, materializeEncounter),
      ),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const rows = db.encounters.filter((row) => matchesWhere(row, where));
        rows.forEach((row) => Object.assign(row, clone(data)));
        return { count: rows.length };
      }),
    },
    note: {
      findFirst: vi.fn(async (args?: any) => firstFrom(db.notes, args, materializeNote)),
      findMany: vi.fn(async (args?: any) => manyFrom(db.notes, args, materializeNote)),
      findUnique: vi.fn(async (args?: any) => firstFrom(db.notes, args, materializeNote)),
      create: vi.fn(async ({ data }: any) => createNote(data)),
      update: vi.fn(async ({ where, data }: any) =>
        updateRow(db.notes, where, data, materializeNote),
      ),
      count: vi.fn(async (args?: any) => db.notes.filter((row) => matchesWhere(row, args?.where)).length),
    },
    auditLog: {
      create: vi.fn(async ({ data }: any) => {
        const row = {
          id: `audit_golden_${db.auditLogs.length + 1}`,
          createdAt: new Date(),
          ...clone(data),
        };
        db.auditLogs.push(row);
        return clone(row);
      }),
    },
    agentJob: {
      findMany: vi.fn(async (args?: any) => manyFrom(db.agentJobs, args, (row) => clone(row))),
      create: vi.fn(async ({ data }: any) => {
        const row = {
          id: data.id ?? `job_golden_${db.agentJobs.length + 1}`,
          status: "pending",
          attempts: 0,
          maxAttempts: 3,
          logs: [],
          createdAt: new Date(),
          runAfter: new Date(),
          ...clone(data),
        };
        db.agentJobs.push(row);
        return clone(row);
      }),
    },
    $transaction: vi.fn(async (callback: any) => callback(prisma)),
  };

  const revalidatePath = vi.fn();
  const redirect = vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  });
  const requireUser = vi.fn(async () => fixture.session.currentUser);
  const requireRole = vi.fn(async (role: string) => {
    const user = fixture.session.currentUser;
    if (!user.roles.includes(role)) throw new Error("FORBIDDEN");
    return user;
  });
  const dispatch = vi.fn(async (event: any) => {
    fixture.dispatchEvents.push(clone(event));
    if (event.name !== "encounter.note.draft.requested") return [];
    const id = "job_golden_1";
    if (!db.agentJobs.some((job) => job.id === id)) {
      db.agentJobs.push({
        id,
        organizationId: ORG_ID,
        workflowName: "encounter-note-draft",
        agentName: "scribe",
        eventName: event.name,
        input: clone(event),
        output: null,
        status: "pending",
        attempts: 0,
        maxAttempts: 3,
        lastError: null,
        logs: [],
        requiresApproval: false,
        approvalRequiredAt: null,
        approvedById: null,
        approvedAt: null,
        claimedAt: null,
        claimedBy: null,
        runAfter: new Date(),
        startedAt: null,
        completedAt: null,
        createdAt: new Date(),
      });
    }
    return [id];
  });
  const runTick = vi.fn(async () => undefined);
  const runJob = vi.fn(async () => undefined);
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    with: vi.fn(() => logger),
  };

  function resetFixture() {
    db.patients.splice(0);
    db.providers.splice(0);
    db.appointments.splice(0);
    db.encounters.splice(0);
    db.notes.splice(0);
    db.auditLogs.splice(0);
    db.agentJobs.splice(0);
    fixture.dispatchEvents.splice(0);
    fixture.session.currentUser = users.patient;

    db.patients.push({
      id: PATIENT_ID,
      userId: PATIENT_USER_ID,
      organizationId: ORG_ID,
      status: "active",
      firstName: "Goldie",
      lastName: "Patient",
      dateOfBirth: new Date("1954-02-11T00:00:00.000Z"),
      ageVerifiedAt: FIXED_NOW,
      email: "goldie.patient@example.test",
      phone: "555-0100",
      addressLine1: "100 Golden Way",
      addressLine2: null,
      city: "Los Angeles",
      state: "CA",
      postalCode: "90001",
      intakeAnswers: {
        demographics: {
          firstName: "Goldie",
          lastName: "Patient",
          dateOfBirth: "1954-02-11",
          phone: "555-0100",
          address: {
            line1: "100 Golden Way",
            city: "Los Angeles",
            state: "CA",
            postalCode: "90001",
          },
        },
        insurance: {
          payerName: "Golden Health",
          memberId: "GOLDEN-123",
          eligibilityStatus: "active",
        },
        signedConsent: {
          signed: true,
          signedAt: FIXED_NOW.toISOString(),
          consentVersion: "golden-visit-e2e/v1",
        },
      },
      cannabisHistory: {
        priorUse: "topical CBD",
        benefits: ["pain relief"],
        sideEffects: [],
      },
      presentingConcerns: "Chronic arthritic pain with daytime stiffness.",
      treatmentGoals: "Improve pain control while avoiding daytime somnolence.",
      allergies: [],
      contraindications: [],
      allergiesScreenedAt: FIXED_NOW,
      qualificationStatus: "qualified",
      qualificationExpiresAt: new Date("2100-06-05T16:00:00.000Z"),
      chartRestricted: false,
      restrictedProviderIds: [],
      chartRestrictedReason: null,
      chartRestrictedAt: null,
      deletedAt: null,
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    });

    db.providers.push({
      id: PROVIDER_ID,
      userId: PHYSICIAN_USER_ID,
      organizationId: ORG_ID,
      title: "MD",
      specialties: ["Cannabis medicine"],
      bio: "Golden visit fixture physician",
      active: true,
      npi: "1234567893",
      taxonomyCode: "207Q00000X",
      practiceAddress: "100 Golden Way, Los Angeles, CA 90001",
      hospitalAffiliations: [],
      createdAt: FIXED_NOW,
    });
  }

  return {
    FIXED_NOW,
    ORG_ID,
    PATIENT_ID,
    PATIENT_USER_ID,
    PROVIDER_ID,
    PHYSICIAN_USER_ID,
    FRONT_DESK_USER_ID,
    MA_USER_ID,
    KIOSK_USER_ID,
    APPOINTMENT_ID,
    ENCOUNTER_ID,
    NOTE_ID,
    fixture,
    prisma,
    revalidatePath,
    redirect,
    requireUser,
    requireRole,
    dispatch,
    runTick,
    runJob,
    logger,
    resetFixture,
  };
});

vi.mock("next/cache", () => ({ revalidatePath: h.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: h.redirect }));
vi.mock("@/lib/db/prisma", () => ({ prisma: h.prisma }));
vi.mock("@/lib/auth/session", () => ({
  requireUser: h.requireUser,
  requireRole: h.requireRole,
}));
vi.mock("@/lib/orchestration/dispatch", () => ({ dispatch: h.dispatch }));
vi.mock("@/lib/orchestration/runner", () => ({
  runTick: h.runTick,
  runJob: h.runJob,
}));
vi.mock("@/lib/observability/log", () => ({ logger: h.logger }));

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

const FIXED_NOW = h.FIXED_NOW;
const ORG_ID = h.ORG_ID;
const PATIENT_ID = h.PATIENT_ID;
const PATIENT_USER_ID = h.PATIENT_USER_ID;
const PROVIDER_ID = h.PROVIDER_ID;
const PHYSICIAN_USER_ID = h.PHYSICIAN_USER_ID;
const FRONT_DESK_USER_ID = h.FRONT_DESK_USER_ID;
const MA_USER_ID = h.MA_USER_ID;
const KIOSK_USER_ID = h.KIOSK_USER_ID;
const APPOINTMENT_ID = h.APPOINTMENT_ID;
const ENCOUNTER_ID = h.ENCOUNTER_ID;
const NOTE_ID = h.NOTE_ID;
const fixture = h.fixture;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  h.resetFixture();
});

afterEach(() => {
  vi.useRealTimers();
});

function activeEncountersForPatient() {
  return fixture.db.encounters.filter(
    (encounter) =>
      encounter.patientId === PATIENT_ID &&
      !["complete", "cancelled", "no_show"].includes(encounter.status),
  );
}

function expectSingleActiveEncounter(label: string) {
  const activeEncounters = activeEncountersForPatient();
  expect(activeEncounters, label).toHaveLength(1);
  expect(activeEncounters[0].id, label).toBe(ENCOUNTER_ID);
  return activeEncounters[0];
}

function expectOnlyGoldenEncounter(label: string) {
  expect(
    fixture.db.encounters.map((encounter) => encounter.id),
    label,
  ).toEqual([ENCOUNTER_ID]);
}

function dispatchCount(name: string) {
  return fixture.dispatchEvents.filter((event) => event.name === name).length;
}

function noteBlocks() {
  return [
    {
      heading: "Subjective",
      body:
        "Golden reports chronic arthritic pain with morning stiffness. Topical CBD helps pain, but the new evening CBD dose caused daytime somnolence.",
    },
    {
      heading: "Objective",
      body:
        "Vitals reviewed. BP 148/86 on arrival and 142/84 on recheck; HR 78. Patient appears alert, mildly anxious, and in no acute distress.",
    },
    {
      heading: "Assessment",
      body:
        "Chronic pain, ICD-10 G89.29, partially responsive to CBD therapy. Daytime somnolence is likely related to recent dose timing change.",
    },
    {
      heading: "Plan",
      body:
        "Reduce evening CBD dose and avoid daytime use while monitoring somnolence. Order labs including CMP and renal function panel. RTC in 6 weeks for BP and pain reassessment.",
    },
  ];
}

async function runGoldenVisit() {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);

  fixture.session.currentUser = fixture.users.patient;
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

  const appointment = fixture.db.appointments.find((row) => row.id === APPOINTMENT_ID);
  expect(appointment).toBeDefined();
  if (!appointment) throw new Error("Golden Visit appointment was not created.");
  appointment.status = "confirmed";

  const ensuredEncounter = await ensureEncounterForAppointment(APPOINTMENT_ID);
  expect(ensuredEncounter?.id).toBe(ENCOUNTER_ID);
  expectSingleActiveEncounter("after appointment encounter materialization");
  expectOnlyGoldenEncounter("after appointment encounter materialization");

  fixture.session.currentUser = fixture.users.kiosk;
  const verified = await kioskVerifyDob(PATIENT_ID, "1954-02-11");
  expect(verified.ok).toBe(true);
  expect(verified.context?.appointment?.encounterId).toBe(ENCOUNTER_ID);

  const firstCheckIn = await kioskCheckIn(PATIENT_ID);
  expect(firstCheckIn).toMatchObject({
    ok: true,
    status: "checked_in",
    alreadyCheckedIn: false,
  });
  expectSingleActiveEncounter("after first kiosk check-in");

  const secondCheckIn = await kioskCheckIn(PATIENT_ID);
  expect(secondCheckIn).toMatchObject({
    ok: true,
    status: "checked_in",
    alreadyCheckedIn: true,
  });
  expectSingleActiveEncounter("after idempotent kiosk check-in");
  expectOnlyGoldenEncounter("after idempotent kiosk check-in");

  fixture.session.currentUser = fixture.users.ma;
  expect(
    await moveQueueEncounter({ encounterId: ENCOUNTER_ID, target: "rooming" }),
  ).toEqual({ ok: true });
  expect(fixture.db.encounters.find((row) => row.id === ENCOUNTER_ID)?.status).toBe(
    "rooming",
  );

  expect(
    await saveRoomingHandoff({
      encounterId: ENCOUNTER_ID,
      room: "A3",
      handoffNote: "BP a little high; patient anxious about new dose.",
      readinessFlags: ["bp_recheck", "review_cbd_somnolence"],
    }),
  ).toEqual({ ok: true });

  expect(
    await moveQueueEncounter({ encounterId: ENCOUNTER_ID, target: "roomed" }),
  ).toEqual({ ok: true });
  const roomedEncounter = expectSingleActiveEncounter("after roomed transition");
  expect(roomedEncounter.status).toBe("roomed");
  expect(roomedEncounter.briefingContext?.rooming).toMatchObject({
    room: "A3",
    handoffNote: "BP a little high; patient anxious about new dose.",
    readinessFlags: ["bp_recheck", "review_cbd_somnolence"],
  });

  fixture.session.currentUser = fixture.users.physician;
  await h.prisma.note.create({
    data: {
      id: NOTE_ID,
      encounterId: ENCOUNTER_ID,
      status: "draft",
      aiDrafted: false,
      blocks: noteBlocks(),
      createdAt: FIXED_NOW,
    },
  });

  await expect(startVisit(PATIENT_ID)).rejects.toThrow(
    `redirect:/clinic/patients/${PATIENT_ID}/notes/${NOTE_ID}`,
  );
  const inProgressEncounter = expectSingleActiveEncounter("after physician starts visit");
  expect(inProgressEncounter.status).toBe("in_progress");
  expect(inProgressEncounter.providerId).toBe(PROVIDER_ID);
  const roomingHandoffVisibleToPhysician = Boolean(
    inProgressEncounter.briefingContext?.rooming?.room === "A3" &&
      inProgressEncounter.briefingContext?.rooming?.handoffNote ===
        "BP a little high; patient anxious about new dose." &&
      inProgressEncounter.briefingContext?.rooming?.readinessFlags?.includes("bp_recheck") &&
      inProgressEncounter.briefingContext?.rooming?.readinessFlags?.includes(
        "review_cbd_somnolence",
      ),
  );
  expect(roomingHandoffVisibleToPhysician).toBe(true);

  await expect(startVisit(PATIENT_ID)).rejects.toThrow(
    `redirect:/clinic/patients/${PATIENT_ID}/notes/${NOTE_ID}`,
  );
  expectSingleActiveEncounter("after idempotent physician start visit");
  expectOnlyGoldenEncounter("after idempotent physician start visit");
  expect(dispatchCount("encounter.note.draft.requested")).toBe(0);
  expect(fixture.db.agentJobs).toHaveLength(0);

  const finalized = await saveAndFinalizeNote(NOTE_ID, noteBlocks());
  expect(finalized).toEqual({ ok: true, status: "finalized" });
  expect(fixture.db.encounters.find((row) => row.id === ENCOUNTER_ID)?.status).toBe(
    "complete",
  );

  const finalizedAgain = await saveAndFinalizeNote(NOTE_ID, noteBlocks());
  expect(finalizedAgain).toEqual({ ok: true, status: "finalized" });
  expectOnlyGoldenEncounter("after final closeout");
  expect(activeEncountersForPatient()).toHaveLength(0);

  const bundle = buildVisitCompletionBundle({
    patientFirstName: "Golden",
    blocks: noteBlocks(),
    hasFutureAppointment: false,
    codingSuggestion: {
      emLevel: "99214",
      icd10: [{ code: "G89.29", label: "Other chronic pain", confidence: 0.95 }],
      rationale: "Established follow-up with chronic pain management and medication adjustment.",
    },
  });
  let selection = initializeVisitCompletionSelection(bundle);
  for (const card of bundle.cards) {
    selection = applyVisitCompletionAction(bundle, selection, {
      type: "confirm_card",
      cardId: card.id,
      confirmationNote: `Confirmed ${card.title} for Golden Visit closeout.`,
    });
  }
  const releasePayload = buildVisitCompletionReleasePayload(bundle, selection);
  expect(releasePayload.canRelease).toBe(true);

  const scrubIssues = scrubClaim({
    cptCodes: [
      {
        code: "99214",
        label: "Established patient office visit",
        units: 1,
        chargeAmount: 235,
        modifiers: [],
      },
    ],
    icd10Codes: [{ code: "G89.29", label: "Other chronic pain" }],
    payerName: "Blue Cross",
    payerId: "bcbs",
    serviceDate: FIXED_NOW,
    providerId: PROVIDER_ID,
    patientCoverage: {
      payerName: "Blue Cross",
      eligibilityStatus: "active",
    },
  });
  expect(isClaimSubmittable(scrubIssues)).toBe(true);

  return {
    appointmentId: APPOINTMENT_ID,
    encounterId: ENCOUNTER_ID,
    finalEncounterStatus: fixture.db.encounters.find((row) => row.id === ENCOUNTER_ID)
      ?.status,
    duplicateActiveEncounterCount: activeEncountersForPatient().filter(
      (encounter) => encounter.id !== ENCOUNTER_ID,
    ).length,
    roomingHandoffVisibleToPhysician,
    noteFinalizedDispatchCount: dispatchCount("note.finalized"),
    encounterCompletedDispatchCount: dispatchCount("encounter.completed"),
    closeoutReady: releasePayload.canRelease && isClaimSubmittable(scrubIssues),
  };
}

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
