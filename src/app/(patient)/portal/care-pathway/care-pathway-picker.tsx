"use client";

/**
 * EMR-422 — Patient care-pathway picker (NEW, distinct from the shipped
 * practice-admin care-model archetype step that shares the EMR-422 id).
 *
 * Lets an onboarding patient choose between a Conventional and a Cannabinoid
 * care pathway. Choice persists to localStorage-interim (no patient schema
 * field yet) and routes onward to intake. A future pass adds a Patient column
 * + clinician-visible surface so the pathway is queryable for cohorting.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

type PathwayKey = "conventional" | "cannabinoid";

const PATHWAYS: {
  key: PathwayKey;
  emoji: string;
  title: string;
  tagline: string;
  points: string[];
}[] = [
  {
    key: "conventional",
    emoji: "🩺",
    title: "Conventional care",
    tagline: "Traditional medicine first, with your usual prescriptions and referrals.",
    points: [
      "Standard medications and therapies",
      "Specialist referrals as needed",
      "Familiar, evidence-based treatment plans",
    ],
  },
  {
    key: "cannabinoid",
    emoji: "🌿",
    title: "Cannabinoid care",
    tagline: "A cannabis-forward plan with per-product tracking and outcome check-ins.",
    points: [
      "Personalized cannabinoid regimens",
      "Fun post-dose check-ins and outcome tracking",
      "Conventional options stay available any time",
    ],
  },
];

function storageKey(userId: string) {
  return `care-pathway:${userId}:v1`;
}

export function CarePathwayPicker({ userId }: { userId: string }) {
  const router = useRouter();
  const key = storageKey(userId);
  const [selected, setSelected] = useState<PathwayKey | null>(null);
  const [saved, setSaved] = useState<PathwayKey | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(key) as PathwayKey | null;
      if (raw === "conventional" || raw === "cannabinoid") {
        setSelected(raw);
        setSaved(raw);
      }
    } catch {
      /* private mode — start unselected */
    }
  }, [key]);

  function choose(k: PathwayKey) {
    setSelected(k);
  }

  function confirm() {
    if (!selected) return;
    try {
      window.localStorage.setItem(key, selected);
      setSaved(selected);
    } catch {
      /* non-fatal */
    }
    router.push("/portal/intake");
  }

  return (
    <div className="py-2">
      <div className="text-center mb-8">
        <h1 className="font-display text-3xl text-text">How would you like to be cared for?</h1>
        <p className="text-sm text-text-muted mt-2">
          Pick the pathway that feels right. You can switch any time — nothing here is permanent.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {PATHWAYS.map((p) => {
          const active = selected === p.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => choose(p.key)}
              aria-pressed={active}
              className={cn(
                "text-left rounded-3xl border-2 p-6 transition-all focus:outline-none",
                "focus-visible:ring-2 focus-visible:ring-accent/40 active:scale-[0.99]",
                active
                  ? "border-accent bg-accent/5 shadow-lg"
                  : "border-border bg-white hover:border-accent/40 hover:shadow-md",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-4xl" aria-hidden="true">{p.emoji}</span>
                <span
                  className={cn(
                    "h-6 w-6 rounded-full border-2 flex items-center justify-center text-xs",
                    active ? "border-accent bg-accent text-accent-ink" : "border-border-strong text-transparent",
                  )}
                  aria-hidden="true"
                >
                  ✓
                </span>
              </div>
              <h2 className="font-display text-xl text-text mt-4">{p.title}</h2>
              <p className="text-sm text-text-muted mt-1 leading-relaxed">{p.tagline}</p>
              <ul className="mt-4 space-y-1.5">
                {p.points.map((pt) => (
                  <li key={pt} className="flex items-start gap-2 text-[13px] text-text">
                    <span className="text-accent mt-0.5" aria-hidden="true">•</span>
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      <div className="mt-8 flex flex-col items-center gap-3">
        <Button
          size="lg"
          disabled={!selected}
          onClick={confirm}
          className="w-full sm:w-auto sm:px-12"
        >
          {saved && saved === selected ? "Continue to intake →" : "Choose this pathway →"}
        </Button>
        {saved && (
          <p className="text-[12px] text-text-subtle">
            Currently set to{" "}
            <span className="font-medium text-text">
              {saved === "conventional" ? "Conventional care" : "Cannabinoid care"}
            </span>
            .
          </p>
        )}
      </div>
    </div>
  );
}
