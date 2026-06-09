"use client";

import { useState, useEffect, useTransition } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { searchPatientsAction, checkDuplicateAppointmentAction } from "@/app/(clinician)/clinic/patients/actions";
import { createPatientAppointmentAction } from "@/app/(clinician)/clinic/schedule/actions";
import { cn } from "@/lib/utils/cn";

interface PatientSearchResult {
  id: string;
  firstName: string;
  lastName: string;
  dob: string | null;
  phone: string | null;
  email: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  lastVisit: string | null;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Format a Date as a `datetime-local` input value (local wall-clock). */
function toLocalDateTimeValue(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function getAge(dobStr: string | null) {
  if (!dobStr) return null;
  const dob = new Date(dobStr);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

export function NewVisitModal({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Search/Selection state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PatientSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientSearchResult | null>(null);

  // Form inputs
  const [date, setDate] = useState("");
  const [visitType, setVisitType] = useState("History & Physical");
  const [customReason, setCustomReason] = useState("");
  const [notes, setNotes] = useState("");
  const [submitError, setSubmitError] = useState("");

  // Duplicate verification
  const [hasDuplicate, setHasDuplicate] = useState(false);
  const [duplicateDate, setDuplicateDate] = useState("");
  const [confirmDoubleBook, setConfirmDoubleBook] = useState(false);

  // Search query trigger
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await searchPatientsAction(searchQuery);
        setSearchResults(res);
      } catch (err) {
        console.error("Failed to query patients:", err);
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // When patient is selected, run duplicate check
  const handleSelectPatient = async (patient: PatientSearchResult) => {
    setSelectedPatient(patient);
    setSearchQuery("");
    setSearchResults([]);
    setHasDuplicate(false);
    setConfirmDoubleBook(false);

    try {
      const res = await checkDuplicateAppointmentAction(patient.id);
      if (res.hasDuplicate && res.scheduledAt) {
        setHasDuplicate(true);
        setDuplicateDate(
          new Date(res.scheduledAt).toLocaleDateString("en-US", {
            weekday: "long",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })
        );
      }
    } catch (err) {
      console.error("Duplicate check failed:", err);
    }
  };

  const resetForm = () => {
    setSelectedPatient(null);
    setSearchQuery("");
    setSearchResults([]);
    setDate("");
    setVisitType("History & Physical");
    setCustomReason("");
    setNotes("");
    setSubmitError("");
    setHasDuplicate(false);
    setDuplicateDate("");
    setConfirmDoubleBook(false);
  };

  const handleClose = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      resetForm();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) {
      setSubmitError("Please select a patient.");
      return;
    }
    if (hasDuplicate && !confirmDoubleBook) {
      setSubmitError("Please confirm double-booking to proceed.");
      return;
    }

    startTransition(async () => {
      setSubmitError("");
      const startAt = new Date(date);
      if (Number.isNaN(startAt.getTime())) {
        setSubmitError("Please enter a valid date and time.");
        return;
      }
      // Native datetime-local lets you type a 6-digit year (e.g. "202602"),
      // which parses to a valid-but-absurd Date. Reject anything outside a
      // sane window so a mistyped year can't silently book a visit in the year
      // 202602.
      const earliest = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const latest = new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000);
      if (startAt < earliest || startAt > latest) {
        setSubmitError("Please choose a date and time within the next two years.");
        return;
      }
      const endAt = new Date(startAt.getTime() + 30 * 60 * 1000); // Default 30-min duration

      const visitNotes = `[Visit Type: ${visitType}${
        visitType === "Custom" ? ` - ${customReason}` : ""
      }] ${notes}`.trim();

      const res = await createPatientAppointmentAction({
        patientId: selectedPatient.id,
        startIso: startAt.toISOString(),
        endIso: endAt.toISOString(),
        notes: visitNotes,
        modality: "in_person",
        force: true, // We override provider conflict checks if double book confirmed
      });

      if (res.ok) {
        setOpen(false);
        resetForm();
      } else {
        setSubmitError(res.error || "Failed to schedule appointment.");
      }
    });
  };

  const showDisambiguation = searchResults.length > 1;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-text">Schedule New Visit</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Patient Selection Search */}
          {!selectedPatient ? (
            <div className="space-y-2">
              <label className="text-sm font-medium text-text">Patient search</label>
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                  placeholder="Type name, DOB (YYYY-MM-DD), or phone..."
                  autoFocus
                />
                {searching && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <svg className="animate-spin h-4 w-4 text-text-subtle" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  </div>
                )}
              </div>

              {/* Disambiguation grid for multiple matches */}
              {showDisambiguation ? (
                <div className="mt-3 rounded-lg border border-border/80 bg-surface shadow-sm overflow-hidden animate-in fade-in duration-200">
                  <div className="bg-surface-muted/60 px-3 py-2 text-xs font-semibold text-text-muted border-b border-border/80">
                    Multiple matches found. Select the correct chart:
                  </div>
                  <div className="overflow-x-auto max-h-48">
                    <table className="min-w-full divide-y divide-border/60 text-xs">
                      <thead className="bg-surface-muted/30">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-text-subtle">Name</th>
                          <th className="px-2 py-2 text-left font-medium text-text-subtle">DOB</th>
                          <th className="px-2 py-2 text-left font-medium text-text-subtle">Age</th>
                          <th className="px-2 py-2 text-left font-medium text-text-subtle">Phone</th>
                          <th className="px-3 py-2 text-left font-medium text-text-subtle">Address</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60 bg-surface">
                        {searchResults.map((patient) => {
                          const age = getAge(patient.dob);
                          const address = [patient.addressLine1, patient.city, patient.state].filter(Boolean).join(", ");
                          return (
                            <tr
                              key={patient.id}
                              onClick={() => handleSelectPatient(patient)}
                              className="hover:bg-accent/5 cursor-pointer transition-colors"
                            >
                              <td className="px-3 py-2 font-semibold text-accent">{patient.firstName} {patient.lastName}</td>
                              <td className="px-2 py-2 whitespace-nowrap">{patient.dob || "—"}</td>
                              <td className="px-2 py-2">{age ?? "—"}</td>
                              <td className="px-2 py-2 whitespace-nowrap">{patient.phone || "—"}</td>
                              <td className="px-3 py-2 truncate max-w-[120px]" title={address}>{address || "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                searchQuery.trim() && searchResults.length === 1 && (
                  <div className="mt-1 bg-surface border border-border rounded-md shadow-sm">
                    {searchResults.map((patient) => (
                      <button
                        key={patient.id}
                        type="button"
                        onClick={() => handleSelectPatient(patient)}
                        className="w-full text-left px-4 py-2 hover:bg-accent/10 flex items-center justify-between text-sm"
                      >
                        <span className="font-semibold text-accent">{patient.firstName} {patient.lastName}</span>
                        <span className="text-xs text-text-subtle">DOB: {patient.dob}</span>
                      </button>
                    ))}
                  </div>
                )
              )}
            </div>
          ) : (
            /* Selected Patient Card */
            <div className="rounded-lg border border-border bg-surface-muted/40 p-4 flex items-center justify-between">
              <div className="space-y-1">
                <div className="font-semibold text-base text-text">
                  {selectedPatient.firstName} {selectedPatient.lastName}
                </div>
                <div className="text-xs text-text-muted flex gap-2">
                  <span>DOB: {selectedPatient.dob || "—"}</span>
                  <span>•</span>
                  <span>Age: {getAge(selectedPatient.dob) ?? "—"}</span>
                  {selectedPatient.phone && (
                    <>
                      <span>•</span>
                      <span>{selectedPatient.phone}</span>
                    </>
                  )}
                </div>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={() => setSelectedPatient(null)}>
                Change
              </Button>
            </div>
          )}

          {/* Duplicate booking verification */}
          {hasDuplicate && selectedPatient && (
            <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 text-xs space-y-2 animate-in slide-in-from-top-1">
              <div className="font-medium text-warning flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path fillRule="evenodd" d="M8.893 1.5c-.18-.31-.5-.5-.893-.5s-.71.19-.893.5L.237 13.5c-.178.308-.178.692 0 1 .179.307.502.5.893.5h13.74c.39 0 .714-.193.893-.5.179-.308.179-.692 0-1L8.893 1.5zM8 11a1 1 0 110-2 1 1 0 010 2zm0-4a1 1 0 01-1-1V4a1 1 0 112 0v2a1 1 0 01-1 1z" clipRule="evenodd" />
                </svg>
                Already Scheduled This Week
              </div>
              <p className="text-text-muted">
                {selectedPatient.firstName} {selectedPatient.lastName} is already scheduled for a visit on{" "}
                <span className="font-semibold">{duplicateDate}</span>.
              </p>
              <label className="flex items-center gap-2 font-semibold text-text cursor-pointer mt-1">
                <input
                  type="checkbox"
                  checked={confirmDoubleBook}
                  onChange={(e) => setConfirmDoubleBook(e.target.checked)}
                  className="rounded border-border bg-surface text-accent focus:ring-accent"
                />
                Confirm double-booking
              </label>
            </div>
          )}

          {/* Form Fields - enabled only once patient is selected */}
          {selectedPatient && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text">Type of visit</label>
                <select
                  value={visitType}
                  onChange={(e) => setVisitType(e.target.value)}
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                >
                  <option>History & Physical</option>
                  <option>Follow up</option>
                  <option>New Patient</option>
                  <option>Custom</option>
                </select>
              </div>

              {visitType === "Custom" && (
                <div className="space-y-1.5 animate-in slide-in-from-top-1">
                  <label className="text-sm font-medium text-text">Custom reason</label>
                  <textarea
                    required
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    placeholder="Enter custom visit reason..."
                    rows={2}
                    className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text">Date & Time</label>
                <input
                  required
                  type="datetime-local"
                  value={date}
                  min={toLocalDateTimeValue(new Date())}
                  max={toLocalDateTimeValue(new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000))}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text">Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notes or clinical reminders..."
                  rows={3}
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                />
              </div>
            </div>
          )}

          {submitError && (
            <p className="text-sm text-danger font-medium bg-danger/10 border border-danger/20 rounded-md px-3 py-2">
              {submitError}
            </p>
          )}

          <div className="pt-4 flex justify-end gap-2 border-t border-border mt-6">
            <Button type="button" variant="secondary" onClick={() => handleClose(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending || !selectedPatient || (hasDuplicate && !confirmDoubleBook)}
            >
              {isPending ? "Scheduling..." : "Schedule Visit"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
