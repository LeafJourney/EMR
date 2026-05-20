"use client";

// SAFE: dead-export-allowed reason="AddAllergyPopup component for EMR-696"

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import {
  classifyAllergyKind,
  type AllergyBubbleData,
} from "./allergy-bubble";

/**
 * EMR-696 — Add Allergy popup.
 *
 * Two-field form: Drug name (free-text + dropdown suggestions) + Reaction
 * (free-text + dropdown). Save closes the popup and emits a structured
 * AllergyBubbleData via `onSave`; Cancel closes without saving.
 *
 * The actual persistence (server action) is wired by the caller — this
 * component is presentational + form-validation only.
 */

const DRUG_SUGGESTIONS = [
  "Penicillin",
  "Amoxicillin",
  "Ciprofloxacin",
  "Sulfa",
  "Codeine",
  "Aspirin",
  "Ibuprofen",
  "Latex",
  "Bananas",
  "Pet dander",
];

const REACTION_SUGGESTIONS = [
  "Hives",
  "Angioedema",
  "Anaphylaxis",
  "Rash",
  "Nausea",
  "Vomiting",
  "Body aches",
  "Weakness",
  "Wheezing",
];

export interface AddAllergyPopupProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: AllergyBubbleData) => void;
}

export function AddAllergyPopup({ open, onClose, onSave }: AddAllergyPopupProps) {
  const [cause, setCause] = React.useState("");
  const [reaction, setReaction] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  if (!open) return null;

  function handleSave() {
    const c = cause.trim();
    const r = reaction.trim();
    if (!c) {
      setError("Drug name is required.");
      return;
    }
    if (!r) {
      setError("Reaction is required.");
      return;
    }
    onSave({ cause: c, reaction: r, kind: classifyAllergyKind(r) });
    setCause("");
    setReaction("");
    setError(null);
  }

  function handleCancel() {
    setCause("");
    setReaction("");
    setError(null);
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-label="Add allergy"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={handleCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[420px] bg-surface border border-border rounded-xl shadow-xl p-5 space-y-4"
      >
        <div>
          <h2 className="text-sm font-semibold text-text">Add allergy</h2>
          <p className="text-[11px] text-text-muted">
            Red bubble for true allergies, yellow for adverse reactions.
          </p>
        </div>

        <div className="space-y-1">
          <Label htmlFor="allergy-cause">Drug name</Label>
          <Input
            id="allergy-cause"
            list="allergy-cause-list"
            value={cause}
            onChange={(e) => {
              setCause(e.target.value);
              setError(null);
            }}
            placeholder="penicillin, ciprofloxacin, dander, bananas…"
          />
          <datalist id="allergy-cause-list">
            {DRUG_SUGGESTIONS.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </div>

        <div className="space-y-1">
          <Label htmlFor="allergy-reaction">Reaction</Label>
          <Input
            id="allergy-reaction"
            list="allergy-reaction-list"
            value={reaction}
            onChange={(e) => {
              setReaction(e.target.value);
              setError(null);
            }}
            placeholder="hives, nausea, vomiting…"
          />
          <datalist id="allergy-reaction-list">
            {REACTION_SUGGESTIONS.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={handleCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
