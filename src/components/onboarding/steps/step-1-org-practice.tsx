"use client";

// EMR-420 — Step 1 of the Practice Onboarding wizard.
//
// Specialty-agnostic. This step never branches on specialty; it captures
// the org + practice identity/location only. The downstream specialty
// step (EMR-421+) reads `practiceId` from the draft to attach config.

import * as React from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FieldGroup, Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";

import type { WizardStepProps } from "@/lib/onboarding/wizard-types";

export function CreateOrgInlineForm({ onCreated }: { onCreated: (orgId: string) => void }) {
  const [loading, setLoading] = React.useState(false);
  
  const handleCreate = async () => {
    setLoading(true);
    const payload = {
      legalName: "New Inline Org",
      brandName: "New Inline Org",
      primaryContactName: "Admin",
      primaryContactEmail: "admin@example.com",
      phone: "(555) 123-4567",
      street: "123 Main St",
      city: "San Francisco",
      state: "CA",
      postalCode: "94105",
      timeZone: "America/Los_Angeles"
    };

    try {
      const res = await fetch("/api/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await res.json();
        onCreated(data.organization.id);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="secondary" size="sm" onClick={handleCreate} disabled={loading} className="mt-2">
      {loading ? "Creating..." : "Quick Create Org"}
    </Button>
  );
}

// Keep this list aligned with the API route's allow-list.
const COMMON_US_TIME_ZONES = [
  { value: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
  { value: "America/Denver", label: "Mountain (Denver)" },
  { value: "America/Phoenix", label: "Mountain — Arizona (Phoenix)" },
  { value: "America/Chicago", label: "Central (Chicago)" },
  { value: "America/New_York", label: "Eastern (New York)" },
  { value: "America/Anchorage", label: "Alaska (Anchorage)" },
  { value: "Pacific/Honolulu", label: "Hawaii (Honolulu)" },
] as const;

const DEFAULT_TZ = "America/Los_Angeles";

function formatPhoneNumber(value: string): string {
  if (!value) return value;
  const phoneNumber = value.replace(/[^\d]/g, "");
  const len = phoneNumber.length;
  if (len < 4) return phoneNumber;
  if (len < 7) {
    return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3)}`;
  }
  return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3, 6)}-${phoneNumber.slice(6, 10)}`;
}

// --- Zod schemas (mirror server-side route validation) -----------------

const npiOptional = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || /^\d{10}$/u.test(v), {
    message: "NPI must be exactly 10 digits",
  });

const orgFormSchema = z.object({
  legalName: z.string().trim().min(1, "Required").max(200),
  brandName: z.string().trim().min(1, "Required").max(200),
  primaryContactName: z.string().trim().min(1, "Required").max(200),
  primaryContactEmail: z
    .string()
    .trim()
    .min(1, "Required")
    .email("Must be a valid email"),
  phone: z
    .string()
    .trim()
    .min(1, "Required")
    .regex(/^\(\d{3}\) \d{3}-\d{4}$/, "Must be formatted as (555) 123-4567"),
  npi: npiOptional,
  street: z.string().trim().min(1, "Required"),
  city: z.string().trim().min(1, "Required"),
  state: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/u, "Use 2-letter state code"),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{5}(-\d{4})?$/u, "Use 5 or 9-digit ZIP"),
  timeZone: z.string().min(1, "Required"),
});

const practiceFormSchema = z.object({
  name: z.string().trim().min(1, "Required").max(200),
  npi: npiOptional,
  street: z.string().trim().min(1, "Required"),
  city: z.string().trim().min(1, "Required"),
  state: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/u, "Use 2-letter state code"),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{5}(-\d{4})?$/u, "Use 5 or 9-digit ZIP"),
  timeZone: z.string().min(1, "Required"),
  specialtyHint: z.string().trim().max(120).optional(),
});

type OrgFormValues = z.infer<typeof orgFormSchema>;
type PracticeFormValues = z.infer<typeof practiceFormSchema>;
type FieldErrors<T> = Partial<Record<keyof T, string>>;

const EMPTY_ORG: OrgFormValues = {
  legalName: "",
  brandName: "",
  primaryContactName: "",
  primaryContactEmail: "",
  phone: "",
  npi: "",
  street: "",
  city: "",
  state: "",
  postalCode: "",
  timeZone: DEFAULT_TZ,
};

