"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { getClinicalDiscoveryTrendAction, type DiscoveryTrendItem } from "@/app/(clinician)/clinic/command/actions";

export function DiscoveryTrendButton() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"week" | "month" | "year">("week");
  const [data, setData] = useState<DiscoveryTrendItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    async function loadData() {
      setLoading(true);
      setError(null);
      const res = await getClinicalDiscoveryTrendAction(activeTab);
      if (res.ok) {
        setData(res.data);
      } else {
        setError(res.error);
      }
      setLoading(false);
    }

    loadData();
  }, [open, activeTab]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="text-xs font-semibold text-accent hover:text-accent-hover transition-colors"
        >
          More
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl bg-surface border-border p-6">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Clinical Discovery Trends</DialogTitle>
            <button
              onClick={() => setOpen(false)}
              className="text-text-subtle hover:text-text transition-colors text-sm font-semibold"
            >
              ✕ Close
            </button>
          </div>
          <p className="text-xs text-text-muted mt-1">
            Historical view of clinical observations and flags surfaced by the ambient AI assistant.
          </p>
        </DialogHeader>

        {/* Tab Selector */}
        <div className="flex gap-1.5 my-4 bg-surface-muted p-1 rounded-xl w-fit border border-border/40">
          {(["week", "month", "year"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all duration-200 ${
                activeTab === tab
                  ? "bg-surface text-text shadow-sm border border-border/20"
                  : "text-text-subtle hover:text-text"
              }`}
            >
              {tab === "week" ? "This Week" : tab === "month" ? "This Month" : "This Year"}
            </button>
          ))}
        </div>

        {/* Chart View */}
        <div className="h-72 w-full flex items-center justify-center bg-surface-muted/40 rounded-2xl border border-border/30 p-4">
          {loading ? (
            <div className="flex flex-col items-center gap-2">
              <div className="h-6 w-6 rounded-full border-2 border-accent border-t-transparent animate-spin" />
              <p className="text-xs text-text-subtle italic">Loading trend data...</p>
            </div>
          ) : error ? (
            <p className="text-xs text-red-600 font-medium">{error}</p>
          ) : data.length === 0 ? (
            <p className="text-xs text-text-subtle italic">No observations logged in this span.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSignals" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#5b8db8" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#5b8db8" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "var(--text-subtle)" }}
                  stroke="rgba(0,0,0,0.08)"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--text-subtle)" }}
                  stroke="rgba(0,0,0,0.08)"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--surface)",
                    borderColor: "var(--border)",
                    borderRadius: "12px",
                    fontSize: "12px",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                <Area
                  name="Surfaced Signals"
                  type="monotone"
                  dataKey="count"
                  stroke="#5b8db8"
                  fillOpacity={1}
                  fill="url(#colorSignals)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
