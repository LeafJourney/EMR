"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { searchPatientsAction } from "@/app/(clinician)/clinic/patients/actions";
import { cn } from "@/lib/utils/cn";

interface PatientSearchResult {
  id: string;
  firstName: string;
  lastName: string;
  dob: string | null;
  phone: string | null;
  email: string | null;
  lastVisit: string | null;
}

interface UniversalPatientSearchProps {
  onSelect?: (patient: PatientSearchResult) => void;
  onQueryChange?: (q: string) => void;
  placeholder?: string;
  className?: string;
  value?: string;
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

function formatLastVisit(dateIso: string | null) {
  if (!dateIso) return "No prior visits";
  return `Last visit: ${new Date(dateIso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}

export function UniversalPatientSearch({
  onSelect,
  onQueryChange,
  placeholder = "Search name, DOB, or phone...",
  className,
  value,
}: UniversalPatientSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState(value || "");

  useEffect(() => {
    if (value !== undefined) {
      setQuery(value);
    }
  }, [value]);

  useEffect(() => {
    onQueryChange?.(query);
  }, [query, onQueryChange]);

  const [results, setResults] = useState<PatientSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounced patient lookup
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await searchPatientsAction(query);
        setResults(res);
        setIsOpen(true);
        setHighlightedIndex(-1);
      } catch (err) {
        console.error("Search failed:", err);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  // Click outside listener
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const handleSelect = (patient: PatientSearchResult) => {
    setIsOpen(false);
    setQuery("");
    if (onSelect) {
      onSelect(patient);
    } else {
      router.push(`/clinic/patients/${patient.id}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < results.length) {
          handleSelect(results[highlightedIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        break;
    }
  };

  return (
    <div ref={containerRef} className={cn("relative w-full max-w-md", className)}>
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-text-subtle">
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5L14 14" />
          </svg>
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={cn(
            "w-full h-9 pl-9 pr-8 rounded-md border border-border bg-surface text-sm text-text",
            "placeholder:text-text-subtle focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/50",
            "transition-colors duration-200"
          )}
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
            <svg
              className="animate-spin h-4 w-4 text-text-subtle"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </div>
        )}
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-lg border border-border bg-surface shadow-lg z-50 py-1">
          {results.map((patient, idx) => {
            const age = getAge(patient.dob);
            const isHighlighted = highlightedIndex === idx;
            return (
              <button
                key={patient.id}
                type="button"
                onClick={() => handleSelect(patient)}
                className={cn(
                  "w-full text-left px-4 py-2 text-xs flex flex-col gap-0.5",
                  isHighlighted ? "bg-accent/10 text-accent font-medium" : "hover:bg-surface-muted/50 text-text"
                )}
              >
                <span className="font-semibold text-sm">
                  {patient.firstName} {patient.lastName}
                </span>
                <span className="text-[11px] text-text-subtle flex items-center gap-1.5 flex-wrap">
                  {patient.dob && <span>DOB: {patient.dob}</span>}
                  {age !== null && <span>• Age: {age}</span>}
                  <span>• {formatLastVisit(patient.lastVisit)}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {isOpen && results.length === 0 && !loading && (
        <div className="absolute left-0 right-0 mt-1 rounded-lg border border-border bg-surface shadow-lg z-50 p-4 text-center text-xs text-text-subtle">
          No patients found matching your search.
        </div>
      )}
    </div>
  );
}
