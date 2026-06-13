"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Textarea, FieldGroup } from "@/components/ui/input";
import { Tabs, TabList, Trigger, Panel } from "@/components/ui/tabs";
import { cn } from "@/lib/utils/cn";
import { lex, lexPlural } from "@/lib/lexicon";
import {
  type SeedTroveSnapshot,
  type GiftCard,
  type SeedLedgerEntry,
  centsToDollars,
  dollarsForSeeds,
  issueGiftCard,
} from "@/lib/domain/seed-trove-loyalty";

type Tab = "wallet" | "redeem" | "fruit-cards" | "history";

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "wallet", label: "Wallet" },
  { key: "redeem", label: "Harvest" },
  { key: "fruit-cards", label: "Fruit cards" },
  { key: "history", label: "History" },
];

const SOURCE_LABEL: Record<NonNullable<SeedLedgerEntry["source"]>, string> = {
  dose_log: "Dose check-in",
  weekly_checkin: "Weekly survey",
  volunteer_hour: "Nurture hour",
  cme_credit: "CME credit",
  purchase: "Marketplace",
  referral: "Referral",
  milestone: "Bloom milestone",
  manual_grant: "Operator grant",
  promo: "Promo",
};

export function TroveWalletView({
  snapshot,
  giftCards,
}: {
  snapshot: SeedTroveSnapshot;
  giftCards: GiftCard[];
}) {
  const [tab, setTab] = useState<Tab>("wallet");
  const [cards, setCards] = useState<GiftCard[]>(giftCards);
  const [balance, setBalance] = useState<number>(snapshot.balance);

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => setTab(v as Tab)}
      variant="pill"
      className="space-y-6"
    >
      <TierStrip snapshot={snapshot} balance={balance} />

      <TabList aria-label="Seed trove sections" className="flex-wrap">
        {TABS.map((t) => (
          <Trigger key={t.key} value={t.key}>
            {t.label}
          </Trigger>
        ))}
      </TabList>

      <Panel value="wallet">
        <WalletPanel snapshot={snapshot} balance={balance} />
      </Panel>
      <Panel value="redeem" lazy>
        <RedeemPanel
          balance={balance}
          onIssue={(card) => {
            setCards((prev) => [card, ...prev]);
            setBalance((prev) => prev - (card.seedsBurned ?? 0));
          }}
        />
      </Panel>
      <Panel value="fruit-cards" lazy>
        <FruitCardsPanel cards={cards} />
      </Panel>
      <Panel value="history" lazy>
        <HistoryPanel entries={snapshot.recentEntries} />
      </Panel>
    </Tabs>
  );
}

