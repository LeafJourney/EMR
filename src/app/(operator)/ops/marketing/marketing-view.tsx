"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FieldGroup, Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";

export interface ChannelStats {
  channel: string;
  newPatients: number;
  spend: number;
  visitors: number;
  demoRequests: number;
  signups: number;
}

interface TrendPoint {
  month: string;
  value: number;
}

export function MarketingView({
  totalThisMonth,
  yoyPct,
  channels,
  monthlyTrend,
}: {
  totalThisMonth: number;
  yoyPct: number;
  channels: ChannelStats[];
  monthlyTrend: TrendPoint[];
}) {
  const [roiChannel, setRoiChannel] = useState(channels[0]?.channel ?? "");
  const [roiRevenuePerPatient, setRoiRevenuePerPatient] = useState<number>(1200);
  // Spend seeds from the selected channel but is editable so the operator can
  // model "what if we spent $X" scenarios. null = follow the channel's spend.
  const [roiSpendOverride, setRoiSpendOverride] = useState<number | null>(null);

  const maxBar = Math.max(...channels.map((c) => c.newPatients), 1);
  const maxTrend = Math.max(...monthlyTrend.map((p) => p.value), 1);

  const totalVisitors = channels.reduce((a, c) => a + c.visitors, 0);
  const totalDemos = channels.reduce((a, c) => a + c.demoRequests, 0);
  const totalSignups = channels.reduce((a, c) => a + c.signups, 0);
  const totalActive = channels.reduce((a, c) => a + c.newPatients, 0);

  const roi = useMemo(() => {
    const c = channels.find((x) => x.channel === roiChannel);
    if (!c) return null;
    const spend = roiSpendOverride ?? c.spend;
    const revenue = c.newPatients * roiRevenuePerPatient;
    const net = revenue - spend;
    const cac = c.newPatients > 0 ? spend / c.newPatients : 0;
    const multiple = spend > 0 ? revenue / spend : Infinity;
    return { channel: c.channel, spend, revenue, net, cac, multiple };
  }, [channels, roiChannel, roiRevenuePerPatient, roiSpendOverride]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card tone="raised">
          <CardContent className="py-5">
            <p className="text-xs uppercase tracking-wider text-text-subtle">New patients · this month</p>
            <p className="font-display text-4xl tabular-nums text-text mt-1">{totalThisMonth}</p>
            <p className="text-xs text-accent mt-1">▲ {yoyPct}% year over year</p>
          </CardContent>
        </Card>
        <Card tone="raised">
          <CardContent className="py-5">
            <p className="text-xs uppercase tracking-wider text-text-subtle">Top channel</p>
            <p className="font-display text-xl text-text mt-1">
              {[...channels].sort((a, b) => b.newPatients - a.newPatients)[0]?.channel ?? "—"}
            </p>
            <p className="text-xs text-text-muted mt-1">
              Drives {[...channels].sort((a, b) => b.newPatients - a.newPatients)[0]?.newPatients ?? 0} patients
            </p>
          </CardContent>
        </Card>
        <Card tone="raised">
          <CardContent className="py-5">
            <p className="text-xs uppercase tracking-wider text-text-subtle">Total ad spend</p>
            <p className="font-display text-2xl tabular-nums text-text mt-1">
              ${channels.reduce((a, c) => a + c.spend, 0).toLocaleString()}
            </p>
            <p className="text-xs text-text-muted mt-1">Across paid channels</p>
          </CardContent>
        </Card>
      </div>

      <Card tone="raised">
        <CardContent className="py-5">
          <p className="text-sm font-medium text-text mb-4">Patients by source</p>
          <div className="space-y-3">
            {channels.map((c) => {
              const pct = (c.newPatients / maxBar) * 100;
              return (
                <div key={c.channel} className="flex items-center gap-3">
                  <span className="w-44 text-xs text-text-muted shrink-0">{c.channel}</span>
                  <div className="flex-1 h-6 bg-surface-muted rounded-md overflow-hidden relative">
                    <div
                      className="h-full bg-gradient-to-r from-accent to-accent-strong rounded-md"
                      style={{ width: `${pct}%` }}
                    />
                    <span className="absolute inset-0 flex items-center px-2 text-[11px] font-medium text-text">
                      {c.newPatients}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card tone="raised">
        <CardContent className="py-5">
          <p className="text-sm font-medium text-text mb-1">Acquisition cost (CAC) by source</p>
          <p className="text-xs text-text-muted mb-4">Customer acquisition cost = spend ÷ new patients.</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {channels.map((c) => {
              const cac = c.newPatients > 0 ? c.spend / c.newPatients : 0;
              return (
                <div key={c.channel} className="p-3 rounded-md bg-surface-muted/60">
                  <p className="text-[11px] text-text-muted truncate">{c.channel}</p>
                  <p className="font-display text-lg tabular-nums text-text mt-1">${cac.toFixed(0)}</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card tone="raised">
        <CardContent className="py-5">
          <p className="text-sm font-medium text-text mb-4">Conversion funnel</p>
          <FunnelRow label="Visitors" value={totalVisitors} max={totalVisitors} />
          <FunnelRow label="Demo requests" value={totalDemos} max={totalVisitors} />
          <FunnelRow label="Signups" value={totalSignups} max={totalVisitors} />
          <FunnelRow label="Active patients" value={totalActive} max={totalVisitors} emphasis />
        </CardContent>
      </Card>

      <Card tone="raised">
        <CardContent className="py-5">
          <p className="text-sm font-medium text-text mb-4">Monthly trend · new patients</p>
          <div className="flex items-end gap-3 h-40">
            {monthlyTrend.map((p) => {
              const pct = (p.value / maxTrend) * 100;
              return (
                <div key={p.month} className="flex-1 flex flex-col items-center gap-2 h-full">
                  {/* definite-height, relative wrapper so the bar's % height
                      resolves (a % height inside a flex-1 item collapses to 0) */}
                  <div className="relative flex-1 min-h-0 w-full">
                    <div
                      className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-accent to-accent-strong rounded-t"
                      style={{ height: `${pct}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-text-subtle tabular-nums">{p.value}</p>
                  <p className="text-[11px] text-text-muted">{p.month}</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card tone="raised">
        <CardContent className="py-5">
          <p className="text-sm font-medium text-text mb-4">ROI calculator</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FieldGroup label="Channel">
              <select
                value={roiChannel}
                onChange={(e) => {
                  setRoiChannel(e.target.value);
                  // re-seed Spend from the newly selected channel
                  setRoiSpendOverride(null);
                }}
                className="flex w-full rounded-md border border-border-strong bg-surface px-3 h-10 text-sm text-text"
              >
                {channels.map((c) => (
                  <option key={c.channel} value={c.channel}>{c.channel}</option>
                ))}
              </select>
            </FieldGroup>
            <FieldGroup label="Spend ($)">
              <Input
                type="number"
                min={0}
                value={roi?.spend ?? 0}
                onChange={(e) => setRoiSpendOverride(Number(e.target.value) || 0)}
              />
            </FieldGroup>
            <FieldGroup label="Lifetime revenue per patient ($)">
              <Input
                type="number"
                min={0}
                value={roiRevenuePerPatient}
                onChange={(e) => setRoiRevenuePerPatient(Number(e.target.value) || 0)}
              />
            </FieldGroup>
          </div>
          {roi && (
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
              <RoiStat label="Spend"   value={`$${roi.spend.toLocaleString()}`} />
              <RoiStat label="Revenue" value={`$${roi.revenue.toLocaleString()}`} />
              <RoiStat label="Net"     value={`$${roi.net.toLocaleString()}`} tone={roi.net >= 0 ? "success" : "danger"} />
              <RoiStat
                label="Multiple"
                value={isFinite(roi.multiple) ? `${roi.multiple.toFixed(1)}×` : "∞"}
                tone="accent"
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FunnelRow({
  label,
  value,
  max,
  emphasis,
}: {
  label: string;
  value: number;
  max: number;
  emphasis?: boolean;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3 mb-2 last:mb-0">
      <span className="w-36 text-xs text-text-muted shrink-0">{label}</span>
      <div className="flex-1 h-5 bg-surface-muted rounded overflow-hidden">
        <div
          className={cn(
            "h-full rounded",
            emphasis ? "bg-gradient-to-r from-accent to-accent-strong" : "bg-accent-soft",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-16 text-right text-xs tabular-nums text-text">{value}</span>
    </div>
  );
}

function RoiStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "danger" | "accent";
}) {
  return (
    <div className="p-3 rounded-md bg-surface-muted/60">
      <p className="text-[10px] uppercase tracking-wider text-text-subtle">{label}</p>
      <div className="mt-1">
        {tone ? (
          <Badge tone={tone}>{value}</Badge>
        ) : (
          <p className="font-display text-lg tabular-nums text-text">{value}</p>
        )}
      </div>
    </div>
  );
}
