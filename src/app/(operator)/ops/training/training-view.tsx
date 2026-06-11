"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { TrainingModule, TrainingStatus } from "@/lib/domain/overnight-batch";
import { cn } from "@/lib/utils/cn";

const CATEGORY_TONES: Record<TrainingModule["category"], "accent" | "info" | "warning" | "highlight"> = {
  clinical: "accent",
  compliance: "warning",
  operations: "info",
  soft_skills: "highlight",
};

const CATEGORY_LABELS: Record<TrainingModule["category"], string> = {
  clinical: "Clinical",
  compliance: "Compliance",
  operations: "Operations",
  soft_skills: "Soft skills",
};

const STATUS_TONE: Record<TrainingStatus, "neutral" | "warning" | "success"> = {
  not_started: "neutral",
  in_progress: "warning",
  complete: "success",
};

const STATUS_LABELS: Record<TrainingStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  complete: "Complete",
};

export function TrainingView({ initialModules }: { initialModules: TrainingModule[] }) {
  const [modules, setModules] = useState<TrainingModule[]>(initialModules);
  const [active, setActive] = useState<TrainingModule | null>(null);

  const required = useMemo(() => modules.filter((m) => m.required), [modules]);
  const requiredComplete = required.filter((m) => m.status === "complete").length;

  function markComplete(id: string) {
    setModules((prev) =>
      prev.map((m) =>
        m.id === id
          ? { ...m, status: "complete", completedAt: new Date().toISOString() }
          : m,
      ),
    );
    setActive(null);
  }

  function startModule(m: TrainingModule) {
    setModules((prev) =>
      prev.map((x) => (x.id === m.id && x.status === "not_started" ? { ...x, status: "in_progress" } : x)),
    );
    setActive({ ...m, status: m.status === "not_started" ? "in_progress" : m.status });
  }

  const progressPct = required.length === 0 ? 0 : Math.round((requiredComplete / required.length) * 100);

  return (
    <div className="space-y-6">
      <Card tone="raised">
        <CardContent className="py-5">
          <div className="flex items-end justify-between gap-4 mb-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-text-subtle">Required progress</p>
              <p className="font-display text-2xl text-text mt-1">
                {requiredComplete} of {required.length} complete
              </p>
            </div>
            <p className="text-sm text-text-muted tabular-nums">{progressPct}%</p>
          </div>
          <div className="h-2 rounded-full bg-surface-muted overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-accent to-accent-strong transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {modules.map((m) => (
          <Card key={m.id} tone="raised" className="flex flex-col">
            <CardContent className="py-5 flex-1 flex flex-col">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {m.required && <span className="text-[var(--leaf,#3a7d44)]" title="Required">🍃</span>}
                    <h3 className="font-medium text-text">{m.title}</h3>
                  </div>
                  <p className="text-xs text-text-muted mt-1">{m.description}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <Badge tone={CATEGORY_TONES[m.category]}>{CATEGORY_LABELS[m.category]}</Badge>
                <Badge tone={STATUS_TONE[m.status]}>{STATUS_LABELS[m.status]}</Badge>
                <span className="text-[11px] text-text-subtle">{m.durationMinutes} min</span>
              </div>
              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border/60">
                <Button
                  size="sm"
                  variant={m.status === "complete" ? "ghost" : "primary"}
                  onClick={() => startModule(m)}
                  disabled={m.status === "complete"}
                >
                  {m.status === "complete" ? "Completed" : m.status === "in_progress" ? "Resume" : "Start training"}
                </Button>
                <select
                  className="flex-1 rounded-md border border-border-strong bg-surface px-2 h-8 text-xs text-text-muted disabled:cursor-not-allowed disabled:opacity-60"
                  defaultValue=""
                  disabled
                  title="Assigning training to staff is not yet available."
                >
                  <option value="">Assign to staff (coming soon)</option>
                </select>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {active && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setActive(null)}
        >
          <Card tone="raised" className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <CardContent className="py-6">
              <p className="text-xs uppercase tracking-wider text-text-subtle mb-1">
                {CATEGORY_LABELS[active.category]} training
              </p>
              <h3 className="font-display text-xl text-text">{active.title}</h3>
              <p className="text-sm text-text-muted mt-2">{active.description}</p>
              <div className="mt-4 p-4 rounded-lg bg-surface-muted/60 text-sm text-text-muted">
                <p className="mb-2 font-medium text-text">Module overview</p>
                <p>
                  This is demo content. In production, this would load a guided video, interactive
                  quiz, or PDF walk-through covering {active.title.toLowerCase()}.
                </p>
                <ul className="list-disc list-inside mt-3 space-y-1 text-xs">
                  <li>Estimated duration: {active.durationMinutes} minutes</li>
                  <li>Learning objectives covered in plain language</li>
                  <li>Short knowledge check at the end</li>
                </ul>
              </div>
              <div className="flex items-center justify-end gap-2 mt-5">
                <Button variant="ghost" size="sm" onClick={() => setActive(null)}>
                  Close
                </Button>
                <Button size="sm" onClick={() => markComplete(active.id)}>
                  Mark complete
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-text-subtle">
          Leaf (🍃) indicates a required module for all staff.
        </p>
        <span className={cn("text-xs", progressPct === 100 ? "text-accent" : "text-text-subtle")}>
          {progressPct === 100 ? "All required training complete." : "Keep going!"}
        </span>
      </div>
    </div>
  );
}
