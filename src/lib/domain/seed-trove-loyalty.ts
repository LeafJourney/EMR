// EMR-313 — Seed Trove loyalty engine.
//
// Pure domain logic for the Track 6 loyalty surface. Earn rules ("plant"),
// redemption rules ("harvest"/"trade"), gift cards ("fruit cards"), and
// ledger projections. No I/O — every function is deterministic and unit
// testable. Persistence layers (Prisma, in-memory demo store) compose this
// module rather than reimplement it.
//
// Currency contract: seeds are integers. We never carry fractional seeds
// in the ledger. Convert dollars→seeds with `seedsForDollars` and
// seeds→dollars with `dollarsForSeeds` so rounding lives in one place.

import { TROVE_TIERS, tierForSeeds, type TroveTierKey } from "@/lib/lexicon";

/**
 * Categorical reasons a seed entry can post. Keeping this an enum-shaped
 * union (not free-form strings) means audit/reporting code can rely on the
 * full set of values being known at compile time.
 */
export type SeedSource =
  | "dose_log"          // patient logs a dose / outcome check-in
  | "weekly_checkin"    // weekly emoji survey completed
  | "volunteer_hour"    // logged hour from EMR-125 volunteer module
  | "cme_credit"        // CME credit awarded from EMR-126
  | "purchase"          // dollars spent in marketplace
  | "referral"          // referred a new patient
  | "milestone"         // streak, anniversary, advisory-board contribution
  | "manual_grant"      // operator gave seeds (audit trail mandatory)
  | "promo";            // marketing campaign

export type RedemptionKind =
  | "gift_card"         // fruit card → marketplace credit
  | "charity_donation"  // 1:1 to Leafjourney Charitable Fund (EMR-127)
  | "platform_credit"   // billing credit toward patient responsibility
  | "manual_debit";     // operator removed seeds (refund / fraud / correction)

export type LedgerEntryKind = "earn" | "redeem" | "expire" | "adjustment";

export interface SeedLedgerEntry {
  id: string;
  userId: string;
  kind: LedgerEntryKind;
  // Positive for earn/adjustment+, negative for redeem/expire/adjustment-
  delta: number;
  source?: SeedSource;
  redemption?: RedemptionKind;
  memo: string;
  occurredAt: string;       // ISO timestamp
  // Optional refs into other systems for audit traceability
  refId?: string;           // dose_log id, volunteer hour id, etc.
}

// ---------------------------------------------------------------------------
// Earn rules
// ---------------------------------------------------------------------------

/**
 * Seeds awarded for a given source action. Centralized so a Director of
 * Growth can re-tune the loyalty economy in one diff. Returning 0 (vs
 * throwing) keeps the caller's flow simple — earning zero is just a no-op
 * ledger entry that never gets persisted.
 */
export function earnSeedsFor(source: SeedSource, params?: { dollars?: number; hours?: number; cmeUnits?: number }): number {
  switch (source) {
    case "dose_log":
      return 5;
    case "weekly_checkin":
      return 25;
    case "volunteer_hour":
      // EMR-125 — 50 seeds per logged hour, encourages quarterly target
      return 50 * (params?.hours ?? 1);
    case "cme_credit":
      // EMR-126 — 100 seeds per CME unit, paired with provider discount
      return 100 * (params?.cmeUnits ?? 1);
    case "purchase":
      // 1 seed per whole dollar; no fractional accrual.
      return Math.floor(params?.dollars ?? 0);
    case "referral":
      return 250;
    case "milestone":
      return 500;
    case "promo":
      return 0;             // promo amounts come in via the campaign, not a default
    case "manual_grant":
      return 0;             // operator supplies the amount explicitly
  }
}

// ---------------------------------------------------------------------------
// Conversion: dollars ↔ seeds
// ---------------------------------------------------------------------------

/**
 * Base conversion: 100 seeds == $1.00. Tier bonus increases redemption
 * value (not earn rate) so the metaphor stays consistent — old growth
 * yields more fruit, but the tree still grew one ring at a time.
 */
const SEEDS_PER_DOLLAR_REDEEM = 100;

const TIER_REDEEM_BONUS: Record<TroveTierKey, number> = {
  sprout: 1.0,
  sapling: 1.05,
  canopy: 1.10,
  "old-growth": 1.20,
};

export function seedsForDollars(dollars: number): number {
  return Math.round(dollars * SEEDS_PER_DOLLAR_REDEEM);
}

/**
 * Cents value of a seed bundle for the given balance's tier. Returns
 * integer cents so callers do not chase floating-point drift; UI code
 * formats with `centsToDollars`.
 */
export function dollarsForSeeds(seeds: number, balance: number): number {
  const tier = tierForSeeds(balance).key;
  const bonus = TIER_REDEEM_BONUS[tier];
  // base cents = (seeds / 100) * 100 = seeds.  bonus is a multiplier on cents.
  return Math.floor(seeds * bonus);
}