const EMPTY_PRACTICE: PracticeFormValues = {
  name: "",
  npi: "",
  street: "",
  city: "",
  state: "",
  postalCode: "",
  timeZone: DEFAULT_TZ,
  specialtyHint: "",
};

// --- API response shapes (narrow what we read from the wire) -----------

interface OrgListItem {
  id: string;
  name: string;
  legalName?: string | null;
  brandName?: string | null;
  practices: { id: string; name: string }[];
}

interface PracticeListItem {
  id: string;
  name: string;
  organizationId: string;
  organization: {
    id: string;
    name: string;
    legalName?: string | null;
    brandName?: string | null;
  };
}

interface OrgGroup {
  org: { id: string; label: string };
  practices: { id: string; name: string }[];
}

// --- Hooks --------------------------------------------------------------

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

// Combine /api/orgs and /api/practices results into a single org-tree
// view so practices that don't share a search-matched org still appear.
function mergeSearchResults(
  orgs: OrgListItem[],
  practices: PracticeListItem[],
): OrgGroup[] {
  const groups = new Map<string, OrgGroup>();

  for (const o of orgs) {
    groups.set(o.id, {
      org: { id: o.id, label: o.brandName || o.legalName || o.name },
      practices: o.practices.map((p) => ({ id: p.id, name: p.name })),
    });
  }

  for (const p of practices) {
    const existing = groups.get(p.organizationId);
    if (existing) {
      if (!existing.practices.some((row) => row.id === p.id)) {
        existing.practices.push({ id: p.id, name: p.name });
      }
    } else {
      groups.set(p.organizationId, {
        org: {
          id: p.organizationId,
          label:
            p.organization.brandName ||
            p.organization.legalName ||
            p.organization.name,
        },
        practices: [{ id: p.id, name: p.name }],
      });
    }
  }

  return Array.from(groups.values()).sort((a, b) =>
    a.org.label.localeCompare(b.org.label),
  );
}

// --- Component ----------------------------------------------------------

type Tab = "pick" | "create";

export function Step1OrgPractice({ draft, patch }: WizardStepProps) {
  const [tab, setTab] = React.useState<Tab>("pick");

  return (
    <Card tone="raised">
      <CardHeader>
        <CardTitle>Organization & practice</CardTitle>
        <CardDescription>
          Pick the practice you&apos;re onboarding, or create a new
          organization and practice now. Specialty and modules come next.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <SegmentedControl tab={tab} onChange={setTab} />

        {tab === "pick" ? (
          <PickExistingTab draft={draft} patch={patch} />
        ) : (
          <CreateNewTab patch={patch} />
        )}
      </CardContent>
    </Card>
  );
}

