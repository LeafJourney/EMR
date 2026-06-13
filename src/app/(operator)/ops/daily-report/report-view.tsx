"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";
import type { DailyReportData, DemoAppointment } from "./page";
import { AppointmentsTable, type AppointmentRow } from "./appointments-table";

function fmtMoney(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

const STATUS_TONE: Record<DemoAppointment["status"], { label: string; bg: string; text: string }> = {
  completed:    { label: "Completed",   bg: "bg-emerald-50",  text: "text-emerald-700" },
  in_progress:  { label: "In progress", bg: "bg-blue-50",     text: "text-blue-700" },
  no_show:      { label: "No-show",     bg: "bg-red-50",      text: "text-red-700" },
  cancelled:    { label: "Cancelled",   bg: "bg-gray-100",    text: "text-gray-600" },
};

export function ReportView({ data }: { data: DailyReportData }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState<string>(today);

  return (
    <div className="space-y-6">
      {/* Date + print controls */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <label className="text-xs uppercase tracking-wider text-text-subtle">Report date</label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="md:w-48"
          />
        </div>
        <Button size="sm" variant="secondary" onClick={() => window.print()}>
          Print report
        </Button>
      </div>

      {/* Print-only header */}
      <div className="hidden print:block mb-6">
        <h1 className="text-2xl font-semibold">Daily Production Report</h1>
        <p className="text-sm text-text-muted">Date: {date}</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <SummaryCard label="Visits completed" value={data.visitsCompleted.toString()} />
        <SummaryCard label="Notes signed" value={data.notesSigned.toString()} accent="emerald" />
        <SummaryCard label="New patients" value={data.newPatients.toString()} />
        <SummaryCard label="Revenue collected" value={fmtMoney(data.revenueCents)} accent="emerald" />
        <SummaryCard label="Active agents" value={data.activeAgents.toString()} />
      </div>

      {/* Provider breakdown */}
      <Card tone="raised">
        <CardHeader>
          <CardTitle className="text-base">Provider breakdown</CardTitle>
          <CardDescription>Per-provider activity for the selected date.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-text-subtle border-b border-border">
                  <th className="py-2 font-medium">Provider</th>
                  <th className="py-2 font-medium text-right">Visits</th>
                  <th className="py-2 font-medium text-right">Notes signed</th>
                  <th className="py-2 font-medium text-right">Avg visit</th>
                  <th className="py-2 font-medium text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {data.providers.map((p) => (
                  <tr key={p.id} className="border-b border-border/40">
                    <td className="py-3">{p.name}</td>
                    <td className="py-3 text-right tabular-nums">{p.visits}</td>
                    <td className="py-3 text-right tabular-nums">{p.notesSigned}</td>
                    <td className="py-3 text-right tabular-nums text-text-muted">
                      {p.avgVisitMinutes}m
                    </td>
                    <td className="py-3 text-right tabular-nums font-medium">{fmtMoney(p.revenueCents)}</td>
                  </tr>
                ))}
                <tr className="bg-surface-muted/40 font-medium">
                  <td className="py-3">Total</td>
                  <td className="py-3 text-right tabular-nums">{data.visitsCompleted}</td>
                  <td className="py-3 text-right tabular-nums">{data.notesSigned}</td>
                  <td className="py-3 text-right text-text-subtle">—</td>
                  <td className="py-3 text-right tabular-nums">{fmtMoney(data.revenueCents)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Two-column: agents + revenue breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card tone="raised">
          <CardHeader>
            <CardTitle className="text-base">Top agents today</CardTitle>
            <CardDescription>Jobs run and success rate.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {data.topAgents.map((a, idx) => (
                <li key={a.id} className="flex items-center gap-3">
                  <span className="text-xs font-mono text-text-subtle w-5">#{idx + 1}</span>
                  <span className="text-sm flex-1">{a.name}</span>
                  <span className="text-xs text-text-muted tabular-nums">{a.jobsRun} jobs</span>
                  <Badge tone={a.successRate >= 0.9 ? "success" : "warning"} className="text-[10px]">
                    {Math.round(a.successRate * 100)}%
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card tone="raised">
          <CardHeader>
            <CardTitle className="text-base">Revenue breakdown</CardTitle>
            <CardDescription>Collected by payment source.</CardDescription>
          </CardHeader>
          <CardContent>
            <RevenueBar
              cash={data.revenueBreakdown.cashCents}
              card={data.revenueBreakdown.cardCents}
              insurance={data.revenueBreakdown.insuranceCents}
            />
            <ul className="mt-4 space-y-2 text-sm">
              <RevenueRow label="Cash"      value={data.revenueBreakdown.cashCents}      total={data.revenueCents} color="bg-emerald-500" />
              <RevenueRow label="Card"      value={data.revenueBreakdown.cardCents}      total={data.revenueCents} color="bg-blue-500" />
              <RevenueRow label="Insurance" value={data.revenueBreakdown.insuranceCents} total={data.revenueCents} color="bg-amber-500" />
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Appointments table — sortable columns + CSV/print export (MASTER prompt G5/G6) */}
      <div>
        <div className="mb-3">
          <h2 className="text-base font-semibold text-text">Appointments</h2>
          <p className="text-sm text-text-muted">{data.appointments.length} on the schedule.</p>
        </div>
        <AppointmentsTable
          rows={data.appointments.map((a): AppointmentRow => ({
            id: a.id,
            time: a.time,
            patient: a.patient,
            provider: a.provider,
            statusKey: a.status,
            statusLabel: STATUS_TONE[a.status]?.label ?? a.status,
            modalityDisplay: a.modality.replace("_", "-"),
            modalityKey: a.modality,
          }))}
        />
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "emerald";
}) {
  return (
    <Card tone="raised">
      <CardContent className="py-5">
        <p
          className={cn(
            "font-display text-2xl tabular-nums",
            accent === "emerald" ? "text-emerald-700" : "text-text",
          )}
        >
          {value}
        </p>
        <p className="text-xs text-text-muted mt-1">{label}</p>
      </CardContent>
    </Card>
  );
}

function RevenueBar({ cash, card, insurance }: { cash: number; card: number; insurance: number }) {
  const total = cash + card + insurance || 1;
  return (
    <div className="h-3 w-full bg-surface-muted rounded-full overflow-hidden flex">
      <div className="h-full bg-emerald-500" style={{ width: `${(cash / total) * 100}%` }} />
      <div className="h-full bg-blue-500" style={{ width: `${(card / total) * 100}%` }} />
      <div className="h-full bg-amber-500" style={{ width: `${(insurance / total) * 100}%` }} />
    </div>
  );
}

function RevenueRow({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <li className="flex items-center gap-3">
      <span className={cn("h-2.5 w-2.5 rounded-sm", color)} />
      <span className="flex-1">{label}</span>
      <span className="text-text-muted text-xs tabular-nums">{pct}%</span>
      <span className="font-medium tabular-nums">{fmtMoney(value)}</span>
    </li>
  );
}
