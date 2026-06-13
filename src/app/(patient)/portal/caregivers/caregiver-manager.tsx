"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  RELATIONSHIPS,
  ACCESS_LEVELS,
  STATUS_STYLES,
  type CaregiverInvite,
  type AccessLevel,
} from "@/lib/domain/caregiver-access";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";
import { inviteCaregiver, revokeCaregiver } from "./actions";

const ACCESS_ICONS: Record<AccessLevel, React.ReactNode> = {
  read_only: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 4C5.5 4 2 10 2 10s3.5 6 8 6 8-6 8-6-3.5-6-8-6Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.4" /></svg>
  ),
  full: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="5" y="9" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4" /><path d="M7 9V7a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
  ),
  emergency_only: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 3l7 12H3L10 3Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><path d="M10 8.5V11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><circle cx="10" cy="13" r="0.8" fill="currentColor" /></svg>
  ),
};

export function CaregiverManager({
  initialCaregivers,
}: {
  initialCaregivers: CaregiverInvite[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [caregivers, setCaregivers] = useState<CaregiverInvite[]>(initialCaregivers);
  // Re-sync with server truth after a mutation triggers router.refresh().
  useEffect(() => setCaregivers(initialCaregivers), [initialCaregivers]);
  const [showForm, setShowForm] = useState(false);
  const [successEmail, setSuccessEmail] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [relationship, setRelationship] = useState<string>("");
  const [accessLevel, setAccessLevel] = useState<AccessLevel>("read_only");

  const handleRevoke = (id: string) => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "Revoke this caregiver's access? They will immediately lose access to your records.",
      )
    ) {
      return;
    }
    // Optimistic — reconciled by router.refresh() once the server confirms.
    setCaregivers((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, status: "revoked" as const, revokedAt: new Date().toISOString() } : c,
      ),
    );
    startTransition(async () => {
      await revokeCaregiver(id);
      router.refresh();
    });
  };

  const handleInvite = () => {
    if (!name || !email || !relationship) return;
    const payload = {
      caregiverName: name,
      caregiverEmail: email,
      relationship,
      accessLevel,
    };
    setSuccessEmail(email);
    setShowForm(false);
    setName("");
    setEmail("");
    setRelationship("");
    setAccessLevel("read_only");
    startTransition(async () => {
      const res = await inviteCaregiver(payload);
      if (res.ok) router.refresh();
      else setSuccessEmail(null);
    });
  };

  const activeCaregivers = caregivers.filter((c) => c.status !== "revoked");

  return (
    <div className="space-y-6">
      {/* Info callout */}
      <Card tone="ambient">
        <CardContent className="py-4 px-6 flex items-start gap-3">
          <div className="h-8 w-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" /><path d="M8 5v3.5M8 10.5v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
          </div>
          <p className="text-sm text-text-muted leading-relaxed">
            Caregivers will receive an email to set up their account. You can
            revoke access at any time.
          </p>
        </CardContent>
      </Card>

      {/* Success banner */}
      {successEmail && (
        <Card tone="ambient">
          <CardContent className="py-4 px-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="h-8 w-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2.5 7l3.5 3.5 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </span>
              <p className="text-sm text-text">
                Invitation sent to{" "}
                <span className="font-medium">{successEmail}</span>
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSuccessEmail(null)}>
              Dismiss
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Current caregivers */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Current caregivers</CardTitle>
            <CardDescription>
              {activeCaregivers.length === 0
                ? "No caregivers have access to your records."
                : `${activeCaregivers.length} caregiver${activeCaregivers.length !== 1 ? "s" : ""} with access`}
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => { setShowForm(true); setSuccessEmail(null); }}>
            Invite caregiver
          </Button>
        </CardHeader>
        <CardContent>
          {activeCaregivers.length === 0 ? (
            <p className="text-sm text-text-muted py-4 text-center">
              No caregivers yet. Invite someone to get started.
            </p>
          ) : (
            <ul className="divide-y divide-border/60 -mx-6">
              {activeCaregivers.map((cg) => {
                const statusStyle = STATUS_STYLES[cg.status];
                const levelInfo = ACCESS_LEVELS[cg.accessLevel];
                return (
                  <li key={cg.id} className="px-6 py-4 flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-text">{cg.caregiverName}</p>
                        <span className={cn("inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full", statusStyle.color)}>
                          {statusStyle.label}
                        </span>
                      </div>
                      <p className="text-xs text-text-muted mt-0.5">{cg.caregiverEmail}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-text-subtle">{cg.relationship}</span>
                        <Badge tone="accent">{levelInfo.label}</Badge>
                      </div>
                    </div>
                    {(cg.status === "active" || cg.status === "invited") && (
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={isPending}
                        onClick={() => handleRevoke(cg.id)}
                      >
                        {cg.status === "active" ? "Revoke access" : "Cancel invite"}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Invite form */}
      {showForm && (
        <Card tone="raised">
          <CardHeader>
            <CardTitle>Invite a caregiver</CardTitle>
            <CardDescription>
              Fill in their information and choose what level of access they should have.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="cg-name">Full name</Label>
                <Input
                  id="cg-name"
                  placeholder="Jane Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="cg-email">Email address</Label>
                <Input
                  id="cg-email"
                  type="email"
                  placeholder="jane@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="cg-relationship">Relationship</Label>
              <select
                id="cg-relationship"
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                className="flex w-full rounded-md border border-border-strong bg-surface px-3 h-10 text-sm text-text transition-colors focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              >
                <option value="">Select relationship...</option>
                {RELATIONSHIPS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            {/* Access level cards */}
            <div>
              <Label>Access level</Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-1.5">
                {(Object.entries(ACCESS_LEVELS) as [AccessLevel, (typeof ACCESS_LEVELS)[AccessLevel]][]).map(
                  ([key, info]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setAccessLevel(key)}
                      className={cn(
                        "flex flex-col items-start gap-2 p-4 rounded-lg border text-left transition-all",
                        accessLevel === key
                          ? "border-accent bg-accent/5 ring-1 ring-accent"
                          : "border-border hover:border-border-strong hover:bg-surface-muted",
                      )}
                    >
                      <span
                        className={cn(
                          "text-text-muted",
                          accessLevel === key && "text-accent",
                        )}
                      >
                        {ACCESS_ICONS[key]}
                      </span>
                      <span className="text-sm font-medium text-text">{info.label}</span>
                      <span className="text-xs text-text-muted leading-relaxed">
                        {info.description}
                      </span>
                    </button>
                  ),
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button
                onClick={handleInvite}
                disabled={!name || !email || !relationship || isPending}
              >
                {isPending ? "Sending…" : "Send invitation"}
              </Button>
              <Button variant="ghost" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
