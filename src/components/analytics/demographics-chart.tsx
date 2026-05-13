"use client";

import React from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

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

const COLORS = ["#10B981", "#3B82F6", "#8B5CF6", "#F59E0B", "#EC4899", "#64748B"];

export function DemographicsChart({
  data,
  title = "Patient Demographics",
  description = "Age distribution across the clinical practice.",
  metric = "Patients",
}: DemographicsChartProps) {
  
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-surface border border-border p-3 rounded-xl shadow-sm text-sm">
          <p className="font-semibold text-text mb-1">{payload[0].name}</p>
          <p className="text-text-muted">
            <span className="font-medium text-text">{payload[0].value}</span> {metric}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="45%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={5}
                dataKey="value"
                stroke="var(--surface)"
                strokeWidth={2}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                verticalAlign="bottom" 
                height={36} 
                iconType="circle"
                formatter={(value) => <span className="text-text-muted font-medium">{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
