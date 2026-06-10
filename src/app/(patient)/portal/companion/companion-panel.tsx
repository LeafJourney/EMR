"use client";

// EMR-386 (portal-scoped) — Ambient AI companion entrypoint.
//
// The canonical always-present presence layer lives in shared shell files
// (AskCindyWidget, the patient layout, the agent libs) which are out of this
// track's directory scope. This is the in-scope piece: one calm, trust-
// building companion surface inside the portal that helps a patient figure
// out what to do next and routes them to check-ins, messages, education, the
// dosing plan, and records — without ever surfacing unapproved clinical drafts
// or acting medically overconfident. It uses the design system's liquid-glass
// card tone (EMR-385) and respects reduced-motion.

import * as React from "react";
import Link from "next/link";
import {
  Sparkles,
  HeartPulse,
  MessageCircle,
  BookOpen,
  Pill,
  FolderHeart,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Eyebrow } from "@/components/ui/ornament";

interface Action {
  href: string;
  emoji: string;
  icon: React.ReactNode;
  title: string;
  body: string;
}

const ACTIONS: Action[] = [
  {
    href: "/portal/outcomes/new",
    emoji: "🌤️",
    icon: <HeartPulse width={16} height={16} />,
    title: "Daily check-in",
    body: "A few taps on how you're feeling — pain, sleep, mood.",
  },
  {
    href: "/portal/log-dose",
    emoji: "🌿",
    icon: <Pill width={16} height={16} />,
    title: "Log a dose",
    body: "Note what you took and how it landed.",
  },
  {
    href: "/portal/messages",
    emoji: "💬",
    icon: <MessageCircle width={16} height={16} />,
    title: "Message your care team",
    body: "Anything clinical? I'll hand you to the people who can help.",
  },
  {
    href: "/portal/dosing",
    emoji: "🗒️",
    icon: <FolderHeart width={16} height={16} />,
    title: "Your dosing plan",
    body: "Review the plan you and your clinician set.",
  },
  {
    href: "/portal/education",
    emoji: "📚",
    icon: <BookOpen width={16} height={16} />,
    title: "Learn",
    body: "Plain-language guides and the bigger picture.",
  },
  {
    href: "/portal/records",
    emoji: "🗂️",
    icon: <FolderHeart width={16} height={16} />,
    title: "Your records",
    body: "Labs, visits, and documents in one calm place.",
  },
];

// A few gentle openers; rotated client-side so the greeting feels alive
// without any network call or medical claim.
const GREETINGS = [
  "I'm here whenever you need a hand finding your way around.",
  "No rush — tell me what you'd like to do, and I'll take you there.",
  "Small steps count. Want to start with a quick check-in?",
  "Here to help you stay on top of things, gently.",
];

export function CompanionPanel() {
  const [greetingIndex, setGreetingIndex] = React.useState(0);
  const prefersReduced = useReducedMotionSafe();

  React.useEffect(() => {
    if (prefersReduced) return;
    const id = window.setInterval(() => {
      setGreetingIndex((i) => (i + 1) % GREETINGS.length);
    }, 6000);
    return () => window.clearInterval(id);
  }, [prefersReduced]);

  return (
    <div>
      <Card tone="glass" className="overflow-hidden">
        <CardContent className="py-6">
          <div className="flex items-start gap-4">
            <span
              className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-accent-soft text-accent"
              aria-hidden="true"
            >
              <Sparkles width={22} height={22} />
            </span>
            <div className="min-w-0">
              <Eyebrow>Cindy · your calm guide</Eyebrow>
              <p
                className={`mt-1 text-[15px] leading-relaxed text-text ${
                  prefersReduced ? "" : "transition-opacity duration-500"
                }`}
                aria-live="polite"
              >
                {GREETINGS[greetingIndex]}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {ACTIONS.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Card tone="raised" className="h-full transition-shadow group-hover:shadow-md">
              <CardContent className="flex items-center gap-3 py-4">
                <span className="text-2xl" aria-hidden="true">
                  {a.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 font-medium text-text">
                    <span className="text-accent">{a.icon}</span>
                    {a.title}
                  </p>
                  <p className="mt-0.5 text-[13px] leading-snug text-text-muted">{a.body}</p>
                </div>
                <ChevronRight
                  width={16}
                  height={16}
                  className="shrink-0 text-text-subtle transition-transform group-hover:translate-x-0.5"
                />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card tone="ambient" className="mt-4">
        <CardContent className="flex items-start gap-2.5 py-4 text-[13px] leading-relaxed text-text-muted">
          <ShieldCheck width={16} height={16} className="mt-0.5 shrink-0 text-accent" />
          <p>
            <span className="font-medium text-text">A gentle note:</span> I help you find your way —
            I don't give medical advice, and for anything clinical I'll connect you with your care
            team. You'll only ever see notes your clinician has approved.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// Small local hook so this component doesn't depend on a shared util. Reads
// the OS reduced-motion preference after mount (SSR-safe).
function useReducedMotionSafe(): boolean {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return reduced;
}
