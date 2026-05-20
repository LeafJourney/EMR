// SAFE: dead-export-allowed reason="Wave 9 SOAP fragment scaffold (EMR-068); composed into the note workspace in a later wave"
"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea, Label } from "@/components/ui/input";

const OLDCARTS_FIELDS: { key: keyof HpiState; label: string; placeholder: string }[] = [
  { key: "onset", label: "Onset", placeholder: "When did it start? (e.g., 3 weeks ago, gradual)" },
  { key: "location", label: "Location", placeholder: "Where is it? (e.g., lower back, bilateral knees)" },
  { key: "duration", label: "Duration", placeholder: "How long does it last? (e.g., constant, intermittent)" },
  { key: "character", label: "Character", placeholder: "What does it feel like? (e.g., sharp, throbbing, burning)" },
  { key: "aggravating", label: "Aggravating", placeholder: "What makes it worse? (e.g., movement, stress)" },
  { key: "relieving", label: "Relieving", placeholder: "What makes it better? (e.g., rest, cannabis, NSAIDs)" },
  { key: "timing", label: "Timing", placeholder: "When is it worst? (e.g., mornings, after meals)" },
  { key: "severity", label: "Severity", placeholder: "How bad on 0-10? (e.g., 7/10 average)" },
];

interface HpiState {
  onset: string;
  location: string;
  duration: string;
  character: string;
  aggravating: string;
  relieving: string;
  timing: string;
  severity: string;
  narrative: string;
}

const EMPTY: HpiState = {
  onset: "",
  location: "",
  duration: "",
  character: "",
  aggravating: "",
  relieving: "",
  timing: "",
  severity: "",
  narrative: "",
};

function composeNarrative(state: HpiState): string {
  const parts: string[] = [];
  if (state.onset) parts.push(`Onset: ${state.onset}.`);
  if (state.location) parts.push(`Location: ${state.location}.`);
  if (state.character) parts.push(`Character: ${state.character}.`);
  if (state.severity) parts.push(`Severity: ${state.severity}.`);
  if (state.duration) parts.push(`Duration: ${state.duration}.`);
  if (state.timing) parts.push(`Timing: ${state.timing}.`);
  if (state.aggravating) parts.push(`Aggravated by: ${state.aggravating}.`);
  if (state.relieving) parts.push(`Relieved by: ${state.relieving}.`);
  return parts.join(" ");
}

export function SubjectiveHpi() {
  const [state, setState] = useState<HpiState>(EMPTY);

  const handleField = (key: keyof HpiState, value: string) => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  const fieldsFilled = OLDCARTS_FIELDS.filter((f) => state[f.key].trim().length > 0).length;

  const handleAutoCompose = () => {
    setState((prev) => ({ ...prev, narrative: composeNarrative(prev) }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>Subjective — History of Present Illness</CardTitle>
        <CardDescription>
          OLDCARTS framework. Fill any field — the narrative composes from what you provide.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {OLDCARTS_FIELDS.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={`hpi-${field.key}`}>{field.label}</Label>
                <Textarea
                  id={`hpi-${field.key}`}
                  rows={2}
                  value={state[field.key]}
                  onChange={(e) => handleField(field.key, e.target.value)}
                  placeholder={field.placeholder}
                />
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="hpi-narrative">Composed narrative</Label>
              <button
                type="button"
                onClick={handleAutoCompose}
                className="text-xs font-medium text-[var(--accent)] hover:underline"
              >
                Auto-compose from fields
              </button>
            </div>
            <Textarea
              id="hpi-narrative"
              rows={4}
              value={state.narrative}
              onChange={(e) => handleField("narrative", e.target.value)}
              placeholder="Free-text HPI. Click Auto-compose to draft from the fields above."
            />
          </div>

          <div className="text-xs text-text-muted">
            {fieldsFilled} of {OLDCARTS_FIELDS.length} OLDCARTS fields filled
          </div>
        </CardContent>
        <CardFooter className="pt-6 border-t border-[var(--border)] flex justify-end">
          <Button type="submit" variant="primary" disabled={fieldsFilled === 0 && !state.narrative.trim()}>
            Save HPI
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

export default SubjectiveHpi;
