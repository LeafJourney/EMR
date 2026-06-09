"use client";

import * as React from "react";
import {
  Wind,
  Brain,
  Flower2,
  Moon,
  HeartHandshake,
  Sparkles,
  Info,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eyebrow, EditorialRule } from "@/components/ui/ornament";
import { BreathingPacer } from "./breathing-pacer";
import {
  MEDITATIONS,
  MOVEMENT_FLOWS,
  REST_RITUALS,
  GRATITUDE_PROMPTS,
  type Practice,
} from "./wellness-data";

// EMR-339 — Wellness surface (client). Calm "safe place for mindfulness":
// breathwork, meditation, gentle movement, rest rituals, and gratitude.
// All copy is de-medicalized — general wellness & education only.

function SectionHeading({
  icon: Icon,
  eyebrow,
  title,
  blurb,
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  blurb: string;
}) {
  return (
    <div className="mb-6 max-w-2xl">
      <Eyebrow className="mb-2">{eyebrow}</Eyebrow>
      <h2 className="flex items-center gap-2.5 font-display text-2xl tracking-tight text-text">
        <Icon width={22} height={22} className="text-accent" />
        {title}
      </h2>
      <p className="mt-2 text-[14px] leading-relaxed text-text-muted">{blurb}</p>
    </div>
  );
}

function PracticeCard({ practice }: { practice: Practice }) {
  return (
    <Card tone="glass" motion="hover" className="h-full">
      <CardContent className="flex h-full flex-col gap-2 p-5">
        <div className="flex items-start justify-between gap-3">
          <span className="text-3xl leading-none" aria-hidden="true">
            {practice.emoji}
          </span>
          {practice.duration ? (
            <Badge tone="neutral">{practice.duration}</Badge>
          ) : null}
        </div>
        <h3 className="mt-1 font-display text-lg tracking-tight text-text">
          {practice.title}
        </h3>
        <p className="text-[13.5px] leading-relaxed text-text-muted">
          {practice.description}
        </p>
      </CardContent>
    </Card>
  );
}

function PracticeGrid({ practices }: { practices: Practice[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {practices.map((p) => (
        <PracticeCard key={p.title} practice={p} />
      ))}
    </div>
  );
}

function GratitudeCard() {
  // Deterministic initial prompt (index 0) to avoid hydration mismatch;
  // cycling happens only on user interaction.
  const [index, setIndex] = React.useState(0);
  const prompt = GRATITUDE_PROMPTS[index] ?? GRATITUDE_PROMPTS[0];

  function nextPrompt() {
    setIndex((i) => (i + 1) % GRATITUDE_PROMPTS.length);
  }

  return (
    <Card tone="ambient" className="overflow-hidden">
      <CardContent className="flex flex-col gap-4 p-7 sm:p-8">
        <span className="text-4xl leading-none" aria-hidden="true">
          🙏
        </span>
        <div>
          <Eyebrow className="mb-2">Today&apos;s reflection</Eyebrow>
          <p className="font-display text-2xl leading-snug tracking-tight text-text">
            {prompt}
          </p>
        </div>
        <p className="text-[13.5px] leading-relaxed text-text-muted">
          Take a slow breath and let the answer arrive on its own. Jotting it
          down — even one line — can make the feeling last a little longer.
        </p>
        <div>
          <Button
            variant="secondary"
            size="sm"
            onClick={nextPrompt}
            leadingIcon={<RefreshCw width={15} height={15} />}
          >
            Another prompt
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function WellnessView() {
  return (
    <div className="mx-auto max-w-6xl">
      {/* Hero */}
      <section className="mb-12 overflow-hidden rounded-3xl border border-border bg-surface-raised p-8 sm:p-12">
        <Eyebrow className="mb-3">Wellness</Eyebrow>
        <h1 className="max-w-2xl font-display text-4xl leading-[1.05] tracking-tight text-text sm:text-5xl">
          A safe place for{" "}
          <span className="text-accent">mindfulness.</span>
        </h1>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-text-muted">
          A few quiet practices to help you slow down, steady your breath, and
          feel a little more grounded. Move at your own pace — there is nothing
          to finish and nothing to get right.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Badge tone="accent">
            <Sparkles width={12} height={12} aria-hidden="true" /> Calm &amp; unhurried
          </Badge>
          <Badge tone="neutral">No account needed</Badge>
          <Badge tone="neutral">Go at your own pace</Badge>
        </div>
      </section>

      {/* Breathwork + pacer */}
      <section className="mb-14">
        <SectionHeading
          icon={Wind}
          eyebrow="Breathwork"
          title="Breathe with the circle"
          blurb="Let the circle guide your rhythm. Expand as you breathe in, settle as you breathe out. A simple way to find calm in a minute or two."
        />
        <Card tone="glass" className="overflow-hidden">
          <CardContent className="p-8 sm:p-10">
            <BreathingPacer />
          </CardContent>
        </Card>
      </section>

      <EditorialRule className="my-12" />

      {/* Mindfulness & meditation */}
      <section className="mb-14">
        <SectionHeading
          icon={Brain}
          eyebrow="Mindfulness"
          title="Meditation & mindfulness"
          blurb="Short, guided moments of stillness. Pick one that fits the time you have — a single minute counts just as much."
        />
        <PracticeGrid practices={MEDITATIONS} />
      </section>

      {/* Gentle movement / yoga */}
      <section className="mb-14">
        <SectionHeading
          icon={Flower2}
          eyebrow="Gentle movement"
          title="Gentle movement & yoga"
          blurb="Easy, low-effort flows to loosen up and feel at ease in your body. Move softly and only as far as feels good."
        />
        <PracticeGrid practices={MOVEMENT_FLOWS} />
      </section>

      {/* Rest & evening rituals */}
      <section className="mb-14">
        <SectionHeading
          icon={Moon}
          eyebrow="Rest"
          title="Rest & evening rituals"
          blurb="Small cues that tell the day it's over. Build a calm wind-down for more restful evenings."
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {REST_RITUALS.map((r) => (
            <PracticeCard key={r.title} practice={r} />
          ))}
        </div>
      </section>

      {/* Gratitude & reflection */}
      <section className="mb-14">
        <SectionHeading
          icon={HeartHandshake}
          eyebrow="Gratitude"
          title="Gratitude & reflection"
          blurb="A quiet moment to notice the good. Reflection is a gentle way to feel more grounded and connected."
        />
        <GratitudeCard />
      </section>

      {/* Layered disclaimer */}
      <section className="mb-4">
        <Card tone="outlined">
          <CardContent className="flex items-start gap-3 p-5">
            <Info
              width={18}
              height={18}
              className="mt-0.5 shrink-0 text-text-subtle"
              aria-hidden="true"
            />
            <p className="text-[12.5px] leading-relaxed text-text-muted">
              This content is for general wellness and education only. It is not
              medical advice, and it is not intended to diagnose, treat, or
              replace care from a professional. Please talk with your healthcare
              provider before changing any treatment or starting a new wellness
              routine.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
