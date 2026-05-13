"use client";

import React, { useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";

export interface CareTeamMember {
  id: string;
  name: string;
  role: string;
}

const DEFAULT_DIRECTORY: CareTeamMember[] = [
  { id: "u-patel", name: "Dr. Neal Patel", role: "Cannabis specialist" },
  { id: "u-nora", name: "Nurse Nora", role: "Care coordinator" },
  { id: "u-rivera", name: "Dr. Maya Rivera", role: "Pain management" },
  { id: "u-okafor", name: "Dr. Sam Okafor", role: "Psychiatry" },
  { id: "u-chen", name: "PharmD Lin Chen", role: "Clinical pharmacist" },
  { id: "u-lee", name: "MA Jordan Lee", role: "Medical assistant" },
];

export interface CareTeamTaggerProps {
  directory?: CareTeamMember[];
  initialTagged?: string[];
  onChange?: (tagged: CareTeamMember[]) => void;
}

export function CareTeamTagger({
  directory = DEFAULT_DIRECTORY,
  initialTagged = [],
  onChange,
}: CareTeamTaggerProps) {
  const [query, setQuery] = useState("");
  const [tagged, setTagged] = useState<string[]>(initialTagged);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const remaining = directory.filter((m) => !tagged.includes(m.id));
    if (!q) return remaining.slice(0, 5);
    return remaining
      .filter((m) => m.name.toLowerCase().includes(q) || m.role.toLowerCase().includes(q))
      .slice(0, 6);
  }, [directory, query, tagged]);

  const taggedMembers = useMemo(
    () => tagged.map((id) => directory.find((m) => m.id === id)).filter((m): m is CareTeamMember => !!m),
    [directory, tagged],
  );

  const addMember = (id: string) => {
    setTagged((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      onChange?.(next.map((tid) => directory.find((m) => m.id === tid)!).filter(Boolean));
      return next;
    });
    setQuery("");
    setHighlight(0);
    inputRef.current?.focus();
  };

  const removeMember = (id: string) => {
    setTagged((prev) => {
      const next = prev.filter((t) => t !== id);
      onChange?.(next.map((tid) => directory.find((m) => m.id === tid)!).filter(Boolean));
      return next;
    });
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && suggestions[highlight]) {
      e.preventDefault();
      addMember(suggestions[highlight].id);
    } else if (e.key === "Backspace" && query === "" && tagged.length > 0) {
      removeMember(tagged[tagged.length - 1]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Care team tagged:", taggedMembers);
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>Care Team</CardTitle>
        <CardDescription>Tag the clinicians and staff who should see this note.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <Label htmlFor="ct-input">Add team members</Label>
          <div className="flex flex-wrap items-center gap-2 p-2 border border-[var(--border)] rounded-xl bg-white focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent)]/20">
            {taggedMembers.map((m) => (
              <span
                key={m.id}
                className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)]/10 text-[var(--accent)] text-xs font-medium px-2 py-1"
              >
                @{m.name}
                <button
                  type="button"
                  onClick={() => removeMember(m.id)}
                  aria-label={`Remove ${m.name}`}
                  className="text-[var(--accent)] hover:text-[var(--accent)]/70"
                >
                  ×
                </button>
              </span>
            ))}
            <input
              id="ct-input"
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlight(0);
              }}
              onKeyDown={handleKey}
              placeholder={taggedMembers.length === 0 ? "Type a name or role…" : ""}
              className="flex-1 min-w-[10ch] bg-transparent text-sm outline-none px-1 py-1"
              autoComplete="off"
            />
          </div>

          {suggestions.length > 0 && (
            <ul className="border border-[var(--border)] rounded-xl divide-y divide-[var(--border)] overflow-hidden">
              {suggestions.map((m, i) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => addMember(m.id)}
                    className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                      i === highlight ? "bg-[var(--accent)]/10" : "hover:bg-[var(--surface-muted)]/40"
                    }`}
                  >
                    <div>
                      <div className="font-medium text-text">{m.name}</div>
                      <div className="text-xs text-text-muted">{m.role}</div>
                    </div>
                    <span className="text-xs text-[var(--accent)] font-medium">Tag</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {tagged.length === 0 && (
            <p className="text-xs text-text-muted">
              Tip: arrow keys to navigate, Enter to add, Backspace to remove the last tag.
            </p>
          )}
        </CardContent>
        <CardFooter className="pt-6 border-t border-[var(--border)] flex justify-end">
          <Button type="submit" variant="primary" disabled={tagged.length === 0}>
            Save Care Team
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

export default CareTeamTagger;
