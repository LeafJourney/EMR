"use client";

import { useState, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, FieldGroup } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";
import { createGroupSeriesAction, type CreateGroupSeriesInput } from "./actions";

type Cadence = "once" | "weekly" | "biweekly" | "monthly";

type ProviderOption = { id: string; name: string };

export function GroupSeriesPlanner({
  providers,
  viewerProviderId,
}: {
  providers: ProviderOption[];
  viewerProviderId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [firstStart, setFirstStart] = useState("");
  const [durationMin, setDurationMin] = useState(60);
  const [cadence, setCadence] = useState<Cadence>("once");
  const [sessionCount, setSessionCount] = useState(1);
  const [maxSeats, setMaxSeats] = useState(8);
  // EMR-1110 (FO-M4, minor 2) — explicit series lead. Defaults to the
  // viewer's own provider profile when they have one.
  const [providerId, setProviderId] = useState<string>(viewerProviderId ?? "");
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);

  const submit = () => {
    setFeedback(null);
    if (!title.trim() || !firstStart) {
      setFeedback("Title and first session start are required.");
      return;
    }
    if (!providerId) {
      setFeedback("Choose the provider who will lead this series.");
      return;
    }
    const payload: CreateGroupSeriesInput = {
      title: title.trim(),
      topic: topic.trim() || null,
      firstStartIso: new Date(firstStart).toISOString(),
      durationMinutes: durationMin,
      cadence,
      sessionCount: cadence === "once" ? 1 : sessionCount,
      maxSeats,
      providerId,
    };
    startTransition(async () => {
      const r = await createGroupSeriesAction(payload);
      if (r.ok) {
        setFeedback(`Series created — ${r.sessionsCreated} session(s).`);
        setTitle("");
        setTopic("");
        setFirstStart("");
        setSessionCount(1);
      } else {
        setFeedback(r.error);
      }
    });
  };

  if (!open) {
    return (
      <Card tone="ambient">
        <CardContent className="pt-5 pb-5 flex items-center justify-between">
          <div>
            <p className="font-display text-lg text-text">Compose a series</p>
            <p className="text-sm text-text-muted">
              Cohort visits, weekly check-ins, monthly groups — all live here.
            </p>
          </div>
          <Button onClick={() => setOpen(true)}>New series</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card tone="raised">
      <CardContent className="pt-6 pb-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg text-text">New group / recurring series</h3>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Close
          </Button>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <FieldGroup label="Series title">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Cannabis 101 cohort"
            />
          </FieldGroup>
          <FieldGroup label="Topic" hint="Optional, shown to invitees">
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Pain regimen group"
            />
          </FieldGroup>
          <FieldGroup label="Led by" hint="Sessions are attributed to this provider">
            <select
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-border bg-surface text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/40"
            >
              <option value="">Select provider…</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.id === viewerProviderId ? " (you)" : ""}
                </option>
              ))}
            </select>
          </FieldGroup>
          <FieldGroup label="First session starts at">
            <Input
              type="datetime-local"
              value={firstStart}
              onChange={(e) => setFirstStart(e.target.value)}
            />
          </FieldGroup>
          <FieldGroup label="Duration (minutes)">
            <Input
              type="number"
              min={15}
              max={240}
              value={durationMin}
              onChange={(e) => setDurationMin(Math.max(15, Math.min(240, Number(e.target.value) || 60)))}
            />
          </FieldGroup>
          <div className="md:col-span-2">
            <Label>Cadence</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {(["once", "weekly", "biweekly", "monthly"] as Cadence[]).map((c) => (
                <button
                  key={c}
                  onClick={() => setCadence(c)}
                  className={cn(
                    "px-3 h-8 rounded-full border text-xs",
                    cadence === c
                      ? "bg-accent text-accent-ink border-accent"
                      : "bg-surface text-text-muted border-border-strong/50",
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          {cadence !== "once" && (
            <FieldGroup label="Number of sessions">
              <Input
                type="number"
                min={2}
                max={26}
                value={sessionCount}
                onChange={(e) =>
                  setSessionCount(Math.max(2, Math.min(26, Number(e.target.value) || 4)))
                }
              />
            </FieldGroup>
          )}
          <FieldGroup label="Seats per session">
            <Input
              type="number"
              min={2}
              max={50}
              value={maxSeats}
              onChange={(e) => setMaxSeats(Math.max(2, Math.min(50, Number(e.target.value) || 8)))}
            />
          </FieldGroup>
        </div>
        <div className="flex items-center justify-between pt-2">
          <Badge tone="info">
            {cadence === "once"
              ? "1 session"
              : `${sessionCount} session${sessionCount === 1 ? "" : "s"}`}
            {" · "}
            {maxSeats} seats each
          </Badge>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Creating…" : "Create series"}
          </Button>
        </div>
        {feedback && (
          <p className={cn("text-sm", feedback.startsWith("Series") ? "text-success" : "text-danger")}>
            {feedback}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