function SegmentedControl({
  tab,
  onChange,
}: {
  tab: Tab;
  onChange: (next: Tab) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Organization & practice picker mode"
      className="inline-flex rounded-lg border border-border bg-surface p-1"
    >
      {(
        [
          { id: "pick", label: "Pick existing" },
          { id: "create", label: "Create new" },
        ] as const
      ).map((option) => {
        const selected = tab === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option.id)}
            className={cn(
              "px-4 h-9 text-sm rounded-md transition-colors",
              selected
                ? "bg-accent text-accent-ink shadow-sm"
                : "text-text-muted hover:text-text",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// --- Pick existing tab --------------------------------------------------

function PickExistingTab({
  draft,
  patch,
}: {
  draft: WizardStepProps["draft"];
  patch: WizardStepProps["patch"];
}) {
  const [query, setQuery] = React.useState("");
  const debouncedQuery = useDebouncedValue(query, 250);

  const [groups, setGroups] = React.useState<OrgGroup[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function run() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (debouncedQuery) params.set("q", debouncedQuery);
        const qs = params.toString();
        const [orgsRes, practicesRes] = await Promise.all([
          fetch(`/api/orgs${qs ? `?${qs}` : ""}`, {
            signal: controller.signal,
          }),
          fetch(`/api/practices${qs ? `?${qs}` : ""}`, {
            signal: controller.signal,
          }),
        ]);
        if (!orgsRes.ok || !practicesRes.ok) {
          throw new Error("Search failed");
        }
        const orgsBody = (await orgsRes.json()) as {
          organizations: OrgListItem[];
        };
        const practicesBody = (await practicesRes.json()) as {
          practices: PracticeListItem[];
        };
        if (cancelled) return;
        setGroups(
          mergeSearchResults(
            orgsBody.organizations ?? [],
            practicesBody.practices ?? [],
          ),
        );
      } catch (err) {
        if (cancelled || (err as Error).name === "AbortError") return;
        setError((err as Error).message || "Search failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [debouncedQuery]);

  const selectedPracticeId =
    typeof draft.practiceId === "string" ? draft.practiceId : "";

  return (
    <div className="space-y-4">
      <FieldGroup label="Search" htmlFor="org-practice-search">
        <Input
          id="org-practice-search"
          placeholder="Search organizations or practices…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-controls="org-practice-results"
          autoComplete="off"
        />
      </FieldGroup>

      <CreateOrgInlineForm onCreated={(orgId) => {
        // Just trigger a re-fetch or clear the query
        setQuery("");
      }} />

      <div
        id="org-practice-results"
        role="region"
        aria-live="polite"
        aria-busy={loading}
        className="rounded-md border border-border bg-surface"
      >
        {error ? (
          <p className="px-4 py-6 text-sm text-danger">{error}</p>
        ) : loading && groups.length === 0 ? (
          <p className="px-4 py-6 text-sm text-text-muted">Searching…</p>
        ) : groups.length === 0 ? (
          <p className="px-4 py-6 text-sm text-text-muted">
            No matches. Try a different search, or switch to{" "}
            <span className="font-medium">Create new</span>.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {groups.map((group) => (
              <li key={group.org.id} className="px-4 py-3">
                <p className="text-sm font-semibold text-text">
                  {group.org.label}
                </p>
                {group.practices.length === 0 ? (
                  <p className="mt-2 text-xs text-text-muted">
                    No practices yet under this organization.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {group.practices.map((practice) => {
                      const inputId = `practice-${practice.id}`;
                      const checked = selectedPracticeId === practice.id;
                      return (
                        <li key={practice.id}>
                          <label
                            htmlFor={inputId}
                            className={cn(
                              "flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer",
                              "hover:bg-surface-muted",
                              checked && "bg-surface-muted",
                            )}
                          >
                            <input
                              id={inputId}
                              type="radio"
                              name="practice-pick"
                              value={practice.id}
                              checked={checked}
                              onChange={() =>
                                patch({
                                  organizationId: group.org.id,
                                  practiceId: practice.id,
                                })
                              }
                              className="h-4 w-4 text-accent"
                            />
                            <span className="text-sm text-text">
                              {practice.name}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// --- Create new tab -----------------------------------------------------

function CreateNewTab({ patch }: { patch: WizardStepProps["patch"] }) {
  const [orgValues, setOrgValues] = React.useState<OrgFormValues>(EMPTY_ORG);
  const [practiceValues, setPracticeValues] =
    React.useState<PracticeFormValues>(EMPTY_PRACTICE);

  const [orgErrors, setOrgErrors] = React.useState<FieldErrors<OrgFormValues>>(
    {},
  );
  const [practiceErrors, setPracticeErrors] = React.useState<
    FieldErrors<PracticeFormValues>
  >({});

  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  function setOrgField<K extends keyof OrgFormValues>(
    key: K,
    value: OrgFormValues[K],
  ) {
    setOrgValues((prev) => ({ ...prev, [key]: value }));
  }

  function setPracticeField<K extends keyof PracticeFormValues>(
    key: K,
    value: PracticeFormValues[K],
  ) {
    setPracticeValues((prev) => ({ ...prev, [key]: value }));
  }

  function flattenIssues<T>(
    error: z.ZodError<T>,
  ): Partial<Record<keyof T, string>> {
    const out: Partial<Record<keyof T, string>> = {};
    for (const issue of error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !(key in out)) {
        (out as Record<string, string>)[key] = issue.message;
      }
    }
    return out;
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    const orgParsed = orgFormSchema.safeParse(orgValues);
    const practiceParsed = practiceFormSchema.safeParse(practiceValues);

    setOrgErrors(orgParsed.success ? {} : flattenIssues(orgParsed.error));
    setPracticeErrors(
      practiceParsed.success ? {} : flattenIssues(practiceParsed.error),
    );

    if (!orgParsed.success || !practiceParsed.success) return;

    setSubmitting(true);
    try {
      const orgRes = await fetch("/api/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...orgParsed.data,
          npi: orgParsed.data.npi || undefined,
        }),
      });
      if (!orgRes.ok) {
        const body = (await orgRes.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error || `Failed to create organization (${orgRes.status})`);
      }
      const orgBody = (await orgRes.json()) as {
        organization: { id: string };
      };
      const organizationId = orgBody.organization.id;

      const practiceRes = await fetch("/api/practices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...practiceParsed.data,
          organizationId,
          npi: practiceParsed.data.npi || undefined,
          specialtyHint: practiceParsed.data.specialtyHint || undefined,
        }),
      });
      if (!practiceRes.ok) {
        const body = (await practiceRes.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(
          body.error || `Failed to create practice (${practiceRes.status})`,
        );
      }
      const practiceBody = (await practiceRes.json()) as {
        practice: { id: string };
      };

      patch({ organizationId, practiceId: practiceBody.practice.id });
    } catch (err) {
      setSubmitError((err as Error).message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-8">
      <fieldset className="space-y-4" disabled={submitting}>
        <legend className="text-sm font-semibold text-text">
          Step 1a — New organization
        </legend>

        <div className="grid gap-4 md:grid-cols-2">
          <FieldGroup
            label="Legal name"
            htmlFor="org-legalName"
            error={orgErrors.legalName}
          >
            <Input
              id="org-legalName"
              aria-required="true"
              value={orgValues.legalName}
              onChange={(e) => setOrgField("legalName", e.target.value)}
            />
          </FieldGroup>
          <FieldGroup
            label="Brand name"
            htmlFor="org-brandName"
            error={orgErrors.brandName}
          >
            <Input
              id="org-brandName"
              aria-required="true"
              value={orgValues.brandName}
              onChange={(e) => setOrgField("brandName", e.target.value)}
            />
          </FieldGroup>
          <FieldGroup
            label="Primary contact name"
            htmlFor="org-primaryContactName"
            error={orgErrors.primaryContactName}
          >
            <Input
              id="org-primaryContactName"
              aria-required="true"
              value={orgValues.primaryContactName}
              onChange={(e) =>
                setOrgField("primaryContactName", e.target.value)
              }
            />
          </FieldGroup>
          <FieldGroup
            label="Primary contact email"
            htmlFor="org-primaryContactEmail"
            error={orgErrors.primaryContactEmail}
          >
            <Input
              id="org-primaryContactEmail"
              type="email"
              aria-required="true"
              value={orgValues.primaryContactEmail}
              onChange={(e) =>
                setOrgField("primaryContactEmail", e.target.value)
              }
            />
          </FieldGroup>
          <FieldGroup
            label="Primary contact phone"
            htmlFor="org-phone"
            error={orgErrors.phone}
          >
            <Input
              id="org-phone"
              type="tel"
              aria-required="true"
              placeholder="(555) 123-4567"
              value={orgValues.phone}
              onChange={(e) =>
                setOrgField("phone", formatPhoneNumber(e.target.value))
              }
            />
          </FieldGroup>
          <FieldGroup
            label="Organization NPI (optional)"
            htmlFor="org-npi"
            hint="10-digit type-2 NPI"
            error={orgErrors.npi}
          >
            <Input
              id="org-npi"
              inputMode="numeric"
              value={orgValues.npi ?? ""}
              onChange={(e) => setOrgField("npi", e.target.value)}
            />
          </FieldGroup>
          <FieldGroup
            label="Time zone"
            htmlFor="org-timeZone"
            error={orgErrors.timeZone}
          >
            <TimeZoneSelect
              id="org-timeZone"
              value={orgValues.timeZone}
              onChange={(tz) => setOrgField("timeZone", tz)}
            />
          </FieldGroup>
          <FieldGroup
            label="Street"
            htmlFor="org-street"
            error={orgErrors.street}
          >
            <Input
              id="org-street"
              aria-required="true"
              value={orgValues.street}
              onChange={(e) => setOrgField("street", e.target.value)}
            />
          </FieldGroup>
          <FieldGroup label="City" htmlFor="org-city" error={orgErrors.city}>
            <Input
              id="org-city"
              aria-required="true"
              value={orgValues.city}
              onChange={(e) => setOrgField("city", e.target.value)}
            />
          </FieldGroup>
          <FieldGroup
            label="State"
            htmlFor="org-state"
            hint="2-letter code (CA, NY)"
            error={orgErrors.state}
          >
            <Input
              id="org-state"
              maxLength={2}
              aria-required="true"
              value={orgValues.state}
              onChange={(e) =>
                setOrgField("state", e.target.value.toUpperCase())
              }
            />
          </FieldGroup>
          <FieldGroup
            label="ZIP / postal code"
            htmlFor="org-postalCode"
            error={orgErrors.postalCode}
          >
            <Input
              id="org-postalCode"
              inputMode="numeric"
              aria-required="true"
              value={orgValues.postalCode}
              onChange={(e) => setOrgField("postalCode", e.target.value)}
            />
          </FieldGroup>
        </div>
      </fieldset>

      <fieldset className="space-y-4" disabled={submitting}>
        <legend className="text-sm font-semibold text-text">
          Step 1b — New practice
        </legend>

        <div className="grid gap-4 md:grid-cols-2">
          <FieldGroup
            label="Practice name"
            htmlFor="practice-name"
            error={practiceErrors.name}
          >
            <Input
              id="practice-name"
              aria-required="true"
              value={practiceValues.name}
              onChange={(e) => setPracticeField("name", e.target.value)}
            />
          </FieldGroup>
          <FieldGroup
            label="Group NPI (optional)"
            htmlFor="practice-npi"
            hint="10-digit NPI for the practice group"
            error={practiceErrors.npi}
          >
            <Input
              id="practice-npi"
              inputMode="numeric"
              value={practiceValues.npi ?? ""}
              onChange={(e) => setPracticeField("npi", e.target.value)}
            />
          </FieldGroup>
          <FieldGroup
            label="Street"
            htmlFor="practice-street"
            error={practiceErrors.street}
          >
            <Input
              id="practice-street"
              aria-required="true"
              value={practiceValues.street}
              onChange={(e) => setPracticeField("street", e.target.value)}
            />
          </FieldGroup>
          <FieldGroup
            label="City"
            htmlFor="practice-city"
            error={practiceErrors.city}
          >
            <Input
              id="practice-city"
              aria-required="true"
              value={practiceValues.city}
              onChange={(e) => setPracticeField("city", e.target.value)}
            />
          </FieldGroup>
          <FieldGroup
            label="State"
            htmlFor="practice-state"
            hint="2-letter code"
            error={practiceErrors.state}
          >
            <Input
              id="practice-state"
              maxLength={2}
              aria-required="true"
              value={practiceValues.state}
              onChange={(e) =>
                setPracticeField("state", e.target.value.toUpperCase())
              }
            />
          </FieldGroup>
          <FieldGroup
            label="ZIP / postal code"
            htmlFor="practice-postalCode"
            error={practiceErrors.postalCode}
          >
            <Input
              id="practice-postalCode"
              inputMode="numeric"
              aria-required="true"
              value={practiceValues.postalCode}
              onChange={(e) =>
                setPracticeField("postalCode", e.target.value)
              }
            />
          </FieldGroup>
          <FieldGroup
            label="Time zone"
            htmlFor="practice-timeZone"
            error={practiceErrors.timeZone}
          >
            <TimeZoneSelect
              id="practice-timeZone"
              value={practiceValues.timeZone}
              onChange={(tz) => setPracticeField("timeZone", tz)}
            />
          </FieldGroup>
          <FieldGroup
            label="Specialty hint (optional)"
            htmlFor="practice-specialtyHint"
            hint="Free-text label only — actual specialty is picked in Step 2"
          >
            <Input
              id="practice-specialtyHint"
              value={practiceValues.specialtyHint ?? ""}
              onChange={(e) =>
                setPracticeField("specialtyHint", e.target.value)
              }
            />
          </FieldGroup>
        </div>
      </fieldset>

      <div
        role="status"
        aria-live="polite"
        className="min-h-[1.25rem] text-sm text-danger"
      >
        {submitError}
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Creating…" : "Create organization & practice"}
        </Button>
      </div>
    </form>
  );
}

function TimeZoneSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (tz: string) => void;
}) {
  return (
    <select
      id={id}
      aria-required="true"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "flex w-full h-10 rounded-md border border-border-strong bg-surface px-3 text-sm text-text",
        "transition-colors duration-200 ease-smooth",
        "focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20",
      )}
    >
      {COMMON_US_TIME_ZONES.map((tz) => (
        <option key={tz.value} value={tz.value}>
          {tz.label}
        </option>
      ))}
    </select>
  );
}

export default Step1OrgPractice;
