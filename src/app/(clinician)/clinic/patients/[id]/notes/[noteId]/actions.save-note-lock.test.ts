import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Signed-note integrity — saveNoteBlocks must not silently mutate a finalized
 * (or amended) note. The editor hides the Save button once a note is signed,
 * but the server action must enforce the lock too; otherwise a direct action
 * call or a stale client could rewrite a signed legal record with no audit
 * trail. saveObjectiveDocumentation already enforces this; saveNoteBlocks did
 * not. Draft / needs_review notes remain freely editable.
 */
const hoisted = vi.hoisted(() => {
  const mockPrisma = {
    patient: { findFirst: vi.fn() },
    encounter: { findFirst: vi.fn() },
    note: { findUnique: vi.fn(), update: vi.fn() },
  };
  return { mockPrisma, requireUserMock: vi.fn() };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: hoisted.mockPrisma }));
vi.mock("@/lib/auth/session", () => ({ requireUser: () => hoisted.requireUserMock() }));
vi.mock("@/lib/orchestration/dispatch", () => ({ dispatch: vi.fn() }));
vi.mock("@/lib/orchestration/runner", () => ({ runTick: vi.fn(), runJob: vi.fn() }));
vi.mock("@/lib/orchestration/model-client", () => ({
  resolveModelClient: vi.fn(),
  isModelError: vi.fn(() => false),
}));
vi.mock("@/lib/observability/log", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { saveNoteBlocks } from "./actions";

const { mockPrisma, requireUserMock } = hoisted;

function clinician(over: Record<string, unknown> = {}) {
  return {
    id: "user_1",
    email: "doc@example.com",
    firstName: "Cli",
    lastName: "Nician",
    roles: ["clinician"],
    organizationId: "org_1",
    organizationName: "Clinic",
    ...over,
  };
}

function note(over: Record<string, unknown> = {}) {
  return {
    id: "note_1",
    encounterId: "enc_1",
    status: "draft",
    aiDrafted: false,
    blocks: [],
    authorUserId: null,
    encounter: { id: "enc_1", patientId: "patient_1", status: "in_progress" },
    ...over,
  };
}

const BLOCKS = [{ heading: "Subjective", body: "edited body" }];

beforeEach(() => {
  vi.clearAllMocks();
  requireUserMock.mockResolvedValue(clinician());
  mockPrisma.note.findUnique.mockResolvedValue(note());
  mockPrisma.encounter.findFirst.mockResolvedValue({
    id: "enc_1",
    organizationId: "org_1",
    patientId: "patient_1",
  });
  // assertChartAccess (real RBAC) reads the patient's privacy flags.
  mockPrisma.patient.findFirst.mockResolvedValue({
    id: "patient_1",
    organizationId: "org_1",
    chartRestricted: false,
    restrictedProviderIds: [],
    chartRestrictedReason: null,
  });
  mockPrisma.note.update.mockResolvedValue(note());
});

describe("saveNoteBlocks — signed-note lock", () => {
  it("saves a draft note", async () => {
    const res = await saveNoteBlocks("note_1", BLOCKS);
    expect(res.ok).toBe(true);
    expect(mockPrisma.note.update).toHaveBeenCalledTimes(1);
  });

  it("saves a needs_review note", async () => {
    mockPrisma.note.findUnique.mockResolvedValue(note({ status: "needs_review" }));
    const res = await saveNoteBlocks("note_1", BLOCKS);
    expect(res.ok).toBe(true);
    expect(mockPrisma.note.update).toHaveBeenCalledTimes(1);
  });

  it("refuses to edit a finalized note and does NOT write", async () => {
    mockPrisma.note.findUnique.mockResolvedValue(note({ status: "finalized" }));
    const res = await saveNoteBlocks("note_1", BLOCKS);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/signed/i);
    expect(mockPrisma.note.update).not.toHaveBeenCalled();
  });

  it("refuses to edit an amended note and does NOT write", async () => {
    mockPrisma.note.findUnique.mockResolvedValue(note({ status: "amended" }));
    const res = await saveNoteBlocks("note_1", BLOCKS);
    expect(res.ok).toBe(false);
    expect(mockPrisma.note.update).not.toHaveBeenCalled();
  });

  it("denies a read-only (no notes.edit) user", async () => {
    requireUserMock.mockResolvedValue(clinician({ roles: ["front_office"] }));
    const res = await saveNoteBlocks("note_1", BLOCKS);
    expect(res.ok).toBe(false);
    expect(mockPrisma.note.update).not.toHaveBeenCalled();
  });
});
