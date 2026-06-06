"use client";

/**
 * Current Medications card (EMR-852).
 *
 * Lives inside the patient chart. Class bubbles (prescription / supplement /
 * OTC / cannabis / psilocybin) filter the list on click. Left-click a med
 * opens a detail popup; right-click offers Renew / Edit / Discontinue without
 * leaving the page. "Add to history" records a non-prescribed med, and an
 * AI doc-scan affordance extracts meds from an uploaded document. The list
 * scrolls inside a fixed height, and clicking the title pops out a larger
 * version that embeds the full medication manager for real edits.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { Card, CardContent } from "@/components/ui/card";
import { MedicationsManager } from "./medications-manager";
import {
  Bubble,
  BubbleStrip,
  ModalShell,
  useChartLedger,
  type FilterBubble,
} from "./chart-kit";
import type { ModuleFlags } from "@/lib/clinical/module-opt-in";

interface Med {
  id: string;
  name: string;
  genericName?: string | null;
  type: string;
  dosage?: string | null;
  prescriber?: string | null;
  active: boolean;
  notes?: string | null;
}

const CLASS_LABEL: Record<string, string> = {
  prescription: "Prescription",
  supplement: "Supplement",
  otc: "OTC",
  cannabis: "Cannabis",
  psilocybin: "Psilocybin",
};

function classOf(med: Med): string {
  if (/psilocyb/i.test(med.name)) return "psilocybin";
  return med.type;
}

export function CurrentMedicationsCard({
  patientId,
  patientName,
  patientDOB,
  medications,
  moduleFlags,
}: {
  patientId: string;
  patientName: string;
  patientDOB: string | null;
  medications: Med[];
  moduleFlags: ModuleFlags;
}) {
  const router = useRouter();
  const { record } = useChartLedger(patientId);
  const [filter, setFilter] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<Med | null>(null);
  const [popOut, setPopOut] = React.useState(false);
  const [menu, setMenu] = React.useState<{ med: Med; x: number; y: number } | null>(
    null,
  );
  const [addOpen, setAddOpen] = React.useState(false);

  const active = medications.filter((m) => m.active);

  // Bubble classes present in the list, gated by module opt-in.
  const classes = ["prescription", "supplement", "otc", "cannabis", "psilocybin"].filter(
    (c) => {
      if (c === "cannabis" && !moduleFlags.cannabis) return false;
      if (c === "psilocybin" && !moduleFlags.psilocybin) return false;
      return true;
    },
  );

  const bubbles: FilterBubble[] = classes.map((c) => ({
    key: c,
    label: CLASS_LABEL[c] ?? c,
    tone: "beige",
    count: active.filter((m) => classOf(m) === c).length,
  }));

  const shown = filter ? active.filter((m) => classOf(m) === filter) : active;

  React.useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  const list = (
    <ul className="divide-y divide-border/50">
      {shown.length === 0 ? (
        <li className="py-6 text-center text-sm text-text-muted">
          No medications in this class.
        </li>
      ) : (
        shown.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => setDetail(m)}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ med: m, x: e.clientX, y: e.clientY });
              }}
              className="w-full flex items-center justify-between gap-3 py-2.5 px-1 text-left hover:bg-surface-muted/50 transition-colors rounded"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-text truncate">{m.name}</p>
                <p className="text-xs text-text-muted">
                  {m.dosage || "—"}
                  {m.prescriber ? ` · ${m.prescriber}` : ""}
                </p>
              </div>
              <Bubble tone="beige">{CLASS_LABEL[classOf(m)] ?? classOf(m)}</Bubble>
            </button>
          </li>
        ))
      )}
    </ul>
  );

  return (
    <Card tone="raised">
      <CardContent className="pt-5 pb-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <button
            type="button"
            onClick={() => setPopOut(true)}
            className="font-display text-base text-text tracking-tight hover:text-accent transition-colors"
            title="Open larger view"
          >
            Current Medications ⤢
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="text-[11px] px-2 py-1 rounded-md border border-dashed border-border-strong text-text-muted hover:bg-surface-muted"
            >
              + Add to history
            </button>
          </div>
        </div>

        <div className="mb-3">
          <BubbleStrip bubbles={bubbles} selected={filter} onSelect={setFilter} />
        </div>

        {/* Scrollable list (EMR-852) */}
        <div className="max-h-64 overflow-y-auto pr-1">{list}</div>
      </CardContent>

      {/* Right-click context menu */}
      {menu && (
        <div
          style={{ top: menu.y, left: menu.x }}
          className="fixed z-50 w-44 rounded-lg border border-border bg-surface-raised shadow-xl py-1 text-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <MenuItem
            label="Renew"
            onClick={() => {
              router.push(`/clinic/patients/${patientId}/prescribe`);
              setMenu(null);
            }}
          />
          <MenuItem
            label="Edit"
            onClick={() => {
              router.push(`/clinic/patients/${patientId}/prescribe`);
              setMenu(null);
            }}
          />
          <MenuItem
            label="Discontinue"
            danger
            onClick={() => {
              record({
                kind: "note",
                source: "Medications",
                subject: `Discontinue requested: ${menu.med.name}`,
              });
              setMenu(null);
            }}
          />
        </div>
      )}

      {/* Detail popup */}
      <ModalShell
        open={detail !== null}
        onClose={() => setDetail(null)}
        eyebrow="Medication"
        title={detail?.name ?? ""}
        placement="center"
        maxWidth="max-w-md"
      >
        {detail && (
          <div className="space-y-2 text-sm">
            <DetailRow k="Generic" v={detail.genericName || "—"} />
            <DetailRow k="Class" v={CLASS_LABEL[classOf(detail)] ?? classOf(detail)} />
            <DetailRow k="Dose" v={detail.dosage || "—"} />
            <DetailRow k="Prescriber" v={detail.prescriber || "—"} />
            <DetailRow k="Status" v={detail.active ? "Active" : "Inactive"} />
            <DetailRow k="Notes" v={detail.notes || "—"} />
          </div>
        )}
      </ModalShell>

      {/* Add-to-history + AI doc scan */}
      <AddToHistoryModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={(text) =>
          record({ kind: "note", source: "Medications", subject: `Added to history: ${text}` })
        }
      />

      {/* Pop-out larger view embeds the full manager */}
      <ModalShell
        open={popOut}
        onClose={() => setPopOut(false)}
        eyebrow={patientName}
        title="Current Medications"
        placement="center"
        maxWidth="max-w-3xl"
      >
        <MedicationsManager
          patientId={patientId}
          patientName={patientName}
          patientDOB={patientDOB}
          medications={medications as never}
        />
      </ModalShell>
    </Card>
  );
}

