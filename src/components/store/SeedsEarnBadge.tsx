// EMR-313 / EMR-314 — Surface the Seed Trove loyalty economy in the storefront.
//
// The loyalty engine + nurture/harvest/fruit lexicon already ship on main
// (src/lib/domain/seed-trove-loyalty.ts, src/lib/lexicon/seed-trove.ts). This
// is the shop-side touchpoint: it shows a shopper how many Seeds a purchase
// will plant, in the canonical lexicon, linking through to their Seed Trove
// wallet. Pure (no hooks) so it renders in both server PDPs and the client
// checkout.

import Link from "next/link";
import { Sprout } from "lucide-react";
import { earnSeedsFor } from "@/lib/domain/seed-trove-loyalty";
import { lex } from "@/lib/lexicon";

export function SeedsEarnBadge({
  dollars,
  className,
  linkToTrove = true,
}: {
  /** Purchase value in dollars; Seeds accrue at 1 Seed per whole dollar. */
  dollars: number;
  className?: string;
  /** Wrap in a link to the Seed Trove wallet. Disable inside other links. */
  linkToTrove?: boolean;
}) {
  const seeds = earnSeedsFor("purchase", { dollars });
  if (seeds <= 0) return null;

  const inner = (
    <>
      <Sprout width={14} height={14} className="text-accent" />
      <span>
        {lex("verb.earn")} <span className="font-medium text-text">~{seeds.toLocaleString()}</span>{" "}
        {lex("currency.points")}
      </span>
      <span className="text-text-subtle">· {lex("trove.name")}</span>
    </>
  );

  const base =
    "inline-flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent-soft/50 px-2.5 py-1 text-[12px] text-text-muted";

  if (!linkToTrove) {
    return <span className={`${base} ${className ?? ""}`}>{inner}</span>;
  }

  return (
    <Link
      href="/portal/seed-trove"
      className={`${base} transition-colors hover:border-accent/40 hover:bg-accent-soft ${className ?? ""}`}
      title="View your Seed Trove wallet"
    >
      {inner}
    </Link>
  );
}
