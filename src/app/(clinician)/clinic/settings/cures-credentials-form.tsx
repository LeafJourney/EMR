"use client";

/**
 * EMR-889 — CURES credentials opt-in (INTERIM, localStorage-backed).
 *
 * IMPORTANT: This is a deliberately interim store. The megasprint forbids
 * schema changes, so the provider's CURES username/password are persisted to
 * localStorage (namespaced per provider) rather than a server-side secret
 * vault. This is NOT production-grade credential storage — a real
 * implementation must move these to an encrypted, server-side secret store
 * (e.g. a dedicated `ProviderCuresCredential` table or a secrets manager) and
 * never round-trip the password to the browser. Treat this purely as a UI
 * placeholder that unblocks the prescribe-side CURES attestation flow.
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const INPUT_CLASS =
  "flex w-full rounded-xl border border-border-strong bg-white px-3 h-11 text-sm text-text " +
  "placeholder:text-text-subtle focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

const LABEL_CLASS =
  "block text-[11px] font-semibold uppercase tracking-[0.12em] text-text-subtle mb-1.5";

function storageKey(userId: string) {
  return `cures-credentials:${userId}:v1`;
}

interface StoredCures {
  username: string;
  password: string;
  savedAt: string;
}

export function CuresCredentialsForm({ userId }: { userId: string }) {
  const key = storageKey(userId);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  // Hydrate from the interim localStorage store after mount (SSR-safe).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredCures;
        setUsername(parsed.username ?? "");
        setPassword(parsed.password ?? "");
        setSavedAt(parsed.savedAt ?? null);
      }
    } catch {
      /* corrupt / private mode — start blank */
    }
  }, [key]);

  function save() {
    const payload: StoredCures = {
      username: username.trim(),
      password,
      savedAt: new Date().toISOString(),
    };
    try {
      window.localStorage.setItem(key, JSON.stringify(payload));
      setSavedAt(payload.savedAt);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
    } catch {
      /* quota / private mode — non-fatal */
    }
  }

  function clear() {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    setUsername("");
    setPassword("");
    setSavedAt(null);
  }

  return (
    <Card className="rounded-2xl bg-white border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          CURES / PDMP credentials
          {savedAt && <Badge tone="success" className="text-[10px]">Stored</Badge>}
        </CardTitle>
        <CardDescription>
          Store your CURES (PDMP) login so controlled-substance prescriptions can
          surface a one-tap query. Interim only — see the security note below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <label className={LABEL_CLASS} htmlFor="cures-username">CURES username</label>
          <input
            id="cures-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="provider@clinic.gov"
            className={INPUT_CLASS}
            autoComplete="off"
          />
        </div>
        <div>
          <label className={LABEL_CLASS} htmlFor="cures-password">CURES password</label>
          <div className="flex gap-2">
            <input
              id="cures-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className={INPUT_CLASS}
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="text-xs text-text-muted hover:text-text shrink-0 px-2"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <Button type="button" onClick={save} disabled={!username.trim() || !password}>
            {justSaved ? "Saved ✓" : "Save credentials"}
          </Button>
          {savedAt && (
            <Button type="button" variant="ghost" onClick={clear}>
              Clear
            </Button>
          )}
          {savedAt && (
            <span className="text-[11px] text-text-subtle">
              Last saved {new Date(savedAt).toLocaleString()}
            </span>
          )}
        </div>

        <p className="text-[11px] leading-relaxed text-text-subtle rounded-lg bg-surface-muted/60 border border-border/60 px-3 py-2 mt-2">
          <span className="font-semibold">Interim storage notice:</span> credentials
          are saved to this browser&apos;s localStorage only (no database column, no
          schema change). This is a placeholder for development and is{" "}
          <span className="font-semibold">not</span> a secure credential store. A
          production rollout must move these to an encrypted server-side secret
          store and must never expose the password to the browser.
        </p>
      </CardContent>
    </Card>
  );
}
