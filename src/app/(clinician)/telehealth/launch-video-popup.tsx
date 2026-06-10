"use client";

// EMR-683 — "Launch Video Visit" popup.
//
// Rendered as the right-hand action on /telehealth. The trigger is the
// large video/plus icon called out in the doc-2 product feedback; the
// popup is a single free-text search field that hits
// /api/patients/search and lets the clinician jump straight to the
// patient's telehealth room (which then handles room creation + the
// in-call ambient AI scribe toggle, already shipped in EMR-652).
//
// We deliberately do NOT touch scribe note-mapping here. The "Objective"
// SOAP/APSO section is human-only — the scribe never pre-fills it. This
// component just routes to the call surface; the in-call scribe button
// is owned by src/app/(clinician)/clinic/patients/[id]/telehealth/video-room.tsx.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Video, Plus, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface PatientHit {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
}

export function LaunchVideoPopup() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PatientHit[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset state every time the popup opens — stale results from a
  // previous launch would be confusing.
  useEffect(() => {
    if (open) {
      setQ("");
      setHits([]);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/patients/search?q=${encodeURIComponent(term)}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          setHits([]);
          return;
        }
        const data = (await res.json()) as { patients: PatientHit[] };
        setHits(data.patients ?? []);
      } catch {
        setHits([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q, open]);

  function launch(p: PatientHit) {
    setOpen(false);
    // The patient telehealth surface owns room creation + token issuance
    // and (per EMR-652) the in-call ambient-scribe toggle that displays a
    // "scribe is recording" indicator. When the room is provisioned
    // (startTelehealthVisit, EMR-1115) the patient's join link is delivered
    // as a secure portal message + notification, and a "Join video visit"
    // button appears on their portal Appointments page. There is no email
    // send — delivery is in-portal.
    router.push(`/clinic/patients/${p.id}/telehealth`);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Launch new video visit"
        title="Launch a new video visit — opens a patient search popup"
        className="relative inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-white shadow-md hover:brightness-110 hover:scale-[1.03] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:ring-offset-2"
      >
        <Video size={26} strokeWidth={1.8} />
        <span className="absolute -right-1 -bottom-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-surface text-accent border border-accent shadow-sm">
          <Plus size={12} strokeWidth={2.5} />
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Launch video visit</DialogTitle>
            <p className="text-sm text-text-muted mt-1">
              Search by name, phone, date of birth, or email. When you start
              the visit, the patient gets a secure join link in their portal
              messages and a Join button on their Appointments page.
            </p>
          </DialogHeader>

          <div className="relative">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle pointer-events-none"
            />
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="e.g. Maya Reyes, 555-0142, 1985-03-21, maya@…"
              className="pl-9"
            />
          </div>

          <div className="mt-4 min-h-[140px] max-h-[320px] overflow-y-auto">
            {q.trim().length < 2 ? (
              <p className="text-xs text-text-subtle text-center py-6">
                Type at least 2 characters to search.
              </p>
            ) : loading ? (
              <p className="text-xs text-text-subtle text-center py-6">
                Searching…
              </p>
            ) : hits.length === 0 ? (
              <p className="text-xs text-text-subtle text-center py-6">
                No patients match. Try a different fragment.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {hits.map((p) => (
                  <li key={p.id}>
                    <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-surface hover:bg-surface-muted transition-colors">
                      <div className="h-9 w-9 rounded-full bg-accent/10 text-accent flex items-center justify-center font-display text-xs shrink-0">
                        {p.firstName[0]}
                        {p.lastName[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text truncate">
                          {p.firstName} {p.lastName}
                        </p>
                        <p className="text-[11px] text-text-muted truncate">
                          {[
                            p.dateOfBirth ? `DOB ${p.dateOfBirth}` : null,
                            p.phone,
                            p.email,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="primary"
                        onClick={() => launch(p)}
                        className="shrink-0"
                      >
                        <Video size={13} className="mr-1" />
                        Launch
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
