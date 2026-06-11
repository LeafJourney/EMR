"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";

/**
 * EMR-816 — Sticky compact patient strip.
 *
 * Dr. Patel: "When scrolling down on the page, keep the tab section fixed
 * and make the Patient Chart section disappear but still keep the patient's
 * name, age, sex (M/F), phone, email and Rx emoji button fixed on top of the
 * tabs section."
 *
 * This renders *inside* the sticky chart-frame region (above the tab bar)
 * but collapses to zero height until the main dossier card has scrolled out
 * of view, watched via an IntersectionObserver on a sentinel placed right
 * below the dossier (`#chart-dossier-sentinel`). When the dossier is gone,
 * the strip expands so the clinician always has identity + a one-click Rx
 * path no matter how far down the chart they've scrolled.
 */
export function StickyPatientHeader({
  patientId,
  name,
  age,
  sexLabel,
  phone,
  email,
}: {
  patientId: string;
  name: string;
  age: number | null;
  sexLabel: string | null;
  phone: string | null;
  email: string | null;
}) {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const sentinel = document.getElementById("chart-dossier-sentinel");
    if (!sentinel) return;
    const io = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting),
      // Trigger the moment the dossier's tail crosses the very top of the
      // viewport — the strip takes over exactly as the dossier leaves.
      { threshold: 0, rootMargin: "0px 0px 0px 0px" },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, []);

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  const ageSex =
    age !== null && sexLabel
      ? `${age}, ${sexLabel}`
      : age !== null
        ? `${age}`
        : sexLabel ?? "";

  return (
    <div
      aria-hidden={!visible}
      className={cn(
        "overflow-hidden transition-all duration-200 ease-smooth",
        visible
          ? "max-h-24 opacity-100"
          : "max-h-0 opacity-0 pointer-events-none",
      )}
    >
      <div className="flex items-center gap-3 flex-wrap py-2.5 px-1">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent text-xs font-semibold">
          {initials}
        </span>
        <span className="font-display text-base text-text leading-none">
          {name}
          {ageSex && (
            <span className="text-text-muted font-normal"> ({ageSex})</span>
          )}
        </span>

        {phone && (
          <a
            href={`tel:${phone}`}
            className="text-[13px] text-text-muted hover:text-accent transition-colors inline-flex items-center gap-1"
            title="Call patient"
          >
            <span aria-hidden>📞</span>
            <span className="tabular-nums">{phone}</span>
          </a>
        )}
        {email && (
          <a
            href={`mailto:${email}`}
            className="text-[13px] text-text-muted hover:text-accent transition-colors inline-flex items-center gap-1 truncate max-w-[220px]"
            title="Email patient"
          >
            <span aria-hidden>✉️</span>
            <span className="truncate">{email}</span>
          </a>
        )}

        {/* Fixed one-click Rx path — survives any scroll depth, per the
            "make it as easy as possible to prescribe" directive. */}
        <Link
          href={`/clinic/patients/${patientId}/prescribe`}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-gradient-to-b from-accent to-accent-strong px-3 py-1.5 text-sm font-semibold text-accent-ink shadow-seal hover:-translate-y-px transition-transform"
          title="Prescribe"
        >
          <span aria-hidden className="text-base leading-none">💊</span>
          Rx
        </Link>
      </div>
    </div>
  );
}
