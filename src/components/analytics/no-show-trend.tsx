"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { TrendArea } from "@/components/charts";

export interface NoShowDataPoint {
  date: string; // e.g. "Week 1", "Jan 2026"
  rate: number; // Percentage (0-100)
}

interface NoShowTrendProps {
  data: NoShowDataPoint[];
  title?: string;
  description?: string;
}

/**
 * No-show trend — backed by the branded `<TrendArea>` wrapper so the gradient,
 * hairline grid, and tooltip match every other surface. Color is overridden to
 * a warning red because the metric is operational-risk-shaped (higher = worse).
 */
export function NoShowTrendLine({
  data,
  title = "Appointment No-Show Rate",
  description = "Tracking missed appointments over time to identify operational bottlenecks.",
}: NoShowTrendProps) {
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mt-2">
          <TrendArea
            data={data}
            xKey="date"
            unit="%"
            height={250}
            lines={[
              {
                dataKey: "rate",
                label: "No-show rate",
                color: "#EF4444",
              },
            ]}
          />
        </div>
      </CardContent>
    </Card>
  );
}
