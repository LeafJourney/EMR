"use client";

// EMR-289 — SMS post-purchase survey (scoped front-end).
//
// The production system texts customers a short survey after a purchase using
// the phone number on their profile — no login required. The SMS gateway,
// rate-limited send API, and de-identified data routing are server-side and
// out of this UI's scope (and out of this track's directory scope: no /api,
// no schema). What lives here is the customer-facing piece: the opt-in / opt-
// out control, and an interactive preview of the conversational survey so a
// customer (and the team) can see exactly what they'll be asked. Response
// types mirror the spec: cannabis emojis, a 1–10 numerical scale, and free
// text. Completing a survey nurtures Seeds (EMR-313 / EMR-314).

import * as React from "react";
import { MessageCircle, Sprout, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { lex } from "@/lib/lexicon";

const OPT_IN_KEY = "leafmart.sms-survey.opt-in.v1";

type Step =
  | { kind: "yesno"; id: string; prompt: string }
  | { kind: "emoji"; id: string; prompt: string }
  | { kind: "scale"; id: string; prompt: string }
  | { kind: "text"; id: string; prompt: string };

// Example flow from the ticket, softened to gentle wording.
const SURVEY: Step[] = [
  { kind: "yesno", id: "consent", prompt: "We saw you picked up PhytoRX about a week ago 🌿 Up for a quick 5-min survey? You'll nurture 50 Seeds. (1 = yes, 2 = no)" },
  { kind: "emoji", id: "overall", prompt: "How have you been feeling overall since you started?" },
  { kind: "scale", id: "comfort", prompt: "On a scale of 1–10 (1 = roughest, 10 = best), how's your comfort today?" },
  { kind: "scale", id: "rest", prompt: "And your rest, 1–10?" },
  { kind: "text", id: "notes", prompt: "Anything you'd like us to know? (type anything, or skip)" },
  { kind: "yesno", id: "repurchase", prompt: "Last one — would you pick up PhytoRX again? (1 = yes, 2 = no)" },
];

const EMOJIS = [
  { glyph: "😞", label: "Rough" },
  { glyph: "😐", label: "So-so" },
  { glyph: "🙂", label: "Good" },
  { glyph: "😄", label: "Great" },
  { glyph: "🌟", label: "Amazing" },
];

interface Bubble {
  from: "leafmart" | "me";
  text: string;
}

export function SurveyPreview() {
  const [optedIn, setOptedIn] = React.useState(true);
  const [stepIndex, setStepIndex] = React.useState(0);
  const [bubbles, setBubbles] = React.useState<Bubble[]>([{ from: "leafmart", text: SURVEY[0].prompt }]);
  const [draft, setDraft] = React.useState("");
  const [done, setDone] = React.useState(false);

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(OPT_IN_KEY);
      if (raw != null) setOptedIn(raw === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const setOptIn = (value: boolean) => {
    setOptedIn(value);
    try {
      window.localStorage.setItem(OPT_IN_KEY, value ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  const advance = (answerText: string, stopEarly = false) => {
    setBubbles((prev) => [...prev, { from: "me", text: answerText }]);
    const next = stepIndex + 1;
    if (stopEarly || next >= SURVEY.length) {
      setDone(true);
      setBubbles((prev) => [
        ...prev,
        {
          from: "leafmart",
          text: stopEarly
            ? "No worries — thanks anyway! Reply STOP any time to opt out. 🌿"
            : `Thank you! 🌱 You just nurtured 50 ${lex("currency.points")} into your ${lex("trove.name")}.`,
        },
      ]);
      return;
    }
    setStepIndex(next);
    setBubbles((prev) => [...prev, { from: "leafmart", text: SURVEY[next].prompt }]);
    setDraft("");
  };

  const restart = () => {
    setStepIndex(0);
    setDone(false);
    setDraft("");
    setBubbles([{ from: "leafmart", text: SURVEY[0].prompt }]);
  };

  const current = SURVEY[stepIndex];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_minmax(320px,380px)]">
      {/* Preferences + explainer */}
      <div>
        <Card tone="raised">
          <CardContent className="py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium text-text">Text-message surveys</p>
                <p className="mt-1 text-sm leading-relaxed text-text-muted">
                  After a purchase, we can text a short, friendly check-in to the number on your
                  profile — no login needed. Your answers help us learn what actually works.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={optedIn}
                onClick={() => setOptIn(!optedIn)}
                className={`relative mt-1 h-7 w-12 shrink-0 rounded-full transition-colors ${
                  optedIn ? "bg-accent" : "bg-surface-muted"
                }`}
                aria-label="Toggle SMS survey opt-in"
              >
                <span
                  className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${
                    optedIn ? "left-6" : "left-1"
                  }`}
                />
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge tone={optedIn ? "success" : "neutral"}>
                {optedIn ? "Opted in" : "Opted out"}
              </Badge>
              <span className="text-[12px] text-text-subtle">
                You can opt out any time — or just reply STOP to a text.
              </span>
            </div>
          </CardContent>
        </Card>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MiniCard emoji="🌿" title="Cannabis emojis" body="One-tap sentiment — quick and fun." />
          <MiniCard emoji="🔢" title="1–10 scales" body="Anchored low-to-high for clean data." />
          <MiniCard emoji="💬" title="Free text" body="Say anything in your own words." />
        </div>

        <Card tone="ambient" className="mt-4">
          <CardContent className="py-5 text-sm leading-relaxed text-text-muted">
            <p className="flex items-center gap-1.5 font-medium text-text">
              <Sprout width={15} height={15} className="text-accent" /> Surveys nurture Seeds
            </p>
            <p className="mt-1.5">
              Finishing a survey adds Seeds to your {lex("trove.name")} — people dislike surveys, so
              we make them quick, kind, and rewarding. Responses are tied to the product and, if you
              have an account, to your records (with opt-in / opt-out). Delivery and de-identified
              routing run securely on our servers.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Phone-style preview */}
      <div>
        <div className="mx-auto w-full max-w-[360px] overflow-hidden rounded-[28px] border border-border bg-surface-raised shadow-xl">
          <div className="flex items-center gap-2 border-b border-border bg-surface px-4 py-3">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-accent text-accent-ink">
              <MessageCircle width={16} height={16} />
            </span>
            <div>
              <p className="text-[13px] font-medium text-text">LeafMart</p>
              <p className="text-[11px] text-text-subtle">Survey preview · SMS</p>
            </div>
          </div>

          <div className="flex h-[360px] flex-col gap-2 overflow-y-auto bg-bg/40 p-3">
            {bubbles.map((b, i) => (
              <div
                key={i}
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-[13px] leading-snug ${
                  b.from === "me"
                    ? "self-end bg-accent text-accent-ink"
                    : "self-start border border-border bg-surface-raised text-text"
                }`}
              >
                {b.text}
              </div>
            ))}
          </div>

          {/* Answer controls */}
          <div className="border-t border-border bg-surface p-3">
            {done ? (
              <Button variant="secondary" className="w-full" leadingIcon={<RotateCcw width={15} height={15} />} onClick={restart}>
                Replay preview
              </Button>
            ) : current.kind === "yesno" ? (
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => advance("1 — yes")}>
                  1 · Yes
                </Button>
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => advance("2 — no", current.id === "consent")}
                >
                  2 · No
                </Button>
              </div>
            ) : current.kind === "emoji" ? (
              <div className="flex justify-between gap-1">
                {EMOJIS.map((e) => (
                  <button
                    key={e.glyph}
                    type="button"
                    onClick={() => advance(`${e.glyph} ${e.label}`)}
                    className="grid flex-1 place-items-center rounded-xl py-2 text-2xl transition-transform hover:scale-110 active:scale-95"
                    aria-label={e.label}
                    title={e.label}
                  >
                    {e.glyph}
                  </button>
                ))}
              </div>
            ) : current.kind === "scale" ? (
              <div className="flex flex-wrap gap-1">
                {Array.from({ length: 10 }).map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => advance(`${i + 1} / 10`)}
                    className="h-8 flex-1 rounded-lg border border-border text-[13px] font-medium text-text-muted transition-colors hover:border-accent hover:bg-accent-soft hover:text-accent"
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  advance(draft.trim() ? draft.trim() : "(skipped)");
                }}
                className="flex gap-2"
              >
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Type a reply…"
                  className="h-9 flex-1 rounded-full border border-border bg-surface-raised px-3 text-[13px] text-text placeholder:text-text-subtle focus:border-accent focus:outline-none"
                />
                <Button type="submit" size="sm">
                  Send
                </Button>
              </form>
            )}
          </div>
        </div>
        <p className="mt-2 text-center text-[11px] text-text-subtle">
          Interactive preview — no messages are actually sent.
        </p>
      </div>
    </div>
  );
}

function MiniCard({ emoji, title, body }: { emoji: string; title: string; body: string }) {
  return (
    <Card tone="raised">
      <CardContent className="py-4">
        <span className="text-2xl" aria-hidden="true">
          {emoji}
        </span>
        <p className="mt-1.5 text-[13px] font-medium text-text">{title}</p>
        <p className="mt-0.5 text-[12px] leading-snug text-text-muted">{body}</p>
      </CardContent>
    </Card>
  );
}
