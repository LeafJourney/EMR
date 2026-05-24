"use client";

import { useState, useRef, useEffect } from "react";
import { saveAllergy, removeAllergen } from "./actions";
import { Badge } from "@/components/ui/badge";

interface AllergyManagerProps {
  patientId: string;
  initialAllergies: string[];
}

const COMMON_DRUGS = [
  "Ibuprofen",
  "Penicillin",
  "Sulfa drugs",
  "Aspirin",
  "Amoxicillin",
  "Codeine",
  "Morphine",
  "Bactrim",
];

const COMMON_REACTIONS = [
  "hives",
  "angioedema",
  "anaphylaxis",
  "nausea",
  "vomiting",
  "body aches",
  "weakness",
  "rash",
  "shortness of breath",
];

const TRUE_ALLERGIES = [
  "hives",
  "angioedema",
  "anaphylaxis",
  "rash",
  "shortness of breath",
  "shortness_of_breath",
];

export function parseAllergyString(allergyStr: string) {
  const parts = allergyStr.split(":");
  const drug = parts[0] || "";
  const reaction = parts[1] || "hives"; // default to hives/true allergy if unspecified
  const isTrueAllergy = TRUE_ALLERGIES.includes(reaction.toLowerCase());
  return { drug, reaction, isTrueAllergy };
}

export function AllergyManager({ patientId, initialAllergies }: AllergyManagerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [reaction, setReaction] = useState("hives");
  const [customReaction, setCustomReaction] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  const filteredDrugs = search
    ? COMMON_DRUGS.filter((d) => d.toLowerCase().includes(search.toLowerCase()))
    : COMMON_DRUGS;

  const handleAdd = async (drugName: string) => {
    if (!drugName) return;
    const selectedReaction = reaction === "custom" ? customReaction.trim() : reaction;
    if (!selectedReaction) return;

    setIsPending(true);
    try {
      await saveAllergy(patientId, drugName, selectedReaction);
      setSearch("");
      setCustomReaction("");
      setOpen(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsPending(false);
    }
  };

  const handleRemove = async (allergyStr: string) => {
    try {
      await removeAllergen(patientId, allergyStr);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="relative inline-flex items-center gap-2">
      {/* Popover trigger button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-full border border-dashed border-border-strong text-text-muted hover:bg-surface-muted transition-colors duration-200"
      >
        + Add allergy
      </button>

      {open && (
        <div
          ref={popoverRef}
          className="absolute z-50 top-full mt-2 left-0 w-72 rounded-xl border border-border bg-surface-raised shadow-xl p-3 space-y-3"
        >
          <div>
            <p className="text-[10px] uppercase tracking-wider text-text-subtle font-semibold mb-1">
              Add new allergy
            </p>
            <input
              type="text"
              placeholder="Search or enter drug name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-xs rounded-md border border-border bg-surface px-2 py-1.5 text-text focus:outline-none focus:border-accent"
              autoFocus
            />
          </div>

          {/* Autocomplete List */}
          {search && filteredDrugs.length > 0 && (
            <ul className="max-h-24 overflow-y-auto border border-border/60 rounded-md bg-surface divide-y divide-border/40 text-xs">
              {filteredDrugs.map((drug) => (
                <li key={drug}>
                  <button
                    type="button"
                    onClick={() => handleAdd(drug)}
                    className="w-full text-left px-2 py-1.5 hover:bg-surface-muted text-text"
                  >
                    {drug}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Custom drug entry if no autocomplete hits */}
          {search && !COMMON_DRUGS.some((d) => d.toLowerCase() === search.toLowerCase()) && (
            <button
              type="button"
              onClick={() => handleAdd(search)}
              className="w-full text-left text-xs text-accent font-medium hover:underline px-1"
            >
              Add custom drug &quot;{search}&quot;
            </button>
          )}

          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-text-subtle font-semibold">
              Reaction
            </label>
            <select
              value={reaction}
              onChange={(e) => setReaction(e.target.value)}
              className="w-full text-xs rounded-md border border-border bg-surface px-2 py-1.5 text-text focus:outline-none focus:border-accent"
            >
              {COMMON_REACTIONS.map((rx) => (
                <option key={rx} value={rx}>
                  {rx}
                </option>
              ))}
              <option value="custom">Custom reaction...</option>
            </select>
          </div>

          {reaction === "custom" && (
            <div>
              <input
                type="text"
                placeholder="Enter reaction (e.g. skin peeling)"
                value={customReaction}
                onChange={(e) => setCustomReaction(e.target.value)}
                className="w-full text-xs rounded-md border border-border bg-surface px-2 py-1.5 text-text focus:outline-none focus:border-accent"
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              disabled={isPending || !search}
              onClick={() => handleAdd(search)}
              className="px-2.5 py-1 text-xs font-medium bg-accent text-accent-ink rounded-md hover:bg-accent-strong disabled:opacity-50"
            >
              {isPending ? "Adding..." : "Add"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface AllergyBadgeProps {
  patientId?: string;
  allergyStr: string;
  onRemove?: () => void;
}

export function AllergyBadge({
  patientId,
  allergyStr,
  onRemove,
}: AllergyBadgeProps) {
  const [isHovered, setIsHovered] = useState(false);
  const { drug, reaction, isTrueAllergy } = parseAllergyString(allergyStr);

  const handleRemove = async () => {
    if (onRemove) {
      onRemove();
    } else if (patientId) {
      try {
        await removeAllergen(patientId, allergyStr);
      } catch (err) {
        console.error(err);
      }
    }
  };

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Badge
        tone={isTrueAllergy ? "danger" : "warning"}
        className="text-[10px] pr-1.5 select-none relative"
      >
        <span>
          ⚠ {drug}
        </span>
        {(onRemove || patientId) && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleRemove();
            }}
            className="ml-1 hover:text-text hover:bg-black/10 rounded-full w-3.5 h-3.5 flex items-center justify-center font-bold"
          >
            &times;
          </button>
        )}
      </Badge>

      {/* Premium custom tooltip on hover */}
      {isHovered && (
        <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 z-50 bg-text text-surface rounded-lg p-2.5 shadow-xl text-left min-w-[160px] pointer-events-none">
          <p className="font-semibold text-xs border-b border-surface/20 pb-1 mb-1">
            {drug}
          </p>
          <div className="space-y-0.5 text-[10px] opacity-90">
            <p>
              <span className="font-medium">Reaction:</span> {reaction}
            </p>
            <p>
              <span className="font-medium">Type:</span>{" "}
              {isTrueAllergy ? "True Allergy (Red)" : "Adverse Reaction (Yellow)"}
            </p>
          </div>
          {/* Arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-text" />
        </div>
      )}
    </div>
  );
}