function MenuItem({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left px-3 py-1.5 hover:bg-surface-muted transition-colors",
        danger ? "text-danger" : "text-text",
      )}
    >
      {label}
    </button>
  );
}

function DetailRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-text-subtle text-xs uppercase tracking-wide shrink-0">{k}</span>
      <span className="text-text text-right">{v}</span>
    </div>
  );
}

function AddToHistoryModal({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (text: string) => void;
}) {
  const [text, setText] = React.useState("");
  const [scanName, setScanName] = React.useState<string | null>(null);

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      eyebrow="Medication history"
      title="Add a medication (not prescribed)"
      placement="center"
      maxWidth="max-w-md"
      isDirty={text.trim().length > 0}
    >
      <div className="space-y-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Metformin 500mg BID (patient-reported)"
          className="w-full text-sm rounded-md border border-border bg-surface px-3 py-2 text-text focus:outline-none focus:border-accent"
        />
        <div className="rounded-lg border border-dashed border-border p-3">
          <p className="text-[11px] font-medium text-text-subtle uppercase tracking-wide mb-1.5">
            AI document scan
          </p>
          <label className="text-xs text-accent cursor-pointer hover:underline">
            Upload a document for Cindy to extract medications
            <input
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setScanName(f.name);
              }}
            />
          </label>
          {scanName && (
            <p className="text-[11px] text-text-muted mt-1.5">
              Queued “{scanName}” for extraction — Cindy will suggest medications to confirm.
            </p>
          )}
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            disabled={!text.trim()}
            onClick={() => {
              onAdd(text.trim());
              setText("");
              onClose();
            }}
            className="px-3 py-1.5 text-sm font-medium rounded-md bg-accent text-accent-ink disabled:opacity-40 hover:bg-accent-strong transition-colors"
          >
            Add to history
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
