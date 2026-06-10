import type { Metadata } from "next";
import { Eyebrow } from "@/components/ui/ornament";
import { SurveyPreview } from "./survey-preview";

export const metadata: Metadata = {
  title: "Survey preferences — Leafmart",
  description:
    "Opt in or out of friendly post-purchase text surveys, and preview exactly what we'll ask. Emojis, 1–10 scales, and free text — and you nurture Seeds for finishing.",
};

// EMR-289 — Post-purchase SMS survey (customer-facing scope): opt-in/opt-out
// control + an interactive preview of the conversational survey.
export default function ShopSurveysPage() {
  return (
    <div className="px-4 py-8 lg:px-12">
      <div className="mb-6 max-w-2xl">
        <Eyebrow className="mb-2">Surveys &amp; rewards</Eyebrow>
        <h1 className="font-display text-3xl tracking-tight text-text sm:text-4xl">
          Quick check-ins, real rewards
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-text-muted">
          We learn what works by asking — briefly, kindly, and right from your texts. Manage your
          preference and see exactly what a survey feels like.
        </p>
      </div>
      <SurveyPreview />
    </div>
  );
}
