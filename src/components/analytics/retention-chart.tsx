"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { TrendLine } from "@/components/charts";

export interface RetentionDataPoint {
  month: string;
  activePatients: number;
  newPatients: number;
  churnedPatients: number;
  retentionRate: number; // Percentage (0-100)
}

interface RetentionChartProps {
  data: RetentionDataPoint[];
  title?: string;
  description?: string;
}

/**
 * Retention trend — now backed by the branded `<TrendLine>` wrapper so it
 * shares the hairline grid + Card-tier tooltip + brand palette with every
 * other chart in the EMR. Series:
 *
 * - Active patients (brand accent)
 * - New patients (palette)
 * - Churned patients (palette)
 * - Retention rate (palette, dashed — "projection" semantics)
 */
export function RetentionChart({
  data,
  title = "Patient Retention Trend",
  description = "Tracking active patient growth vs churn over time.",
}: RetentionChartProps) {
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mt-2">
          <TrendLine
            data={data}
            xKey="month"
            height={320}
            lines={[
              { dataKey: "activePatients", label: "Active patients" },
              { dataKey: "newPatients", label: "New patients" },
              { dataKey: "churnedPatients", label: "Churned" },
              { dataKey: "retentionRate", label: "Retention rate", dashed: true },
            ]}
          />
        </div>
      </CardContent>
    </Card>
  );
}
