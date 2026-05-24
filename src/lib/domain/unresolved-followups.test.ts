import { describe, expect, it } from "vitest";
import {
  buildUnresolvedFollowUps,
  encodeSourceRef,
  extractFollowUpFromThread,
  extractFollowUpsFromNote,
  extractSourceRef,
  type NoteLike,
  type ThreadLike,
} from "./unresolved-followups";

const baseNote = (overrides: Partial<NoteLike> = {}): NoteLike => ({
  id: "n1",
  encounterId: "e1",
  status: "finalized",
  finalizedAt: "2026-05-01T12:00:00Z",
  createdAt: "2026-05-01T11:00:00Z",
  blocks: [
    { heading: "Assessment", body: "Hypothyroid, well-controlled." },
    {
      heading: "Plan",
      body: "Recheck TSH in 6 weeks. Continue current dose. Patient to follow up if symptoms worsen.",
    },
  ],
  narrative: null,
  ...overrides,
});

describe("extractFollowUpsFromNote", () => {
  it("pulls follow-up sentences out of Plan blocks", () => {
    const items = extractFollowUpsFromNote(baseNote(), "p1");
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items[0].source).toBe("note");
    expect(items[0].title.toLowerCase()).toContain("recheck tsh");
    expect(items[0].href).toBe("/clinic/patients/p1/notes/n1");
    expect(items[0].sourceRef).toBe("noteId:n1");
  });

  it("ignores draft notes — they are still being written", () => {
    expect(extractFollowUpsFromNote(baseNote({ status: "draft" }), "p1")).toEqual([]);
  });

  it("returns empty when the plan block has no follow-up phrasing", () => {
    const note = baseNote({
      blocks: [{ heading: "Plan", body: "Patient stable. No changes." }],
    });
    expect(extractFollowUpsFromNote(note, "p1")).toEqual([]);
  });

  it("caps at 3 items even when the plan is verbose", () => {
    const note = baseNote({
      blocks: [
        {
          heading: "Plan",
          body: [
            "Recheck TSH in 6 weeks.",
            "Repeat lipid panel in 3 months.",
            "Titrate sertraline next visit.",
            "Reassess BP weekly.",
            "Reorder mammogram referral.",
          ].join(" "),
        },
      ],
    });
    expect(extractFollowUpsFromNote(note, "p1").length).toBe(3);
  });
});

describe("extractFollowUpFromThread", () => {
  it("surfaces triaged symptom-report threads", () => {
    const thread: ThreadLike = {
      id: "t1",
      subject: "Headaches since starting new dose",
      lastMessageAt: "2026-05-15T10:00:00Z",
      triageCategory: "symptom_report",
      triageUrgency: "routine",
      triageSummary: "Patient reports daily headaches, asks about dose adjustment.",
    };
    const item = extractFollowUpFromThread(thread, "p1");
    expect(item).not.toBeNull();
    expect(item!.source).toBe("message");
    expect(item!.sourceRef).toBe("threadId:t1");
    expect(item!.href).toBe("/clinic/patients/p1?tab=correspondence");
  });

  it("marks emergency/high triage as danger regardless of age", () => {
    const thread: ThreadLike = {
      id: "t2",
      subject: "Bad rash",
      lastMessageAt: new Date().toISOString(),
      triageCategory: "symptom_report",
      triageUrgency: "high",
    };
    const item = extractFollowUpFromThread(thread, "p1");
    expect(item?.severity).toBe("danger");
  });

  it("skips untriaged / informational threads", () => {
    const thread: ThreadLike = {
      id: "t3",
      subject: "Insurance card update",
      lastMessageAt: "2026-05-15T10:00:00Z",
      triageCategory: null,
      triageUrgency: null,
    };
    expect(extractFollowUpFromThread(thread, "p1")).toBeNull();
  });
});

describe("buildUnresolvedFollowUps", () => {
  it("hides items already converted to a task", () => {
    const note = baseNote();
    const items = buildUnresolvedFollowUps({
      patientId: "p1",
      notes: [note],
      threads: [],
      existingTasks: [
        {
          status: "open",
          description: `Recheck TSH in 6 weeks. ${encodeSourceRef("noteId:n1")}`,
        },
      ],
    });
    // Both follow-ups inside note n1 were "resolved" because the task
    // references noteId:n1 — the panel should be empty.
    expect(items).toEqual([]);
  });

  it("orders danger before info and applies the limit", () => {
    const old = baseNote({
      id: "n_old",
      finalizedAt: "2026-01-01T00:00:00Z",
      createdAt: "2026-01-01T00:00:00Z",
    });
    const fresh = baseNote({
      id: "n_fresh",
      finalizedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
    const items = buildUnresolvedFollowUps({
      patientId: "p1",
      notes: [fresh, old],
      threads: [],
      existingTasks: [],
      limit: 2,
    });
    expect(items.length).toBe(2);
    // Old finalized note (>30 days) → danger; it should sort first.
    expect(items[0].severity).toBe("danger");
  });
});

describe("source ref encode/extract round-trip", () => {
  it("encodes and recovers a ref", () => {
    const encoded = encodeSourceRef("noteId:n1");
    expect(extractSourceRef(`Recheck thyroid. ${encoded}`)).toBe("noteId:n1");
  });
  it("returns null when no ref is embedded", () => {
    expect(extractSourceRef("Just a regular task")).toBeNull();
    expect(extractSourceRef(null)).toBeNull();
  });
});