function TierStrip({ snapshot, balance }: { snapshot: SeedTroveSnapshot; balance: number }) {
  // Actual progress through the current tier (0–100), computed in the loyalty
  // builder where the tier floors are known.
  const progress = snapshot.tierProgressPct;
  return (
    <Card tone="ambient">
      <CardContent className="py-7">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-wider text-text-subtle">{lex("noun.tier")}</p>
            <h2 className="font-display text-2xl text-text mt-1" style={{ color: snapshot.tierHue }}>
              {snapshot.tierLabel}
            </h2>
            <p className="text-sm text-text-muted mt-1">
              {balance.toLocaleString()} {lexPlural(balance, "currency").toLowerCase()} planted in your trove.
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-text-subtle">Lifetime</p>
            <p className="text-sm text-text-muted mt-1">
              <span className="text-text font-medium">{snapshot.lifetimeEarned.toLocaleString()}</span> earned ·{" "}
              <span className="text-text font-medium">{snapshot.lifetimeRedeemed.toLocaleString()}</span> harvested
            </p>
          </div>
        </div>
        {snapshot.nextTierLabel && (
          <div className="mt-5">
            <div className="flex items-center justify-between text-[11px] text-text-subtle">
              <span>Toward {snapshot.nextTierLabel}</span>
              <span>
                {snapshot.seedsToNextTier?.toLocaleString()} {lex("currency.points").toLowerCase()} to grow
              </span>
            </div>
            <div className="h-1.5 mt-1.5 rounded-full bg-surface-muted overflow-hidden">
              <div
                className="h-full bg-emerald-600 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WalletPanel({ snapshot, balance }: { snapshot: SeedTroveSnapshot; balance: number }) {
  const redeemableCents = dollarsForSeeds(balance, balance);
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card>
        <CardContent className="py-5">
          <p className="text-xs uppercase tracking-wider text-text-subtle">Available {lex("currency.points")}</p>
          <p className="font-display text-3xl text-text mt-1 tabular-nums">{balance.toLocaleString()}</p>
          <p className="text-xs text-text-muted mt-2">Worth {centsToDollars(redeemableCents)} at your tier.</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="py-5">
          <p className="text-xs uppercase tracking-wider text-text-subtle">Ways to plant more</p>
          <ul className="mt-2 space-y-1 text-sm text-text-muted">
            <li>• Log a dose check-in (+5)</li>
            <li>• Complete the weekly survey (+25)</li>
            <li>• Log a nurture hour (+50)</li>
            <li>• Refer a friend (+250)</li>
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="py-5">
          <p className="text-xs uppercase tracking-wider text-text-subtle">Recent</p>
          <ul className="mt-2 space-y-1 text-sm">
            {snapshot.recentEntries.slice(0, 5).map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2">
                <span className="text-text-muted truncate">{e.memo}</span>
                <span className={cn("tabular-nums text-xs", e.delta >= 0 ? "text-emerald-700" : "text-text-subtle")}>
                  {e.delta >= 0 ? "+" : ""}
                  {e.delta}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

const REDEEM_PRESETS = [500, 1000, 2500, 5000];

function RedeemPanel({
  balance,
  onIssue,
}: {
  balance: number;
  onIssue: (card: GiftCard) => void;
}) {
  const [seeds, setSeeds] = useState<number>(1000);
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const valueCents = useMemo(() => dollarsForSeeds(seeds, balance), [seeds, balance]);

  function submit() {
    setError(null);
    setOkMsg(null);
    const result = issueGiftCard({
      faceValueCents: valueCents,
      fundedBy: "seeds",
      issuedByUserId: "self",
      recipientName: recipientName || undefined,
      recipientEmail: recipientEmail || undefined,
      message: message || undefined,
      seedsBurned: seeds,
      buyerBalance: balance,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onIssue(result.giftCard);
    setOkMsg(`Fruit card ${result.giftCard.code} issued.`);
    setSeeds(1000);
    setRecipientName("");
    setRecipientEmail("");
    setMessage("");
  }

  return (
    <Card tone="raised">
      <CardHeader>
        <CardTitle>{lex("verb.redeem")} {lex("currency.points").toLowerCase()} for a {lex("noun.giftCard").toLowerCase()}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center gap-2 flex-wrap">
          {REDEEM_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setSeeds(p)}
              disabled={p > balance}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium border",
                seeds === p
                  ? "bg-emerald-700 text-white border-emerald-700"
                  : "bg-surface text-text-muted border-border hover:bg-surface-muted disabled:opacity-40 disabled:cursor-not-allowed",
              )}
            >
              {p.toLocaleString()} {lex("currency.short")}
            </button>
          ))}
        </div>

        <FieldGroup label={`${lex("currency.points")} to plant`} hint={`Up to ${balance.toLocaleString()}.`}>
          <Input
            type="number"
            min={500}
            max={balance}
            value={seeds}
            onChange={(e) => setSeeds(Math.max(0, Number(e.target.value)))}
          />
        </FieldGroup>

        <Card tone="outlined">
          <CardContent className="py-4 flex items-center justify-between gap-4">
            <span className="text-sm text-text-muted">
              {seeds.toLocaleString()} {lex("currency.points").toLowerCase()} →
            </span>
            <span className="font-display text-xl text-text">{centsToDollars(valueCents)}</span>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FieldGroup label="Recipient name (optional)">
            <Input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="For yourself? Leave blank." />
          </FieldGroup>
          <FieldGroup label="Recipient email (optional)">
            <Input type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} placeholder="them@example.com" />
          </FieldGroup>
        </div>
        <FieldGroup label="Note (optional)">
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="Add a kind note." />
        </FieldGroup>

        {error && <p className="text-sm text-danger">{error}</p>}
        {okMsg && <p className="text-sm text-emerald-700">{okMsg}</p>}

        <div className="flex justify-end">
          <Button onClick={submit} disabled={seeds < 500 || seeds > balance}>
            Issue {lex("noun.giftCard").toLowerCase()}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function FruitCardsPanel({ cards }: { cards: GiftCard[] }) {
  if (cards.length === 0) {
    return (
      <Card tone="outlined">
        <CardContent className="py-10 text-center text-text-muted text-sm">
          No fruit cards yet. Harvest your seeds for one above.
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {cards.map((c) => (
        <Card key={c.id} tone="raised">
          <CardContent className="py-5 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-text-subtle">{lex("noun.giftCard")}</p>
                <p className="font-mono text-sm text-text mt-1">{c.code}</p>
              </div>
              <Badge tone={c.status === "issued" ? "success" : c.status === "redeemed" ? "neutral" : "warning"}>
                {c.status.replace("_", " ")}
              </Badge>
            </div>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[11px] text-text-subtle">Remaining</p>
                <p className="font-display text-2xl text-text">{centsToDollars(c.remainingCents)}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-text-subtle">Face value</p>
                <p className="text-sm text-text-muted">{centsToDollars(c.faceValueCents)}</p>
              </div>
            </div>
            {c.recipientName && (
              <p className="text-xs text-text-muted">
                For <span className="text-text">{c.recipientName}</span>
                {c.recipientEmail && ` · ${c.recipientEmail}`}
              </p>
            )}
            {c.message && <p className="text-xs italic text-text-muted">&ldquo;{c.message}&rdquo;</p>}
            <p className="text-[11px] text-text-subtle">
              Expires {new Date(c.expiresAt).toLocaleDateString()}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function HistoryPanel({ entries }: { entries: SeedLedgerEntry[] }) {
  return (
    <Card>
      <CardContent className="py-2">
        <ul className="divide-y divide-border/60">
          {entries.map((e) => (
            <li key={e.id} className="py-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-text">{e.memo}</p>
                <p className="text-[11px] text-text-subtle">
                  {new Date(e.occurredAt).toLocaleDateString()}
                  {e.source && ` · ${SOURCE_LABEL[e.source]}`}
                </p>
              </div>
              <span className={cn("tabular-nums text-sm", e.delta >= 0 ? "text-emerald-700" : "text-text-subtle")}>
                {e.delta >= 0 ? "+" : ""}
                {e.delta}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
