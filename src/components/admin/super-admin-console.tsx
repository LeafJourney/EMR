"use client";

// Super-admin console.
//
// Two tabs:
//   - Practices: every PracticeConfiguration (one per practice), each row
//     gets a SpecialtySwitcherWidget that lets a super-admin pick a new
//     pre-templated specialty and switch in place. The widget enforces a
//     typed-confirmation (organization name) before posting.
//   - Admins: lists the super_admin allowlist with grant-by-email and
//     revoke-by-userId controls. Self-revoke is blocked server-side.

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";
import { EmergencyRevokeDialog } from "@/components/admin/emergency-revoke-dialog";

type SpecialtyManifest = {
  slug: string;
  name: string;
  version: string;
  description: string;
  default_enabled_modalities: string[];
  default_disabled_modalities: string[];
};

type PracticeRow = {
  configId: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string | null;
  selectedSpecialty: string | null;
  selectedSpecialtyVersion: string | null;
  status: "draft" | "published" | "archived";
  version: number;
  publishedAt: string | null;
  updatedAt: string;
};

type AdminRow = {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  grantedAt: string;
  lastLoginAt: string | null;
};

type Tab = "practices" | "admins";

export function SuperAdminConsole() {
  const [tab, setTab] = React.useState<Tab>("practices");
  const [templates, setTemplates] = React.useState<SpecialtyManifest[]>([]);
  const [templatesError, setTemplatesError] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch("/api/specialty-templates")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { items: SpecialtyManifest[] }) => setTemplates(d.items ?? []))
      .catch((e: Error) => setTemplatesError(e.message));
  }, []);

  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="Console sections" className="flex gap-1 border-b border-border">
        <TabButton active={tab === "practices"} onClick={() => setTab("practices")}>
          Practices
        </TabButton>
        <TabButton active={tab === "admins"} onClick={() => setTab("admins")}>
          Super-admins
        </TabButton>
      </div>

      {templatesError && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-danger">
          Couldn&rsquo;t load specialty templates ({templatesError}).
        </div>
      )}

      {tab === "practices" ? (
        <PracticesTab templates={templates} />
      ) : (
        <AdminsTab />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "px-4 py-2 text-sm font-medium transition-colors duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        active
          ? "text-text border-b-2 border-accent -mb-px"
          : "text-text-muted hover:text-text",
      )}
    >
      {children}
    </button>
  );
}

// -----------------------------------------------------------------------------
// Practices tab
// -----------------------------------------------------------------------------

function PracticesTab({ templates }: { templates: SpecialtyManifest[] }) {
  const [items, setItems] = React.useState<PracticeRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setError(null);
    fetch("/api/admin/practices")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { items: PracticeRow[] }) => setItems(d.items ?? []))
      .catch((e: Error) => setError(e.message));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-danger">
        Couldn&rsquo;t load practices: {error}
      </div>
    );
  }
  if (items === null) {
    return <div className="text-sm text-text-muted">Loading practices&hellip;</div>;
  }
  if (items.length === 0) {
    return (
      <Card tone="outlined">
        <CardContent className="p-8 text-center text-sm text-text-muted">
          No practice configurations found yet. Use the onboarding wizard at{" "}
          <a className="underline" href="/ops/onboarding">
            /ops/onboarding
          </a>{" "}
          to create one.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {items.map((p) => (
        <PracticeCard key={p.configId} practice={p} templates={templates} onChanged={load} />
      ))}
    </div>
  );
}

