"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DistributionBar } from "@/components/charts";

export interface DemographicSegment {
  name: string;
  value: number; // Count or Percentage
}

interface DemographicsChartProps {
  data: DemographicSegment[];
  title?: string;
  description?: string;
  metric?: string;
}

/**
 * Demographics — converted from the legacy donut to a branded `<DistributionBar>`.
 * Bars are easier to compare than pie slices, and we get the shared hairline
 * grid + Card-tier tooltip + reduced-motion handling for free.
 */
export function DemographicsChart({
  data,
  title = "Patient Demographics",
  description = "Age distribution across the clinical practice.",
}: DemographicsChartProps) {
  const bars = data.map((d) => ({ label: d.name, value: d.value }));
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mt-2">
          <DistributionBar data={bars} height={280} rainbow />
        </div>
      </CardContent>
    </Card>
  );
}
