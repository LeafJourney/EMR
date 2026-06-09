"use client";

/**
 * Floating "+" action menu (EMR-877).
 *
 * On ANY page of a patient's chart, a fixed "+" bubble sits at the bottom
 * right (above the feedback bubble). Clicking it fans out radial action
 * circles: Rx (jump to the prescribe page), Note (inline quick-note
 * composer), and Phone (call / video / text the patient's main number).
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { ModalShell } from "@/components/ui/modal-shell";
import { useChartLedger } from "./chart-kit";

interface FloatingActionMenuProps {
  patientId: string;
  patientName: string;
  patientPhone?: string | null;
}

export function FloatingActionMenu({
  patientId,
  patientName,
  patientPhone,
}: FloatingActionMenuProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [noteOpen, setNoteOpen] = React.useState(false);
  const [phoneOpen, setPhoneOpen] = React.useState(false);

  // Radial items animate out from the "+" along an arc to the upper-left.
  const items = [
    {
      key: "rx",
      emoji: "℞",
      label: "Prescribe",
      offset: "translate-y-[-72px]",
      onClick: () => router.push(`/clinic/patients/${patientId}/prescribe`),
    },
    {
      key: "note",
      emoji: "📝",
      label: "Quick note",
      offset: "translate-x-[-52px] translate-y-[-52px]",
      onClick: () => setNoteOpen(true),
    },
    {
      key: "phone",
      emoji: "📞",
      label: "Contact",
      offset: "translate-x-[-72px]",
      onClick: () => setPhoneOpen(true),
    },
  ];

  return (
    <>
      <div className="fixed bottom-20 right-6 z-40 print:hidden">
        {/* Radial action circles */}
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-label={item.label}
            title={item.label}
            onClick={() => {
              setOpen(false);
              item.onClick();
            }}
            className={cn(
              "absolute bottom-0 right-0 flex h-11 w-11 items-center justify-center rounded-full bg-surface-raised border border-border shadow-lg text-lg transition-all duration-300",
              open
                ? cn("opacity-100", item.offset)
                : "opacity-0 translate-x-0 translate-y-0 pointer-events-none",
            )}
          >
            <span aria-hidden="true">{item.emoji}</span>
          </button>
        ))}

        {/* Main + trigger */}
        <button
          type="button"
          aria-label={open ? "Close actions" : "Open quick actions"}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "relative flex h-[52px] w-[52px] items-center justify-center rounded-full bg-gradient-to-b from-accent to-accent-strong text-accent-ink shadow-seal text-2xl transition-transform hover:scale-105",
            open && "rotate-45",
          )}
        >
          <span aria-hidden="true" className="leading-none">＋</span>
        </button>
      </div>

      <QuickNoteModal
        open={noteOpen}
        onClose={() => setNoteOpen(false)}
        patientId={patientId}
        patientName={patientName}
      />
      <ContactModal
        open={phoneOpen}
        onClose={() => setPhoneOpen(false)}
        patientId={patientId}
        patientName={patientName}
        patientPhone={patientPhone}
      />
    </>
  );
}

function QuickNoteModal({
  open,
  onClose,
  patientId,
  patientName,
}: {
  open: boolean;
  onClose: () => void;
  patientId: string;
  patientName: string;
}) {
  const { record } = useChartLedger(patientId);
  const [text, setText] = React.useState("");
  const [saved, setSaved] = React.useState(false);

  function save() {
    if (!text.trim()) return;
    record({ kind: "note", source: "Quick note", subject: text.trim() });
    setSaved(true);
    setText("");
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 700);
  }

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      eyebrow={patientName}
      title="Quick note"
      placement="center"
      maxWidth="max-w-md"
      isDirty={text.trim().length > 0}
    >
      <div className="space-y-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          autoFocus
          placeholder="Jot a quick note or reminder for this chart…"
          className="w-full text-sm rounded-lg border border-border bg-surface px-3 py-2 text-text focus:outline-none focus:border-accent resize-none"
        />
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-text-subtle">
            {saved ? "Saved to chart log ✓" : "Saved into the chart activity log."}
          </span>
          <button
            type="button"
            onClick={save}
            disabled={!text.trim()}
            className="px-3 py-1.5 text-sm font-medium rounded-md bg-accent text-accent-ink disabled:opacity-40 hover:bg-accent-strong transition-colors"
          >
            Save note
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function ContactModal({
  open,
  onClose,
  patientId,
  patientName,
  patientPhone,
}: {
  open: boolean;
  onClose: () => void;
  patientId: string;
  patientName: string;
  patientPhone?: string | null;
}) {
  const [mode, setMode] = React.useState<"phone" | "video" | "text">("phone");
  const phone = (patientPhone ?? "").replace(/[^\d+]/g, "");

  const href =
    mode === "phone"
      ? phone
        ? `tel:${phone}`
        : undefined
      : mode === "text"
        ? phone
          ? `sms:${phone}`
          : undefined
        : `/clinic/patients/${patientId}/telehealth`;

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      eyebrow={patientName}
      title="Contact patient"
      placement="center"
      maxWidth="max-w-sm"
    >
      <div className="space-y-4">
        <p className="text-sm text-text-muted">
          {patientPhone
            ? `Main number: ${patientPhone}`
            : "No phone number on file — video visit available."}
        </p>
        <div className="flex gap-2">
          {(["phone", "video", "text"] as const).map((m) => (
            <label
              key={m}
              className={cn(
                "flex-1 flex flex-col items-center gap-1 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors",
                mode === m
                  ? "border-accent bg-accent-soft"
                  : "border-border hover:bg-surface-muted",
              )}
            >
              <input
                type="radio"
                name="contact-mode"
                value={m}
                checked={mode === m}
                onChange={() => setMode(m)}
                className="sr-only"
              />
              <span aria-hidden="true" className="text-xl">
                {m === "phone" ? "📞" : m === "video" ? "🎥" : "💬"}
              </span>
              <span className="text-xs font-medium capitalize">{m}</span>
            </label>
          ))}
        </div>
        <a
          href={href}
          target={mode === "video" ? "_self" : undefined}
          onClick={() => onClose()}
          className={cn(
            "block w-full text-center px-3 py-2 text-sm font-medium rounded-md bg-accent text-accent-ink hover:bg-accent-strong transition-colors",
            !href && "pointer-events-none opacity-40",
          )}
        >
          {mode === "phone" ? "Call now" : mode === "video" ? "Start video visit" : "Send text"}
        </a>
      </div>
    </ModalShell>
  );
}