function PracticeCard({
  practice,
  templates,
  onChanged,
}: {
  practice: PracticeRow;
  templates: SpecialtyManifest[];
  onChanged: () => void;
}) {
  const currentTemplate = templates.find((t) => t.slug === practice.selectedSpecialty) ?? null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <CardTitle className="truncate">{practice.organizationName}</CardTitle>
            <p className="mt-1 text-xs text-text-muted">
              configId: <code>{practice.configId}</code> &middot; status:{" "}
              <span className="font-medium text-text">{practice.status}</span> &middot; v{practice.version}
            </p>
          </div>
          <Badge tone={practice.status === "published" ? "success" : practice.status === "draft" ? "warning" : "neutral"}>
            {practice.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm text-text-muted">
          Current specialty:{" "}
          {currentTemplate ? (
            <span className="font-medium text-text">
              {currentTemplate.name}{" "}
              <span className="text-xs text-text-muted">
                (v{practice.selectedSpecialtyVersion ?? "?"})
              </span>
            </span>
          ) : practice.selectedSpecialty ? (
            <span className="font-medium text-text">
              {practice.selectedSpecialty} (manifest not in active registry)
            </span>
          ) : (
            <span className="italic text-text-muted">none selected</span>
          )}
        </div>

        <SpecialtySwitcherWidget
          configId={practice.configId}
          organizationName={practice.organizationName}
          currentSlug={practice.selectedSpecialty}
          templates={templates}
          onSwitched={onChanged}
        />
      </CardContent>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Specialty switcher widget — compact, dropdown + typed-confirmation
// -----------------------------------------------------------------------------

function SpecialtySwitcherWidget({
  configId,
  organizationName,
  currentSlug,
  templates,
  onSwitched,
}: {
  configId: string;
  organizationName: string;
  currentSlug: string | null;
  templates: SpecialtyManifest[];
  onSwitched: () => void;
}) {
  const [pendingSlug, setPendingSlug] = React.useState<string>(currentSlug ?? "");
  const [confirmName, setConfirmName] = React.useState("");
  const [showConfirm, setShowConfirm] = React.useState(false);
  const [submitState, setSubmitState] = React.useState<"idle" | "submitting" | "error" | "ok">("idle");
  const [error, setError] = React.useState<string | null>(null);

  const pendingTemplate = templates.find((t) => t.slug === pendingSlug) ?? null;
  const isChanging = pendingSlug !== "" && pendingSlug !== currentSlug;

  async function submit() {
    if (!pendingTemplate) return;
    setSubmitState("submitting");
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/practices/${encodeURIComponent(configId)}/switch-specialty`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug: pendingTemplate.slug, confirmName }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setSubmitState("ok");
      setShowConfirm(false);
      setConfirmName("");
      onSwitched();
    } catch (e: unknown) {
      setSubmitState("error");
      setError(e instanceof Error ? e.message : "Failed to switch");
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface-muted/40 p-4">
      <label className="block text-xs font-medium uppercase tracking-wide text-text-muted">
        Switch specialty
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={pendingSlug}
          onChange={(e) => {
            setPendingSlug(e.target.value);
            setShowConfirm(false);
            setConfirmName("");
            setSubmitState("idle");
            setError(null);
          }}
          className="h-10 rounded-md border border-border-strong bg-surface px-3 text-sm text-text focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        >
          <option value="">Select a specialty…</option>
          {templates.map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.name} (v{t.version})
            </option>
          ))}
        </select>
        <Button
          variant="secondary"
          size="md"
          disabled={!isChanging || submitState === "submitting"}
          onClick={() => setShowConfirm(true)}
        >
          Switch&hellip;
        </Button>
      </div>

      {pendingTemplate && isChanging && (
        <div className="text-xs text-text-muted">
          Will enable {pendingTemplate.default_enabled_modalities.length} modalities and disable{" "}
          {pendingTemplate.default_disabled_modalities.length}.
        </div>
      )}

      {showConfirm && pendingTemplate && (
        <div role="dialog" aria-label="Confirm specialty switch" className="space-y-3 rounded-md border border-highlight/30 bg-highlight-soft/50 p-3">
          <p className="text-sm text-text">
            This will replace the published specialty config for{" "}
            <span className="font-medium">{organizationName}</span> with{" "}
            <span className="font-medium">{pendingTemplate.name}</span>. Patient
            records are preserved (soft switch); the UI for disabled modalities
            simply hides.
          </p>
          <p className="text-sm text-text">
            Type <code className="rounded bg-surface-muted px-1 py-0.5">{organizationName}</code> to confirm:
          </p>
          <Input
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={organizationName}
            aria-label="Confirm organization name"
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowConfirm(false);
                setConfirmName("");
                setError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={confirmName.trim() !== organizationName || submitState === "submitting"}
              onClick={submit}
            >
              {submitState === "submitting" ? "Switching…" : "Confirm switch"}
            </Button>
          </div>
        </div>
      )}

      {submitState === "ok" && (
        <p className="text-sm text-success">Specialty switched.</p>
      )}
      {submitState === "error" && error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Admins tab
// -----------------------------------------------------------------------------

function AdminsTab() {
  const [items, setItems] = React.useState<AdminRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [grantEmail, setGrantEmail] = React.useState("");
  const [grantState, setGrantState] = React.useState<"idle" | "submitting" | "error" | "ok">("idle");
  const [grantError, setGrantError] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setError(null);
    fetch("/api/admin/super-admins")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { items: AdminRow[] }) => setItems(d.items ?? []))
      .catch((e: Error) => setError(e.message));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function grant() {
    if (!grantEmail.trim()) return;
    setGrantState("submitting");
    setGrantError(null);
    try {
      const res = await fetch("/api/admin/super-admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: grantEmail.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.hint || data?.error || `HTTP ${res.status}`);
      }
      setGrantState("ok");
      setGrantEmail("");
      load();
    } catch (e: unknown) {
      setGrantState("error");
      setGrantError(e instanceof Error ? e.message : "Failed to grant");
    }
  }

  async function revoke(userId: string, email: string) {
    if (!confirm(`Revoke super_admin from ${email}?`)) return;
    try {
      const res = await fetch(`/api/admin/super-admins/${encodeURIComponent(userId)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(`Couldn't revoke: ${data?.message || data?.error || `HTTP ${res.status}`}`);
        return;
      }
      load();
    } catch (e: unknown) {
      alert(`Couldn't revoke: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
  }

  // EMR-727 — emergency revoke modal target. Holds the row the operator
  // wants to nuke; the modal renders when this is non-null.
  const [emergencyTarget, setEmergencyTarget] = React.useState<AdminRow | null>(null);

  function onEmergencyRevoked() {
    setEmergencyTarget(null);
    load();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Grant super-admin</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-text-muted">
            The user must have signed in at least once so their account exists in the database.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="email"
              value={grantEmail}
              onChange={(e) => setGrantEmail(e.target.value)}
              placeholder="someone@example.com"
              className="max-w-sm"
              aria-label="Email to grant super-admin"
            />
            <Button variant="primary" size="md" onClick={grant} disabled={grantState === "submitting" || !grantEmail.trim()}>
              {grantState === "submitting" ? "Granting…" : "Grant"}
            </Button>
          </div>
          {grantState === "ok" && (
            <p className="mt-2 text-sm text-success">Granted.</p>
          )}
          {grantState === "error" && grantError && (
            <p role="alert" className="mt-2 text-sm text-danger">
              {grantError}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current super-admins</CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : items === null ? (
            <p className="text-sm text-text-muted">Loading&hellip;</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-text-muted">No super-admins yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((a) => (
                <li key={a.userId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text">
                      {a.firstName} {a.lastName}
                    </p>
                    <p className="text-xs text-text-muted">{a.email}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-text-muted">
                      Granted {new Date(a.grantedAt).toLocaleDateString()}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => revoke(a.userId, a.email)}>
                      Revoke
                    </Button>
                    <EmergencyRevokeTrigger
                      label="Emergency revoke"
                      ariaLabel={`Emergency revoke ${a.email}`}
                      onClick={() => setEmergencyTarget(a)}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {emergencyTarget && (
        <EmergencyRevokeDialog
          targetUserId={emergencyTarget.userId}
          targetEmail={emergencyTarget.email}
          onCancel={() => setEmergencyTarget(null)}
          onSuccess={onEmergencyRevoked}
        />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// EMR-727 — Emergency revoke row trigger
// -----------------------------------------------------------------------------
//
// Red destructive button with a small "?" tooltip next to it. The tooltip
// is intentionally lightweight (CSS-only hover/focus reveal — no
// JS-driven popper) because the row already has its own visual weight and
// we don't want a heavyweight tooltip primitive added to the bundle just
// for this one explainer. The "?" pill is keyboard-focusable so screen-
// reader users can read the explanation via aria-describedby.
// -----------------------------------------------------------------------------

function EmergencyRevokeTrigger({
  label,
  ariaLabel,
  onClick,
}: {
  label: string;
  ariaLabel: string;
  onClick: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="danger"
        size="sm"
        onClick={onClick}
        aria-label={ariaLabel}
      >
        {label}
      </Button>
      <span className="group relative inline-flex">
        <button
          type="button"
          aria-label="What does emergency revoke do?"
          aria-describedby="emergency-revoke-help"
          className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border-strong bg-surface text-[10px] font-bold text-text-muted hover:text-danger hover:border-danger focus:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
          // No onClick — purely informational. Stops the row's revoke
          // button from accidentally firing if the user mis-clicks the "?".
          onClick={(e) => e.preventDefault()}
        >
          ?
        </button>
        <span
          id="emergency-revoke-help"
          role="tooltip"
          className="pointer-events-none absolute bottom-full right-0 z-40 mb-2 hidden w-64 rounded-lg border border-border bg-surface-raised p-3 text-xs text-text shadow-lg group-hover:block group-focus-within:block"
        >
          Strips super-admin AND terminates every active session for this user
          within ~1 second across the fleet. Requires a typed email
          confirmation. Used for compromised accounts.
        </span>
      </span>
    </div>
  );
}

// EMR-727 — Emergency revoke modal lives in
// `./emergency-revoke-dialog.tsx` and is rendered above. The trigger
// `<EmergencyRevokeTrigger>` is co-located here because it is tightly
// coupled to the per-row layout.
