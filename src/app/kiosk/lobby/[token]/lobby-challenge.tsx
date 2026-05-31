"use client";

import { useState, useTransition } from "react";
import { useFormState } from "react-dom";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, FieldGroup } from "@/components/ui/input";
import { SubmitButton } from "@/lib/ui/form-helpers";
import {
  lobbySendCode,
  lobbyVerifyIdentity,
  type LobbyVerifyResult,
} from "../actions";

/**
 * Two-step identity challenge for the lobby. Step 1 texts a one-time code to the
 * phone on file. Step 2 takes the patient's date of birth + that code. On
 * success the server sets the scoped lobby cookie and we route to the lobby home.
 *
 * No PHI is shown here — we never echo the phone number or any patient detail;
 * we only confirm a code was sent.
 */
export function LobbyChallenge({ token }: { token: string }) {
  const router = useRouter();
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, startSending] = useTransition();

  const [state, formAction] = useFormState<LobbyVerifyResult | null, FormData>(
    lobbyVerifyIdentity,
    null,
  );

  // On a successful verify the cookie is set server-side; move to the lobby home.
  if (state?.ok) {
    router.replace("/kiosk/lobby");
  }

  function handleSend() {
    setSendError(null);
    startSending(async () => {
      const res = await lobbySendCode(token);
      if (!res.ok) {
        setSendError(res.error ?? "We couldn't send a code. Please see the front desk.");
        return;
      }
      setSent(true);
    });
  }

  return (
    <div className="flex-1 flex flex-col justify-center">
      <p className="text-[11px] uppercase tracking-[0.2em] text-accent font-medium mb-2 text-center">
        Continue your check-in
      </p>
      <h1 className="font-display text-3xl text-text tracking-tight leading-tight mb-2 text-center">
        Let&rsquo;s confirm it&rsquo;s you
      </h1>
      <p className="text-[15px] text-text-muted mb-8 text-center leading-relaxed">
        We&rsquo;ll text a code to the phone number on file, then ask for your date of birth.
      </p>

      {!sent ? (
        <div className="space-y-4">
          {sendError && <p className="text-sm text-danger text-center">{sendError}</p>}
          <Button size="lg" onClick={handleSend} disabled={sending} className="w-full">
            {sending ? "Sending code…" : "Text me a code"}
          </Button>
        </div>
      ) : (
        <form action={formAction} className="space-y-5">
          <input type="hidden" name="token" value={token} />

          <FieldGroup label="Your date of birth" htmlFor="dateOfBirth">
            <Input id="dateOfBirth" name="dateOfBirth" type="date" required />
          </FieldGroup>

          <FieldGroup
            label="6-digit code"
            htmlFor="code"
            hint="Check your text messages. The code expires in 10 minutes."
          >
            <Input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="••••••"
              required
            />
          </FieldGroup>

          {state?.ok === false && (
            <p className="text-sm text-danger">{state.error}</p>
          )}

          <SubmitButton idleLabel="Continue" pendingLabel="Verifying…" className="w-full" />

          <button
            type="button"
            onClick={handleSend}
            disabled={sending}
            className="block w-full text-center text-sm text-accent hover:underline"
          >
            {sending ? "Sending…" : "Send a new code"}
          </button>
        </form>
      )}
    </div>
  );
}