export function centsToDollars(cents: number): string {
  const dollars = cents / 100;
  return dollars.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

// ---------------------------------------------------------------------------
// Balance projection
// ---------------------------------------------------------------------------

export interface SeedTroveSnapshot {
  balance: number;
  lifetimeEarned: number;
  lifetimeRedeemed: number;
  tierKey: TroveTierKey;
  tierLabel: string;
  tierHue: string;
  seedsToNextTier: number | null;   // null when at the top tier
  nextTierLabel: string | null;
  /** 0–100 progress through the current tier toward the next (100 at top tier). */
  tierProgressPct: number;
  recentEntries: SeedLedgerEntry[]; // newest first, capped to 10
}

export function snapshotFromLedger(userId: string, ledger: SeedLedgerEntry[]): SeedTroveSnapshot {
  const mine = ledger.filter((e) => e.userId === userId);
  let balance = 0;
  let earned = 0;
  let redeemed = 0;
  for (const e of mine) {
    balance += e.delta;
    if (e.delta > 0) earned += e.delta;
    else redeemed += -e.delta;
  }
  const tier = tierForSeeds(balance);
  const tierIdx = TROVE_TIERS.findIndex((t) => t.key === tier.key);
  const next = tierIdx >= 0 && tierIdx < TROVE_TIERS.length - 1 ? TROVE_TIERS[tierIdx + 1] : null;

  const recent = [...mine]
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, 10);

  return {
    balance,
    lifetimeEarned: earned,
    lifetimeRedeemed: redeemed,
    tierKey: tier.key,
    tierLabel: tier.label,
    tierHue: tier.hue,
    seedsToNextTier: next ? Math.max(0, next.minSeeds - balance) : null,
    nextTierLabel: next?.label ?? null,
    tierProgressPct: next
      ? Math.min(
          100,
          Math.max(
            0,
            Math.round(((balance - tier.minSeeds) / (next.minSeeds - tier.minSeeds)) * 100),
          ),
        )
      : 100,
    recentEntries: recent,
  };
}

// ---------------------------------------------------------------------------
// Gift cards ("fruit cards")
// ---------------------------------------------------------------------------

export type GiftCardStatus = "issued" | "partially_redeemed" | "redeemed" | "expired" | "voided";

export interface GiftCard {
  id: string;
  code: string;             // 16-char alphanumeric, hyphenated for readability
  faceValueCents: number;
  remainingCents: number;
  status: GiftCardStatus;
  recipientName?: string;
  recipientEmail?: string;
  message?: string;
  issuedByUserId: string;
  issuedAt: string;
  expiresAt: string;        // 1 year by default
  fundedBy: "seeds" | "cash";
  seedsBurned?: number;
}

/**
 * Fruit-card codes are decoupled from card IDs because the code is the
 * thing that travels (email, printed card) and we want the ID space and
 * code space to be revoke-and-reissue independent.
 *
 * 16 chars from a no-look-alikes alphabet (omits 0/O/1/I) → ~1.2 trillion
 * combinations per length, more than sufficient with daily issuance volume.
 */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateGiftCardCode(rand: () => number = Math.random): string {
  let raw = "";
  for (let i = 0; i < 16; i++) raw += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
}

export interface IssueGiftCardInput {
  faceValueCents: number;
  fundedBy: "seeds" | "cash";
  issuedByUserId: string;
  recipientName?: string;
  recipientEmail?: string;
  message?: string;
  // Required when fundedBy === "seeds"
  seedsBurned?: number;
  // Required when fundedBy === "seeds"
  buyerBalance?: number;
  rand?: () => number;
  now?: () => Date;
}

export type IssueGiftCardResult =
  | { ok: true; giftCard: GiftCard }
  | { ok: false; error: string };

const MIN_GIFT_CARD_CENTS = 500;       // $5
const MAX_GIFT_CARD_CENTS = 50_000;    // $500 — keeps fraud blast radius bounded
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export function issueGiftCard(input: IssueGiftCardInput): IssueGiftCardResult {
  const now = (input.now ?? (() => new Date()))();
  if (input.faceValueCents < MIN_GIFT_CARD_CENTS) {
    return { ok: false, error: `Minimum fruit card value is ${centsToDollars(MIN_GIFT_CARD_CENTS)}.` };
  }
  if (input.faceValueCents > MAX_GIFT_CARD_CENTS) {
    return { ok: false, error: `Maximum fruit card value is ${centsToDollars(MAX_GIFT_CARD_CENTS)}.` };
  }
  if (input.fundedBy === "seeds") {
    if (input.seedsBurned == null || input.buyerBalance == null) {
      return { ok: false, error: "Seed-funded fruit cards require seedsBurned and buyerBalance." };
    }
    if (input.seedsBurned > input.buyerBalance) {
      return { ok: false, error: "Insufficient seeds." };
    }
    const valueCents = dollarsForSeeds(input.seedsBurned, input.buyerBalance);
    if (valueCents < input.faceValueCents) {
      return { ok: false, error: `Seeds redeem to ${centsToDollars(valueCents)}; need ${centsToDollars(input.faceValueCents)}.` };
    }
  }
  const card: GiftCard = {
    id: `gc-${Math.floor((input.rand ?? Math.random)() * 1e9).toString(36)}`,
    code: generateGiftCardCode(input.rand),
    faceValueCents: input.faceValueCents,
    remainingCents: input.faceValueCents,
    status: "issued",
    recipientName: input.recipientName,
    recipientEmail: input.recipientEmail,
    message: input.message,
    issuedByUserId: input.issuedByUserId,
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ONE_YEAR_MS).toISOString(),
    fundedBy: input.fundedBy,
    seedsBurned: input.seedsBurned,
  };
  return { ok: true, giftCard: card };
}

/** Apply a partial redemption to a fruit card. Returns the updated card and the cents actually drawn. */
export function redeemGiftCard(
  card: GiftCard,
  cents: number,
): { card: GiftCard; redeemedCents: number } {
  if (card.status === "expired" || card.status === "voided") return { card, redeemedCents: 0 };
  const redeemed = Math.min(card.remainingCents, Math.max(0, cents));
  const remaining = card.remainingCents - redeemed;
  const status: GiftCardStatus = remaining === 0 ? "redeemed" : remaining < card.faceValueCents ? "partially_redeemed" : card.status;
  return {
    card: { ...card, remainingCents: remaining, status },
    redeemedCents: redeemed,
  };
}
