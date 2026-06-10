import { WellnessView } from "./wellness-view";

// EMR-339 — Wellness module for the Leafmart shop. Public (no auth). Renders
// inside the existing ShopLayout, so we emit page content only — no header,
// footer, or top bar of our own.

export const metadata = {
  title: "Wellness — Leafmart",
  description:
    "A calm, safe place for mindfulness — breathwork, meditation, gentle movement, rest rituals, and gratitude. General wellness and education only.",
};

export default function WellnessPage() {
  return (
    <div className="px-4 py-8 lg:px-12">
      <WellnessView />
    </div>
  );
}
