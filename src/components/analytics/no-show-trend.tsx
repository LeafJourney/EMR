"use client";

import React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export interface NoShowDataPoint {
  date: string; // e.g. "Week 1", "Jan 2026"
  rate: number; // Percentage (0-100)
}

interface NoShowTrendProps {
  data: NoShowDataPoint[];
  title?: string;
  description?: string;
}

export function NoShowTrendLine({
  data,
  title = "Appointment No-Show Rate",
  description = "Tracking missed appointments over time to identify operational bottlenecks.",
}: NoShowTrendProps) {
  
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const rate = payload[0].value;
      const isHigh = rate > 15; // Arbitrary threshold for visual warning
      
      return (
        <div className="bg-surface border border-border p-3 rounded-xl shadow-sm text-sm">
          <p className="font-medium text-text mb-1">{label}</p>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isHigh ? 'bg-red-500' : 'bg-emerald-500'}`} />
            <p className="font-semibold text-text">
              {rate.toFixed(1)}% <span className="text-text-muted font-normal">no-show rate</span>
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  // Create a gradient for the area chart
  const gradientId = "colorNoShowRate";

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[250px] w-full mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{
                top: 5,
                right: 0,
                left: -20,
                bottom: 0,
              }}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#EF4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
              
              <XAxis 
                dataKey="date" 
                tickLine={false} 
                axisLine={false} 
                tick={{ fill: 'var(--text-muted)', fontSize: 12 }} 
                dy={10}
              />
              
              <YAxis 
                tickLine={false} 
                axisLine={false} 
                tick={{ fill: 'var(--text-muted)', fontSize: 12 }} 
                tickFormatter={(value) => `${value}%`}
                domain={[0, 'auto']}
              />
              
              <Tooltip content={<CustomTooltip />} />
              
              <Area
                type="monotone"
                dataKey="rate"
                stroke="#EF4444" // red-500
                strokeWidth={3}
                fillOpacity={1}
                fill={`url(#${gradientId})`}
                activeDot={{ r: 6, strokeWidth: 0, fill: "#EF4444" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
