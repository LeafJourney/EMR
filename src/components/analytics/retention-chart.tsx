"use client";

import React, { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

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

export function RetentionChart({
  data,
  title = "Patient Retention Trend",
  description = "Tracking active patient growth vs churn over time.",
}: RetentionChartProps) {
  
  const CustomTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: Array<{ name: string; value: number; color: string }>;
    label?: string;
  }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-surface border border-border p-3 rounded shadow-sm text-sm">
          <p className="font-medium text-text mb-2">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} style={{ color: entry.color }} className="font-medium">
              {entry.name}: {entry.name === "Retention Rate" ? `${entry.value}%` : entry.value}
            </p>
          ))}
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
        <div className="h-[350px] w-full mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{
                top: 5,
                right: 30,
                left: 20,
                bottom: 5,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis 
                dataKey="month" 
                tickLine={false} 
                axisLine={false} 
                tick={{ fill: 'var(--text-muted)' }} 
                dy={10}
              />
              <YAxis 
                yAxisId="left" 
                tickLine={false} 
                axisLine={false} 
                tick={{ fill: 'var(--text-muted)' }} 
              />
              <YAxis 
                yAxisId="right" 
                orientation="right" 
                tickLine={false} 
                axisLine={false} 
                tick={{ fill: 'var(--text-muted)' }} 
                domain={[0, 100]}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
              
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="activePatients"
                name="Active Patients"
                stroke="#10B981" // emerald-500
                strokeWidth={3}
                dot={{ r: 4, strokeWidth: 2 }}
                activeDot={{ r: 6 }}
              />
              
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="newPatients"
                name="New Patients"
                stroke="#3B82F6" // blue-500
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="churnedPatients"
                name="Churned"
                stroke="#EF4444" // red-500
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="retentionRate"
                name="Retention Rate"
                stroke="#8B5CF6" // violet-500
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
